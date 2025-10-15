// DynamicContextManager: compute context length and RoPE scaling from resources & event complexity
export type ResourceSnapshot = { memMB?: number; cores?: number; gpu?: boolean };
export type ContextConfig = { context_len: number; rope_scale: number; device: 'webgpu'|'cpu' };

export class DynamicContextManager {
  private baseContext: number;
  private defaultTheta: number;

  constructor(baseContext = 8192, defaultTheta = 10000) {
    this.baseContext = baseContext;
    this.defaultTheta = defaultTheta;
  }

  estimateEventComplexity(eventSpan: { branches?: number; amb?: number; parallel?: number } = {}): number {
    const b = Math.max(1, Number(eventSpan.branches || 1));
    const a = Math.max(1, Number(eventSpan.amb || 1));
    const p = Math.max(1, Number(eventSpan.parallel || 1));
    return Math.log2(1 + b * a * p);
  }

  calculate(resources: ResourceSnapshot = {}, eventSpan: { branches?: number; amb?: number; parallel?: number } = {}): ContextConfig {
    const mem = Math.max(256, Number(resources.memMB || 4096));
    const device: 'webgpu'|'cpu' = resources.gpu ? 'webgpu' : 'cpu';
    const complexity = this.estimateEventComplexity(eventSpan);

    // Simple meter: allow up to 4x scaling when enough memory is present
    const memFactor = Math.min(mem / 4096, 4);
    const target = Math.floor(this.baseContext * Math.min(4, (1 + complexity)));
    const contextLen = Math.min(target, Math.floor(this.baseContext * memFactor));
    const ropeScale = Math.max(1, contextLen / this.baseContext);

    return { context_len: contextLen, rope_scale: ropeScale, device };
  }
}

export default new DynamicContextManager();


