// Script to clear entities table from SQLite database
// Usage: npx tsx clear-entities.js (from packages/proxy directory)

import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'

// Get database path (same logic as in db/index.ts)
function getConfigDir() {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || homedir(), 'zs-ai')
  }
  return join(homedir(), '.zs-ai')
}

const DB_PATH = join(getConfigDir(), 'proxy.db')

if (!existsSync(DB_PATH)) {
  console.error(`❌ Database not found at: ${DB_PATH}`)
  console.log(`\nMake sure the proxy server has been started at least once to create the database.`)
  process.exit(1)
}

console.log(`📂 Opening database at: ${DB_PATH}\n`)

const db = new Database(DB_PATH)

try {
  // Count entities before deletion
  const countBefore = db.prepare('SELECT COUNT(*) as count FROM entities').get()
  const count = countBefore.count
  console.log(`Found ${count} entities in the table`)
  
  if (count === 0) {
    console.log('✅ Entities table is already empty!')
    db.close()
    process.exit(0)
  }
  
  // Ask for confirmation (in a real script, you might want to add a prompt)
  console.log(`\n⚠️  About to delete ${count} entities...`)
  
  // Delete all entities
  const result = db.prepare('DELETE FROM entities').run()
  
  console.log(`\n✅ Successfully deleted ${result.changes} entities from the table`)
  
  // Verify deletion
  const countAfter = db.prepare('SELECT COUNT(*) as count FROM entities').get()
  const remaining = countAfter.count
  console.log(`Entities remaining: ${remaining}`)
  
} catch (error) {
  console.error('❌ Error clearing entities:', error.message)
  process.exit(1)
} finally {
  db.close()
  console.log('\n✅ Database connection closed')
}
