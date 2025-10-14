const listeners = new Map();

function emit(type, detail) {
  const subs = listeners.get(type);
  if (!subs) return;
  for (const fn of subs) {
    try { fn(detail); } catch (e) { /* noop */ }
  }
}

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type)?.delete(fn);
}

export function once(type, fn) {
  const off = on(type, (d) => { off(); fn(d); });
  return off;
}

export function off(type, fn) {
  listeners.get(type)?.delete(fn);
}

export const GatewayState = {
  stackMode: (import.meta.env.VITE_STACK_MODE || 'remote'),
  modelProfileId: (import.meta.env.VITE_MODEL_PROFILE || ''),
  privateAgent: (import.meta.env.VITE_PRIVATE_AGENT === '1'),
  metrics: { entropy: 1.0, coherence: 0.0, phaseLock: 0.0 },
};

export function updateStackMode(mode) {
  GatewayState.stackMode = mode;
  emit('ctx:changed', { key: 'stackMode', value: mode });
}

export function updateModelProfile(id) {
  GatewayState.modelProfileId = id;
  emit('ctx:changed', { key: 'modelProfileId', value: id });
}

export function updateMetrics(partial) {
  GatewayState.metrics = { ...GatewayState.metrics, ...partial };
  emit('metrics:changed', { metrics: GatewayState.metrics });
}

export function trace(event) {
  emit('trace:emit', { ...event, t: Date.now() });
}
