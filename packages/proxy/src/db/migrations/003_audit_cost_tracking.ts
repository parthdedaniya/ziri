import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  const tablesExist = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name IN ('audit_logs', 'cost_tracking', 'model_pricing', 'model_aliases')
  `).all() as { name: string }[]
  
  const existingTableNames = new Set(tablesExist.map(t => t.name))
  
  if (!existingTableNames.has('model_pricing')) {
    db.exec(`
    CREATE TABLE model_pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_cost_per_token REAL NOT NULL,
      output_cost_per_token REAL NOT NULL,
      cache_write_cost_per_token REAL,
      cache_read_cost_per_token REAL,
      max_input_tokens INTEGER,
      max_output_tokens INTEGER,
      supports_vision INTEGER DEFAULT 0,
      supports_function_calling INTEGER DEFAULT 0,
      supports_streaming INTEGER DEFAULT 1,
      effective_from TEXT NOT NULL DEFAULT (datetime('now')),
      effective_until TEXT,
      source_url TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(provider, model, effective_from)
    )
  `)
  }

  if (!existingTableNames.has('model_aliases')) {
    db.exec(`
    CREATE TABLE model_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      canonical_model TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  }

  if (!existingTableNames.has('audit_logs')) {
    db.exec(`
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      
      principal TEXT NOT NULL,
      principal_type TEXT NOT NULL,
      auth_id TEXT,
      api_key_id TEXT,
      
      -- Request details
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      
      decision TEXT NOT NULL CHECK (decision IN ('permit', 'forbid')),
      decision_reason TEXT,
      policies_evaluated TEXT,
      determining_policies TEXT,
      
      request_ip TEXT,
      user_agent TEXT,
      request_method TEXT,
      request_path TEXT,
      request_body_hash TEXT,
      
      cedar_context TEXT,
      entity_snapshot TEXT,
      
      -- Timing
      request_timestamp TEXT NOT NULL,
      auth_start_time TEXT,
      auth_end_time TEXT,
      auth_duration_ms INTEGER,
      
      provider_request_id TEXT,
      cost_tracking_id INTEGER,
      
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  }

  if (!existingTableNames.has('cost_tracking')) {
    db.exec(`
    CREATE TABLE cost_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      execution_key TEXT NOT NULL,
      audit_log_id INTEGER,
      
      -- Provider info
      provider TEXT NOT NULL,
      provider_request_id TEXT,
      
      model_requested TEXT NOT NULL,
      model_used TEXT,
      
      -- Token counts
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      cached_tokens INTEGER DEFAULT 0,
      
      input_cost REAL NOT NULL,
      output_cost REAL NOT NULL,
      cache_savings REAL DEFAULT 0,
      total_cost REAL NOT NULL,
      
      -- Pricing reference
      pricing_id INTEGER,
      pricing_source TEXT DEFAULT 'database',
      input_rate_used REAL,
      output_rate_used REAL,
      
      request_timestamp TEXT NOT NULL,
      response_timestamp TEXT,
      latency_ms INTEGER,
      
      -- Status
      status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'partial', 'streaming')),
      error_code TEXT,
      error_message TEXT,
      
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      
      FOREIGN KEY (execution_key) REFERENCES user_agent_keys(id) ON DELETE CASCADE,
      FOREIGN KEY (audit_log_id) REFERENCES audit_logs(id) ON DELETE SET NULL,
      FOREIGN KEY (pricing_id) REFERENCES model_pricing(id) ON DELETE SET NULL
    )
  `)
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_model_pricing_provider ON model_pricing(provider);
    CREATE INDEX IF NOT EXISTS idx_model_pricing_provider_model ON model_pricing(provider, model);
    CREATE INDEX IF NOT EXISTS idx_model_pricing_effective ON model_pricing(effective_from, effective_until);

    -- audit_logs indexes
    CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_auth_id ON audit_logs(auth_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_api_key_id ON audit_logs(api_key_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_decision ON audit_logs(decision);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_provider ON audit_logs(provider);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_model ON audit_logs(model);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(request_timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_auth_decision_time ON audit_logs(auth_id, decision, request_timestamp);

    CREATE INDEX IF NOT EXISTS idx_cost_tracking_request_id ON cost_tracking(request_id);
    CREATE INDEX IF NOT EXISTS idx_cost_tracking_execution_key ON cost_tracking(execution_key);
    CREATE INDEX IF NOT EXISTS idx_cost_tracking_provider ON cost_tracking(provider);
    CREATE INDEX IF NOT EXISTS idx_cost_tracking_model ON cost_tracking(model_used);
    CREATE INDEX IF NOT EXISTS idx_cost_tracking_timestamp ON cost_tracking(request_timestamp);
    CREATE INDEX IF NOT EXISTS idx_cost_tracking_status ON cost_tracking(status);
    CREATE INDEX IF NOT EXISTS idx_cost_tracking_key_time ON cost_tracking(execution_key, request_timestamp);
  `)
}

export function down(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS cost_tracking`)
  db.exec(`DROP TABLE IF EXISTS audit_logs`)
  db.exec(`DROP TABLE IF EXISTS model_aliases`)
  db.exec(`DROP TABLE IF EXISTS model_pricing`)
}
