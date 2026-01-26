export const CREATE_AUTH_TABLE = `
CREATE TABLE IF NOT EXISTS auth (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  name TEXT,
  password TEXT NOT NULL,
  dept TEXT,
  is_agent INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1, 2)),
  last_sign_in TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_email_hash ON auth(email_hash);
CREATE INDEX IF NOT EXISTS idx_auth_status ON auth(status);
CREATE INDEX IF NOT EXISTS idx_auth_is_agent ON auth(is_agent);
`;

export const CREATE_USER_AGENT_KEYS_TABLE = `
CREATE TABLE IF NOT EXISTS user_agent_keys (
  id TEXT PRIMARY KEY,
  key_value TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  auth_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (auth_id) REFERENCES auth(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_agent_keys_auth_id ON user_agent_keys(auth_id);
CREATE INDEX IF NOT EXISTS idx_user_agent_keys_key_hash ON user_agent_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_user_agent_keys_created_at ON user_agent_keys(created_at);
`;

export const CREATE_PROVIDER_KEYS_TABLE = `
CREATE TABLE IF NOT EXISTS provider_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_provider_keys_provider ON provider_keys(provider);
`;

export const CREATE_SCHEMA_POLICY_TABLE = `
CREATE TABLE IF NOT EXISTS schema_policy (
  id TEXT PRIMARY KEY,
  obj_type TEXT NOT NULL CHECK (obj_type IN ('schema', 'policy')),
  version TEXT,
  content TEXT NOT NULL,
  description TEXT,
  status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1, 2)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_schema_policy_obj_type ON schema_policy(obj_type);
CREATE INDEX IF NOT EXISTS idx_schema_policy_status ON schema_policy(status);
CREATE INDEX IF NOT EXISTS idx_schema_policy_version ON schema_policy(version);
CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_policy_unique_schema ON schema_policy(obj_type) WHERE obj_type = 'schema';
`;

export const CREATE_REFRESH_TOKENS_TABLE = `
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  auth_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT,
  used_at TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  FOREIGN KEY (auth_id) REFERENCES auth(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_auth_id ON refresh_tokens(auth_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
`;

export const CREATE_ENTITIES_TABLE = `
CREATE TABLE IF NOT EXISTS entities (
  etype TEXT NOT NULL,
  eid TEXT NOT NULL,
  ejson TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (0, 1, 2)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (etype, eid)
);

CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status);
CREATE INDEX IF NOT EXISTS idx_entities_etype ON entities(etype);
CREATE INDEX IF NOT EXISTS idx_entities_created_at ON entities(created_at);
`;

export const CREATE_COST_TRACKING_TABLE = `
CREATE TABLE IF NOT EXISTS cost_tracking (
  id TEXT PRIMARY KEY,
  execution_key TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  model TEXT NOT NULL,
  calculated_cost REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (execution_key) REFERENCES user_agent_keys(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cost_tracking_execution_key ON cost_tracking(execution_key);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_model ON cost_tracking(model);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_created_at ON cost_tracking(created_at);
`;

export const CREATE_AUDIT_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  principal TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  decision TEXT NOT NULL,
  policies TEXT,
  execution_time TEXT NOT NULL,
  context TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_principal ON audit_logs(principal);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX IF NOT EXISTS idx_audit_logs_decision ON audit_logs(decision);
CREATE INDEX IF NOT EXISTS idx_audit_logs_execution_time ON audit_logs(execution_time);
`;

export const ALL_SCHEMAS = [
  CREATE_AUTH_TABLE,
  CREATE_USER_AGENT_KEYS_TABLE,
  CREATE_PROVIDER_KEYS_TABLE,
  CREATE_SCHEMA_POLICY_TABLE,
  CREATE_REFRESH_TOKENS_TABLE,
  CREATE_ENTITIES_TABLE,
  CREATE_COST_TRACKING_TABLE,
  CREATE_AUDIT_LOGS_TABLE
];

export const LEGACY_TABLES = [
  'users',
  'api_keys',
  'policies',
  'schema'
];
