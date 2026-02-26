import { getDatabase } from './packages/proxy/src/db/index.js'
import * as roleEntityService from './packages/proxy/src/services/role-entity-service.js'
import {
  createDashboardUser,
  listDashboardUsers,
  type DashboardUser as DashboardUserRecord
} from './packages/proxy/src/services/dashboard-user-service.js'
import * as keyService from './packages/proxy/src/services/key-service.js'
import * as userService from './packages/proxy/src/services/user-service.js'
import { hash as hashEmail } from './packages/proxy/src/utils/encryption.js'

type DashboardSeedUser = {
  name: string
  email: string
  role: 'admin' | 'viewer' | 'user_admin' | 'policy_admin'
  needsKey: boolean
}

type AccessSeedUser = {
  name: string
  email: string
  tenant: string
  createApiKey: boolean
  roleId?: string
}

async function seedRoles() {
  const roles = ['admin', 'analyst', 'engineer']

  for (const id of roles) {
    try {
      await roleEntityService.createRole(id)
      console.log(`[demo-seed] created role: ${id}`)
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (msg.includes('already exists')) {
        console.log(`[demo-seed] role already exists, skipping: ${id}`)
      } else {
        console.error(`[demo-seed] failed to create role ${id}:`, msg)
      }
    }
  }
}

async function findDashboardUserByEmail(email: string): Promise<DashboardUserRecord | null> {
  const res = listDashboardUsers({ search: email })
  const user = res.data.find(u => u.email.toLowerCase() === email.toLowerCase()) || null
  return user
}

async function ensureDashboardUser(user: DashboardSeedUser): Promise<DashboardUserRecord> {
  const existing = await findDashboardUserByEmail(user.email)
  if (existing) {
    console.log(`[demo-seed] dashboard user exists, skipping create: ${user.email}`)
    return existing
  }

  const result = await createDashboardUser({
    email: user.email,
    name: user.name,
    role: user.role
  })

  console.log(`[demo-seed] created dashboard user: ${user.email} (${user.role})`)
  return result.user
}

function ensureDashboardUserKey(userId: string, email: string) {
  const keys = keyService.getKeysByUserId(userId)
  if (keys.length > 0) {
    console.log(`[demo-seed] dashboard user already has keys, skipping key create: ${email}`)
    return
  }

  const result = keyService.createKey({ userId })
  console.log(`[demo-seed] created API key for dashboard user: ${email} (key suffix: ${result.apiKey?.slice(-6) || 'hidden'})`)
}

async function seedDashboardUsers() {
  const dashboardUsers: DashboardSeedUser[] = [
    { name: 'Dipen', role: 'admin', email: 'dipen.admin@example.com', needsKey: true },
    { name: 'Amit', role: 'admin', email: 'amit.admin@example.com', needsKey: true },
    { name: 'John', role: 'viewer', email: 'john.viewer@example.com', needsKey: false },
    { name: 'Sarah', role: 'user_admin', email: 'sarah.useradmin@example.com', needsKey: false },
    { name: 'Alex', role: 'policy_admin', email: 'alex.policyadmin@example.com', needsKey: false }
  ]

  for (const u of dashboardUsers) {
    const user = await ensureDashboardUser(u)
    if (u.needsKey) {
      ensureDashboardUserKey(user.userId, u.email)
    }
  }
}

async function findAccessUserByEmail(email: string): Promise<{ id: string } | null> {
  const db = getDatabase()
  const emailHash = hashEmail(email)
  const row = db
    .prepare('SELECT id FROM auth WHERE email_hash = ? AND status != 0')
    .get(emailHash) as { id: string } | undefined
  return row || null
}

function ensureAccessUserKey(userId: string, email: string) {
  const keys = keyService.getKeysByUserId(userId)
  if (keys.length > 0) {
    console.log(`[demo-seed] access user already has keys, skipping key create: ${email}`)
    return
  }

  const result = keyService.createKey({ userId })
  console.log(`[demo-seed] created API key for access user: ${email} (key suffix: ${result.apiKey?.slice(-6) || 'hidden'})`)
}

async function ensureAccessUser(user: AccessSeedUser) {
  const existing = await findAccessUserByEmail(user.email)

  if (existing) {
    console.log(`[demo-seed] access user exists, skipping create: ${user.email}`)
    if (user.createApiKey) {
      ensureAccessUserKey(existing.id, user.email)
    }
    return
  }

  const result = await userService.createUser({
    email: user.email,
    name: user.name,
    tenant: user.tenant,
    isAgent: false,
    limitRequestsPerMinute: 100,
    createApiKey: user.createApiKey,
    roleId: user.roleId
  })

  console.log(
    `[demo-seed] created access user: ${user.email} (tenant=${user.tenant}, roleId=${user.roleId || 'none'}, apiKey=${
      user.createApiKey ? 'yes' : 'no'
    })`
  )
}

async function seedAccessUsers() {
  const accessUsers: AccessSeedUser[] = [
    // With keys
    {
      name: 'Alice Johnson',
      email: 'alice@eng.example.com',
      tenant: 'engineering',
      createApiKey: true,
      roleId: 'admin'
    },
    {
      name: 'Bob Smith',
      email: 'bob@sales.example.com',
      tenant: 'sales',
      createApiKey: true,
      roleId: 'analyst'
    },
    {
      name: 'Carol Davis',
      email: 'carol@marketing.example.com',
      tenant: 'marketing',
      createApiKey: true,
      roleId: 'engineer'
    },
    // Without keys
    {
      name: 'Dave Miller',
      email: 'dave@eng.example.com',
      tenant: 'engineering',
      createApiKey: false,
      roleId: 'analyst'
    },
    {
      name: 'Eve Wilson',
      email: 'eve@marketing.example.com',
      tenant: 'marketing',
      createApiKey: false
    }
  ]

  for (const u of accessUsers) {
    await ensureAccessUser(u)
  }
}

async function main() {
  console.log('[demo-seed] starting demo seed...')

  await seedRoles()
  await seedDashboardUsers()
  await seedAccessUsers()

  console.log('[demo-seed] demo seed complete')
}

main().catch(err => {
  console.error('[demo-seed] failed:', err)
  process.exit(1)
})

