# Session Context - CLI Auth & Orchestrator Fixes

**Last Updated:** 2025-12-19T17:43:00Z
**Session ID:** efce0d10-5bb1-474e-a57f-8593daf07f56

## Current State: WAITING FOR DEPLOYMENT

### Blocking Issue
The terminals.tech Vercel deployment needs to complete with Attack Challenge Mode disabled.
The CLI auth flow is hitting Vercel's Security Checkpoint (bot protection).

### Test Command (run after deployment)
```bash
zero login
```

If still blocked, verify:
1. Attack Challenge Mode is **Disabled** in Vercel Dashboard → Settings → Security
2. Deployment completed: `vercel ls --prod` in terminals-landing-new
3. Test endpoint directly:
```bash
curl -X POST https://terminals.tech/api/auth/cli/init \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test123","public_key":"test"}' \
  -w "\n%{http_code}\n"
```

---

## Completed Work

### 1. CLI Auth Module (ECDH Flow) - DONE
Files created/modified:
- `src/cli/auth/cliAuth.js` - **NEW** - Complete ECDH key exchange implementation
- `src/cli/auth/providers.js` - Updated terminals provider to type: 'cli-auth'
- `src/cli/auth/index.js` - Routes to cliAuth when provider type is 'cli-auth'
- `src/cli/auth/tokenStore.js` - Saves credentials to `~/.zero/oauth_creds.json`

**Auth Flow:**
```
zero login
    → auth.login({provider: 'terminals'})
    → loginWithOAuth() detects type: 'cli-auth'
    → startCliAuth() executes ECDH flow:
      1. Generate ECDH keypair + UUID session
      2. POST /api/auth/cli/init
      3. Open browser to /auth/cli?session=<uuid>
      4. Poll /api/auth/cli/status/<session_id>
      5. Decrypt token with ECDH shared secret
      6. Save credentials
```

### 2. tmux Orchestrator Fixes - DONE
Files modified:
- `src/cli/orchestrator/core/pane.js` - `ensureTmuxServer()` creates socket directory
- `src/cli/orchestrator/core/session.js` - Pre-flight checks before session creation

**Fix:** Socket directory `/tmp/tmux-<uid>` is now created with proper permissions (0o700)

---

## terminals.tech CLI Auth Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/cli/init` | POST | Initialize CLI auth session |
| `/api/auth/cli/status/<session_id>` | GET | Poll for completion |
| `/api/auth/cli/complete` | POST | Browser calls to complete auth |
| `/auth/cli` | Page | Browser auth page |

Located in: `~/Documents/terminals-tech-landing/terminals-landing-new/`

---

## Next Steps After Deployment Works

1. **Test `zero login`** - Should open browser and complete ECDH auth
2. **Verify token storage** - Check `~/.zero/oauth_creds.json`
3. **Test authenticated commands** - `zero research "test query"`
4. **Test `zero claude`** - tmux orchestrator should work now

---

## Key Files Reference

### CLI Auth
```
src/cli/auth/
├── cliAuth.js      # ECDH auth flow (NEW)
├── index.js        # Main auth module
├── providers.js    # Provider configs
├── tokenStore.js   # Credential storage
├── oauth.js        # OAuth PKCE flow
└── deviceFlow.js   # Device auth flow
```

### Orchestrator
```
src/cli/orchestrator/
├── index.js        # Main orchestrator
└── core/
    ├── pane.js     # tmux pane management
    └── session.js  # Session lifecycle
```

---

## Vercel Configuration Applied

1. **Attack Challenge Mode:** Should be set to **Disabled** (or "Suspicious only")
2. **WAF Rules:** May have path-based bypass for `/api/auth/cli/*`
3. **vercel.json:** May have headers for security bypass

The WAF rules alone don't bypass "system mitigations" - Attack Challenge Mode must be disabled project-wide.
