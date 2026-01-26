# ZS AI Gateway

A production-grade LLM Gateway management interface with Cedar-based authorization. This monorepo contains two main packages: a proxy server (with bundled CLI, UI, and admin tools) and a lightweight SDK for end users.

> 💡 **New to the project?** Check out the [QUICKSTART.md](./QUICKSTART.md) guide for a streamlined setup process.

## ✨ Features

- **Local Proxy Server**: Runs on your machine, manages users, API keys, and LLM provider credentials
- **Authorization Gateway**: Intercepts LLM requests, validates them through Cedar policies, and routes authorized requests to LLM providers
- **Management UI**: Web-based interface with role-based access (admin and user roles)
- **Dual Mode Support**: 
  - **Local Mode**: SQLite storage + Cedar-WASM authorization (default, no external dependencies)
  - **Live Mode (coming soon)**: Backend API storage + external PDP authorization
- **Email Service**: Optional email notifications for user credentials and password resets
- **User SDK**: Client library for end-users to make authorized LLM calls using API keys
- **Server-Side Search & Pagination**: All list pages support efficient server-side search and pagination with debounced inputs
- **Server-Side Sorting**: All data tables support server-side sorting by clicking column headers
- **Rate Limiting**: Per-user and per-API-key rate limiting with persistent state
- **Queue Management**: Per-user concurrent request limiting with persistent queueing
- **Cost Estimation & Reservation**: Estimates request costs before authorization and temporarily reserves them to prevent concurrent request bypass
- **Precise Cost Tracking**: Full-precision cost storage with accurate daily/monthly spend calculation
- **Comprehensive Audit Logging**: All authorization decisions logged with full context and searchable history
- **Real-Time Updates**: Server-Sent Events (SSE) for automatic updates on Logs, Analytics, and Dashboard pages

## 📦 Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn**
- **Git**

For Local Mode (default):
- No additional dependencies required

For Live Mode:
- Backend API endpoint
- External Policy Decision Point (PDP)
- M2M credentials (clientId, clientSecret, orgId, projectId)

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd zs-llm-ai-gateway-I
```

### 2. Install Dependencies

```bash
# Install all dependencies for all packages
npm install
```

This will install dependencies for:
- Root workspace
- `packages/proxy` - Proxy server (includes CLI, UI, config, and auth-plugin bundled)
- `packages/sdk` - User SDK (zero dependencies, for end users)
- `packages/ui` - Management UI (development only, bundled into proxy for production)
- `packages/config` - Config module (internal, used by proxy)
- `packages/auth-plugin` - Auth plugin (internal, used by proxy)

### 3. Build All Packages

```bash
# Build all packages
npm run build
```

Or build individually:
```bash
npm run build:proxy  # Build proxy server
npm run build:ui     # Build UI
npm run build:sdk    # Build SDKs
```

## 🎯 Quick Start

### Step 1: Start the Proxy Server

The proxy server runs in **local mode** by default (no configuration needed). The proxy includes the CLI, UI, and all admin tools bundled together.

**Option A: Using the CLI (Recommended)**
```bash
# From project root
npm run start

# Or using the CLI directly
npx zs-ai start

# Or with custom port/host
npx zs-ai start --port 3100 --host localhost
```

**Option B: Development Mode**
```bash
cd packages/proxy
npm run dev
```

**First Run:**
- A master key will be generated and displayed in the console
- **Save this master key** - you'll need it for admin authentication
- Database will be initialized at:
  - **Windows**: `%APPDATA%\zs-ai\proxy.db`
  - **macOS/Linux**: `~/.zs-ai/proxy.db`
- Default admin user is created:
  - **User ID**: `admin`
  - **Password**: Same as the master key
  - **Email**: `admin@zs-ai.local`

**Expected Output:**
```
======================================================================
🚀 ZS AI GATEWAY PROXY SERVER
======================================================================
Mode: local
Local URL: http://127.0.0.1:3100
API Endpoints: http://127.0.0.1:3100/api/*
Health Check: http://127.0.0.1:3100/health
📧 Email: Disabled
======================================================================
```

### Step 2: Access the Management UI

The UI is **bundled with the proxy server** and served automatically.

1. Open `http://localhost:3100` (or the port shown in the console) in your browser
2. You'll be redirected to `/config` if this is the first run
3. Click "Skip Configuration" or configure email service (optional)
4. Login with admin credentials:
   - **Username/Email**: `admin` or `admin@zs-ai.local`
   - **Password**: The master key displayed when you started the proxy

**Note:** For development, you can run the UI separately with hot reload:
```bash
# Terminal 1: Start proxy (API only)
npm run dev:proxy

# Terminal 2: Start UI with hot reload
npm run dev
```

### Step 4: Create Your First User

1. Navigate to **Users** page
2. Click **Create User**
3. Fill in:
   - Email
   - Name
4. Click **Create User**
5. If email is disabled, copy the generated password from the popup

### Step 5: View API Keys

1. Navigate to **Keys** page
2. API keys are automatically created when users are created
3. Click on a key to view details:
   - Current daily/monthly spend
   - Rate limits
   - Reset times
   - Status
4. You can rotate keys (old key is deleted, new one is created)

## 📖 Usage

### Making LLM Requests

Once you have an API key, you can make LLM requests through the gateway:

```bash
curl -X POST http://127.0.0.1:3100/api/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk-zs-your-api-key-here" \
  -d '{
    "provider": "openai",
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

**Note**: You need to configure LLM provider API keys first:
1. Navigate to **Providers** page in the UI
2. Add provider credentials (OpenAI, Anthropic, etc.)
3. These are encrypted and stored locally

### Using the User SDK

The SDK has **zero dependencies** and can be installed independently:

```bash
npm install @zs-ai/sdk
```

**Usage:**
```javascript
import { UserSDK } from '@zs-ai/sdk'

const sdk = new UserSDK({
  apiKey: 'sk-zs-your-api-key-here',
  proxyUrl: process.env.ZS_AI_PROXY_URL || 'http://localhost:3100'
})

const response = await sdk.chatCompletions({
  provider: 'openai',
  model: 'gpt-4',
  messages: [
    { role: 'user', content: 'Hello!' }
  ]
})
```

**Configuration:**
- `proxyUrl`: Proxy server URL (defaults to `http://localhost:3100` or `process.env.ZS_AI_PROXY_URL`)
- `apiKey`: Your API key (starts with `sk-zs-`)

### Management Operations

Use the UI for:
- **Users**: Create, delete, reset passwords (API keys auto-created)
  - Server-side search across name, email, userId
  - Pagination with total count
- **Keys**: View, rotate (old key deleted, new one created)
  - Server-side search across userId, name, email, API key
  - Client-side status filtering (active/revoked/disabled)
  - Pagination with total count
- **Providers**: Add/update LLM provider API keys (encrypted storage)
  - Server-side search across name, displayName, baseUrl
  - Pagination with total count
- **Rules**: Create and manage Cedar authorization policies
  - Server-side search across description and policy content
  - Filter by effect (permit/forbid)
  - Pagination with total count
- **Schema**: View and update Cedar schema
- **Logs**: View comprehensive audit logs
  - Server-side search across auth_id, model, request_id
  - Filter by decision, provider, model, date range
  - Pagination with total count (default: 10 items per page)
- **Config**: Configure email service, public URL, etc.

**Search Features:**
- All search inputs use 300ms debounce to reduce API calls
- Search bars remain visible even when no results are found
- Server-side filtering searches entire database, not just loaded rows

## 🧪 Testing

### Quick Health Check

```bash
# Check if proxy server is running
curl http://127.0.0.1:3100/health

# Expected response:
# {"status":"ok","timestamp":"2025-01-XX..."}
```

### Test User Creation

```bash
# Login as admin (get token)
curl -X POST http://127.0.0.1:3100/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-master-key"
  }'

# Create a user (use token from above)
curl -X POST http://127.0.0.1:3100/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "email": "test@example.com",
    "name": "Test User",
    "department": "Engineering",
    "isAgent": false,
    "limitRequestsPerMinute": 100
  }'
```

**Note:** API keys are automatically created when a user is created. No separate key creation step is needed.

### Test Chat Completion

```bash
# Make an LLM request
curl -X POST http://127.0.0.1:3100/api/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "provider": "openai",
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

For testing, use the UI to create users, manage keys, and make test LLM requests through the gateway.

## 📁 Project Structure

```
.
├── packages/
│   ├── proxy/          # Proxy server (includes CLI, UI, config, auth-plugin)
│   │   ├── src/
│   │   │   ├── cli/     # CLI commands (bundled)
│   │   │   ├── routes/  # API routes
│   │   │   ├── services/ # Business logic
│   │   │   ├── db/      # Database schema & migrations
│   │   │   └── server.ts # Server setup
│   │   ├── dist/
│   │   │   ├── ui/      # Bundled UI assets (production)
│   │   │   └── cli/     # CLI executable
│   │   └── package.json # Includes CLI bin entry
│   ├── sdk/             # User SDK (zero dependencies)
│   │   ├── src/
│   │   │   ├── user.ts  # User SDK implementation
│   │   │   ├── types.ts # TypeScript types
│   │   │   └── index.ts # Exports (UserSDK only)
│   │   └── package.json # Zero dependencies
│   ├── ui/              # Management UI (development)
│   │   └── .output/     # Built UI (bundled into proxy)
│   ├── config/          # Config module (internal, private)
│   └── auth-plugin/     # Auth plugin (internal, private)
├── package.json         # Root workspace config
└── README.md           # This file
```

**Package Overview:**
- **`@zs-ai/proxy`**: Admin package - includes proxy server, CLI (`zs-ai`), UI (bundled), config, and auth-plugin
- **`@zs-ai/sdk`**: End-user package - lightweight SDK with zero dependencies
- **`@zs-ai/ui`**: Development UI package (bundled into proxy for production)
- **`@zs-ai/config`**: Internal config module (private, used by proxy)
- **`@zs-ai/auth-plugin`**: Internal auth plugin (private, used by proxy)

## 📚 Documentation

- **[PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md)** - Complete project documentation including architecture, API endpoints, and features
- **[QUICKSTART.md](./QUICKSTART.md)** - Quick start guide for getting up and running
- **[NEW_DATABASE_SCHEMA.md](./NEW_DATABASE_SCHEMA.md)** - Complete database schema documentation with encryption details (if exists)

## 🔧 Configuration

### Proxy Server Configuration

Configuration is stored at:
- **Windows**: `%APPDATA%\zs-ai\config.json`
- **macOS/Linux**: `~/.zs-ai/config.json`

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

You can configure:
- **Mode**: `local` or `live`
- **Server**: Host and port
- **Public URL**: For sharing with end-users
- **Email**: SMTP or SendGrid configuration

Configuration can be updated via the UI's **Config** page.

### Database Location

Database is stored at:
- **Windows**: `%APPDATA%\zs-ai\proxy.db`
- **macOS/Linux**: `~/.zs-ai/proxy.db`

**Note:** The database uses a new schema with encryption for sensitive data. See [NEW_DATABASE_SCHEMA.md](./NEW_DATABASE_SCHEMA.md) for complete details.

### Encryption Key

The system uses a persistent encryption key for sensitive data (emails, API keys). The key is stored in:
1. **Environment Variable** (`ZS_AI_ENCRYPTION_KEY`) - Recommended for production
2. **Secure File** (`~/.zs-ai/encryption.key`) - For local development
3. **Config File** (`encryptionKey` field) - Fallback option

If no key exists, one will be auto-generated on first run and stored in the config file.

## 🛠️ Development

### Running in Development Mode

**Option 1: Integrated Mode (UI bundled)**
```bash
# Start proxy with bundled UI
npm run dev:proxy
# Access UI at http://localhost:3100
```

**Option 2: Separate UI Development (with hot reload)**
```bash
# Terminal 1: Proxy server (API only)
npm run dev:proxy

# Terminal 2: UI with hot reload
npm run dev
# UI runs at http://localhost:3000 (proxies API to :3100)
```

**SDK Development:**
```bash
cd packages/sdk
npm run dev  # TypeScript watch mode
```

### Building for Production

```bash
# Build all packages
npm run build

# Build individual packages
npm run build:proxy
npm run build:ui
npm run build:sdk
```

### Running Production Builds

```bash
# Build everything
npm run build

# Start proxy (includes bundled UI)
npm run start

# Or use the CLI
npx zs-ai start
```

The UI is automatically served from the proxy server at `http://localhost:3100`.

## 📝 Scripts

```bash
# Development
npm run dev              # Run UI dev server (separate from proxy)
npm run dev:proxy        # Run proxy dev server (with bundled UI)
npm run build            # Build all packages (config → auth-plugin → ui → proxy → sdk)
npm run build:proxy      # Build proxy (compiles TS + copies UI)
npm run build:ui         # Build UI package
npm run build:sdk        # Build SDK package
npm run start            # Start proxy server (production)
```

**Note:** The root `build` script builds packages in the correct order to avoid duplicate builds.

## 🔐 Security Notes

- **Master Key**: Generated on first run, stored securely. Use for admin authentication.
- **API Keys**: Stored as hashes in the database. Original keys are only shown once.
- **Provider Keys**: Encrypted before storage in the database.
- **Passwords**: Hashed using bcrypt before storage.

## 🐛 Troubleshooting

### Proxy Server Won't Start

1. Check if port 3100 is already in use:
   ```bash
   # Windows
   netstat -ano | findstr :3100
   
   # macOS/Linux
   lsof -i :3100
   ```
2. The server will automatically find the next available port if 3100 is taken.

### Database Issues

1. Delete the database file and restart:
   ```bash
   # Windows
   del %APPDATA%\zs-ai\proxy.db
   
   # macOS/Linux
   rm ~/.zs-ai/proxy.db
   ```
2. Restart the proxy server - it will recreate the database.

### UI Won't Connect to Proxy

1. Ensure proxy server is running
2. Check the proxy URL in UI configuration
3. Check browser console for CORS errors
4. Verify proxy is accessible: `curl http://127.0.0.1:3100/health`

### Email Service Not Working

1. Check email configuration in the Config page
2. For Gmail: Use App Password (not regular password) if 2FA is enabled
3. For SMTP: Use port 587 (STARTTLS) or 465 (SSL)
4. Check proxy server logs for email errors
