import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getDatabase } from './index.js'
import { localSchemaStore } from '../services/local/local-schema-store.js'
import { localPolicyStore } from '../services/local/local-policy-store.js'
import { loadPolicyTemplates } from '../services/policy-template-service.js'
import { shouldUpdateSchema, getDefaultSchema } from '../services/schema-service.js'
import * as roleEntityService from '../services/role-entity-service.js'
import {
  createDashboardUser,
  listDashboardUsers,
  type DashboardUser as DashboardUserRecord
} from '../services/dashboard-user-service.js'
import * as keyService from '../services/key-service.js'
import * as userService from '../services/user-service.js'
import { hash as hashEmail } from '../utils/encryption.js'
import type * as cedarType from '@cedar-policy/cedar-wasm/nodejs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function isCedarTextFormat(schemaData: string): boolean {
  return /^\s*(type\s+\w+|entity\s+\w+|action\s+)/m.test(schemaData.trim())
}

export async function seedDefaultSchema(): Promise<void> {
  const db = getDatabase()
  
  const existing = db.prepare('SELECT id, content FROM schema_policy WHERE obj_type = \'schema\' AND status = 1 LIMIT 1').get() as any
  
  if (existing) {
    const isCedarText = isCedarTextFormat(existing.content)
    
    if (!isCedarText) {
      try {
        const jsonSchema = JSON.parse(existing.content)
        
        const cedar = await import('@cedar-policy/cedar-wasm/nodejs')
        const textConversion = cedar.schemaToText(jsonSchema as any)
        
        if (textConversion.type === 'failure') {
          const errors = textConversion.errors.map((e: any) => e.message || JSON.stringify(e)).join(', ')
          console.error(`failed to convert json to cedar text: ${errors}`)
        } else {
          const version = `v${Date.now()}`
          db.prepare(`
            UPDATE schema_policy 
            SET content = ?, version = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(textConversion.text, version, existing.id)

          const comparison = await shouldUpdateSchema()
          if (comparison.shouldUpdate) {
            await localSchemaStore.updateSchema(comparison.fileSchema)
          }
          return
        }
      } catch (error: any) {
        console.error(`schema migration error: ${error.message}`)
      }
    } else {
      const comparison = await shouldUpdateSchema()
      if (comparison.shouldUpdate) {
        await localSchemaStore.updateSchema(comparison.fileSchema)
      }
      return
    }
  }

  const fileSchema = getDefaultSchema()
  await localSchemaStore.updateSchema(fileSchema)
}

export async function seedDefaultPolicy(): Promise<void> {
  const db = getDatabase()
  
  const existing = db.prepare('SELECT id FROM schema_policy WHERE obj_type = \'policy\' AND status = 1 LIMIT 1').get() as any
  
  if (existing) {
    return
  }

  const defaultPolicy = '@id("allow-completion-active-keys")permit(principal, action, resource) when { principal.status == "active" };'
  const description = 'Default policy: Allow completion when user status is active'
  await localPolicyStore.createPolicy(defaultPolicy, description)
}

type SeedFile = {
  roles?: string[]
  dashboardUsers?: {
    name: string
    email: string
    role: 'admin' | 'viewer' | 'user_admin' | 'policy_admin'
    createKey?: boolean
  }[]
  users?: {
    name: string
    email: string
    tenant?: string
    roleId?: string
    createKey?: boolean
    isAgent?: boolean
    limitRequestsPerMinute?: number
  }[]
}

async function findDashboardUserByEmail(email: string): Promise<DashboardUserRecord | null> {
  const res = listDashboardUsers({ search: email })
  const user = res.data.find(u => u.email.toLowerCase() === email.toLowerCase()) || null
  return user
}

function ensureDashboardUserKey(userId: string, email: string) {
  const keys = keyService.getKeysByUserId(userId)
  if (keys.length > 0) {
    return
  }
  keyService.createKey({ userId })
}

async function seedRolesFromFile(roles: string[] | undefined) {
  if (!roles || roles.length === 0) return

  for (const id of roles) {
    try {
      await roleEntityService.createRole(id)
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (msg.includes('already exists')) {
        // role exists, nothing to do
      } else {
        console.warn(`failed to create role ${id}:`, msg)
      }
    }
  }
}

async function seedDashboardUsersFromFile(entries: SeedFile['dashboardUsers']) {
  if (!entries || entries.length === 0) return

  for (const u of entries) {
    const existing = await findDashboardUserByEmail(u.email)
    if (existing) {
      if (u.createKey) {
        ensureDashboardUserKey(existing.userId, u.email)
      }
      continue
    }

    const result = await createDashboardUser({
      email: u.email,
      name: u.name,
      role: u.role
    })
    if (u.createKey) {
      ensureDashboardUserKey(result.user.userId, u.email)
    }
  }
}

async function seedAccessUsersFromFile(entries: SeedFile['users']) {
  if (!entries || entries.length === 0) return

  const db = getDatabase()

  for (const u of entries) {
    const emailHash = hashEmail(u.email)
    const existing = db
      .prepare('SELECT id FROM auth WHERE email_hash = ? AND status != 0')
      .get(emailHash) as { id: string } | undefined

    if (existing) {
      if (u.createKey) {
        const keys = keyService.getKeysByUserId(existing.id)
        if (keys.length === 0) {
          keyService.createKey({ userId: existing.id })
        }
      }
      continue
    }

    const createApiKey = u.createKey === true
    const limit = u.limitRequestsPerMinute ?? 100
    const isAgent = u.isAgent ?? false
    const tenant = u.tenant || 'engineering'

    await userService.createUser({
      email: u.email,
      name: u.name,
      tenant,
      isAgent,
      limitRequestsPerMinute: limit,
      createApiKey,
      roleId: u.roleId
    })
  }
}

async function seedFromLocalSeedFile(): Promise<void> {
  const seedPath = join(__dirname, '../seed/seed-data.json')

  if (!existsSync(seedPath)) {
    return
  }

  try {
    const raw = readFileSync(seedPath, 'utf-8')
    const parsed = JSON.parse(raw) as SeedFile

    console.log(`loading seed data from ${seedPath}`)

    await seedRolesFromFile(parsed.roles)
    await seedDashboardUsersFromFile(parsed.dashboardUsers)
    await seedAccessUsersFromFile(parsed.users)
  } catch (error: any) {
    console.warn('failed to process seed-data.json:', error?.message || error)
  }
}

export async function seedDefaults(): Promise<void> {
  await seedDefaultSchema()
  await seedDefaultPolicy()
  
  loadPolicyTemplates()
  await seedFromLocalSeedFile()
}
