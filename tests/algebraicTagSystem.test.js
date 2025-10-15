/**
 * Algebraic Tag System - Test Suite
 * Validates compositional tool abstraction and protein-like encoding
 */

const {
  parseTagExpression,
  executeTagExpression,
  CommonSequences,
  TagToToolMap
} = require('../src/intelligence/algebraicTagSystem');

// Mock tool executor
class MockToolExecutor {
  constructor() {
    this.calls = [];
  }
  
  async call(toolName, params) {
    this.calls.push({ tool: toolName, params });
    return { success: true, tool: toolName, params };
  }
  
  reset() {
    this.calls = [];
  }
}

describe('Algebraic Tag System', () => {
  let executor;
  
  beforeEach(() => {
    executor = new MockToolExecutor();
  });
  
  describe('Parsing', () => {
    test('Single tag', () => {
      const result = parseTagExpression('R');
      expect(result.tags).toEqual(['R']);
      expect(result.estimatedOps).toBe(1);
      expect(result.executionPlan).toHaveLength(1);
      expect(result.executionPlan[0].tool).toBe('agent');
    });
    
    test('Function application: R(O(K))', () => {
      const result = parseTagExpression('R(O(K))');
      expect(result.tags).toContain('R');
      expect(result.tags).toContain('O');
      expect(result.tags).toContain('K');
      expect(result.estimatedOps).toBeGreaterThan(1);
    });
    
    test('Parallel execution: [R,S,T]', () => {
      const result = parseTagExpression('[R,S,T]');
      expect(result.executionPlan).toHaveLength(1);
      expect(result.executionPlan[0].op).toBe('parallel');
      expect(result.executionPlan[0].plans).toHaveLength(3);
    });
    
    test('Repetition: B^3', () => {
      const result = parseTagExpression('B^3');
      expect(result.estimatedOps).toBe(3);
      expect(result.executionPlan).toHaveLength(3);
      expect(result.executionPlan.every(step => step.tool === 'benchmark.run')).toBe(true);
    });
    
    test('Conditional: R/FS', () => {
      const result = parseTagExpression('R/FS');
      expect(result.executionPlan).toHaveLength(2);
      expect(result.executionPlan[0].op).toBe('try');
      expect(result.executionPlan[1].op).toBe('catch');
    });
    
    test('SOP Gate flow: O→A→D→X→V', () => {
      const result = parseTagExpression('O→A→D→X→V');
      expect(result.tags).toEqual(['O', 'A', 'D', 'X', 'V']);
      expect(result.estimatedOps).toBe(5);
    });
  });
  
  describe('Execution', () => {
    test('Execute single tag', async () => {
      const { executionPlan } = parseTagExpression('R');
      await executeTagExpression(executionPlan, executor);
      
      expect(executor.calls).toHaveLength(1);
      expect(executor.calls[0].tool).toBe('agent');
      expect(executor.calls[0].params.action).toBe('research');
    });
    
    test('Execute parallel tags', async () => {
      const { executionPlan } = parseTagExpression('[R,S]');
      await executeTagExpression(executionPlan, executor);
      
      // Should have 2 calls (parallel execution)
      expect(executor.calls.length).toBeGreaterThanOrEqual(2);
    });
    
    test('Execute repetition', async () => {
      const { executionPlan } = parseTagExpression('P^3');
      await executeTagExpression(executionPlan, executor);
      
      expect(executor.calls).toHaveLength(3);
      expect(executor.calls.every(c => c.tool === 'ping')).toBe(true);
    });
    
    test('Execute conditional (success case)', async () => {
      const { executionPlan } = parseTagExpression('P/PS');
      await executeTagExpression(executionPlan, executor);
      
      // Should only call 'ping' (primary), not fallback
      expect(executor.calls).toHaveLength(1);
      expect(executor.calls[0].tool).toBe('ping');
    });
  });
  
  describe('Common Sequences', () => {
    test('RESEARCH_FULL parses correctly', () => {
      const result = parseTagExpression(CommonSequences.RESEARCH_FULL);
      expect(result.tags).toContain('R');
      expect(result.estimatedOps).toBeGreaterThan(1);
    });
    
    test('PARALLEL_GATHER parses correctly', () => {
      const result = parseTagExpression(CommonSequences.PARALLEL_GATHER);
      expect(result.executionPlan[0].op).toBe('parallel');
      expect(result.executionPlan[0].plans).toHaveLength(3);
    });
    
    test('BENCHMARK_3X creates 3 benchmark calls', () => {
      const result = parseTagExpression(CommonSequences.BENCHMARK_3X);
      expect(result.executionPlan).toHaveLength(3);
      expect(result.executionPlan.every(step => step.tool === 'benchmark.run')).toBe(true);
    });
  });
  
  describe('Tag to Tool Mapping', () => {
    test('All tags map to valid tools', () => {
      const tags = Object.keys(TagToToolMap);
      expect(tags.length).toBeGreaterThan(10);
      
      // Verify core tags exist
      expect(TagToToolMap['R']).toBe('agent');
      expect(TagToToolMap['S']).toBe('search_index');
      expect(TagToToolMap['B']).toBe('benchmark.run');
      expect(TagToToolMap['M']).toBe('model.catalog');
    });
  });
  
  describe('Compositional Complexity', () => {
    test('Complex expression: I(A(R(O(K))))', () => {
      const result = parseTagExpression('I(A(R(O(K))))');
      expect(result.estimatedOps).toBeGreaterThan(3);
      expect(result.tags).toContain('I');
      expect(result.tags).toContain('A');
      expect(result.tags).toContain('R');
    });
    
    test('Mixed operators: [R^2,S]→V', () => {
      const result = parseTagExpression('[R^2,S]→V');
      expect(result.estimatedOps).toBeGreaterThan(2);
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  const runTests = async () => {
    console.log('🧬 Testing Algebraic Tag System\n');
    
    // Test parsing
    console.log('1️⃣  Parsing Tests:');
    const testCases = [
      'R',
      'R(O(K))',
      '[R,S,T]',
      'B^3',
      'R/FS',
      'O→A→D→X→V',
      CommonSequences.RESEARCH_FULL
    ];
    
    for (const expr of testCases) {
      try {
        const result = parseTagExpression(expr);
        console.log(`   ✅ ${expr.padEnd(20)} → ${result.estimatedOps} ops, ${result.tags.length} tags`);
      } catch (e) {
        console.log(`   ❌ ${expr.padEnd(20)} → ERROR: ${e.message}`);
      }
    }
    
    // Test execution
    console.log('\n2️⃣  Execution Tests:');
    const executor = new MockToolExecutor();
    
    for (const expr of ['R', 'P^3', '[R,S]']) {
      try {
        executor.reset();
        const { executionPlan } = parseTagExpression(expr);
        await executeTagExpression(executionPlan, executor);
        console.log(`   ✅ ${expr.padEnd(20)} → ${executor.calls.length} tool calls`);
      } catch (e) {
        console.log(`   ❌ ${expr.padEnd(20)} → ERROR: ${e.message}`);
      }
    }
    
    console.log('\n✨ Algebraic Tag System operational!\n');
  };
  
  runTests().catch(console.error);
}

module.exports = { MockToolExecutor };

