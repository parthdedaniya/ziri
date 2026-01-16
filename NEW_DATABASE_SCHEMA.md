# New Database Schema Design

## Encryption Key Management

### Strategy: Multi-Source with Fallback

**Priority Order:**
1. **Environment Variable** (`ZS_AI_ENCRYPTION_KEY`) - Best for cloud deployments
2. **Secure File** (`~/.zs-ai/encryption.key`) - Good for local/dev environments
3. **Config File** (`encryptionKey` field) - Fallback option
4. **Auto-generate** - If none exist, generate and store in config

**Cloud Deployment Compatibility:**
- ✅ Environment variables work in all cloud platforms (AWS, GCP, Azure, Docker, Kubernetes)
- ✅ Secure file works if volume mounts are configured
- ✅ Config file works as fallback but less secure

**Runtime Environment Variable Injection:**
- ✅ Environment variables are read at process startup
- ✅ Can be injected at runtime via container orchestration (K8s secrets, Docker secrets, etc.)
- ✅ Requires process restart to pick up new values (standard practice)

---

## Schema Design

### 1. `auth` Table (User/Agent Authentication)

```sql
CREATE TABLE auth (
    id TEXT PRIMARY KEY,                    -- UUID or generated ID (replaces user_id)
    email TEXT NOT NULL,                    -- Encrypted (sensitive PII, GDPR compliance)
    email_hash TEXT NOT NULL,               -- SHA-256 hash of email (for fast lookup, before encryption)
    name TEXT,                              -- Plain text (not encrypted)
    password TEXT NOT NULL,                 -- Hashed (bcrypt/argon2), NOT encrypted
    dept TEXT,                              -- Plain text (not encrypted)
    is_agent INTEGER NOT NULL DEFAULT 0,    -- 0 = user, 1 = agent
    status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1, 2)),  -- 0=inactive, 1=active, 2=revoked
    last_sign_in TEXT,                      -- ISO timestamp
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_auth_email_hash ON auth(email_hash);  -- For fast email lookup
CREATE INDEX idx_auth_status ON auth(status);
CREATE INDEX idx_auth_is_agent ON auth(is_agent);
```

**Encryption:**
- `email`: Encrypted (PII, GDPR compliance)
- `email_hash`: SHA-256 hash (for fast lookup, not encrypted, not exposed in API)
- `name`: **Plain text** (not encrypted, not sensitive)
- `dept`: **Plain text** (not encrypted, not sensitive)
- `password`: **Hashed only** (bcrypt/argon2, never encrypted)

**Changes from Proposed:**
- Added `is_agent` index for faster filtering
- `password` remains hashed (not encrypted) for security best practices
- Only `email` is encrypted (PII protection), `name` and `dept` are plain text

---

### 2. `user_agent_keys` Table (User/Agent API Keys)

```sql
CREATE TABLE user_agent_keys (
    id TEXT PRIMARY KEY,                    -- UUID or generated ID
    key_value TEXT NOT NULL,                -- Encrypted API key (format: sk-zs-{userId}-{hash})
    key_hash TEXT NOT NULL,                 -- SHA-256 hash of API key (for fast validation, internal only, before encryption)
    auth_id TEXT NOT NULL,                  -- Foreign key to auth.id
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (auth_id) REFERENCES auth(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_agent_keys_auth_id ON user_agent_keys(auth_id);
CREATE INDEX idx_user_agent_keys_key_hash ON user_agent_keys(key_hash);  -- For fast API key validation
CREATE INDEX idx_user_agent_keys_created_at ON user_agent_keys(created_at);
```

**Encryption:**
- `key_value`: Fully encrypted (sensitive credential)
- `key_hash`: SHA-256 hash (for fast validation, internal only, not exposed in API)

**Changes from Proposed:**
- Kept `key_hash` internally (for fast API key validation, not exposed in API)
- Removed `status` (keys are deleted on rotation, not revoked)
- Simplified structure (one key per user, deleted on rotation)

**Frontend Impact:**
- Use `id` instead of `keyHash` for key identification
- Remove `keyHash` from UI components (never exposed)
- Update delete endpoints to use `id` instead of `keyHash`
- `key_hash` is backend-only optimization

---

### 3. `provider_keys` Table (LLM Provider API Keys)

```sql
CREATE TABLE provider_keys (
    id TEXT PRIMARY KEY,                    -- UUID or generated ID
    provider TEXT NOT NULL UNIQUE,          -- Provider name (openai, anthropic, etc.)
    api_key TEXT NOT NULL,                  -- Encrypted provider API key
    metadata TEXT,                          -- JSON metadata (baseUrl, models, etc.) - Not encrypted (non-sensitive)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_provider_keys_provider ON provider_keys(provider);
```

**Encryption:**
- `api_key`: Fully encrypted (sensitive credential)
- `metadata`: Not encrypted (non-sensitive configuration)

**Changes from Proposed:**
- Kept separate from `user_agent_keys` (different use cases, relationships, security boundaries)
- Added `id` as primary key (TEXT instead of INTEGER)

---

### 4. `schema_policy` Table (Merged Schema + Policies)

```sql
CREATE TABLE schema_policy (
    id TEXT PRIMARY KEY,                    -- UUID or generated ID
    obj_type TEXT NOT NULL CHECK (obj_type IN ('schema', 'policy')),  -- Discriminator
    version TEXT,                            -- NULL for policies, version string for schema (e.g., 'v1.0.0')
    content TEXT NOT NULL,                   -- Schema JSON (for obj_type='schema') or Policy string (for obj_type='policy')
    description TEXT,                        -- NULL for schema, description for policies
    status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1, 2)),  -- 0=inactive, 1=active, 2=deprecated
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_schema_policy_obj_type ON schema_policy(obj_type);
CREATE INDEX idx_schema_policy_status ON schema_policy(status);
CREATE INDEX idx_schema_policy_version ON schema_policy(version);
CREATE UNIQUE INDEX idx_schema_policy_unique_schema ON schema_policy(obj_type) WHERE obj_type = 'schema';
```

**Encryption:**
- No encryption needed (Cedar schema and policies are not sensitive data)

**Changes from Proposed:**
- Merged `schema` and `policies` tables into one with `obj_type` discriminator
- Added unique constraint: only one active schema allowed
- `version` is NULL for policies (policies don't have versions)
- `description` is NULL for schema (schema doesn't need description)



---

### 5. `refresh_tokens` Table (JWT Refresh Tokens)

```sql
CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY,                    -- UUID or generated ID
    auth_id TEXT NOT NULL,                  -- Foreign key to auth.id (replaces user_id)
    token_hash TEXT NOT NULL UNIQUE,         -- Hashed refresh token (for validation)
    expires_at TEXT NOT NULL,                -- ISO timestamp
    absolute_expires_at TEXT,                -- Absolute expiry (30 days from creation)
    used_at TEXT,                            -- ISO timestamp when token was used (NULL if unused)
    device_id TEXT,                          -- Device identifier (optional)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_at TEXT,                         -- ISO timestamp when token was revoked (NULL if active)
    FOREIGN KEY (auth_id) REFERENCES auth(id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_auth_id ON refresh_tokens(auth_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
```

**Encryption:**
- No encryption needed (tokens are hashed, not stored in plain text)

**Changes from Current Schema:**
- Primary key changed from INTEGER to TEXT
- `user_id` → `auth_id` (foreign key to `auth.id`)
- All timestamps use TEXT (ISO format) instead of DATETIME
- Structure matches current implementation but with new naming

**Purpose:**
- Stores JWT refresh tokens for user authentication
- Enables token rotation and revocation
- Tracks token usage and device information

---

### 6. `entities` Table (Cedar Entities)

```sql
CREATE TABLE entities (
    etype TEXT NOT NULL,                    -- Entity type (User, UserKey, Resource, etc.)
    eid TEXT NOT NULL,                      -- Entity ID
    ejson TEXT NOT NULL,                    -- Entity data as JSON string
    status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1, 2)),  -- 0=inactive, 1=active, 2=revoked
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (etype, eid)                -- Composite primary key
);

CREATE INDEX idx_entities_status ON entities(status);
CREATE INDEX idx_entities_etype ON entities(etype);
CREATE INDEX idx_entities_created_at ON entities(created_at);
```

**Encryption:**
- No encryption needed (entity data is authorization metadata, not sensitive credentials)

**Changes from Proposed:**
- Matches proposed design exactly
- Composite primary key for efficient lookups

---

### 7. `cost_tracking` Table (Usage Cost Tracking)

```sql
CREATE TABLE cost_tracking (
    id TEXT PRIMARY KEY,                    -- UUID or generated ID
    execution_key TEXT NOT NULL,            -- Foreign key to user_agent_keys.id
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    model TEXT NOT NULL,                    -- Model name (e.g., 'gpt-4', 'claude-3-opus')
    calculated_cost REAL NOT NULL,          -- Cost in USD
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (execution_key) REFERENCES user_agent_keys(id) ON DELETE CASCADE
);

CREATE INDEX idx_cost_tracking_execution_key ON cost_tracking(execution_key);
CREATE INDEX idx_cost_tracking_model ON cost_tracking(model);
CREATE INDEX idx_cost_tracking_created_at ON cost_tracking(created_at);
```

**Encryption:**
- No encryption needed (usage metrics are not sensitive)

**Changes from Proposed:**
- Matches proposed design exactly

---

### 8. `audit_logs` Table (Authorization Audit Logs)

```sql
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,                    -- UUID or generated ID
    principal TEXT NOT NULL,                -- Principal entity (e.g., 'UserKey::"uk-123"')
    action TEXT NOT NULL,                   -- Action (e.g., 'completion', 'embedding')
    resource TEXT NOT NULL,                 -- Resource (e.g., 'Resource::"gpt-4"')
    decision TEXT NOT NULL,                 -- 'permit' or 'forbid'
    policies TEXT,                          -- JSON array of policy IDs that were evaluated
    execution_time TEXT NOT NULL,           -- ISO timestamp
    context TEXT                            -- JSON context data (optional, for debugging)
);

CREATE INDEX idx_audit_logs_principal ON audit_logs(principal);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX idx_audit_logs_decision ON audit_logs(decision);
CREATE INDEX idx_audit_logs_execution_time ON audit_logs(execution_time);
```

**Encryption:**
- No encryption needed (audit logs are not sensitive, but may contain PII - consider encryption if required by compliance)

**Changes from Proposed:**
- Added `context` field for debugging
- Added `id` as primary key (for easier reference)

---

## Summary of Changes from Proposed Schema

### ✅ Implemented as Proposed:
1. **TEXT primary keys** instead of INTEGER AUTOINCREMENT
2. **INTEGER status** (0,1,2) instead of TEXT
3. **Composite primary key** for entities table
4. **Merged schema + policies** into `schema_policy` table
5. **Separate `user_agent_keys` and `provider_keys`** (kept separate for security and clarity)

### 🔄 Modified from Proposed:
1. **`auth` table:**
   - Added indexes for `is_agent` and `status`
   - `password` remains hashed (not encrypted) - security best practice
   - Only `email` encrypted (PII protection), `name` and `dept` are plain text

2. **`user_agent_keys` table:**
   - Removed `key_hash` (rely on encryption + `id` for identification)
   - Removed `status` (keys deleted on rotation, not revoked)
   - Simplified structure

3. **`schema_policy` table:**
   - Added unique constraint for schema (only one active schema)
   - `version` is NULL for policies
   - `description` is NULL for schema

4. **`audit_logs` table:**
   - Added `context` field for debugging
   - Added `id` primary key

### ❌ Removed from Proposed:
1. **`key_hash` field** - Removed from API responses (kept internally for optimization)

### ➕ Added (Not in Proposed but Required):
1. **`refresh_tokens` table** - Required for JWT refresh token functionality

---