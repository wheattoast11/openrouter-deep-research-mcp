# Git Workflow for v2.0 Release

## Current State

- Working on: `release/v1.5.1` branch
- Changes: All v2.0 features implemented
- Status: Ready for branch and release

## Recommended Strategy

### Option 1: Beta Branch (Recommended for Safety)

Create a parallel beta branch for v2.0 while keeping v1.x stable:

```bash
# Create and switch to v2.0 beta branch
git checkout -b release/v2.0.0-beta

# Stage all changes
git add .

# Commit with detailed message
git commit -m "feat: v2.0.0-beta - Agentic Intelligence Platform

MAJOR FEATURES:
- Bidirectional WebSocket communication (/mcp/ws)
- Temporal awareness with cron-based scheduling
- Universal knowledge graph with auto-extraction
- Unified retrieval (graph + vector + BM25)
- Magic workflow prompts (summarize_and_learn, daily_briefing, continuous_query)
- Full MCP resource subscriptions
- Optional Terminals-themed client UI

NEW MODULES:
- src/server/wsTransport.js
- src/utils/temporalAgent.js
- src/utils/graphManager.js
- client/ (React app)

ENHANCEMENTS:
- Enhanced retrieve tool with knowledge graph
- 4 new tools (schedule_action, list_schedules, cancel_schedule, query_graph)
- Auto-extraction of entities from research reports
- Proactive agent notifications

BUG FIXES:
- Job status not found error
- async:false being ignored
- Duplicate idempotency keys
- Embedder status showing null

BREAKING CHANGES: None (100% backward compatible)

Co-authored-by: AI Agent <ai@terminals.tech>"

# Push beta branch
git push origin release/v2.0.0-beta

# Merge to main when validated
git checkout main
git merge release/v2.0.0-beta
git tag -a v2.0.0 -m "Release v2.0.0 - Agentic Intelligence Platform"
git push origin main --tags
```

### Option 2: Direct Release (If Confident)

```bash
# Commit directly to current branch
git add .
git commit -m "feat: v2.0.0 - Agentic Intelligence Platform

[Same commit message as above]"

# Create and push tag
git tag -a v2.0.0 -m "Release v2.0.0"
git push origin release/v1.5.1 --tags

# Create release branch
git checkout -b release/v2.0.0
git push origin release/v2.0.0
```

## NPM Publishing

```bash
# Ensure you're logged in
npm whoami

# Dry run to verify package contents
npm pack
tar -tzf terminals-tech-openrouter-agents-2.0.0.tgz

# Publish
npm publish --access public

# Verify
npm view @terminals-tech/openrouter-agents
```

## GitHub Release

Create a release on GitHub with:

**Tag**: `v2.0.0`  
**Title**: `v2.0.0 - Agentic Intelligence Platform`  
**Description**: Contents of `docs/RELEASE-v2.0.0.md`

**Assets to Attach**:
- `terminals-tech-openrouter-agents-2.0.0.tgz` (npm package)
- `client/` as separate zip (optional UI)

## Post-Release Checklist

- [ ] npm package published
- [ ] GitHub release created
- [ ] README.md updated on GitHub
- [ ] Update terminals.tech website
- [ ] Announce on social media / community
- [ ] Monitor npm downloads
- [ ] Monitor GitHub issues
- [ ] Respond to early adopter feedback

## Rollback Procedure

If critical issues found:

```bash
# Deprecate v2.0.0 on npm
npm deprecate @terminals-tech/openrouter-agents@2.0.0 "Critical issue found, use v1.6.0"

# Publish patched version
# (Fix issues, bump to v2.0.1)
npm publish

# Or, direct users back to v1.6.0
npm dist-tag add @terminals-tech/openrouter-agents@1.6.0 latest
```

## Branch Strategy Going Forward

```
main                    - Latest stable release
  ├─ release/v2.0.0     - v2.0 release branch
  ├─ release/v1.6.0     - v1.6 (security fixes only)
  └─ develop            - Active development for v2.1
```

## Semantic Versioning Policy

- **MAJOR** (2.0.0): New paradigm, backward compatible
- **MINOR** (2.X.0): New features, backward compatible
- **PATCH** (2.0.X): Bug fixes only

Next version will be:
- `v2.0.1` for bug fixes
- `v2.1.0` for new features (multi-tenant graphs)
- `v3.0.0` only if breaking changes required

---

**Recommendation**: Use Option 1 (beta branch) for 1-2 weeks of user validation before merging to main.

