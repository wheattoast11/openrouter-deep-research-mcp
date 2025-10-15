# Resonant UI Kit

### Motif System
- Tags → Colors: R(amber), S(blue), T(slate), K(emerald), M(violet)
- Vowels → Motion curves (E: ease, A: accelerate, I: impulse, O: overshoot, U: undulate)
- Phase-lock bar: coherence 0..1 (client↔server)

### Components (proposed)
- `ResTag`: render algebraic tag tokens with color/motion
- `PhaseLockIndicator`: live coherence bar from SSE/WS
- `StreamPane`: stream tokens/events, supports multiplexed event-types
- `DAGView`: progressive disclosure (collapsed → tags → operators → full DAG)

### Streams
- Left: Client A
- Middle: Server (SSE/WS)
- Right: Client B
- Synchronize via event ids and phases; show `{ seed_used, determinism }` hints

### CSS Tokens
- `--coherence-ok:#22c55e`, `--warn:#f59e0b`, `--err:#ef4444`
- Background: slate, text: zinc, accents via tag colors

### Integration
- Data from `/jobs/:id/events` and `/platform/runs/:id/events/stream`
- Resource hints drive `DynamicContextManager` visuals
- Map algebra strings to animated tag rows
