// client/src/utils/LlamaCpp.js

class LlamaCpp {
    constructor() {
      this.worker = new Worker("/src/utils/llama-worker.js");
      this.isInitialized = false;
      this.messageCallbacks = new Map();

      this.worker.onmessage = (event) => {
        const { type, payload } = event.data;
        if (type === "initialized") {
          this.isInitialized = true;
        }
        const callback = this.messageCallbacks.get(type);
        if (callback) {
          callback(payload);
        }
      };

      this.worker.onerror = (error) => {
        console.error("LlamaCpp Worker error:", error);
        const callback = this.messageCallbacks.get("error");
        if (callback) {
          callback(error);
        }
      };

      this.initWorker();
    }

    initWorker() {
      this.worker.postMessage({ type: "init" });
    }

    on(type, callback) {
      this.messageCallbacks.set(type, callback);
    }

    loadModel(modelId, modelPath) {
      if (!this.isInitialized) {
        console.warn("Worker not initialized. Model load queued.");
        return new Promise((resolve) => {
          this.on("initialized", () => {
            this.worker.postMessage({ type: "load_model", payload: { modelId, modelPath } });
            resolve();
          });
        });
      }
      this.worker.postMessage({ type: "load_model", payload: { modelId, modelPath } });
    }

    runInference(prompt, modelToUse, options = {}) {
      if (!this.isInitialized) {
        throw new Error("LlamaCpp worker not initialized.");
      }
      this.worker.postMessage({
        type: "run_inference",
        payload: { prompt, modelToUse, options },
      });
    }

    // Method to simulate logit injection for utopia-atomic
    // In a real scenario, llama-cpp-js would need an API for this.
    injectLogits(logitsData) {
      console.log("Simulating logit injection for utopia-atomic:", logitsData);
      // This is a placeholder for actual logit injection logic.
      // The llama-cpp-js library would need to expose a method to accept raw logits
      // and use them as input for the next inference step.
    }
  }

  export const llamaCppClient = new LlamaCpp();

