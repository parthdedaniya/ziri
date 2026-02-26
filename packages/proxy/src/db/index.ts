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
    console.error('schema initialization failed:', error.message)
    throw error
  })

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
  for (const schema of ALL_SCHEMAS) {
    try {
      database.exec(schema)
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        console.warn('schema exec warning:', error.message)
      }
    }
  }


  try {

    const auditLogsColumns = database.prepare("PRAGMA table_info(audit_logs)").all() as Array<{ name: string }>
    const hasAuthName = auditLogsColumns.some(col => col.name === 'auth_name')
    if (!hasAuthName) {
      database.exec('ALTER TABLE audit_logs ADD COLUMN auth_name TEXT')
    }


    const userAgentKeysColumns = database.prepare("PRAGMA table_info(user_agent_keys)").all() as Array<{ name: string }>
    const hasStatus = userAgentKeysColumns.some(col => col.name === 'status')
    if (!hasStatus) {
      database.exec("ALTER TABLE user_agent_keys ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
      database.exec("CREATE INDEX IF NOT EXISTS idx_user_agent_keys_status ON user_agent_keys(status)")
    }


    try {
      database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_email_hash_active ON auth(email_hash) WHERE status != 0")
    } catch (idxError: any) {
      if (!idxError.message?.includes('already exists')) {
        console.warn('idx_auth_email_hash_active warning:', idxError.message)
      }
    }


    const schemaPolicyColumns = database.prepare("PRAGMA table_info(schema_policy)").all() as Array<{ name: string }>
    const hasPolicyId = schemaPolicyColumns.some(col => col.name === 'policy_id')
    if (!hasPolicyId) {
      database.exec('ALTER TABLE schema_policy ADD COLUMN policy_id TEXT')
    }


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

    try {
      database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_policy_policy_id
        ON schema_policy(policy_id)
        WHERE obj_type = 'policy' AND policy_id IS NOT NULL
      `)
    } catch (idxError: any) {
      if (!idxError.message?.includes('already exists')) {
        console.warn('idx_schema_policy_policy_id warning:', idxError.message)
      }
    }
  } catch (error: any) {
    console.warn('column addition warning:', error.message)
  }

  try {
    const { seedPricing } = await import('./seed-pricing.js')
    seedPricing(database)
  } catch (error: any) {
    if (!error.message?.includes('Cannot find module')) {
      console.warn('pricing seed failed:', error.message)
    }
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export async function initializeAdminUser(): Promise<void> {
  const db = getDatabase()
  const { getRootKey } = await import('../utils/root-key.js')
  const { hashPassword } = await import('../utils/password.js')
  const { encrypt, hash: hashEmail } = await import('../utils/encryption.js')

  const rootKey = getRootKey()
  if (!rootKey) {
    console.error('root key not found, skipping admin user initialization')
    return
  }

  const adminEmail = 'ziri@ziri.local'
  const adminId = 'ziri'
  const rootKeyHash = await hashPassword(rootKey)
  
  const adminUser = db.prepare('SELECT * FROM auth WHERE id = ?').get(adminId) as any
  
  const encryptedEmail = encrypt(adminEmail)
  const emailHash = hashEmail(adminEmail)
  
  if (!adminUser) {
    db.prepare(`
      INSERT INTO auth (id, email, email_hash, name, password, tenant, is_agent, status, role)
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
  } else {
    db.prepare(`
      UPDATE auth 
      SET email = ?, email_hash = ?, password = ?, status = 1, role = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(encryptedEmail, emailHash, rootKeyHash, 'admin', adminId)
  }
}

export async function initializeInternalAuth(): Promise<void> {
  const db = getDatabase()
  const { internalSchemaStore } = await import('../services/internal/internal-schema-store.js')
  const { internalPolicyStore } = await import('../services/internal/internal-policy-store.js')
  const { internalEntityStore } = await import('../services/internal/internal-entity-store.js')
  const { internalCedarTextSchema } = await import('../authorization/internal/internal-schema.js')
  const { internalPolicies } = await import('../authorization/internal/internal-policies.js')
  

  const schemaCheck = await internalSchemaStore.shouldUpdateSchema()
  if (schemaCheck.shouldUpdate) {
    await internalSchemaStore.updateSchema(schemaCheck.fileSchema)
  }

  const policyCheck = await internalPolicyStore.shouldUpdatePolicies()
  if (policyCheck.shouldUpdate) {
    await internalPolicyStore.updatePolicies(policyCheck.filePolicies)
  }

  const ziriEntity = await internalEntityStore.getEntity('ziri')
  if (!ziriEntity) {
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
      }
    }
  }
}

export { DB_PATH }
