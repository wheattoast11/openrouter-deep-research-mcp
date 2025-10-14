import { trace } from './ContextGateway';

export const Gates = Object.freeze({
  OBSERVE: 'observe',
  ABSTRACT: 'abstract',
  DECIDE: 'decide',
  ACT: 'act',
  VERIFY: 'verify',
});

export function enterGate(gate, context = {}) {
  trace({ type: 'sop:gate:entered', gate, context });
}

export function verify(result, policy = {}) {
  const passed = !policy?.fails?.(result);
  trace({ type: 'verify:' + (passed ? 'passed' : 'failed'), result });
  return passed;
}

export const Policies = {
  redaction: (text) => (typeof text === 'string' ? text.replace(/(sk-[a-z0-9]+)/gi, 'sk-xxx') : text),
  rateLimit: () => true,
};
