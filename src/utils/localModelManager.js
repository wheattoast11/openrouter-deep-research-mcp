// src/utils/localModelManager.js
const { downloadFile } = require('@huggingface/hub');
const path = require('path');
const fs = require('fs');
const config = require('../../config');

class LocalModelManager {
  constructor() {
    this.llama = null;
    this.models = new Map(); // Map of modelId -> { model, context }
    this.initialized = false;
    this.LlamaChatSession = null;
  }

  async initialize() {
    if (this.initialized) return;

    console.error(`[${new Date().toISOString()}] LocalModelManager: Initializing...`);

    try {
      // Dynamically import node-llama-cpp (ESM module)
      const llamaCppModule = await import('node-llama-cpp');
      const { getLlama, LlamaChatSession } = llamaCppModule;
      this.LlamaChatSession = LlamaChatSession;
      
      // Get llama instance
      this.llama = await getLlama();
      console.error(`[${new Date().toISOString()}] LocalModelManager: llama.cpp bindings loaded.`);

      // Load configured models
      const modelConfig = config.localModels || {};
      if (!modelConfig.enabled) {
        console.error(`[${new Date().toISOString()}] LocalModelManager: Local models disabled via config.`);
        return;
      }

      const modelIds = modelConfig.modelIds || [];
      const downloadPath = modelConfig.downloadPath || path.join(process.cwd(), 'models');

      // Ensure download directory exists
      if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
      }

      for (const modelId of modelIds) {
        await this.loadModel(modelId, downloadPath);
      }

      this.initialized = true;
      console.error(`[${new Date().toISOString()}] LocalModelManager: Initialization complete. Loaded ${this.models.size} models.`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] LocalModelManager: Initialization failed:`, error);
      throw error;
    }
  }

  async loadModel(modelId, downloadPath) {
    try {
      console.error(`[${new Date().toISOString()}] LocalModelManager: Loading model ${modelId}...`);

      // Parse HuggingFace model ID (e.g., "mradermacher/utopia-atomic-GGUF:Q2_K")
      const [repoId, filePattern] = modelId.split(':');
      
      // Determine filename pattern
      let filename;
      if (filePattern) {
        // Try to find a file matching the pattern
        filename = `${repoId.split('/')[1]}.${filePattern}.gguf`;
      } else {
        // Default to common patterns
        filename = `${repoId.split('/')[1]}.gguf`;
      }

      const localPath = path.join(downloadPath, filename);

      // Download if not exists
      if (!fs.existsSync(localPath)) {
        console.error(`[${new Date().toISOString()}] LocalModelManager: Downloading ${modelId} from HuggingFace...`);
        
        // Download from HuggingFace
        await downloadFile({
          repo: repoId,
          path: filename,
          output: localPath
        });

        console.error(`[${new Date().toISOString()}] LocalModelManager: Downloaded to ${localPath}`);
      } else {
        console.error(`[${new Date().toISOString()}] LocalModelManager: Model already exists at ${localPath}`);
      }

      // Load model with llama.cpp
      const model = await this.llama.loadModel({
        modelPath: localPath
      });

      // Create context
      const context = await model.createContext({
        contextSize: 2048 // Adjust as needed
      });

      this.models.set(modelId, { model, context, localPath });
      console.error(`[${new Date().toISOString()}] LocalModelManager: Model ${modelId} loaded successfully.`);

    } catch (error) {
      console.error(`[${new Date().toISOString()}] LocalModelManager: Failed to load model ${modelId}:`, error);
      throw error;
    }
  }

  async runInference(modelId, prompt, options = {}) {
    if (!this.initialized) {
      throw new Error('LocalModelManager not initialized. Call initialize() first.');
    }

    const modelData = this.models.get(modelId);
    if (!modelData) {
      throw new Error(`Model ${modelId} not loaded. Available models: ${Array.from(this.models.keys()).join(', ')}`);
    }

    const { model, context } = modelData;

    try {
      const session = new this.LlamaChatSession({
        contextSequence: context.getSequence()
      });

      const response = await session.prompt(prompt, {
        maxTokens: options.maxTokens || 512,
        temperature: options.temperature || 0.7,
        topP: options.topP || 0.9,
      });

      return { text: response };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] LocalModelManager: Inference error for ${modelId}:`, error);
      throw error;
    }
  }

  // Special method for Qwen->Utopia logit pipeline
  async runLogitPipeline(qwenModelId, utopiaModelId, prompt, options = {}) {
    if (!this.initialized) {
      throw new Error('LocalModelManager not initialized.');
    }

    // For now, run them sequentially
    // TODO: Implement actual logit extraction and injection
    console.error(`[${new Date().toISOString()}] LocalModelManager: Running logit pipeline: ${qwenModelId} -> ${utopiaModelId}`);

    // Step 1: Run Qwen for reasoning
    const qwenResult = await this.runInference(qwenModelId, prompt, options);
    
    // Step 2: Feed Qwen's reasoning to Utopia
    const enrichedPrompt = `Based on this reasoning: "${qwenResult.text}"\n\nNow provide your analysis: ${prompt}`;
    const utopiaResult = await this.runInference(utopiaModelId, enrichedPrompt, options);

    return {
      qwenReasoning: qwenResult.text,
      utopiaAnalysis: utopiaResult.text,
      combined: `${qwenResult.text}\n\n---\n\n${utopiaResult.text}`
    };
  }

  getLoadedModels() {
    return Array.from(this.models.keys());
  }

  isReady() {
    return this.initialized && this.models.size > 0;
  }
}

// Export singleton
const localModelManager = new LocalModelManager();
module.exports = localModelManager;

