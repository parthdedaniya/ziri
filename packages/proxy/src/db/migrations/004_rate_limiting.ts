// Migration 004: Rate limiting tables
// Adds rate_limit_buckets table for rate-limiter-flexible
// Schema matches what rate-limiter-flexible expects: key (PRIMARY KEY), points, expire

import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  // Drop old table if it exists with wrong schema
  db.exec(`DROP TABLE IF EXISTS rate_limit_buckets`)
  
  // rate_limit_buckets table for rate-limiter-flexible
  // Schema: key (PRIMARY KEY), points (INTEGER), expire (INTEGER - Unix timestamp in milliseconds)
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      key TEXT PRIMARY KEY,
      points INTEGER NOT NULL DEFAULT 0,
      expire INTEGER
    )
  `)

  // Index on expire for cleanup of expired entries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_rate_limit_expire 
    ON rate_limit_buckets(expire);
  `)
}

export function down(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS rate_limit_buckets`)
}
