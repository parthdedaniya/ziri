import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS rate_limit_buckets`)
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      key TEXT PRIMARY KEY,
      points INTEGER NOT NULL DEFAULT 0,
      expire INTEGER
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_rate_limit_expire 
    ON rate_limit_buckets(expire);
  `)
}

export function down(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS rate_limit_buckets`)
}
