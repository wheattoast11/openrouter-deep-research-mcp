# Beta Release Checklist v2.1.1

**Release Date**: _TBD_  
**Release Manager**: _TBD_  
**Branch**: `beta`

## Pre-Release Validation

### Code Quality
- [ ] All automated tests pass (`npm run test:all-beta`)
- [ ] No linter errors (`npm run lint` if available)
- [ ] No TypeScript errors (if applicable)
- [ ] No high/critical security vulnerabilities (`npm audit`)
- [ ] Dependencies up to date (`npm outdated`)

### Feature Validation
- [ ] BETA_FEATURES master flag implemented in `config.js`
- [ ] PLL streaming logic functional (telemetry emits correctly)
- [ ] Compression policies operational
- [ ] Idempotency system works with toggle
- [ ] Circuit breaker logic doesn't crash server
- [ ] Beta features can be disabled (BETA_FEATURES=false restores v2.1 behavior)

### Test Suite
- [ ] E2E user journeys pass (`npm run test:e2e`)
- [ ] Beta features isolation tests pass (`npm run test:beta`)
- [ ] MCP SDK compatibility tests pass (`npm run test:sdk`)
- [ ] Streaming contract tests pass (`npm run test:stream`)
- [ ] Smoke test passes (`node scripts/beta-smoke-test.js`)
- [ ] Production readiness check passes (`node scripts/production-readiness-check.js`)

### Documentation
- [ ] README.md updated with beta highlights
- [ ] CHANGELOG.md has v2.1.1-beta entry
- [ ] env.example includes all beta variables with explanations
- [ ] QUICKSTART-v2.1.1-beta.md created
- [ ] BETA-USER-JOURNEYS.md created
- [ ] PLATFORM-INTEGRATION.md created
- [ ] DOCKER-DEPLOYMENT.md created
- [ ] BETA-RELEASE-CHECKLIST.md (this file) completed
- [ ] MANUAL-QA-PROTOCOL.md created

### Configuration Templates
- [ ] `config-templates/dev.env` created
- [ ] `config-templates/staging.env` created
- [ ] `config-templates/production-stable.env` created
- [ ] `config-templates/production-beta.env` created
- [ ] `config-templates/docker-compose.yml` created
- [ ] `config-templates/platform-integration.js` created

### Docker
- [ ] Dockerfile builds successfully (`docker build -t openrouter-agents:test .`)
- [ ] Docker image runs successfully
- [ ] Docker image tested locally with env overrides
- [ ] Health checks functional
- [ ] Volume mounts work for PGlite persistence

### Git & Version Control
- [ ] All changes committed to `beta` branch
- [ ] Commit messages follow convention
- [ ] No uncommitted changes (`git status` clean)
- [ ] Git tags created (`v2.1.1-beta`)
- [ ] Branch pushed to origin

### Package Registry
- [ ] package.json version is "2.1.1-beta"
- [ ] package.json bin scripts defined
- [ ] npm publish dry-run succeeds (`npm publish --dry-run`)
- [ ] package.json files array includes necessary files
- [ ] .npmignore excludes test artifacts

### GitHub Release
- [ ] Release notes drafted
- [ ] Release marked as "Pre-release"
- [ ] Changelog excerpt included in release body
- [ ] Known limitations documented
- [ ] Upgrade instructions provided

## Post-Release Validation

### Installation Testing
- [ ] Fresh npm install works (`npm install @terminals-tech/openrouter-agents@2.1.1-beta`)
- [ ] Global install works (`npm install -g @terminals-tech/openrouter-agents@2.1.1-beta`)
- [ ] npx execution works (`npx @terminals-tech/openrouter-agents@2.1.1-beta --stdio`)
- [ ] Binary commands accessible (`openrouter-agents --help`)

### Deployment Testing
- [ ] STDIO mode works in Cursor/VS Code
- [ ] HTTP/SSE mode works as daemon
- [ ] WebSocket connections functional
- [ ] Docker deployment successful
- [ ] docker-compose example works

### Integration Testing
- [ ] MCP SDK client can connect
- [ ] terminals.tech platform integration validated (if applicable)
- [ ] OAuth 2.1 authentication works
- [ ] Rate limiting functional

### Monitoring
- [ ] Server startup logs clean
- [ ] No unexpected errors in production logs
- [ ] Performance metrics acceptable
- [ ] Memory usage stable

## Rollback Plan

If critical issues discovered post-release:

1. **Immediate**: Deprecate beta tag on npm (`npm deprecate @terminals-tech/openrouter-agents@2.1.1-beta "Critical issue, use v2.1.0"`)
2. **GitHub**: Mark release as "This release has known issues"
3. **Communication**: Notify users via GitHub issue / Discord / email
4. **Fix**: Create hotfix branch, test, release as v2.1.2-beta
5. **Documentation**: Update changelog with issue details and resolution

## Sign-Off

- [ ] **QA Lead**: _________________ Date: _______
- [ ] **Release Manager**: _________________ Date: _______
- [ ] **Engineering Lead**: _________________ Date: _______

## Notes

_Add any additional notes, caveats, or observations here:_



