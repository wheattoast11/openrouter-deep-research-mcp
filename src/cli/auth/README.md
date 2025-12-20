# Zero CLI Authentication Module

Complete OAuth 2.0 authentication system with PKCE flow, device flow, and API key fallback.

## Features

- **OAuth PKCE Flow**: Browser-based authentication with Proof Key for Code Exchange
- **Device Authorization Flow**: Headless/SSH-friendly authentication
- **API Key Fallback**: Traditional API key authentication
- **Automatic Token Refresh**: Tokens refresh automatically with 30-second buffer
- **Secure Storage**: Credentials stored in `~/.zero/oauth_creds.json` with `0o600` permissions
- **Multi-Provider Support**: Extensible provider configuration

## Usage

### Command Line

```bash
# Login with auto-detected method (OAuth in desktop, device flow in SSH)
zero login

# Specify authentication method
zero login --method oauth     # Force browser-based OAuth
zero login --method device    # Force device authorization flow
zero login --method api-key   # Use API key (interactive prompt)

# Check authentication status
zero config list
zero status

# Logout
zero logout

# Set API key directly
zero config set api-key sk-or-v1-xxxxx
```

### Programmatic Usage

```javascript
const auth = require('./src/cli/auth');

// Login with OAuth
const result = await auth.login({
  strategy: 'oauth',
  provider: 'terminals',
  onProgress: (msg) => console.log(msg)
});

// Check authentication status
const status = auth.getAuthStatus();
console.log(status.authenticated); // true/false
console.log(status.method); // 'oauth' | 'api_key' | null

// Get auth headers for API requests
const headers = await auth.getAuthHeaders();
// { Authorization: 'Bearer <token>' }

// Ensure authenticated (throws if not)
const { method, token } = await auth.ensureAuthenticated();

// Logout
await auth.logout({ revokeTokens: true });
```

## Architecture

```
src/cli/auth/
├── index.js          # Main entry point, strategy selection
├── oauth.js          # PKCE OAuth flow
├── deviceFlow.js     # Device authorization flow
├── tokenStore.js     # Secure credential storage
├── providers.js      # OAuth provider configurations
└── apiKey.js         # API key management
```

### OAuth PKCE Flow

1. Generate code verifier (random 32 bytes)
2. Generate S256 code challenge (SHA-256 of verifier)
3. Start localhost HTTP server on dynamic port (8080+)
4. Build authorization URL with PKCE parameters
5. Open browser to authorization endpoint
6. Capture authorization code from callback
7. Exchange code + verifier for access/refresh tokens
8. Store tokens securely

### Device Authorization Flow

1. Request device code from provider
2. Display verification URL and user code
3. User visits URL and enters code
4. Poll token endpoint every 5 seconds
5. Receive tokens when user completes authorization
6. Store tokens securely

### Token Refresh

Tokens are automatically refreshed when:
- Expiry time is within 30 seconds
- `getAccessToken()` or `ensureAuthenticated()` is called
- Refresh token is available

Failed refresh clears credentials and requires re-authentication.

## Security

### File Permissions

All credential files use `0o600` permissions (read/write owner only):
- `~/.zero/oauth_creds.json` - OAuth tokens
- `~/.zero/api_key` - API key

### CSRF Protection

OAuth flow uses state parameter for CSRF protection:
- Random 16-byte state generated
- State validated on callback
- Mismatched state rejects authorization

### PKCE

PKCE prevents authorization code interception:
- Code verifier never transmitted
- Code challenge sent to authorization endpoint
- Only client with verifier can exchange code for tokens

## Provider Configuration

Add new providers in `providers.js`:

```javascript
const PROVIDERS = {
  myservice: {
    name: 'My Service',
    authorizationEndpoint: 'https://myservice.com/oauth/authorize',
    tokenEndpoint: 'https://myservice.com/oauth/token',
    deviceAuthEndpoint: 'https://myservice.com/oauth/device',
    revokeEndpoint: 'https://myservice.com/oauth/revoke',
    clientId: process.env.MY_SERVICE_CLIENT_ID || 'zero-cli',
    scopes: ['openid', 'profile', 'api'],
    codeChallengeMethod: 'S256',
    redirectUri: 'http://localhost:{PORT}/callback'
  }
};
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ZERO_OAUTH_CLIENT_ID` | OAuth client ID | `zero-cli` |
| `OPENROUTER_API_KEY` | API key (fallback) | - |

## Credential Storage Format

`~/.zero/oauth_creds.json`:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "v1.abc123...",
  "expires_at": "2025-12-19T12:00:00.000Z",
  "provider": "terminals",
  "token_type": "Bearer",
  "scope": "openid profile email api",
  "created_at": "2025-12-19T10:00:00.000Z"
}
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Authentication timeout` | User didn't complete flow in 5 min | Run `zero login` again |
| `State mismatch` | Possible CSRF attack | Run `zero login` again |
| `Token refresh failed` | Refresh token expired | Run `zero login` to re-authenticate |
| `Not authenticated` | No credentials found | Run `zero login` |

### Headless Detection

The module automatically detects headless environments:
- No `DISPLAY` environment variable (Unix)
- `SSH_CONNECTION` or `SSH_CLIENT` set
- Windows is assumed to have display

When headless, device flow is used by default.

## Testing

```bash
# Test OAuth flow (requires browser)
zero login --method oauth

# Test device flow
zero login --method device

# Test API key
export OPENROUTER_API_KEY=sk-or-v1-xxxxx
zero config list

# Test token refresh (wait for expiry)
zero config list  # Check expires_at
# Wait until near expiry
zero status       # Should refresh automatically
```

## Integration Example

Use authenticated requests in your code:

```javascript
const auth = require('./src/cli/auth');
const fetch = require('node-fetch');

async function callApi() {
  // Ensure authenticated (auto-refresh if needed)
  const headers = await auth.getAuthHeaders();

  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    }
  });

  return response.json();
}
```

## References

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
- [Device Authorization Grant RFC 8628](https://tools.ietf.org/html/rfc8628)
