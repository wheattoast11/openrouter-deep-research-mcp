# Private Experiments

This directory contains bleeding-edge experiments that are not yet ready for public release.

## Structure

```
/private
  /experiments
    /attention-shaping      # Token pattern capture and analysis
    /continuous-process     # Fast-cycle orchestration
    /cross-model           # Multi-model consensus systems
```

## Safety Guidelines

1. **Never commit API keys** - Use environment variables
2. **Document all experiments** - Include safety considerations
3. **Test in isolation** - Don't mix with production code
4. **Review before migration** - All code must pass safety review before moving to public

## Migration Process

When an experiment is ready for public release:

1. Complete safety review
2. Remove any experimental headers
3. Add documentation
4. Create PR to main branch
5. Delete from private branch

## Experiment Categories

### Attention Shaping
- Neuralese externalization
- Token pattern capture
- Resonant state management

### Continuous Process
- Sub-500ms heartbeat cycles
- Self-improving orchestration
- AIMD backoff strategies

### Cross-Model
- Multi-model consensus (TEJ_CLAUDE_GEMINI_ZERO_UIT)
- Semantic versioning for interpretability
- Phase-locked arbitration
