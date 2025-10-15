const listeners = new Map();
let remoteForward = null; // optional forwarder (ws)

function emit(type, detail) {
  const subs = listeners.get(type);
  if (!subs) return;
  for (const fn of subs) {
    try { fn(detail); } catch (e) { /* noop */ }
  }
}

export function setRemoteForwarder(sendFn) {
  remoteForward = typeof sendFn === 'function' ? sendFn : null;
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
  const payload = { ...event, t: Date.now() };
  // local listeners
  emit('trace:emit', payload);
  // remote forwarding when in remote mode and forwarder present
  try {
    if (GatewayState.stackMode !== 'local' && remoteForward) {
      const req = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'trace.log', arguments: { event: payload } },
        id: Date.now()
      };
      remoteForward(JSON.stringify(req));
    }
  } catch (_) {}
}
