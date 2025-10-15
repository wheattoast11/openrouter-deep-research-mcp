/**
 * Model Registry - Centralized configuration for browser-based inference models
 * 
 * Defines all supported models with quantization variants, capabilities,
 * and loading strategies for transformers.js + WebGPU
 * 
 * @module inference/modelRegistry
 */

/**
 * Model registry with quantization variants and capabilities
 * 
 * Each model entry contains:
 * - id: Unique model identifier
 * - huggingFaceId: HuggingFace repository path
 * - variants: Available quantization formats
 * - architecture: Base model architecture
 * - capabilities: Supported tasks
 * - activeParams: Parameter count per variant
 * - experts: Sparse MoE configuration (if applicable)
 * - recommendedVariant: Default quantization for balanced performance
 * - memoryRequirements: Estimated VRAM/RAM usage
 */

const MODEL_REGISTRY = {
  'ui-tars-1.5-7b': {
    id: 'ui-tars-1.5-7b',
    huggingFaceId: 'ByteDance-Seed/UI-TARS-1.5-7B',
    variants: {
      'awq': {
        huggingFaceId: 'flin775/UI-TARS-1.5-7B-AWQ',
        quantization: '4-bit AWQ',
        activeParams: 2.64e9,
        memoryVRAM: '2.5GB',
        memoryRAM: '1GB',
        loadTimeEstimate: 8000, // ms
        inferenceSpeed: 'fast'
      },
      'gguf-q4': {
        huggingFaceId: 'mradermacher/UI-TARS-1.5-7B-i1-GGUF',
        file: 'UI-TARS-1.5-7B.i1-Q4_K_M.gguf',
        quantization: 'Q4_K_M GGUF',
        activeParams: 1.8e9,
        memoryVRAM: '1.8GB',
        memoryRAM: '2GB',
        loadTimeEstimate: 6000,
        inferenceSpeed: 'medium'
      },
      'gguf-q8': {
        huggingFaceId: 'mradermacher/UI-TARS-1.5-7B-i1-GGUF',
        file: 'UI-TARS-1.5-7B.i1-Q8_0.gguf',
        quantization: 'Q8_0 GGUF',
        activeParams: 3.2e9,
        memoryVRAM: '3.5GB',
        memoryRAM: '1.5GB',
        loadTimeEstimate: 10000,
        inferenceSpeed: 'slow-but-accurate'
      }
    },
    architecture: 'qwen2_5_vl',
    capabilities: ['vision', 'computer-use', 'grounding', 'text-generation'],
    experts: null, // Not sparse MoE
    recommendedVariant: 'gguf-q4',
    description: 'Multimodal agent for computer use and GUI grounding',
    contextLength: 32768,
    inputTypes: ['text', 'image']
  },

  'gpt-oss-20b': {
    id: 'gpt-oss-20b',
    huggingFaceId: 'openai/gpt-oss-20b',
    variants: {
      'mxfp4': {
        huggingFaceId: 'openai/gpt-oss-20b',
        quantization: 'MXFP4 mixed-precision',
        activeParams: 3.61e9,
        totalParams: 20.9e9,
        memoryVRAM: '4GB', // Only active experts
        memoryRAM: '8GB', // Inactive experts
        loadTimeEstimate: 15000,
        inferenceSpeed: 'fast',
        expertLoadingStrategy: 'lazy'
      },
      'gguf-q4': {
        huggingFaceId: 'mradermacher/gpt-oss-20b-i1-GGUF',
        file: 'gpt-oss-20b.i1-Q4_K_M.gguf',
        quantization: 'Q4_K_M GGUF',
        activeParams: 2.8e9,
        totalParams: 15e9,
        memoryVRAM: '3GB',
        memoryRAM: '6GB',
        loadTimeEstimate: 12000,
        inferenceSpeed: 'medium',
        expertLoadingStrategy: 'lazy'
      }
    },
    architecture: 'sparse_moe',
    capabilities: ['text-generation', 'reasoning', 'analysis'],
    experts: {
      total: 32,
      activePerToken: 4,
      routingStrategy: 'top-k',
      expertSize: 650e6 // ~650M params per expert
    },
    recommendedVariant: 'gguf-q4',
    description: 'Sparse MoE for efficient reasoning and analysis',
    contextLength: 32768,
    inputTypes: ['text']
  },

  'qwen3-4b': {
    id: 'qwen3-4b',
    huggingFaceId: 'Qwen/Qwen3-4B',
    variants: {
      'q4': {
        huggingFaceId: 'Xenova/Qwen3-4B-q4',
        quantization: 'Q4 GGUF',
        activeParams: 1.2e9,
        memoryVRAM: '1.5GB',
        memoryRAM: '0.5GB',
        loadTimeEstimate: 4000,
        inferenceSpeed: 'very-fast'
      }
    },
    architecture: 'qwen3',
    capabilities: ['text-generation', 'reasoning', 'coding'],
    experts: null,
    recommendedVariant: 'q4',
    description: 'Fast general-purpose reasoning model',
    contextLength: 32768,
    inputTypes: ['text']
  },

  'utopia-atomic': {
    id: 'utopia-atomic',
    huggingFaceId: 'intuitionlabs/utopia-atomic',
    variants: {
      'q4': {
        huggingFaceId: 'mradermacher/utopia-atomic-GGUF',
        file: 'utopia-atomic.i1-Q4_K_M.gguf',
        quantization: 'Q4_K_M GGUF',
        activeParams: 0.8e9,
        memoryVRAM: '1GB',
        memoryRAM: '0.5GB',
        loadTimeEstimate: 3000,
        inferenceSpeed: 'ultra-fast'
      }
    },
    architecture: 'custom',
    capabilities: ['text-generation', 'semantic-compression', 'meta-reasoning'],
    experts: null,
    recommendedVariant: 'q4',
    description: 'Tej\'s custom model for semantic compression and meta-cognition',
    contextLength: 8192,
    inputTypes: ['text'],
    specialFeatures: ['latent-space-injection', 'embedding-manipulation']
  }
};

/**
 * Task-to-model mapping for automatic model selection
 */
const TASK_MODEL_MAP = {
  'vision': ['ui-tars-1.5-7b'],
  'computer-use': ['ui-tars-1.5-7b'],
  'grounding': ['ui-tars-1.5-7b'],
  'reasoning': ['gpt-oss-20b', 'qwen3-4b', 'utopia-atomic'],
  'analysis': ['gpt-oss-20b', 'qwen3-4b'],
  'coding': ['qwen3-4b'],
  'text-generation': ['qwen3-4b', 'utopia-atomic', 'gpt-oss-20b'],
  'semantic-compression': ['utopia-atomic'],
  'meta-reasoning': ['utopia-atomic']
};

/**
 * Get model configuration by ID
 * @param {string} modelId - Model identifier
 * @returns {Object|null} Model configuration or null if not found
 */
function getModel(modelId) {
  return MODEL_REGISTRY[modelId] || null;
}

/**
 * Get all available models
 * @returns {Array<Object>} Array of model configurations
 */
function getAllModels() {
  return Object.values(MODEL_REGISTRY);
}

/**
 * Get recommended model for a specific task
 * @param {string} task - Task type (e.g., 'vision', 'reasoning')
 * @returns {Object|null} Recommended model configuration
 */
function getModelForTask(task) {
  const modelIds = TASK_MODEL_MAP[task];
  if (!modelIds || modelIds.length === 0) {
    return null;
  }
  return getModel(modelIds[0]); // Return first (highest priority)
}

/**
 * Get variant configuration for a model
 * @param {string} modelId - Model identifier
 * @param {string} variantName - Variant name (e.g., 'q4', 'awq')
 * @returns {Object|null} Variant configuration or null
 */
function getVariant(modelId, variantName) {
  const model = getModel(modelId);
  if (!model || !model.variants) {
    return null;
  }
  return model.variants[variantName] || null;
}

/**
 * Get recommended variant for a model based on available VRAM
 * @param {string} modelId - Model identifier
 * @param {number} availableVRAM - Available VRAM in GB
 * @returns {Object|null} Recommended variant configuration
 */
function getRecommendedVariant(modelId, availableVRAM = 4) {
  const model = getModel(modelId);
  if (!model) return null;

  // Sort variants by VRAM requirement
  const variants = Object.entries(model.variants).map(([name, config]) => ({
    name,
    ...config,
    vramGB: parseFloat(config.memoryVRAM)
  }));

  variants.sort((a, b) => a.vramGB - b.vramGB);

  // Find highest quality variant that fits in VRAM
  for (let i = variants.length - 1; i >= 0; i--) {
    if (variants[i].vramGB <= availableVRAM) {
      return { name: variants[i].name, ...variants[i] };
    }
  }

  // Fallback to smallest variant
  return variants[0] ? { name: variants[0].name, ...variants[0] } : null;
}

/**
 * Check if model supports sparse MoE
 * @param {string} modelId - Model identifier
 * @returns {boolean} True if model is sparse MoE
 */
function isSparseMoE(modelId) {
  const model = getModel(modelId);
  return model && model.experts !== null;
}

/**
 * Get expert configuration for sparse MoE models
 * @param {string} modelId - Model identifier
 * @returns {Object|null} Expert configuration or null
 */
function getExpertConfig(modelId) {
  const model = getModel(modelId);
  if (!model || !model.experts) {
    return null;
  }
  return model.experts;
}

/**
 * Estimate total memory requirement for a model variant
 * @param {string} modelId - Model identifier
 * @param {string} variantName - Variant name
 * @returns {Object} Memory requirements { vram: string, ram: string, total: string }
 */
function estimateMemory(modelId, variantName) {
  const variant = getVariant(modelId, variantName);
  if (!variant) {
    return { vram: 'unknown', ram: 'unknown', total: 'unknown' };
  }

  const vramGB = parseFloat(variant.memoryVRAM);
  const ramGB = parseFloat(variant.memoryRAM);
  const totalGB = vramGB + ramGB;

  return {
    vram: variant.memoryVRAM,
    ram: variant.memoryRAM,
    total: `${totalGB.toFixed(1)}GB`
  };
}

/**
 * Get loading strategy for a model variant
 * @param {string} modelId - Model identifier
 * @param {string} variantName - Variant name
 * @returns {string} Loading strategy ('eager' | 'lazy' | 'streaming')
 */
function getLoadingStrategy(modelId, variantName) {
  const model = getModel(modelId);
  const variant = getVariant(modelId, variantName);
  
  if (!model || !variant) {
    return 'eager';
  }

  // Sparse MoE models use lazy loading for experts
  if (model.experts && variant.expertLoadingStrategy) {
    return variant.expertLoadingStrategy;
  }

  // Large models (>4GB VRAM) use streaming
  const vramGB = parseFloat(variant.memoryVRAM);
  if (vramGB > 4) {
    return 'streaming';
  }

  // Default to eager loading
  return 'eager';
}

module.exports = {
  MODEL_REGISTRY,
  TASK_MODEL_MAP,
  getModel,
  getAllModels,
  getModelForTask,
  getVariant,
  getRecommendedVariant,
  isSparseMoE,
  getExpertConfig,
  estimateMemory,
  getLoadingStrategy
};


