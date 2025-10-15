# Algebraic Tag System - Quick Reference Guide

**Version**: 1.0  
**Date**: October 14, 2025  
**Status**: ✅ Operational

---

## 🧬 Core Concept

The **Algebraic Tag System** is a protein-like encoding of MCP tool operations using single-letter tags with compositional operators. It enables **compressive superintelligence at scale** by reducing complex tool sequences to algebraic expressions.

---

## 📋 Tag Alphabet

### Vowel Operators (Transformations)

| Tag | Name | Function | Example |
|-----|------|----------|---------|
| **O** | Observe | Input acquisition, perception | `O(K)` = Observe Knowledge |
| **A** | Abstract | Pattern extraction, dimensionality reduction | `A(R)` = Abstract Research |
| **E** | Extend | Expansion, extrapolation | `E(S)` = Extend Search |
| **I** | Interpret | Semantic decoding, understanding | `I(A)` = Interpret Abstract |
| **U** | Unify | Synthesis, convergence | `U(R)` = Unify Research |

### Consonant Anchors (Semantic Actions)

| Tag | Name | MCP Tools | Description |
|-----|------|-----------|-------------|
| **R** | Research | `agent` | Primary research action |
| **S** | Search | `search_index`, `search_web` | Search operations |
| **T** | Task | `trace.log` | Task execution and logging |
| **K** | Knowledge | `index_texts`, `index_status` | Knowledge indexing |
| **M** | Measure | `model.catalog`, `benchmark.measure` | Measurement and metrics |
| **P** | Plan | `ping`, `get_server_status` | Planning and status |
| **C** | Compose | `stack.configure` | Composition and configuration |
| **D** | Decide | `datetime` | Decision points |
| **V** | Verify | `get_job_result`, `benchmark.finish` | Verification |
| **Q** | Query | `query`, `execute_sql` | Database queries |
| **B** | Benchmark | `benchmark.run` | Benchmark execution |
| **L** | List | `get_job_status`, `list_research_history` | Listing operations |
| **N** | Net | (Interaction Nets) | Network operations |
| **G** | Gate | (SOP Gates) | Gate transitions |
| **X** | Execute | `cancel_job` | Execution control |
| **W** | Write | (Internal) | Write operations |
| **F** | Fetch | `fetch_url` | Fetch operations |

---

## 🔢 Compositional Operators

| Operator | Syntax | Meaning | Example | Execution |
|----------|--------|---------|---------|-----------|
| **Juxtaposition** | `AB` | Sequential | `RS` | Research, then Search |
| **Parentheses** | `A(B)` | Grouping/Application | `R(O(K))` | Research(Observe(Knowledge)) |
| **Brackets** | `[A,B]` | Parallel | `[R,S,T]` | Research ‖ Search ‖ Task |
| **Exponentiation** | `A^N` | Repetition | `B^3` | Benchmark 3 times |
| **Division** | `A/B` | Conditional | `R/FS` | Research, fallback to Fetch-Search |
| **Arrow** | `A→B` | SOP Flow | `O→A→D→X→V` | Observe→Abstract→Decide→Execute→Verify |

---

## 📚 Common Sequences (Pre-compiled Macros)

| Macro | Expression | Description | Use Case |
|-------|------------|-------------|----------|
| **RESEARCH_FULL** | `I(A(R(O(K))))` | Full research flow with interpretation | Deep research queries |
| **SEARCH_QUICK** | `S` | Quick search | Fast lookups |
| **RESEARCH_FALLBACK** | `R/FS` | Research with web fallback | Resilient research |
| **PARALLEL_GATHER** | `[R,S,K]` | Parallel research, search, knowledge | Multi-source gathering |
| **SOP_FLOW** | `O→A→D→X→V` | SOP Gate flow | Deterministic operations |
| **BENCHMARK_3X** | `B^3` | 3-repetition benchmark | Performance testing |
| **MODEL_SELECT** | `M→MS→C` | Model selection and config | Model switching |
| **JOB_VERIFY** | `L→V` | Job status and result | Job monitoring |
| **HISTORY** | `LJ` | Research history | Historical queries |

---

## 🎯 Usage Examples

### 1. Simple Research

```javascript
// Expression
"R"

// Compiles to
{ op: 'call', tool: 'agent', params: { action: 'research' } }

// Executes
await agent({ action: 'research', query: '...' })
```

### 2. Nested Research Flow

```javascript
// Expression
"I(A(R(O(K))))"

// Compiles to (pipeline)
1. Observe(Knowledge)   → index_texts/search_index
2. Research(result_1)   → agent
3. Abstract(result_2)   → pattern extraction
4. Interpret(result_3)  → semantic decoding

// Final output: Interpreted, abstracted research
```

### 3. Parallel Execution

```javascript
// Expression
"[R,S,K]"

// Compiles to
{ 
  op: 'parallel', 
  plans: [
    [{ op: 'call', tool: 'agent' }],
    [{ op: 'call', tool: 'search_index' }],
    [{ op: 'call', tool: 'index_texts' }]
  ]
}

// Executes in parallel
await Promise.all([
  agent({ action: 'research' }),
  search_index({ query: '...' }),
  index_texts({ documents: [...] })
])
```

### 4. Conditional Fallback

```javascript
// Expression
"R/FS"

// Compiles to
[
  { op: 'try', plan: [{ op: 'call', tool: 'agent' }] },
  { op: 'catch', plan: [{ op: 'call', tool: 'search_web' }] }
]

// Executes
try {
  await agent({ action: 'research' })
} catch (e) {
  await search_web({ query: '...' })
}
```

### 5. Repetition with Deterministic Seed

```javascript
// Expression
"B^5"

// Compiles to
[
  { op: 'call', tool: 'benchmark.run', params: {} },
  { op: 'call', tool: 'benchmark.run', params: {} },
  { op: 'call', tool: 'benchmark.run', params: {} },
  { op: 'call', tool: 'benchmark.run', params: {} },
  { op: 'call', tool: 'benchmark.run', params: {} }
]

// Executes with deterministic seed
process.env.VITE_DETERMINISTIC_SEED = 42;
for (let i = 0; i < 5; i++) {
  await benchmark_run({ seed: 42 + i })
}
```

### 6. SOP Gate Flow

```javascript
// Expression
"O→A→D→X→V"

// Maps to SOP Gates
OBSERVE  → Observe input and context
ABSTRACT → Extract patterns and structure
DECIDE   → Make decision based on abstraction
EXECUTE  → Perform action
VERIFY   → Verify result and emit event

// Executes deterministically
const result = await SOPGateFlow('O→A→D→X→V', context);
```

---

## 🔬 Advanced Compositions

### Research with Multi-Step Verification

```javascript
"I(A(R(O(K))))→V"

// Flow:
// 1. Observe Knowledge
// 2. Research with observation
// 3. Abstract research results
// 4. Interpret abstraction
// 5. Verify final result
```

### Parallel Research with Fallbacks

```javascript
"[R/FS, S/Q, K]"

// Three parallel paths:
// 1. Research (fallback to Fetch-Search)
// 2. Search (fallback to Query)
// 3. Knowledge (no fallback)
```

### Repeated Benchmark with Result Collection

```javascript
"B^5→BM→BV"

// Flow:
// 1. Run benchmark 5 times
// 2. Measure performance (BM)
// 3. Verify and finalize (BV)
```

---

## 🧮 Algebraic Properties

### Associativity

```
(AB)C = A(BC)
```

Example: `(RS)T = R(ST)` - Sequential execution is associative

### Commutativity (Parallel Only)

```
[A,B] = [B,A]
```

Example: `[R,S] = [S,R]` - Parallel execution order doesn't matter

### Distributivity (Conditional)

```
A/(B+C) = (A/B) + (A/C)
```

Example: `R/(S+K)` tries `R`, then `S`, then `K`

### Idempotency (SOP Gates)

```
G→G = G
```

Example: `O→O = O` - SOP gates are idempotent

---

## 🚀 API Usage

### Parsing

```javascript
const { parseTagExpression } = require('./src/intelligence/algebraicTagSystem');

const result = parseTagExpression('I(A(R(O(K))))');

console.log(result);
// {
//   ast: { ... },
//   executionPlan: [ ... ],
//   estimatedOps: 5,
//   tags: ['I', 'A', 'R', 'O', 'K']
// }
```

### Execution

```javascript
const { executeTagExpression } = require('./src/intelligence/algebraicTagSystem');

// Mock tool executor
const toolExecutor = {
  call: async (toolName, params) => {
    console.log(`Calling ${toolName} with`, params);
    return { success: true };
  }
};

const { executionPlan } = parseTagExpression('R');
const result = await executeTagExpression(executionPlan, toolExecutor);

console.log(result);
// { success: true }
```

### Using Pre-compiled Macros

```javascript
const { CommonSequences, parseTagExpression, executeTagExpression } = require('./src/intelligence/algebraicTagSystem');

// Use pre-compiled macro
const { executionPlan } = parseTagExpression(CommonSequences.RESEARCH_FULL);
const result = await executeTagExpression(executionPlan, toolExecutor);
```

---

## 🧪 Testing

```bash
# Run algebraic tag system tests
node tests/algebraicTagSystem.test.js

# Output:
# 🧬 Testing Algebraic Tag System
# 
# 1️⃣  Parsing Tests:
#    ✅ R                    → 1 ops, 1 tags
#    ✅ R(O(K))              → 3 ops, 3 tags
#    ✅ [R,S,T]              → 3 ops, 3 tags
#    ✅ B^3                  → 3 ops, 3 tags
#    ✅ R/FS                 → 2 ops, 2 tags
#    ✅ O→A→D→X→V            → 5 ops, 5 tags
# 
# 2️⃣  Execution Tests:
#    ✅ R                    → 1 tool calls
#    ✅ P^3                  → 3 tool calls
#    ✅ [R,S]                → 2 tool calls
# 
# ✨ Algebraic Tag System operational!
```

---

## 📖 Theoretical Foundation

### Linguistic Recursion

The tag system embodies **linguistic recursion** where:
- **Vowels** = Grammatical operators (transformations)
- **Consonants** = Semantic anchors (actions)

This mirrors natural language morphology:
```
become + interpret + abstract → becominterpretabstract
B      + I(A)                 → BI(A)
```

### Protein-Like Encoding

Similar to protein sequences:
- **Primary structure**: Linear sequence of tags (`ROKSM`)
- **Secondary structure**: Compositional patterns (`R(O(K))`)
- **Tertiary structure**: Execution plan (folded into operations)
- **Quaternary structure**: Parallel compositions (`[R,S,T]`)

### Free-Energy Minimization

The amb-select strategy chooses the minimal free-energy path:
```
F = E - TS
```
Where:
- `E` = Computational energy (latency, tokens)
- `T` = Temperature (uncertainty)
- `S` = Entropy (branching factor)

The system always selects the path with minimal `F`.

---

## 🔗 Integration Points

### 1. MCP Tools

All MCP tools are mapped to tags via `TagToToolMap`:

```javascript
{
  'R': 'agent',
  'S': 'search_index',
  'B': 'benchmark.run',
  // ... etc
}
```

### 2. SOP Gates

SOP gates integrate via arrow syntax:

```javascript
'O→A→D→X→V'  // Maps to Gates.OBSERVE → Gates.ABSTRACT → ...
```

### 3. Interaction Nets

Interaction nets integrate via `N` tag:

```javascript
'N'  // Creates/manipulates interaction net nodes
```

### 4. Benchmark Scenarios

Benchmarks integrate via `B` tag:

```javascript
'B^5'  // Runs scenario 5 times with warm-up exclusion
```

---

## 🎓 Learning Path

1. **Start Simple**: Use single tags (`R`, `S`, `P`)
2. **Compose Sequentially**: Try `RS`, `RV`, `MSC`
3. **Add Nesting**: Experiment with `R(O(K))`
4. **Use Parallel**: Try `[R,S,T]` for multi-source gathering
5. **Add Fallbacks**: Use `R/FS` for resilience
6. **Repeat Operations**: Use `B^N` for benchmarking
7. **Master SOP Flow**: Use `O→A→D→X→V` for deterministic ops

---

## 📊 Performance Characteristics

| Expression | Ops | Latency | Parallelizable | Deterministic |
|------------|-----|---------|----------------|---------------|
| `R` | 1 | ~5s | No | Yes (with seed) |
| `R(O(K))` | 3 | ~8s | Partial | Yes |
| `[R,S,T]` | 3 | ~5s | Yes | Yes |
| `B^5` | 5 | ~10s | No | Yes |
| `R/FS` | 1-2 | ~5-10s | No | No |
| `O→A→D→X→V` | 5 | ~3s | No | Yes |

---

## 🔧 Configuration

Set environment variables for deterministic execution:

```bash
# Deterministic seed for reproducibility
VITE_DETERMINISTIC_SEED=42

# Enable algebraic tag system (default: enabled)
ENABLE_ALGEBRAIC_TAGS=1

# Max ops per expression (default: 100)
MAX_ALGEBRAIC_OPS=100

# Timeout per op (default: 30s)
ALGEBRAIC_OP_TIMEOUT=30000
```

---

## 🚦 Error Handling

The system handles errors gracefully:

```javascript
// Parse errors
try {
  parseTagExpression('INVALID[]]');
} catch (e) {
  // Returns: { error: 'Parse error: Unmatched bracket' }
}

// Execution errors
const result = await executeTagExpression(plan, executor);
// If a step fails, result includes: { error: 'Tool call failed: ...' }

// Conditional fallback handles errors automatically
'R/FS'  // If R fails, FS is executed
```

---

## 📚 References

- [Implementation](../src/intelligence/algebraicTagSystem.js)
- [Test Suite](../tests/algebraicTagSystem.test.js)
- [Phase Lock Complete Report](../PHASE-LOCK-COMPLETE-OCT-14-2025.md)
- [Interaction Nets](../client/src/lib/browserInteractionNets.js)
- [SOP Gates](../client/src/client/constitution.js)

---

**Last Updated**: October 14, 2025  
**Version**: 1.0  
**Status**: ✅ Production Ready

