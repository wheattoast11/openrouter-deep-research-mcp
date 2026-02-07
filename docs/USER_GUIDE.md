# Agent Zero: Operator's Handbook (v1.12.0)

**Welcome, Operator.**

You are interacting with **Agent Zero**, a bleeding-edge autonomous research system designed to extend your cognitive reach. This version (v1.12.0) introduces "Resilient Cognition" — the ability to self-heal and adapt when external AI providers are stressed.

This guide walks you through the core "User Journeys" to get the most out of the system.

---

## 🚀 Journey 1: The "Curiosity" Run (Basic Research)
**Goal:** Answer a complex question with depth and verified citations.

**Scenario:** You want to understand a complex topic without wading through SEO-spam results.

**Command:**
```bash
node bin/zero research "What are the latest breakthroughs in solid-state batteries as of 2025?"
```

**What to Observe:**
1.  **Planning:** The agent decomposes your question into sub-queries (e.g., "electrolyte materials", "manufacturing scaling").
2.  **Parallel Execution:** Multiple sub-agents browse the web and query knowledge bases simultaneously.
3.  **Synthesis:** The system compiles a final report.
4.  **Verification:** It cross-references claims against source signals to prevent hallucinations.

**Optimal Usage:**
- Use specific queries. "Solid-state batteries" is good; "Solid-state battery energy density vs lithium-ion" is better.

---

## 🛡️ Journey 2: The "Pressure Test" (Graceful Degradation)
**Goal:** Observe the system's resilience when AI providers are overwhelmed.

**Scenario:** You are doing heavy research during peak hours, or you have hit a rate limit on your primary API key.

**Command:**
```bash
# This forces the system to run hard, likely triggering rate limits or fallback logic
node bin/zero research "Detailed timeline of the Roman Empire's fall including economic factors" --cost low
```

**The "Magic" Moment:**
- Normally, if an API key fails (Error 429/403), the program would crash.
- **Now:** Watch the output. If a key fails, you might see a brief pause, then research continues.
- **Degradation Indicator:** At the end, you might see a subtle message:
  `[degraded] fallback models used (2)`
- This means Agent Zero automatically switched to a backup model or rotated your API key to ensure your job finished.

---

## 📊 Journey 3: The "Health Check" (System Status)
**Goal:** Verify your cognitive infrastructure is healthy.

**Command:**
```bash
node bin/zero status
```

**What to Look For:**
- **Provider Health:** A new section showing success rates and latency.
  ```text
  Provider Health:
  • openrouter: 100% success (15 reqs) | 450ms avg
  ```
- **System:** Confirmation that your Database and Embedder are `Connected` and `Ready`.

---

## 🧩 Journey 4: Interactive Session (The "Vibe" Mode)
**Goal:** Collaborate with the agent in a REPL loop.

**Command:**
```bash
# Starts the interactive mode (if configured in your environment)
node bin/zero
```
*Note: If no interactive mode is active, it defaults to help. Use `node src/server/mcpServer.js` to run the server for Claude Desktop.*

---

## 💡 Pro-Tips for Optimality

1.  **Multi-Key Setup:**
    In your `.env` file, you can now provide multiple keys:
    ```env
    OPENROUTER_API_KEYS=sk-or-key1,sk-or-key2,sk-or-key3
    ```
    Agent Zero will automatically rotate them if one burns out.

2.  **Cost Control:**
    Use `--cost low` for broad, fast sweeps. Use `--cost high` (default) for deep, reasoning-heavy tasks.

3.  **Silent Recovery:**
    You don't need to do anything when errors happen. The system attempts to recover automatically. You only need to intervene if you see a critical failure message at the very end.

---

**Status:** `OPERATIONAL`
**Version:** `1.12.0`
**Construct:** `Agent Zero`
