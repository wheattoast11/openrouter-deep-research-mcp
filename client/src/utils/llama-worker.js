// client/src/utils/llama-worker.js
import { Llama } from "llama-cpp-js";

let llama; // Llama.cpp instance
let qwenModelLoaded = false;
let utopiaModelLoaded = false;

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case "init":
      // Initialize Llama.cpp with a path to its WASM module and worker URL
      // Adjust paths as necessary based on your build output
      llama = new Llama({
        wasmPath: "/llama.wasm", // Assuming llama.wasm is served from root
        workerUrl: "/llama-worker.js", // This worker itself
      });
      await llama.load();
      self.postMessage({ type: "initialized" });
      break;

    case "load_model":
      const { modelId, modelPath } = payload;
      try {
        await llama.loadModel({ modelPath });
        if (modelId === "qwen") {
          qwenModelLoaded = true;
        } else if (modelId === "utopia") {
          utopiaModelLoaded = true;
        }
        self.postMessage({ type: "model_loaded", payload: { modelId } });
      } catch (error) {
        self.postMessage({
          type: "error",
          payload: { message: `Failed to load ${modelId}: ${error.message}` },
        });
      }
      break;

    case "run_inference":
      const { prompt, modelToUse, options } = payload;
      try {
        if (modelToUse === "qwen" && !qwenModelLoaded) {
          throw new Error("Qwen model not loaded.");
        }
        if (modelToUse === "utopia" && !utopiaModelLoaded) {
          throw new Error("Utopia model not loaded.");
        }

        const inferenceOptions = { ...options, logits: true }; // Always request logits

        // This is a simplified example. Real logit streaming/injection would be more complex
        // and depend heavily on the llama-cpp-js API and how it exposes logits.
        // For demonstration, we'll just simulate logit output.
        const output = await llama.generate(prompt, inferenceOptions);

        self.postMessage({
          type: "inference_result",
          payload: { modelToUse, output },
        });

      } catch (error) {
        self.postMessage({
          type: "error",
          payload: {
            message: `Inference failed for ${modelToUse}: ${error.message}`,
          },
        });
      }
      break;
  }
};
