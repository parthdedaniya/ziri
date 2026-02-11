import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { getConfigDir } from '../config/index.js'
import { ALL_SCHEMAS } from './schema.js'

const CONFIG_DIR = getConfigDir()
const DB_PATH = join(CONFIG_DIR, 'proxy.db')

let db: Database.Database | null = null
let schemaInitPromise: Promise<void> | null = null

export function getDatabase(): Database.Database {
  if (db) {
    return db
  }

  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }

  db = new Database(DB_PATH)

  db.pragma('foreign_keys = ON')

  schemaInitPromise = initializeSchema(db).catch((error) => {
    console.error('[DB] ❌ Schema initialization failed:', error.message)
    console.error('[DB] Stack:', error.stack)
    throw error
  })

  console.log(`[DB] Database initialized at: ${DB_PATH}`)

  return db
}

export async function ensureSchemaInitialized(): Promise<void> {
  if (!schemaInitPromise) {
    getDatabase()
  }
  if (schemaInitPromise) {
    await schemaInitPromise
  }
}

async function initializeSchema(database: Database.Database): Promise<void> {
  console.log('[DB] Initializing database schema (unified)...')

  for (const schema of ALL_SCHEMAS) {
    try {
      database.exec(schema)
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        console.warn('[DB] Schema execution warning:', error.message)
      }
    }
  }

  // Add new columns to existing tables if they don't exist
  try {
    // Check if auth_name column exists in audit_logs
    const auditLogsColumns = database.prepare("PRAGMA table_info(audit_logs)").all() as Array<{ name: string }>
    const hasAuthName = auditLogsColumns.some(col => col.name === 'auth_name')
    if (!hasAuthName) {
      database.exec('ALTER TABLE audit_logs ADD COLUMN auth_name TEXT')
      console.log('[DB] Added auth_name column to audit_logs table')
    }

    // Check if status column exists in user_agent_keys
    const userAgentKeysColumns = database.prepare("PRAGMA table_info(user_agent_keys)").all() as Array<{ name: string }>
    const hasStatus = userAgentKeysColumns.some(col => col.name === 'status')
    if (!hasStatus) {
      database.exec("ALTER TABLE user_agent_keys ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
      database.exec("CREATE INDEX IF NOT EXISTS idx_user_agent_keys_status ON user_agent_keys(status)")
      console.log('[DB] Added status column to user_agent_keys table')
    }

    // Partial unique index for auth email (Option D - allow reuse when deleted)
    try {
      database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_email_hash_active ON auth(email_hash) WHERE status != 0")
      console.log('[DB] Added partial unique index idx_auth_email_hash_active')
    } catch (idxError: any) {
      if (!idxError.message?.includes('already exists')) {
        console.warn('[DB] idx_auth_email_hash_active warning:', idxError.message)
      }
    }

    // Add policy_id column to schema_policy for policy ID uniqueness
    const schemaPolicyColumns = database.prepare("PRAGMA table_info(schema_policy)").all() as Array<{ name: string }>
    const hasPolicyId = schemaPolicyColumns.some(col => col.name === 'policy_id')
    if (!hasPolicyId) {
      database.exec('ALTER TABLE schema_policy ADD COLUMN policy_id TEXT')
      console.log('[DB] Added policy_id column to schema_policy')
    }

    // Backfill policy_id for existing policy rows
    const policyRows = database.prepare(`
      SELECT id, content FROM schema_policy
      WHERE obj_type = 'policy' AND policy_id IS NULL
    `).all() as Array<{ id: string; content: string }>

    const usedIds = new Set(
      (database.prepare('SELECT policy_id FROM schema_policy WHERE obj_type = ? AND policy_id IS NOT NULL').all('policy') as Array<{ policy_id: string }>)
        .map(r => r.policy_id)
    )

    const parsePolicyId = (content: string): string | null => {
      const match = content.trim().match(/^\s*@id\s*\(\s*"([^"]+)"\s*\)/)
      return match ? match[1] : null
    }

    for (const row of policyRows) {
      const parsed = parsePolicyId(row.content)
      let policyId: string
      if (parsed && !usedIds.has(parsed)) {
        policyId = parsed
      } else {
        policyId = `legacy-${row.id}`
      }
      usedIds.add(policyId)
      database.prepare('UPDATE schema_policy SET policy_id = ? WHERE id = ?').run(policyId, row.id)
    }
    if (policyRows.length > 0) {
      console.log(`[DB] Backfilled policy_id for ${policyRows.length} policy row(s)`)
    }

    // Create unique index on policy_id (if not exists from schema)
    try {
      database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_policy_policy_id
        ON schema_policy(policy_id)
        WHERE obj_type = 'policy' AND policy_id IS NOT NULL
      `)
      console.log('[DB] Ensured idx_schema_policy_policy_id index')
    } catch (idxError: any) {
      if (!idxError.message?.includes('already exists')) {
        console.warn('[DB] idx_schema_policy_policy_id warning:', idxError.message)
      }
    }
  } catch (error: any) {
    console.warn('[DB] Column addition warning:', error.message)
  }

  try {
    const { seedPricing } = await import('./seed-pricing.js')
    seedPricing(database)
  } catch (error: any) {
    if (!error.message?.includes('Cannot find module')) {
      console.warn('[DB] Pricing seed failed:', error.message)
    }
  }

  console.log('[DB] ✅ Database schema initialized')
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[DB] Database connection closed')
  }
}

export async function initializeAdminUser(): Promise<void> {
  console.log('[DB] initializeAdminUser() called')
  const db = getDatabase()
  const { getRootKey } = await import('../utils/root-key.js')
  const { hashPassword } = await import('../utils/password.js')
  const { encrypt, hash: hashEmail } = await import('../utils/encryption.js')
  
  const rootKey = getRootKey()
  console.log(`[DB] Root key retrieved: ${!!rootKey}, length: ${rootKey?.length || 0}`)
  if (!rootKey) {
    console.error('[DB] ✗ Root key not found, skipping admin user initialization')
    return
  }
  
  const adminEmail = 'ziri@ziri.local'
  const adminId = 'ziri'
  console.log(`[DB] Hashing root key for admin user...`)
  const rootKeyHash = await hashPassword(rootKey)
  console.log(`[DB] Root key hashed successfully`)
  
  const adminUser = db.prepare('SELECT * FROM auth WHERE id = ?').get(adminId) as any
  
  const encryptedEmail = encrypt(adminEmail)
  const emailHash = hashEmail(adminEmail)
  
  if (!adminUser) {
    console.log(`[DB] Creating new admin user: ${adminId}`)
    db.prepare(`
      INSERT INTO auth (id, email, email_hash, name, password, "group", is_agent, status, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      adminId,
      encryptedEmail,
      emailHash,
      'Administrator',
      rootKeyHash,
      null,
      0,
      1,
      'admin'
    )
    console.log('[DB] ✓ Admin user ziri created with root key as password')
  } else {
    console.log(`[DB] Admin user exists, updating password hash and role...`)
    db.prepare(`
      UPDATE auth 
      SET email = ?, email_hash = ?, password = ?, status = 1, role = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(encryptedEmail, emailHash, rootKeyHash, 'admin', adminId)
    console.log('[DB] ✓ Admin user ziri password and role updated to match current root key')
  }
  console.log(`[DB] Admin user initialization complete`)
}

export async function initializeInternalAuth(): Promise<void> {
  console.log('[INTERNAL AUTH] Initializing internal authorization...')
  
  const db = getDatabase()
  const { internalSchemaStore } = await import('../services/internal/internal-schema-store.js')
  const { internalPolicyStore } = await import('../services/internal/internal-policy-store.js')
  const { internalEntityStore } = await import('../services/internal/internal-entity-store.js')
  const { internalCedarTextSchema } = await import('../authorization/internal/internal-schema.js')
  const { internalPolicies } = await import('../authorization/internal/internal-policies.js')
  

  const schemaCheck = await internalSchemaStore.shouldUpdateSchema()
  if (schemaCheck.shouldUpdate) {
    console.log('[INTERNAL AUTH] Schema changed, updating...')
    await internalSchemaStore.updateSchema(schemaCheck.fileSchema)
    console.log('[INTERNAL AUTH] ✓ Schema updated')
  } else {
    console.log('[INTERNAL AUTH] Schema is up to date')
  }
  

  const policyCheck = await internalPolicyStore.shouldUpdatePolicies()
  if (policyCheck.shouldUpdate) {
    console.log('[INTERNAL AUTH] Policies changed, updating...')
    await internalPolicyStore.updatePolicies(policyCheck.filePolicies)
    console.log('[INTERNAL AUTH] ✓ Policies updated')
  } else {
    console.log('[INTERNAL AUTH] Policies are up to date')
  }
  

  const ziriEntity = await internalEntityStore.getEntity('ziri')
  if (!ziriEntity) {
    console.log('[INTERNAL AUTH] Creating internal entity for ziri...')
    const ziriUser = db.prepare('SELECT * FROM auth WHERE id = ?').get('ziri') as any
    if (ziriUser) {
      const { decrypt } = await import('../utils/encryption.js')
      let email = 'ziri@ziri.local'
      try {
        email = decrypt(ziriUser.email)
      } catch {
        email = ziriUser.email || 'ziri@ziri.local'
      }
      
      const entity = {
        uid: {
          type: 'DashboardUser',
          id: 'ziri'
        },
        attrs: {
          user_id: 'ziri',
          role: 'admin',
          status: 'active',
          email: email,
          name: ziriUser.name || 'Administrator'
        },
        parents: []
      }
      
      await internalEntityStore.createEntity(entity)
      console.log('[INTERNAL AUTH] ✓ Ziri internal entity created')
    } else {
      console.warn('[INTERNAL AUTH] ⚠️ Ziri user not found in auth table, skipping entity creation')
    }
  } else {

    const ziriUser = db.prepare('SELECT * FROM auth WHERE id = ?').get('ziri') as any
    if (ziriUser) {
      const { decrypt } = await import('../utils/encryption.js')
      let email = 'ziri@ziri.local'
      try {
        email = decrypt(ziriUser.email)
      } catch {
        email = ziriUser.email || 'ziri@ziri.local'
      }
      
      const updates: any = {}
      if (ziriEntity.attrs.email !== email) {
        updates.email = email
      }
      if (ziriEntity.attrs.name !== (ziriUser.name || 'Administrator')) {
        updates.name = ziriUser.name || 'Administrator'
      }
      if (ziriEntity.attrs.role !== (ziriUser.role || 'admin')) {
        updates.role = ziriUser.role || 'admin'
      }
      
      if (Object.keys(updates).length > 0) {
        await internalEntityStore.updateEntity('ziri', updates)
        console.log('[INTERNAL AUTH] ✓ Ziri internal entity synced')
      }
    }
  }
  
  console.log('[INTERNAL AUTH] ✅ Internal authorization initialization complete')
}

export { DB_PATH }
