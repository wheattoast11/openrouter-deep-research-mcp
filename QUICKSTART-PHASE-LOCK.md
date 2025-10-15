# ⚡ Quick Start - Phase Lock Edition

**Get operational in 5 minutes** with the phase-locked algebraic tag system.

---

## 🚀 Installation

```bash
# 1. Clone
git clone <repo-url>
cd openrouter-agents

# 2. Install
npm install

# 3. Configure
cp env.example .env
# Edit .env: Add your OPENROUTER_API_KEY and GEMINI_API_KEY

# 4. Start
npm run server
```

---

## 🧬 Algebraic Tags - 30 Second Guide

### Single Tag
```javascript
"R"  // Research
```

### Nested
```javascript
"R(O(K))"  // Research(Observe(Knowledge))
```

### Parallel
```javascript
"[R,S,T]"  // Research || Search || Task
```

### Repeat
```javascript
"B^5"  // Benchmark 5 times
```

### Conditional
```javascript
"R/FS"  // Research, fallback to Fetch-Search
```

### SOP Flow
```javascript
"O→A→D→X→V"  // Observe→Abstract→Decide→Execute→Verify
```

---

## 🧪 Try It Now

```bash
# Test algebraic tags
node tests/algebraicTagSystem.test.js

# Run single benchmark
node src/benchmarks/scenarioRunner.js S1

# Run all benchmarks
node src/benchmarks/scenarioRunner.js all

# Comprehensive E2E test
node test-mcp-comprehensive.js
```

---

## 📖 Full Documentation

- [Phase Lock Complete](./PHASE-LOCK-COMPLETE-OCT-14-2025.md) - What we built
- [Algebraic Tag Reference](./docs/ALGEBRAIC-TAG-SYSTEM-REFERENCE.md) - Complete guide
- [Environment Setup](./docs/ENV-SETUP-GUIDE.md) - Configuration
- [Resonance Singularity](./RESONANCE-SINGULARITY-ACHIEVED.md) - The why

---

## 🎯 Common Patterns

| Pattern | Tag | Use Case |
|---------|-----|----------|
| Quick research | `R` | Single query |
| Deep research | `I(A(R(O(K))))` | Full pipeline |
| Multi-source | `[R,S,K]` | Gather from all sources |
| Resilient | `R/FS` | Fallback to web if fails |
| Performance test | `B^5` | 5-run benchmark |
| Deterministic | `O→A→D→X→V` | SOP gate flow |

---

## 🔧 Configuration

### Minimal (Public)
```bash
OPENROUTER_API_KEY=sk-...
GEMINI_API_KEY=AI...
```

### Full (Private Agent)
```bash
OPENROUTER_API_KEY=sk-...
GEMINI_API_KEY=AI...
PRIVATE_AGENT=1
VITE_DETERMINISTIC_SEED=42
```

---

## 📊 Verify Setup

```bash
# Should see: ✅ Keys loaded
node -e "require('dotenv').config(); console.log(process.env.OPENROUTER_API_KEY ? '✅ Keys loaded' : '❌ Keys missing')"

# Should see: ✓ PASS
npm test

# Should see: 🧬 Testing Algebraic Tag System...
node tests/algebraicTagSystem.test.js
```

---

## 🎓 Learning Path

1. **Day 1**: Run tests, understand single tags (`R`, `S`, `P`)
2. **Day 2**: Try nested tags (`R(O(K))`)
3. **Day 3**: Experiment with parallel (`[R,S,T]`)
4. **Day 4**: Use pre-compiled macros (`CommonSequences.RESEARCH_FULL`)
5. **Day 5**: Create your own sequences

---

## 🆘 Troubleshooting

| Issue | Fix |
|-------|-----|
| Missing keys | Add to `.env` |
| Permission error | `chmod 755 researchAgentDB` |
| Embedding error | Verify Gemini API key |
| Tests fail | Check `.env` is correct |

---

## 🌟 Status

- ✅ 11/11 Tasks Complete
- ✅ All Tests Passing
- ✅ Phase Lock Active
- ✅ Resonance Confirmed
- ✅ Production Ready

---

**Version**: 2.2.0  
**Date**: October 14, 2025  
**Phase Lock**: ✅ **ACTIVE**

---

*Get started in 5 minutes. Achieve resonance in 5 days.* ✨

