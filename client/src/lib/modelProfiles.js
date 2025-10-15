export const MODEL_PROFILES = [
  {
    id: 'janus-1.3b-onnx',
    engine: 'transformersjs',
    repo: 'onnx-community/Janus-1.3B-ONNX',
    task: 'text-generation',
    modality: 'vision-text',
    ctx: 2048,
    precision: 'fp16',
    device: 'webgpu',
    license: 'Apache-2.0',
    // CDN fallback for ONNX weights if HuggingFace Hub is unreachable
    cdnFallback: 'https://cdn.jsdelivr.net/npm/@onnx-community/janus-1.3b-onnx@latest',
    // Estimated memory footprint (MB)
    memoryMB: 2600,
    // Supports deterministic inference
    deterministicSupport: true
  },
  {
    id: 'qwen2.5-0.5b',
    engine: 'transformersjs',
    repo: 'Xenova/Qwen2.5-0.5B-Instruct',
    task: 'text-generation',
    modality: 'text',
    precision: 'int8',
    device: 'webgpu',
    license: 'Apache-2.0',
    cdnFallback: 'https://cdn.jsdelivr.net/npm/@xenova/qwen2.5-0.5b-instruct@latest',
    memoryMB: 600,
    deterministicSupport: true
  },
  {
    id: 'qwen1.5-0.5b-chat',
    engine: 'transformersjs',
    repo: 'Xenova/Qwen1.5-0.5B-Chat',
    task: 'text-generation',
    modality: 'text',
    precision: 'int8',
    device: 'webgpu',
    license: 'Apache-2.0',
    cdnFallback: 'https://cdn.jsdelivr.net/npm/@xenova/qwen1.5-0.5b-chat@latest',
    memoryMB: 600,
    deterministicSupport: true
  }
];

export function getDefaultProfileId() {
  const envId = (import.meta?.env?.VITE_MODEL_PROFILE || '').trim();
  if (envId) return envId;
  return 'qwen2.5-0.5b';
}

export function resolveModelProfile(idOrUndefined) {
  const id = (idOrUndefined || getDefaultProfileId()).trim();
  const prof = MODEL_PROFILES.find(p => p.id === id);
  if (prof) return prof;
  // Fallback priority: janus -> qwen2.5 -> qwen1.5
  return MODEL_PROFILES.find(p => p.id === 'qwen2.5-0.5b') || MODEL_PROFILES[0];
}

export function listModelProfiles() {
  return MODEL_PROFILES.map(p => ({ 
    id: p.id, 
    engine: p.engine, 
    repo: p.repo, 
    modality: p.modality,
    memoryMB: p.memoryMB,
    deterministicSupport: p.deterministicSupport
  }));
}

/**
 * Get deterministic seed from environment or generate from timestamp
 * @returns {number} Seed value for reproducible inference
 */
export function getDeterministicSeed() {
  const envSeed = import.meta?.env?.VITE_DETERMINISTIC_SEED;
  if (envSeed && !isNaN(Number(envSeed)) && Number(envSeed) !== 0) {
    return Number(envSeed);
  }
  // Non-deterministic: use timestamp-based seed
  return 0;
}

/**
 * Load model with CDN fallback and caching
 * @param {string} profileId - Model profile ID
 * @param {Function} onProgress - Progress callback (file, progress)
 * @returns {Promise<object>} Loaded pipeline
 */
export async function loadModelWithFallback(profileId, onProgress = null) {
  const profile = resolveModelProfile(profileId);
  const { pipeline } = await import('@huggingface/transformers');
  
  // Determine device preference
  const devicePref = import.meta?.env?.VITE_DEVICE_PREFERENCE || 'auto';
  let device = profile.device;
  
  if (devicePref === 'wasm') {
    device = 'wasm';
  } else if (devicePref === 'auto') {
    // Auto-detect WebGPU support
    try {
      if (navigator.gpu) {
        const adapter = await navigator.gpu.requestAdapter();
        device = adapter ? 'webgpu' : 'wasm';
      } else {
        device = 'wasm';
      }
    } catch {
      device = 'wasm';
    }
  }
  
  // Attempt primary load from HuggingFace Hub
  try {
    const model = await pipeline(profile.task, profile.repo, {
      progress_callback: onProgress || (() => {}),
      device,
      dtype: profile.precision === 'fp16' ? 'fp16' : 'q8',
      // Enable caching in IndexedDB
      cache: true
    });
    return model;
  } catch (primaryError) {
    console.warn(`Primary load failed for ${profile.repo}:`, primaryError);
    
    // Attempt CDN fallback if configured
    const cdnUrl = import.meta?.env?.VITE_MODEL_CDN_FALLBACK || profile.cdnFallback;
    if (cdnUrl) {
      try {
        console.log(`Attempting CDN fallback: ${cdnUrl}`);
        const model = await pipeline(profile.task, cdnUrl, {
          progress_callback: onProgress || (() => {}),
          device,
          dtype: profile.precision === 'fp16' ? 'fp16' : 'q8',
          cache: true
        });
        return model;
      } catch (cdnError) {
        console.error(`CDN fallback failed for ${cdnUrl}:`, cdnError);
      }
    }
    
    // Re-throw original error if all attempts failed
    throw primaryError;
  }
}

/**
 * Get inference options with deterministic seed if enabled
 * @param {object} overrides - Override options
 * @returns {object} Inference options
 */
export function getInferenceOptions(overrides = {}) {
  const seed = getDeterministicSeed();
  const baseOptions = {
    max_new_tokens: 150,
    temperature: 0.2,
    top_k: 40,
    do_sample: true,
    ...overrides
  };
  
  // Add seed if deterministic mode is enabled
  if (seed !== 0) {
    baseOptions.seed = seed;
  }
  
  return baseOptions;
}
