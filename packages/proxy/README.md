# ZIRI Proxy Server

## What It Does

The proxy server provides:

- **Gateway API** - Standard LLM endpoints (`/api/chat/completions`, `/api/embeddings`, `/api/images`) that forward requests to providers like OpenAI and Anthropic
- **Authorization** - Policy-based access control using Cedar. You define rules that control who can do what
- **User and API Key Management** - Create users, generate API keys, and manage access
- **Rate Limiting** - Per-user and per-key rate limits to prevent abuse
- **Cost Tracking** - Track spending per user/key with daily and monthly summaries
- **Admin Dashboard** - Web UI for managing everything (bundled with the server)
- **Role-Based Access** - Dashboard users can have different roles (Admin, Viewer, User Admin, Policy Admin) with different permissions

## Quick Start

### Using Docker (Recommended)

The easiest way to run ZIRI is with Docker:

```bash
docker run -d \
  -p 3100:3100 \
  -v ziri-data:/data \
  -e CONFIG_DIR=/data \
  ziri/proxy:latest
```

Or use Docker Compose:

```yaml
services:
  proxy:
    image: ziri/proxy:latest
    ports:
      - "3100:3100"
    volumes:
      - ziri-data:/data
    environment:
      - CONFIG_DIR=/data
      - PORT=3100
      - HOST=0.0.0.0
    restart: unless-stopped

volumes:
  ziri-data:
```

### Using npm

If you're developing or want to run it directly:

```bash
npm install @ziri/proxy
npx ziri start
```

Or programmatically:

```javascript
import { startServer } from '@ziri/proxy'

const { port, url } = await startServer()
console.log(`Server running at ${url}`)
```

## First Run

When you start the proxy for the first time, it will:

1. **Generate a root key** - Written to `.ziri-root-key` in the config directory (not printed to logs). This is your admin password.
2. **Create the database** - SQLite database at:
   - Windows: `%APPDATA%\ziri\proxy.db`
   - macOS/Linux: `~/.ziri/proxy.db`
3. **Create the admin user**:
   - User ID: `ziri`
   - Password: Same as root key
   - Email: `ziri@ziri.local`
   - Role: Admin (full access)

You can set a fixed root key via the `ZIRI_ROOT_KEY` environment variable if you prefer.

## Accessing the Admin UI

Once the server is running, open your browser to:

- **URL**: `http://localhost:3100` (or your configured port)

Log in with:
- Username/Email: `ziri` or `ziri@ziri.local`
- Password: The root key from `.ziri-root-key`

## Dashboard Users and Roles

The proxy supports role-based access control for dashboard users (people who log into the admin UI). There are four roles:

- **Admin** - Full access to everything, including managing other dashboard users
- **Viewer** - Read-only access to all pages (can view but not modify)
- **User Admin** - Viewer permissions plus full access to Users and API Keys management
- **Policy Admin** - Viewer permissions plus full access to Rules (policies) management

Only Admins can access the Settings section (Configuration and Manage Users pages). Other roles have those sections hidden.

Dashboard users are separate from access users (end users who use the gateway with API keys). Dashboard users don't get API keys and don't use the gateway endpoints.

## Configuration

Configuration is stored in a `config.json` file in the config directory:

- Windows: `%APPDATA%\ziri\config.json`
- macOS/Linux: `~/.ziri/config.json`

You can also set the config directory via the `CONFIG_DIR` environment variable.

Default configuration:

```json
{
  "mode": "local",
  "server": {
    "host": "127.0.0.1",
    "port": 3100
  },
  "publicUrl": "",
  "email": {
    "enabled": false
  }
}
```

Update configuration via the UI's Config page (Admin only) or by editing the file directly.

## Environment Variables

- `PORT` - Server port (default: 3100)
- `HOST` - Server host (default: 127.0.0.1)
- `CONFIG_DIR` - Directory for config and data files
- `ZIRI_ROOT_KEY` - Root key for admin auth (optional; if unset, key is written to `.ziri-root-key`)
- `ZS_AI_ENCRYPTION_KEY` - Encryption key for sensitive data (optional, auto-generated)
- `NODE_ENV` - Environment (`development` or `production`)

## API Endpoints

The proxy exposes several API endpoints:

- `/api/chat/completions` - Chat completions (OpenAI-compatible)
- `/api/embeddings` - Embeddings (OpenAI-compatible)
- `/api/images` - Image generation (OpenAI-compatible)
- `/api/users` - User management
- `/api/keys` - API key management
- `/api/policies` - Policy (rule) management
- `/api/schema` - Cedar schema management
- `/api/providers` - Provider configuration
- `/api/config` - Server configuration
- `/api/dashboard-users` - Dashboard user management (Admin only)
- `/api/authz/check` - Authorization check (for UI)
- `/api/authz/check-batch` - Batch authorization checks (for UI)
- `/health` - Health check

All admin endpoints require authentication (JWT token or `x-root-key` header).

## How It Works

When a request comes in:

1. **Authentication** - Validates the API key or admin session
2. **Key Lookup** - Finds the user associated with the API key
3. **Status Check** - Verifies the key is active (not revoked or disabled)
4. **Rate Limiting** - Checks if the user has exceeded their rate limits
5. **Cost Estimation** - Calculates the estimated cost for the request
6. **Spend Reservation** - Reserves the estimated cost (prevents overspending)
7. **Authorization** - Evaluates Cedar policies to determine if the request is allowed
8. **Provider Call** - If authorized, forwards the request to the configured provider
9. **Cost Tracking** - Records the actual cost and updates spending totals
10. **Response** - Returns the provider's response to the client

If authorization fails or an error occurs, reserved spend is released automatically.

## Development

### Building

```bash
# Build everything (proxy + UI)
npm run build

# Build proxy only (assumes UI already built)
npm run build:proxy

# Build UI separately
npm run build:ui
```

### Running in Development

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm start
```