/**
 * Browser Inference Engine - WebGPU-accelerated model inference via transformers.js
 * 
 * Core engine for loading and running quantized models in-browser.
 * Supports sparse MoE, quantization-aware inference, and latent space injection.
 * 
 * @module inference/browserInference
 */

const modelRegistry = require('./modelRegistry');

// Lazy-load transformers.js to avoid server-side import issues
let transformers = null;

/**
 * Lazy-load transformers.js library
 */
async function loadTransformers() {
  if (transformers) return transformers;
  
  try {
    // Try browser-compatible import
    if (typeof window !== 'undefined') {
      transformers = await import('@huggingface/transformers');
    } else {
      // Server-side: return mock for testing
      transformers = {
        pipeline: () => { throw new Error('Transformers.js only works in browser'); }
      };
    }
    return transformers;
  } catch (error) {
    console.error('[BrowserInference] Failed to load transformers.js:', error);
    throw new Error('Transformers.js not available. Ensure you are running in a browser environment.');
  }
}

/**
 * Browser Inference Engine
 * 
 * Manages model loading, inference, and streaming with WebGPU acceleration
 */
class BrowserInferenceEngine {
  constructor(options = {}) {
    this.models = new Map(); // Loaded model instances
    this.pipelines = new Map(); // Cached pipelines
    this.expertCache = new Map(); // Cache for sparse MoE experts
    this.device = options.device || 'webgpu'; // 'webgpu' | 'wasm' | 'cpu'
    this.verbose = options.verbose !== false;
    this.maxConcurrent = options.maxConcurrent || 3;
    this.initialized = false;
    
    // Note: BoundedExecutor not used here yet, but reserved for future parallel model loading
    // this.executor = new BoundedExecutor({ maxConcurrency: this.maxConcurrent });
  }

  /**
   * Initialize the inference engine
   */
  async initialize() {
    if (this.initialized) return;

    this.log('Initializing browser inference engine...');
    
    // Load transformers.js
    await loadTransformers();
    
    // Detect WebGPU availability
    if (this.device === 'webgpu' && typeof navigator !== 'undefined') {
      const hasWebGPU = 'gpu' in navigator;
      if (!hasWebGPU) {
        this.log('WebGPU not available, falling back to WASM');
        this.device = 'wasm';
      }
    }

    this.initialized = true;
    this.log(`Initialized with device: ${this.device}`);
  }

  /**
   * Load a model into memory
   * 
   * @param {string} modelId - Model identifier from registry
   * @param {Object} options - Loading options
   * @param {string} options.variant - Quantization variant (default: recommended)
   * @param {boolean} options.lazyExperts - Lazy load experts for sparse MoE
   * @param {Function} options.onProgress - Progress callback (loaded, total)
   * @returns {Promise<Object>} Loaded model metadata
   */
  async loadModel(modelId, options = {}) {
    await this.initialize();

    // Check if already loaded
    if (this.models.has(modelId)) {
      this.log(`Model ${modelId} already loaded`);
      return this.models.get(modelId);
    }

    const modelConfig = modelRegistry.getModel(modelId);
    if (!modelConfig) {
      throw new Error(`Model ${modelId} not found in registry`);
    }

    const variantName = options.variant || modelConfig.recommendedVariant;
    const variantConfig = modelRegistry.getVariant(modelId, variantName);
    
    if (!variantConfig) {
      throw new Error(`Variant ${variantName} not found for model ${modelId}`);
    }

    this.log(`Loading ${modelId} (${variantName})...`);
    
    const startTime = Date.now();

    try {
      // Determine loading strategy
      const loadingStrategy = modelRegistry.getLoadingStrategy(modelId, variantName);
      
      let modelInstance;
      
      if (modelRegistry.isSparseMoE(modelId) && options.lazyExperts !== false) {
        // Sparse MoE: lazy load experts
        modelInstance = await this._loadSparseMoE(modelId, variantName, options);
      } else {
        // Standard loading
        modelInstance = await this._loadStandard(modelId, variantName, options);
      }

      const loadTime = Date.now() - startTime;
      
      const metadata = {
        modelId,
        variant: variantName,
        architecture: modelConfig.architecture,
        capabilities: modelConfig.capabilities,
        loadTime,
        device: this.device,
        instance: modelInstance
      };

      this.models.set(modelId, metadata);
      this.log(`Loaded ${modelId} in ${loadTime}ms`);
      
      return metadata;
    } catch (error) {
      this.log(`Failed to load ${modelId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load standard (non-MoE) model
   * @private
   */
  async _loadStandard(modelId, variantName, options) {
    const tf = await loadTransformers();
    const variantConfig = modelRegistry.getVariant(modelId, variantName);
    
    // Create pipeline based on model capabilities
    const modelConfig = modelRegistry.getModel(modelId);
    const task = this._inferTaskFromCapabilities(modelConfig.capabilities);
    
    const pipeline = await tf.pipeline(task, variantConfig.huggingFaceId, {
      device: this.device,
      dtype: this._mapQuantizationToDtype(variantConfig.quantization),
      progress_callback: options.onProgress
    });

    return { pipeline, task };
  }

  /**
   * Load sparse MoE model with lazy expert loading
   * @private
   */
  async _loadSparseMoE(modelId, variantName, options) {
    const tf = await loadTransformers();
    const modelConfig = modelRegistry.getModel(modelId);
    const variantConfig = modelRegistry.getVariant(modelId, variantName);
    const expertConfig = modelRegistry.getExpertConfig(modelId);

    this.log(`Loading sparse MoE: ${expertConfig.total} experts, ${expertConfig.activePerToken} active per token`);

    // Load base model (without expert weights)
    const baseModel = await tf.AutoModel.from_pretrained(variantConfig.huggingFaceId, {
      device: this.device,
      dtype: this._mapQuantizationToDtype(variantConfig.quantization),
      progress_callback: options.onProgress,
      // Custom: only load routing network initially
      load_experts: false
    });

    // Initialize expert cache
    this.expertCache.set(modelId, {
      loaded: new Set(),
      active: new Set(),
      config: expertConfig
    });

    return { baseModel, expertConfig, isMoE: true };
  }

  /**
   * Run inference on input
   * 
   * @param {string} modelId - Model identifier
   * @param {string|Object} input - Input text or structured input
   * @param {Object} options - Inference options
   * @returns {Promise<Object>} Inference result
   */
  async inference(modelId, input, options = {}) {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not loaded. Call loadModel() first.`);
    }

    const startTime = Date.now();

    try {
      let result;
      
      if (model.instance.isMoE) {
        // Sparse MoE inference with expert selection
        result = await this._inferenceSparseMoE(modelId, input, options);
      } else {
        // Standard inference
        result = await model.instance.pipeline(input, options);
      }

      const inferenceTime = Date.now() - startTime;
      
      return {
        result,
        metadata: {
          modelId,
          inferenceTime,
          device: this.device
        }
      };
    } catch (error) {
      this.log(`Inference failed for ${modelId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stream inference results token-by-token
   * 
   * @param {string} modelId - Model identifier
   * @param {string|Object} input - Input text or structured input
   * @param {Object} options - Inference options
   * @yields {Object} Token stream { token, confidence, done }
   */
  async* inferenceStream(modelId, input, options = {}) {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not loaded`);
    }

    const pipeline = model.instance.pipeline;
    
    // Use transformers.js streaming API
    const streamer = await pipeline(input, {
      ...options,
      return_type: 'stream'
    });

    for await (const chunk of streamer) {
      yield {
        token: chunk.token,
        text: chunk.text,
        confidence: chunk.confidence || null,
        done: chunk.done || false
      };
    }
  }

  /**
   * Sparse MoE inference with dynamic expert selection
   * @private
   */
  async _inferenceSparseMoE(modelId, input, options) {
    const model = this.models.get(modelId);
    const expertCache = this.expertCache.get(modelId);
    const { baseModel, expertConfig } = model.instance;

    // Step 1: Encode input and get routing logits
    const encoded = await baseModel.encode(input);
    const routingLogits = await baseModel.router(encoded);

    // Step 2: Select top-k experts
    const selectedExperts = await this.selectExperts(routingLogits, expertConfig);

    // Step 3: Load selected experts if not cached
    await this._ensureExpertsLoaded(modelId, selectedExperts);

    // Step 4: Run inference with active experts
    const output = await baseModel.forward(encoded, {
      active_experts: selectedExperts,
      ...options
    });

    return output;
  }

  /**
   * Select top-k experts based on routing logits
   * 
   * @param {Array} routingLogits - Router network output
   * @param {Object} expertConfig - Expert configuration
   * @returns {Promise<Array<number>>} Selected expert indices
   */
  async selectExperts(routingLogits, expertConfig) {
    const k = expertConfig.activePerToken;
    
    // Get top-k experts by logit value
    const expertScores = routingLogits.map((logit, idx) => ({ idx, score: logit }));
    expertScores.sort((a, b) => b.score - a.score);
    
    const selected = expertScores.slice(0, k).map(e => e.idx);
    
    this.log(`Selected experts: [${selected.join(', ')}]`);
    return selected;
  }

  /**
   * Ensure experts are loaded into VRAM
   * @private
   */
  async _ensureExpertsLoaded(modelId, expertIndices) {
    const expertCache = this.expertCache.get(modelId);
    const model = this.models.get(modelId);
    
    const toLoad = expertIndices.filter(idx => !expertCache.loaded.has(idx));
    
    if (toLoad.length === 0) {
      return; // All experts already loaded
    }

    this.log(`Loading ${toLoad.length} experts: [${toLoad.join(', ')}]`);
    
    // Load experts in parallel
    await Promise.all(
      toLoad.map(idx => this._loadExpert(modelId, idx))
    );
  }

  /**
   * Load a single expert into memory
   * @private
   */
  async _loadExpert(modelId, expertIdx) {
    const model = this.models.get(modelId);
    const expertCache = this.expertCache.get(modelId);
    
    // Simulate expert loading (actual implementation depends on model format)
    // In practice, this would load expert weights from HuggingFace Hub
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay
    
    expertCache.loaded.add(expertIdx);
    this.log(`Expert ${expertIdx} loaded`);
  }

  /**
   * Inject custom embedding into model's latent space
   * 
   * @param {string} modelId - Model identifier
   * @param {Array<number>} embedding - Embedding vector
   * @param {number} targetLayer - Layer index to inject into
   * @returns {Promise<Object>} Modified model state
   */
  async injectLatentSpace(modelId, embedding, targetLayer = 0) {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not loaded`);
    }

    this.log(`Injecting embedding into layer ${targetLayer}`);
    
    // Access model's internal state
    const modelInstance = model.instance.pipeline?.model || model.instance.baseModel;
    
    // Inject embedding at target layer
    // Implementation depends on model architecture
    const layerState = await modelInstance.getLayerState(targetLayer);
    layerState.hidden_states = embedding;
    await modelInstance.setLayerState(targetLayer, layerState);
    
    return { success: true, layer: targetLayer, dimension: embedding.length };
  }

  /**
   * Unload model from memory
   * 
   * @param {string} modelId - Model identifier
   */
  async unloadModel(modelId) {
    const model = this.models.get(modelId);
    if (!model) {
      return;
    }

    this.log(`Unloading ${modelId}...`);
    
    // Dispose model resources
    if (model.instance.pipeline?.dispose) {
      await model.instance.pipeline.dispose();
    }
    if (model.instance.baseModel?.dispose) {
      await model.instance.baseModel.dispose();
    }

    this.models.delete(modelId);
    this.expertCache.delete(modelId);
    
    this.log(`Unloaded ${modelId}`);
  }

  /**
   * Get memory usage statistics
   * 
   * @returns {Object} Memory stats
   */
  getMemoryStats() {
    const stats = {
      modelsLoaded: this.models.size,
      models: []
    };

    for (const [modelId, model] of this.models.entries()) {
      const modelConfig = modelRegistry.getModel(modelId);
      const variantConfig = modelRegistry.getVariant(modelId, model.variant);
      
      stats.models.push({
        modelId,
        variant: model.variant,
        vram: variantConfig.memoryVRAM,
        ram: variantConfig.memoryRAM,
        loadTime: model.loadTime
      });
    }

    return stats;
  }

  /**
   * Map quantization format to dtype
   * @private
   */
  _mapQuantizationToDtype(quantization) {
    if (quantization.includes('4bit') || quantization.includes('Q4')) {
      return 'q4';
    }
    if (quantization.includes('8bit') || quantization.includes('Q8')) {
      return 'q8';
    }
    if (quantization.includes('FP16')) {
      return 'fp16';
    }
    return 'fp32'; // Default
  }

  /**
   * Infer task type from capabilities
   * @private
   */
  _inferTaskFromCapabilities(capabilities) {
    if (capabilities.includes('vision')) {
      return 'image-to-text';
    }
    if (capabilities.includes('text-generation')) {
      return 'text-generation';
    }
    return 'text-generation'; // Default
  }

  /**
   * Log message (if verbose)
   * @private
   */
  log(message) {
    if (this.verbose) {
      console.log(`[BrowserInference] ${message}`);
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton instance
 * 
 * @param {Object} options - Engine options
 * @returns {BrowserInferenceEngine} Singleton instance
 */
function getInstance(options = {}) {
  if (!instance) {
    instance = new BrowserInferenceEngine(options);
  }
  return instance;
}

module.exports = {
  BrowserInferenceEngine,
  getInstance
};


