# OAuth Infrastructure Setup Guide

## Overview

This guide documents the OAuth authentication infrastructure for terminals.tech, integrating Supabase Auth with custom OAuth flows for the CLI.

### Architecture

```
┌─────────────┐
│  Zero CLI   │
└──────┬──────┘
       │ 1. Initiate OAuth
       ▼
┌──────────────────┐
│ terminals.tech   │
│ OAuth Server     │
└────────┬─────────┘
         │ 2. User selects provider
         ▼
┌──────────────────┐
│ Supabase Auth    │
│ (Pass-through)   │
└────────┬─────────┘
         │ 3. SSO handoff
         ▼
┌──────────────────┐
│ GitHub / Google  │
│ / SAML Provider  │
└────────┬─────────┘
         │ 4. Callback
         ▼
┌──────────────────┐
│ Supabase Auth    │
└────────┬─────────┘
         │ 5. Session created
         ▼
┌──────────────────┐
│ terminals.tech   │
│ (Token issue)    │
└────────┬─────────┘
         │ 6. Return tokens
         ▼
┌─────────────┐
│  Zero CLI   │
│ (Authenticated)
└─────────────┘
```

### Authentication Flows

**Authorization Code Flow with PKCE (CLI)**
```
CLI                    terminals.tech           Supabase           Provider
│                            │                      │                  │
├─1. Generate PKCE──────────>│                      │                  │
│   code_verifier            │                      │                  │
│   code_challenge           │                      │                  │
│                            │                      │                  │
├─2. GET /oauth/authorize──>│                      │                  │
│   + code_challenge         │                      │                  │
│                            │                      │                  │
│<──3. Redirect URL──────────┤                      │                  │
│   (open browser)           │                      │                  │
│                            │                      │                  │
│   ┌─Browser Opens──────────┤                      │                  │
│   │                        │                      │                  │
│   │  4. User selects───────┼────────────────────>│                  │
│   │     provider           │                      │                  │
│   │                        │                      │                  │
│   │                        │  5. Redirect to──────┼────────────────>│
│   │                        │     provider         │                  │
│   │                        │                      │                  │
│   │                        │  6. User auth────────┼──────────────────┤
│   │                        │                      │                  │
│   │                        │  7. Callback<────────┼──────────────────┤
│   │                        │                      │                  │
│   │  8. Supabase session<──┼──────────────────────┤                  │
│   │     created            │                      │                  │
│   │                        │                      │                  │
│   └─9. Redirect to─────────┼────────────────────>│                  │
│      localhost callback    │                      │                  │
│                            │                      │                  │
├─10. POST /oauth/token────>│                      │                  │
│    + code                  │                      │                  │
│    + code_verifier         │                      │                  │
│                            │                      │                  │
│<──11. Access + Refresh─────┤                      │                  │
│       tokens               │                      │                  │
```

**Device Code Flow (Headless)**
```
CLI                    terminals.tech
│                            │
├─1. POST /oauth/device────>│
│                            │
│<──2. device_code───────────┤
│    user_code               │
│    verification_uri        │
│                            │
├─3. Display to user         │
│   "Visit terminals.tech    │
│    and enter: ABCD-EFGH"   │
│                            │
│   ┌─User visits URL────────┤
│   │  enters code           │
│   │  authenticates         │
│   │  approves              │
│   └────────────────────────┤
│                            │
├─4. Poll /oauth/device/poll│ (every 5s)
│    + device_code           │
│                            │
│<──5. pending...────────────┤
│                            │
│<──6. pending...────────────┤
│                            │
│<──7. Access + Refresh──────┤ (authorized!)
│       tokens               │
```

## 2. Supabase Configuration

### Project Setup

1. **Create Supabase Project**
   ```bash
   # Visit https://app.supabase.com
   # Create new project: terminals-tech-prod
   # Region: us-west-1 (or closest to users)
   # Database password: [secure password]
   ```

2. **Get Project Credentials**
   ```bash
   # Project Settings > API
   Project URL:      https://[project-ref].supabase.co
   Anon Key:         eyJhbGc...
   Service Role Key: eyJhbGc... (keep secret!)
   JWT Secret:       [base64 string]
   ```

### Google OAuth Setup

1. **Create OAuth Credentials**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Select project or create new one
   - Navigate to APIs & Services > Credentials
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: "Web application"
   - Name: "terminals.tech Supabase Auth"

2. **Configure Authorized Redirect URIs**
   ```
   https://[project-ref].supabase.co/auth/v1/callback
   ```

3. **Copy Credentials to Supabase**
   - Supabase Dashboard > Authentication > Providers > Google
   - Enable Google provider
   - Paste Client ID
   - Paste Client Secret
   - Click "Save"

4. **Configure OAuth Consent Screen** (if not done)
   - User Type: External (or Internal for workspace)
   - App name: "terminals.tech"
   - User support email: support@terminals.tech
   - Developer contact: dev@terminals.tech
   - Scopes: email, profile, openid

### GitHub OAuth Setup

1. **Create OAuth App**
   - Go to [GitHub Developer Settings](https://github.com/settings/developers)
   - Click "New OAuth App"
   - Application name: "terminals.tech"
   - Homepage URL: `https://terminals.tech`
   - Authorization callback URL: `https://[project-ref].supabase.co/auth/v1/callback`

2. **Copy Credentials to Supabase**
   - Copy Client ID
   - Generate new Client Secret
   - Supabase Dashboard > Authentication > Providers > GitHub
   - Enable GitHub provider
   - Paste Client ID
   - Paste Client Secret
   - Click "Save"

### SSO Configuration (Enterprise)

#### SAML Setup

1. **Enable SAML in Supabase**
   - Supabase Dashboard > Authentication > Providers
   - Enable "SAML 2.0"
   - Note the metadata URL and ACS URL

2. **Configure Identity Provider**

   **For Okta:**
   ```yaml
   Single Sign-On URL: https://[project-ref].supabase.co/auth/v1/sso/saml/acs
   Audience URI (SP Entity ID): https://[project-ref].supabase.co
   Attribute Statements:
     - email: user.email
     - firstName: user.firstName
     - lastName: user.lastName
   ```

   **For Azure AD:**
   ```yaml
   Reply URL: https://[project-ref].supabase.co/auth/v1/sso/saml/acs
   Sign on URL: https://[project-ref].supabase.co/auth/v1/sso/saml/[provider-id]
   Identifier: https://[project-ref].supabase.co
   Claims:
     - emailaddress: user.mail
     - givenname: user.givenname
     - surname: user.surname
   ```

3. **Upload IdP Metadata to Supabase**
   - Download metadata XML from your IdP
   - Upload to Supabase SAML configuration
   - Or provide metadata URL

4. **Domain-Based Routing**
   ```sql
   -- Create domain routing table
   CREATE TABLE sso_domain_routing (
     domain TEXT PRIMARY KEY,
     provider_id UUID REFERENCES auth.sso_providers(id),
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Example: Route @acme.com to Okta
   INSERT INTO sso_domain_routing (domain, provider_id)
   VALUES ('acme.com', 'provider-uuid-here');
   ```

#### Attribute Mapping

Configure how SAML attributes map to Supabase user metadata:

```javascript
// In Supabase Edge Function
const attributeMapping = {
  email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
  lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
  role: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role',
};
```

## 3. Vercel Deployment

### Environment Variables

Create `.env.local` (development) and configure Vercel project settings (production):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_JWT_SECRET=[your-jwt-secret]
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... # Server-side only!

# OAuth Client for CLI (registered in oauth_clients table)
ZERO_OAUTH_CLIENT_ID=zero-cli
ZERO_OAUTH_CLIENT_SECRET=[secure-random-string] # Optional for public clients

# Application URLs
NEXT_PUBLIC_APP_URL=https://terminals.tech
OAUTH_CALLBACK_URL=http://localhost:3000/oauth/callback # Local dev

# Optional: Edge Config for dynamic settings
EDGE_CONFIG=https://edge-config.vercel.com/...
```

### Vercel Configuration

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": {
      "type": "plain",
      "value": "https://[project-ref].supabase.co"
    },
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": {
      "type": "plain"
    },
    "SUPABASE_SERVICE_ROLE_KEY": {
      "type": "secret"
    },
    "SUPABASE_JWT_SECRET": {
      "type": "secret"
    }
  }
}
```

### Auth Callback Route

Create `app/api/oauth/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const error = requestUrl.searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/error?error=${error}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/error?error=missing_code`
    );
  }

  try {
    const supabase = createClient();

    // Exchange code for session (PKCE)
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('Code exchange error:', exchangeError);
      return NextResponse.redirect(
        `${requestUrl.origin}/auth/error?error=${exchangeError.message}`
      );
    }

    // Validate state parameter (CSRF protection)
    const storedState = request.cookies.get('oauth_state')?.value;
    if (state !== storedState) {
      return NextResponse.redirect(
        `${requestUrl.origin}/auth/error?error=invalid_state`
      );
    }

    // Set session cookie
    const response = NextResponse.redirect(`${requestUrl.origin}/dashboard`);

    // Clear state cookie
    response.cookies.delete('oauth_state');

    // Set secure session cookie
    response.cookies.set('sb-access-token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: data.session.expires_in,
      path: '/',
    });

    response.cookies.set('sb-refresh-token', data.session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Unexpected error in OAuth callback:', err);
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/error?error=unexpected_error`
    );
  }
}
```

### Authorization Endpoint

Create `app/api/oauth/authorize/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { nanoid } from 'nanoid';

export async function GET(request: NextRequest) {
  const searchParams = request.url.split('?')[1];
  const params = new URLSearchParams(searchParams);

  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state');
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method');
  const scope = params.get('scope') || 'openid profile email';

  // Validate required parameters
  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing required parameters' },
      { status: 400 }
    );
  }

  // Validate client
  const supabase = createClient();
  const { data: client, error: clientError } = await supabase
    .from('oauth_clients')
    .select('*')
    .eq('client_id', clientId)
    .single();

  if (clientError || !client) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Unknown client' },
      { status: 401 }
    );
  }

  // Validate redirect URI
  if (!client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Invalid redirect_uri' },
      { status: 400 }
    );
  }

  // Store PKCE challenge and OAuth state
  const internalState = nanoid();
  const response = NextResponse.redirect(`${request.nextUrl.origin}/auth/login`);

  response.cookies.set('oauth_state', state || '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
  });

  response.cookies.set('pkce_challenge', codeChallenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
  });

  response.cookies.set('oauth_redirect', redirectUri, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
  });

  return response;
}
```

### Edge Config for Dynamic Settings

Use Vercel Edge Config for runtime-updatable settings without redeployment:

```typescript
// lib/edge-config.ts
import { get } from '@vercel/edge-config';

export async function getOAuthConfig() {
  return await get<{
    clientIdRotationEnabled: boolean;
    allowedClients: string[];
    featureFlags: {
      deviceCodeFlow: boolean;
      refreshTokenRotation: boolean;
    };
  }>('oauth-config');
}

// Usage in route
const config = await getOAuthConfig();
if (!config.allowedClients.includes(clientId)) {
  return NextResponse.json({ error: 'client_disabled' }, { status: 403 });
}
```

## 4. terminals.tech OAuth Server

### Required Endpoints

#### Authorization Endpoint

**`GET /api/oauth/authorize`**

Query Parameters:
- `client_id` (required): OAuth client identifier
- `redirect_uri` (required): Callback URL
- `response_type` (required): Must be "code"
- `state` (recommended): CSRF token
- `code_challenge` (required for PKCE): SHA256 hash of code_verifier
- `code_challenge_method` (required): "S256"
- `scope` (optional): Space-separated scopes (default: "openid profile email")

Response: Redirect to authentication page or provider selection

#### Token Exchange Endpoint

**`POST /api/oauth/token`**

Request Body (application/x-www-form-urlencoded):
```
grant_type=authorization_code
code=[authorization_code]
redirect_uri=[original_redirect_uri]
client_id=[client_id]
code_verifier=[pkce_verifier]
```

Response:
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "v1.abc123...",
  "scope": "openid profile email"
}
```

#### Device Code Initiation

**`POST /api/oauth/device`**

Request Body:
```json
{
  "client_id": "zero-cli",
  "scope": "openid profile email"
}
```

Response:
```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://terminals.tech/device",
  "verification_uri_complete": "https://terminals.tech/device?user_code=WDJB-MJHT",
  "expires_in": 1800,
  "interval": 5
}
```

#### Device Code Polling

**`POST /api/oauth/device/poll`**

Request Body:
```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "client_id": "zero-cli"
}
```

Responses:

Pending authorization:
```json
{
  "error": "authorization_pending"
}
```

Slow down (polling too fast):
```json
{
  "error": "slow_down"
}
```

Expired:
```json
{
  "error": "expired_token"
}
```

Success:
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "v1.abc123...",
  "scope": "openid profile email"
}
```

#### Token Refresh

**`POST /api/oauth/refresh`**

Request Body:
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "v1.abc123...",
  "client_id": "zero-cli"
}
```

Response:
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "v1.def456...",
  "scope": "openid profile email"
}
```

#### User Info Endpoint

**`GET /api/oauth/userinfo`**

Headers:
```
Authorization: Bearer eyJhbGc...
```

Response:
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "email_verified": true,
  "name": "John Doe",
  "picture": "https://avatars.githubusercontent.com/...",
  "provider": "github"
}
```

### Database Schema

Run these migrations in Supabase SQL Editor:

```sql
-- OAuth clients table
CREATE TABLE IF NOT EXISTS oauth_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT UNIQUE NOT NULL,
  client_secret TEXT, -- NULL for public clients (CLI)
  name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  scopes TEXT[] DEFAULT ARRAY['openid', 'profile', 'email'],
  is_public BOOLEAN DEFAULT FALSE, -- TRUE for CLI, FALSE for web apps
  pkce_required BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Device codes table
CREATE TABLE IF NOT EXISTS device_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code TEXT UNIQUE NOT NULL,
  user_code TEXT UNIQUE NOT NULL,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  scopes TEXT[] DEFAULT ARRAY['openid', 'profile', 'email'],
  expires_at TIMESTAMPTZ NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  authorized BOOLEAN DEFAULT FALSE,
  last_poll_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  CONSTRAINT device_codes_client_fk FOREIGN KEY (client_id)
    REFERENCES oauth_clients(client_id) ON DELETE CASCADE
);

CREATE INDEX idx_device_codes_user_code ON device_codes(user_code);
CREATE INDEX idx_device_codes_device_code ON device_codes(device_code);
CREATE INDEX idx_device_codes_expires_at ON device_codes(expires_at);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  scopes TEXT[] DEFAULT ARRAY['openid', 'profile', 'email'],
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  parent_token_id UUID REFERENCES refresh_tokens(id), -- For rotation
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,

  CONSTRAINT refresh_tokens_client_fk FOREIGN KEY (client_id)
    REFERENCES oauth_clients(client_id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Authorization codes table (short-lived, PKCE)
CREATE TABLE IF NOT EXISTS authorization_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL, -- PKCE
  code_challenge_method TEXT DEFAULT 'S256',
  scopes TEXT[] DEFAULT ARRAY['openid', 'profile', 'email'],
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auth_codes_code ON authorization_codes(code);
CREATE INDEX idx_auth_codes_expires_at ON authorization_codes(expires_at);

-- Insert CLI client
INSERT INTO oauth_clients (client_id, name, redirect_uris, is_public, pkce_required)
VALUES (
  'zero-cli',
  'Zero CLI',
  ARRAY['http://localhost:3000/oauth/callback', 'http://127.0.0.1:3000/oauth/callback'],
  TRUE,
  TRUE
) ON CONFLICT (client_id) DO NOTHING;

-- Cleanup job for expired tokens (run via pg_cron or Edge Function)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM device_codes WHERE expires_at < NOW();
  DELETE FROM authorization_codes WHERE expires_at < NOW();
  DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = TRUE;
END;
$$ LANGUAGE plpgsql;
```

### Row Level Security (RLS)

```sql
-- Enable RLS
ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorization_codes ENABLE ROW LEVEL SECURITY;

-- OAuth clients: Read-only for authenticated users
CREATE POLICY "OAuth clients are viewable by authenticated users"
  ON oauth_clients FOR SELECT
  TO authenticated
  USING (true);

-- Device codes: Users can view their own
CREATE POLICY "Users can view their own device codes"
  ON device_codes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Refresh tokens: Users can view their own
CREATE POLICY "Users can view their own refresh tokens"
  ON refresh_tokens FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role can do everything (for API endpoints)
CREATE POLICY "Service role has full access to oauth_clients"
  ON oauth_clients FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role has full access to device_codes"
  ON device_codes FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role has full access to refresh_tokens"
  ON refresh_tokens FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role has full access to authorization_codes"
  ON authorization_codes FOR ALL
  TO service_role
  USING (true);
```

## 5. CLI Configuration

### First-Time Setup

#### Option 1: OAuth Login (Recommended)

```bash
# Start OAuth flow
zero login

# Output:
# Opening browser to https://terminals.tech/oauth/authorize?client_id=zero-cli&...
# Waiting for authentication...
# ✓ Successfully authenticated as user@example.com
# Tokens saved to keychain
```

**Flow:**
1. CLI opens browser to terminals.tech
2. User selects auth provider (Google/GitHub/SSO)
3. User authenticates with provider
4. terminals.tech exchanges code for tokens
5. CLI receives tokens and stores in system keychain

#### Option 2: Device Code Flow (Headless/SSH)

```bash
# Start device code flow
zero login --device

# Output:
# Visit https://terminals.tech/device
# Enter code: WDJB-MJHT
# Waiting for authorization...
# ✓ Successfully authenticated as user@example.com
```

#### Option 3: API Key (Manual)

```bash
# Set API key via environment variable
export OPENROUTER_API_KEY="sk-or-v1-..."

# Or configure via CLI
zero config set api-key "sk-or-v1-..."

# Or create config file
mkdir -p ~/.config/zero
cat > ~/.config/zero/config.json <<EOF
{
  "apiKey": "sk-or-v1-..."
}
EOF
```

### Configuration Files

**Location Priority:**
1. Environment variables (`OPENROUTER_API_KEY`)
2. Project config (`./.zero/config.json`)
3. User config (`~/.config/zero/config.json`)
4. System keychain (for OAuth tokens)

**Example `~/.config/zero/config.json`:**
```json
{
  "auth": {
    "method": "oauth",
    "oauthServer": "https://terminals.tech",
    "clientId": "zero-cli"
  },
  "apiKey": null,
  "defaultModel": "anthropic/claude-opus-4",
  "telemetry": true
}
```

### Environment Variables

```bash
# OAuth Configuration
ZERO_OAUTH_CLIENT_ID=zero-cli                    # OAuth client ID
ZERO_OAUTH_SERVER=https://terminals.tech         # Custom OAuth server
ZERO_OAUTH_REDIRECT_PORT=3000                    # Local callback port

# Direct API Key (alternative to OAuth)
OPENROUTER_API_KEY=sk-or-v1-...

# Advanced
ZERO_CONFIG_DIR=~/.config/zero                   # Config directory
ZERO_TOKEN_STORAGE=keychain                      # keychain|file|env
ZERO_LOG_LEVEL=info                              # debug|info|warn|error
```

### Token Storage

**macOS/Linux (Keychain):**
```bash
# Tokens stored in system keychain
# macOS: Keychain Access.app
# Linux: gnome-keyring / kwallet

# Service: "zero-cli"
# Account: user@example.com
# Items:
#   - access_token
#   - refresh_token
#   - expires_at
```

**Windows (Credential Manager):**
```powershell
# Tokens stored in Windows Credential Manager
# Target: zero-cli:user@example.com
# Attributes:
#   - access_token
#   - refresh_token
#   - expires_at
```

**File-based (Fallback):**
```bash
# ~/.config/zero/tokens.json (encrypted)
{
  "user@example.com": {
    "access_token": "[encrypted]",
    "refresh_token": "[encrypted]",
    "expires_at": "2024-12-31T23:59:59Z"
  }
}
```

## 6. Security Considerations

### PKCE (Proof Key for Code Exchange)

**Mandatory for all CLI flows** to prevent authorization code interception.

```typescript
// Client (CLI) generates PKCE challenge
import crypto from 'crypto';

function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

// Server validates
function validatePKCE(codeVerifier: string, codeChallenge: string): boolean {
  const computed = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return computed === codeChallenge;
}
```

### Token Encryption at Rest

**Keychain Integration (macOS):**
```typescript
import keytar from 'keytar';

async function storeTokens(email: string, tokens: TokenSet) {
  await keytar.setPassword('zero-cli', `${email}:access`, tokens.accessToken);
  await keytar.setPassword('zero-cli', `${email}:refresh`, tokens.refreshToken);
}

async function getTokens(email: string): Promise<TokenSet | null> {
  const accessToken = await keytar.getPassword('zero-cli', `${email}:access`);
  const refreshToken = await keytar.getPassword('zero-cli', `${email}:refresh`);

  if (!accessToken || !refreshToken) return null;

  return { accessToken, refreshToken };
}
```

**File Encryption (Fallback):**
```typescript
import crypto from 'crypto';
import fs from 'fs';

const ALGORITHM = 'aes-256-gcm';
const KEY_DERIVATION = 'pbkdf2';

function encryptTokens(tokens: TokenSet, passphrase: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(tokens), 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}
```

### Refresh Token Rotation

Implement automatic rotation to limit token exposure:

```sql
-- On token refresh, create new token and revoke old one
CREATE OR REPLACE FUNCTION rotate_refresh_token(
  old_token TEXT,
  new_token TEXT,
  new_expires_at TIMESTAMPTZ
)
RETURNS UUID AS $$
DECLARE
  old_token_record refresh_tokens%ROWTYPE;
  new_token_id UUID;
BEGIN
  -- Get old token
  SELECT * INTO old_token_record
  FROM refresh_tokens
  WHERE token = old_token AND revoked = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid refresh token';
  END IF;

  -- Create new token
  INSERT INTO refresh_tokens (
    token, user_id, client_id, scopes, expires_at, parent_token_id
  )
  VALUES (
    new_token,
    old_token_record.user_id,
    old_token_record.client_id,
    old_token_record.scopes,
    new_expires_at,
    old_token_record.id
  )
  RETURNING id INTO new_token_id;

  -- Revoke old token
  UPDATE refresh_tokens
  SET revoked = TRUE, revoked_at = NOW()
  WHERE id = old_token_record.id;

  RETURN new_token_id;
END;
$$ LANGUAGE plpgsql;
```

### Rate Limiting

**Device Code Polling:**
```typescript
// Enforce interval from /device response (default: 5 seconds)
const POLL_INTERVAL = 5000;
const MAX_POLL_ATTEMPTS = 360; // 30 minutes

// Server-side rate limiting
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT NOW()
);

-- Rate limit: 1 request per 5 seconds per device_code
CREATE OR REPLACE FUNCTION check_rate_limit(
  device_code_param TEXT,
  interval_seconds INTEGER DEFAULT 5
)
RETURNS BOOLEAN AS $$
DECLARE
  last_poll TIMESTAMPTZ;
BEGIN
  SELECT last_poll_at INTO last_poll
  FROM device_codes
  WHERE device_code = device_code_param;

  IF last_poll IS NULL OR (NOW() - last_poll) >= (interval_seconds || ' seconds')::INTERVAL THEN
    UPDATE device_codes
    SET last_poll_at = NOW()
    WHERE device_code = device_code_param;
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### State Parameter Validation

Prevent CSRF attacks:

```typescript
// Generate state
const state = crypto.randomBytes(16).toString('base64url');

// Store in session/cookie
response.cookies.set('oauth_state', state, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 600, // 10 minutes
});

// Validate on callback
const receivedState = searchParams.get('state');
const storedState = request.cookies.get('oauth_state')?.value;

if (receivedState !== storedState) {
  throw new Error('Invalid state parameter - possible CSRF attack');
}
```

## 7. Troubleshooting

### Browser Doesn't Open

**Symptoms:**
```bash
$ zero login
Error: Failed to open browser
```

**Solutions:**

1. **Copy URL Manually:**
   ```bash
   $ zero login --no-browser
   Visit this URL to authenticate:
   https://terminals.tech/oauth/authorize?client_id=zero-cli&...
   ```

2. **Set Browser Explicitly:**
   ```bash
   export BROWSER=/usr/bin/firefox
   zero login
   ```

3. **Use Device Flow:**
   ```bash
   zero login --device
   ```

### Port Already in Use

**Symptoms:**
```bash
$ zero login
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions:**

1. **CLI Auto-selects Port:**
   The CLI automatically tries ports 3000-3010 until it finds an available one.

2. **Specify Port:**
   ```bash
   zero login --port 3001
   ```

3. **Kill Conflicting Process:**
   ```bash
   # macOS/Linux
   lsof -ti:3000 | xargs kill -9

   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

### Token Refresh Fails

**Symptoms:**
```bash
$ zero ask "hello"
Error: Failed to refresh token
Authentication required. Run: zero login
```

**Solutions:**

1. **Re-authenticate:**
   ```bash
   zero login
   ```

2. **Clear Cached Tokens:**
   ```bash
   # macOS
   security delete-generic-password -s "zero-cli"

   # Linux
   secret-tool clear service zero-cli

   # Windows
   cmdkey /delete:zero-cli

   # Or use CLI command
   zero logout
   zero login
   ```

3. **Check Token Expiry:**
   ```bash
   zero config get tokens --json | jq '.expires_at'
   ```

4. **Verify Refresh Token Not Revoked:**
   Query Supabase:
   ```sql
   SELECT * FROM refresh_tokens
   WHERE token = '[your-token]'
   AND revoked = FALSE;
   ```

### Headless Environment Issues

**Symptoms:**
```bash
$ ssh server "zero login"
Error: No display available
```

**Solutions:**

1. **Use Device Code Flow:**
   ```bash
   zero login --device
   # Visit URL on local machine
   ```

2. **Use API Key:**
   ```bash
   export OPENROUTER_API_KEY="sk-or-v1-..."
   zero ask "hello"
   ```

3. **Forward X11 (Linux):**
   ```bash
   ssh -X user@server
   zero login
   ```

### PKCE Validation Fails

**Symptoms:**
Server logs:
```
Error: Code verifier does not match challenge
```

**Solutions:**

1. **Verify Code Verifier Storage:**
   Ensure the CLI is storing and sending the same verifier used to generate the challenge.

2. **Check Challenge Method:**
   Must be "S256" (SHA-256), not "plain":
   ```typescript
   const challenge = crypto
     .createHash('sha256')  // Must be SHA-256!
     .update(verifier)
     .digest('base64url');  // Must be base64url, not base64
   ```

3. **Debug:**
   ```bash
   zero login --debug
   # Check logs for code_verifier and code_challenge
   ```

### Redirect URI Mismatch

**Symptoms:**
```
Error: redirect_uri mismatch
```

**Solutions:**

1. **Check Registered URIs:**
   ```sql
   SELECT redirect_uris FROM oauth_clients WHERE client_id = 'zero-cli';
   ```

2. **Add Missing URI:**
   ```sql
   UPDATE oauth_clients
   SET redirect_uris = array_append(redirect_uris, 'http://localhost:3001/oauth/callback')
   WHERE client_id = 'zero-cli';
   ```

3. **Verify Exact Match:**
   The redirect_uri in the `/token` request must **exactly** match the one in `/authorize`:
   ```
   http://localhost:3000/oauth/callback  ✓
   http://127.0.0.1:3000/oauth/callback  ✗ (different host)
   ```

## Appendix: Auth Flow ASCII Diagrams

### Authorization Code Flow (Full)

```
┌─────────┐                                             ┌──────────────┐
│   CLI   │                                             │ terminals.tech│
└────┬────┘                                             └──────┬───────┘
     │                                                          │
     │ 1. Generate PKCE verifier & challenge                   │
     │    verifier = random(32 bytes)                          │
     │    challenge = SHA256(verifier)                         │
     │                                                          │
     │ 2. GET /oauth/authorize                                 │
     │    ?client_id=zero-cli                                  │
     │    &redirect_uri=http://localhost:3000/callback         │
     │    &response_type=code                                  │
     │    &code_challenge=[challenge]                          │
     │    &code_challenge_method=S256                          │
     │    &state=[random-state]                                │
     ├─────────────────────────────────────────────────────────>│
     │                                                          │
     │ 3. Redirect to auth page                                │
     │<─────────────────────────────────────────────────────────┤
     │                                                          │
     │ 4. User authenticates via Supabase                      │
     │    (Google/GitHub/SAML)                                 │
     │                                                          │
     │ 5. Redirect to CLI callback with code                   │
     │    http://localhost:3000/callback                       │
     │    ?code=[auth-code]                                    │
     │    &state=[same-state]                                  │
     │<─────────────────────────────────────────────────────────┤
     │                                                          │
     │ 6. POST /oauth/token                                    │
     │    grant_type=authorization_code                        │
     │    &code=[auth-code]                                    │
     │    &redirect_uri=http://localhost:3000/callback         │
     │    &client_id=zero-cli                                  │
     │    &code_verifier=[original-verifier]                   │
     ├─────────────────────────────────────────────────────────>│
     │                                                          │
     │                                  7. Validate PKCE        │
     │                                     SHA256(verifier) == challenge?
     │                                                          │
     │ 8. Return tokens                                        │
     │    { access_token, refresh_token, expires_in }          │
     │<─────────────────────────────────────────────────────────┤
     │                                                          │
     │ 9. Store in keychain                                    │
     │    Service: zero-cli                                    │
     │    Account: user@example.com                            │
     │                                                          │
```

### Device Code Flow (Headless)

```
┌─────────┐              ┌──────────────┐              ┌─────────────┐
│   CLI   │              │ terminals.tech│              │   Browser   │
│(Server) │              │               │              │   (User)    │
└────┬────┘              └──────┬───────┘              └──────┬──────┘
     │                          │                              │
     │ 1. POST /oauth/device    │                              │
     │    { client_id }         │                              │
     ├─────────────────────────>│                              │
     │                          │                              │
     │ 2. Return codes          │                              │
     │    {                     │                              │
     │      device_code: "...", │                              │
     │      user_code: "ABCD",  │                              │
     │      verification_uri    │                              │
     │    }                     │                              │
     │<─────────────────────────┤                              │
     │                          │                              │
     │ 3. Display to user:      │                              │
     │    "Visit terminals.tech/device"                        │
     │    "Enter code: ABCD-EFGH"                              │
     │                          │                              │
     │                          │   4. User visits URL         │
     │                          │<─────────────────────────────┤
     │                          │                              │
     │                          │   5. Show code entry form    │
     │                          │──────────────────────────────>│
     │                          │                              │
     │                          │   6. User enters "ABCD-EFGH" │
     │                          │<─────────────────────────────┤
     │                          │                              │
     │                          │   7. Redirect to auth        │
     │                          │──────────────────────────────>│
     │                          │                              │
     │                          │   8. User authenticates      │
     │                          │<─────────────────────────────┤
     │                          │                              │
     │                          │   9. Mark device authorized  │
     │                          │                              │
     │ (Meanwhile...)           │                              │
     │                          │                              │
     │ 10. Poll (every 5s)      │                              │
     │     POST /oauth/device/poll                             │
     │     { device_code }      │                              │
     ├─────────────────────────>│                              │
     │                          │                              │
     │ 11. {error: "pending"}   │                              │
     │<─────────────────────────┤                              │
     │                          │                              │
     │ ... wait 5 seconds ...   │                              │
     │                          │                              │
     │ 12. Poll again           │                              │
     ├─────────────────────────>│                              │
     │                          │                              │
     │ 13. {error: "pending"}   │                              │
     │<─────────────────────────┤                              │
     │                          │                              │
     │ ... wait 5 seconds ...   │                              │
     │                          │                              │
     │ 14. Poll again           │                              │
     ├─────────────────────────>│                              │
     │                          │                              │
     │ 15. Success! Return tokens                              │
     │     {                    │                              │
     │       access_token,      │                              │
     │       refresh_token      │                              │
     │     }                    │                              │
     │<─────────────────────────┤                              │
     │                          │                              │
     │ 16. Store in keychain    │                              │
     │                          │                              │
```

### Token Refresh Flow

```
┌─────────┐                                             ┌──────────────┐
│   CLI   │                                             │ terminals.tech│
└────┬────┘                                             └──────┬───────┘
     │                                                          │
     │ 1. Access token expires                                 │
     │                                                          │
     │ 2. POST /oauth/refresh                                  │
     │    {                                                    │
     │      grant_type: "refresh_token",                       │
     │      refresh_token: "[old-refresh-token]",              │
     │      client_id: "zero-cli"                              │
     │    }                                                    │
     ├─────────────────────────────────────────────────────────>│
     │                                                          │
     │                                  3. Validate token       │
     │                                     - Not revoked?       │
     │                                     - Not expired?       │
     │                                     - Correct client?    │
     │                                                          │
     │                                  4. Generate new tokens  │
     │                                     - New access_token   │
     │                                     - New refresh_token  │
     │                                     - Revoke old refresh │
     │                                                          │
     │ 5. Return new tokens                                    │
     │    {                                                    │
     │      access_token: "[new-access]",                      │
     │      refresh_token: "[new-refresh]",                    │
     │      expires_in: 3600                                   │
     │    }                                                    │
     │<─────────────────────────────────────────────────────────┤
     │                                                          │
     │ 6. Update keychain                                      │
     │    - Replace old tokens                                 │
     │    - Store new expiry                                   │
     │                                                          │
```

---

## Server-Side Token Validation

The MCP server validates incoming tokens using a layered authentication system.

### Authentication Layers (Priority Order)

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server Request                        │
│            Authorization: Bearer <token>                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Supabase Auth (src/server/auth/supabaseAuth.js)          │
│    - Validates terminals.tech OAuth tokens                   │
│    - Verifies JWT using SUPABASE_JWT_SECRET (HS256)         │
│    - Or SUPABASE_JWKS_URL for RS256 asymmetric              │
│    - Extracts user_metadata and app_metadata                 │
└────────────────────────┬────────────────────────────────────┘
                         │ If fails, try next...
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Enterprise Auth (src/server/auth/enterpriseAuth.js)      │
│    - MCP SEP-990 Enterprise-Managed Authorization           │
│    - Validates ID-JAG tokens from corporate IdP             │
│    - RFC 8693 Token Exchange for Cross App Access (XAA)     │
│    - JWKS-based verification via AUTH_JWKS_URL              │
└────────────────────────┬────────────────────────────────────┘
                         │ If fails, try next...
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. API Key Auth (fallback)                                  │
│    - Simple bearer token comparison                         │
│    - Token === SERVER_API_KEY                               │
│    - For service-to-service communication                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
                    Authenticated
```

### Server Environment Variables

```bash
# Supabase Auth (Layer 1)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret          # For HS256 (default)
SUPABASE_JWKS_URL=                            # For RS256 (optional)
SUPABASE_SERVICE_ROLE_KEY=                    # For admin operations

# Enterprise Auth (Layer 2)
ENTERPRISE_IDP_URL=https://your-idp.com
ENTERPRISE_IDP_ISSUER=https://your-idp.com
ENTERPRISE_EXPECTED_AUD=mcp-server
ENTERPRISE_CLIENT_ID=mcp-server
ENTERPRISE_CLIENT_SECRET=                     # For token introspection

# API Key Auth (Layer 3)
SERVER_API_KEY=sk-your-api-key

# Optional: Disable auth for development
ALLOW_NO_API_KEY=true
```

### Client Metadata Validation (SEP-991)

For OAuth clients with URL-based client_id:

```javascript
// src/server/auth/clientMetadata.js
// Validates client metadata document per OAuth 2.0 DCR spec

// Client ID format: https://example.com/.well-known/oauth-client/zero-cli
// Server fetches metadata from URL and validates:
// - client_id matches URL
// - redirect_uris registered
// - grant_types allowed
```

### File Structure

```
src/server/auth/
├── index.js          # Unified auth module with createMiddleware()
├── supabaseAuth.js   # Supabase JWT validation
├── enterpriseAuth.js # Enterprise IdP (SEP-990)
└── clientMetadata.js # URL-based client registration (SEP-991)

src/cli/auth/
├── index.js          # CLI auth entry point
├── oauth.js          # PKCE OAuth flow
├── deviceFlow.js     # Device code flow
├── tokenStore.js     # Credential storage (~/.zero/)
├── providers.js      # Provider configurations
└── apiKey.js         # API key management
```

### Token Flow: CLI to Server

```
┌─────────────┐          ┌──────────────────┐          ┌─────────────┐
│  Zero CLI   │          │ terminals.tech   │          │ MCP Server  │
└──────┬──────┘          └────────┬─────────┘          └──────┬──────┘
       │                          │                           │
       │ 1. zero login            │                           │
       ├─────────────────────────>│                           │
       │                          │                           │
       │ 2. OAuth flow            │                           │
       │<─────────────────────────┤                           │
       │    access_token          │                           │
       │    (Supabase JWT)        │                           │
       │                          │                           │
       │ 3. Store in ~/.zero/oauth_creds.json                │
       │                          │                           │
       │ 4. zero research "query" │                           │
       │    Authorization: Bearer <token>                     │
       ├──────────────────────────┼──────────────────────────>│
       │                          │                           │
       │                          │  5. supabaseAuth.validateToken()
       │                          │     - Verify JWT signature
       │                          │     - Check exp, iss, aud
       │                          │     - Extract user info
       │                          │                           │
       │                          │  6. req.user = { userId, email, ... }
       │                          │                           │
       │ 7. Response              │                           │
       │<─────────────────────────┼───────────────────────────┤
       │                          │                           │
```

---

## References

- [RFC 6749: OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749)
- [RFC 7636: PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [RFC 8628: Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628)
- [RFC 8693: Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
- [RFC 7662: Token Introspection](https://datatracker.ietf.org/doc/html/rfc7662)
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Vercel Edge Config](https://vercel.com/docs/storage/edge-config)
- [SAML 2.0 Specification](http://docs.oasis-open.org/security/saml/Post2.0/sstc-saml-tech-overview-2.0.html)
- [MCP SEP-990: Enterprise Auth](https://spec.modelcontextprotocol.io/specification/draft/2025-11-25/)
- [MCP SEP-991: Client Metadata](https://spec.modelcontextprotocol.io/specification/draft/2025-11-25/)
