# Cognitive Substrate Integration Notes

## Quick Reference

### Starting the Client

```powershell
cd client
npm install  # First time only
npm run dev  # Starts Vite dev server on http://localhost:5173
```

### Mode Toggle

Click the button in the top-right header:
- **🌐 Server**: Connect to remote MCP server (requires server running on port 3008)
- **🧠 Local**: Run Cognitive Substrate locally in browser (no server needed)

## Technical Details

### Component Structure

```
client/src/components/CognitiveSubstrate.jsx
├── Three.js Scene Management
│   ├── 1500-particle system
│   ├── Orbital camera with golden ratio motion
│   └── Real-time color/position updates
├── Transformers.js Integration
│   ├── Singleton model loader
│   ├── Qwen1.5-0.5B-Chat pipeline
│   └── WebGPU/WASM fallback
├── Agent Classes
│   ├── Planner (breaks down tasks)
│   └── Synthesizer (generates responses)
└── React State Management
    ├── systemState (entropy, coherence, phaseLock, status)
    ├── agents (Map of Agent instances)
    ├── agentStates (UI state per agent)
    └── consoleOutput (conversation log)
```

### State Flow

```
User submits query
  → systemState.status = 'THINKING'
  → Particles converge (entropy ↓, coherence ↑, phaseLock ↑)
  → Planner.think() executes
  → Synthesizer.think() executes
  → systemState.status = 'IDLE'
  → Particles disperse (entropy ↑, coherence ↓, phaseLock ↓)
```

## Performance Characteristics

### First Load

- Model download: ~250MB (cached by browser after first load)
- Initialization time: 5-10 seconds (one-time cost)
- Subsequent loads: <1 second (from browser cache)

### Inference

- Planner: ~500-1000ms (150 tokens max)
- Synthesizer: ~500-1000ms (150 tokens max)
- Total response time: ~1-2 seconds (depends on hardware)

### Visualization

- 60fps particle animation
- Smooth state transitions (exponential smoothing, α=0.05)
- No frame drops on modern hardware

## Browser Compatibility

### Supported

- ✅ Chrome/Edge 113+ (WebGPU support)
- ✅ Firefox 120+ (WebGPU experimental)
- ✅ Safari 18+ (WebGPU preview)

### Fallback

- 🟡 Older browsers use WASM (slower, but functional)
- 🟡 Mobile browsers (limited by memory, 2-3× slower)

## Troubleshooting

### Model fails to load

**Issue**: `Failed to load Transformers.js` error  
**Solution**: Check browser console for CORS errors. Ensure CDN access is not blocked.

### Canvas not rendering

**Issue**: Black screen, no particles  
**Solution**: 
1. Check if WebGL is enabled in browser
2. Try hardware acceleration toggle in browser settings
3. Inspect console for Three.js errors

### Slow inference

**Issue**: Agents take >5 seconds to respond  
**Solution**:
1. Check if WebGPU is active (should see "[WebGPU]" in console)
2. Close other GPU-intensive tabs
3. Reduce `max_new_tokens` in `CognitiveSubstrate.jsx` (currently 150)

### Memory errors

**Issue**: "Out of memory" or browser crashes  
**Solution**:
1. Refresh page to clear cached models
2. Close other tabs
3. Use smaller model (replace `Qwen1.5-0.5B-Chat` with `Qwen2-0.5B-Instruct`)

## Development Tips

### Hot Module Replacement

Vite supports HMR. Changes to `CognitiveSubstrate.jsx` will reload automatically without losing Three.js state (canvas will re-initialize).

### Debugging Agents

Add logging to agent execution:

```javascript
async think(userInput, updateUI) {
  console.log(`[${this.id}] Thinking:`, userInput);
  // ... existing logic
  console.log(`[${this.id}] Result:`, result);
  return result;
}
```

### Adjusting Visualization

Modify particle behavior in the animation loop:

```javascript
// Increase coherence effect (stronger convergence)
const coherentForce = -positions[i3] * 0.001 * systemState.coherence; // was 0.0005

// Faster state transitions
setSystemState(prev => ({
  ...prev,
  entropy: prev.entropy + (targetEntropy - prev.entropy) * 0.1 // was 0.05
}));
```

### Custom Agent Prompts

Edit system prompts in `useEffect` initialization:

```javascript
const plannerAgent = new Agent(
  'planner',
  'Planner',
  'Custom planning instructions here...'
);
```

## Integration with Existing Components

The Local Mode is completely isolated from Remote Mode components:

- ❌ Does NOT use `EventStream`
- ❌ Does NOT use `KnowledgeGraph`
- ❌ Does NOT use `CommandBar`
- ❌ Does NOT connect to WebSocket
- ✅ Fully self-contained rendering
- ✅ Independent state management
- ✅ Direct user input (no MCP protocol)

## Deployment

### Development

```powershell
cd client
npm run dev
```

Access at http://localhost:5173

### Production

```powershell
cd client
npm run build
```

Output in `client/dist/` - deploy as static site.

### Environment Variables

No environment variables needed for Local Mode (fully self-contained).

For Remote Mode, pass token via URL: `?token=YOUR_JWT_TOKEN`

## Future Enhancements

See `COGNITIVE-SUBSTRATE-INTEGRATION-COMPLETE.md` for Phase 2 and Phase 3 roadmap.

---

**Last Updated**: October 13, 2025  
**Maintainer**: Tej Desai  
**Status**: Production Ready

