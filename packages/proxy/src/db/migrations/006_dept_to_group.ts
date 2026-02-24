import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(auth)').all() as { name: string }[]
  const hasDept = cols.some(c => c.name === 'dept')
  if (hasDept) {
    db.exec('ALTER TABLE auth RENAME COLUMN dept TO tenant')
  }
}

export function down(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(auth)').all() as { name: string }[]
  const hasTenant = cols.some(c => c.name === 'tenant')
  if (hasTenant) {
    db.exec('ALTER TABLE auth RENAME COLUMN tenant TO dept')
  }
}
