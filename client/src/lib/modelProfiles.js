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
    license: 'Apache-2.0'
  },
  {
    id: 'qwen2.5-0.5b',
    engine: 'transformersjs',
    repo: 'Xenova/Qwen2.5-0.5B-Instruct',
    task: 'text-generation',
    modality: 'text',
    precision: 'int8',
    device: 'webgpu',
    license: 'Apache-2.0'
  },
  {
    id: 'qwen1.5-0.5b-chat',
    engine: 'transformersjs',
    repo: 'Xenova/Qwen1.5-0.5B-Chat',
    task: 'text-generation',
    modality: 'text',
    precision: 'int8',
    device: 'webgpu',
    license: 'Apache-2.0'
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
  return MODEL_PROFILES.map(p => ({ id: p.id, engine: p.engine, repo: p.repo, modality: p.modality }));
}
