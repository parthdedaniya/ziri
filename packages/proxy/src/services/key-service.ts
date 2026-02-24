 
 

import { getDatabase } from '../db/index.js'
import { generateApiKey, hashApiKey } from '../utils/api-key.js'
import { randomBytes } from 'crypto'
import * as userService from './user-service.js'
import { serviceFactory } from './service-factory.js'
import type { Entity } from '../types/entity.js'

export interface CreateKeyInput {
  userId: string
 
}

export interface ApiKey {
  id: string
  userId: string
  apiKey?: string
  keySuffix?: string
  createdAt: string
}

 
async function findUserKeyIdForUser(userId: string): Promise<string | null> {
  const entityStore = serviceFactory.getEntityStore()
  
 
  const allEntitiesResult = await entityStore.getEntities()
  const allEntities = allEntitiesResult.data
  const userKeyEntity = allEntities.find(e => 
    e.uid.type === 'UserKey' && 
    (e.attrs as any).user && 
    (e.attrs as any).user.__entity && 
    (e.attrs as any).user.__entity.id === userId
  )
  
  return userKeyEntity ? userKeyEntity.uid.id : null
}

async function hasActiveKey(userId: string): Promise<boolean> {
  const entityStore = serviceFactory.getEntityStore()
  
  const allEntitiesResult = await entityStore.getEntities()
  const allEntities = allEntitiesResult.data
  const userKeyEntity = allEntities.find(e => 
    e.uid.type === 'UserKey' && 
    (e.attrs as any).user && 
    (e.attrs as any).user.__entity && 
    (e.attrs as any).user.__entity.id === userId
  )
  
  if (!userKeyEntity) {
    return false
  }
  
  const status = (userKeyEntity.attrs as any).status
  return status === 'active' || status === 1
}

 
export async function createKey(input: CreateKeyInput): Promise<{ apiKey: string; userId: string }> {
  const db = getDatabase()
  
  const dbUser = db.prepare('SELECT * FROM auth WHERE id = ?').get(input.userId) as any
  if (!dbUser) {
    throw new Error('User not found')
  }
  
  if (dbUser.status !== 1) {
    throw new Error('User is not active')
  }
  const existingKeys = getKeysByUserId(input.userId)
  if (existingKeys.length > 0) {
    throw new Error('User already has an API key. Only one key per user is allowed.')
  }
  
  const entityStore = serviceFactory.getEntityStore()
  const { toDecimalFour } = await import('../utils/cedar.js')
  
  let userEntityExists = false
  try {
    const allEntitiesResult = await entityStore.getEntities()
    const allEntities = allEntitiesResult.data
    userEntityExists = allEntities.some(e => e.uid.type === 'User' && e.uid.id === input.userId)
  } catch (error: any) {
    console.warn(`[KEY SERVICE] Failed to check for User entity:`, error.message)
  }
  
  if (!userEntityExists) {
    const { decrypt } = await import('../utils/encryption.js')
    let userEmail = ''
    let userGroup = ''
    let isAgent = false
    
    try {
      userEmail = decrypt(dbUser.email)
    } catch {
      userEmail = dbUser.email || ''
    }
    
    const userEntity = {
      uid: { type: 'User', id: input.userId },
      attrs: {
        user_id: input.userId,
        email: userEmail,
        tenant: dbUser.tenant || '',
        is_agent: dbUser.is_agent === 1,
        limit_requests_per_minute: 100
      },
      parents: []
    }
    
    try {
      await entityStore.createEntity(userEntity, 1)
    } catch (error: any) {
      throw new Error(`Failed to create User entity: ${error.message}`)
    }
  }
  
  let userKeyId = await findUserKeyIdForUser(input.userId)
  if (!userKeyId) {
    const creationTime = new Date().toISOString()
    const newUserKeyId = `uk-${randomBytes(8).toString('hex')}`
    const userKeyEntity = {
      uid: { type: 'UserKey', id: newUserKeyId },
      attrs: {
        current_daily_spend: toDecimalFour(0),
        current_monthly_spend: toDecimalFour(0),
        last_daily_reset: creationTime,
        last_monthly_reset: creationTime,
        status: 'active' as const,
        user: {
          __entity: {
            type: 'User',
            id: input.userId
          }
        }
      },
      parents: []
    }
    
    try {
      await entityStore.createEntity(userKeyEntity, 1)
      userKeyId = newUserKeyId
    } catch (error: any) {
      throw new Error(`Failed to create UserKey entity: ${error.message}`)
    }
  }
  
  const apiKey = generateApiKey(input.userId)
  const keyHash = hashApiKey(apiKey)
  const keySuffix = apiKey.slice(-5)

  const keyId = `key-${randomBytes(8).toString('hex')}`

  db.prepare(`
    INSERT INTO user_agent_keys (id, key_value, key_hash, auth_id, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(keyId, keySuffix, keyHash, input.userId)

  return { apiKey, userId: input.userId }
}

 
export function listKeys(): ApiKey[] {
  const db = getDatabase()
  const keys = db.prepare(`
    SELECT * FROM user_agent_keys
    WHERE status IN ('active', 'disabled')
    ORDER BY created_at DESC
  `).all() as any[]
  return keys.map(mapDbKeyToKey)
}

 
export function getKeyByHash(keyHash: string): ApiKey | null {
  const db = getDatabase()
  const key = db.prepare(`
    SELECT * FROM user_agent_keys
    WHERE key_hash = ? AND status = 'active'
  `).get(keyHash) as any
  return key ? mapDbKeyToKey(key) : null
}

 
export function getKeyByApiKey(apiKey: string): ApiKey | null {
  const keyHash = hashApiKey(apiKey)
  return getKeyByHash(keyHash)
}

 
export function getKeyHashByApiKey(apiKey: string): string | null {
  const db = getDatabase()
  const keyHash = hashApiKey(apiKey)
  const dbKey = db.prepare(`
    SELECT key_hash FROM user_agent_keys
    WHERE key_hash = ? AND status = 'active'
  `).get(keyHash) as { key_hash: string } | undefined
  return dbKey?.key_hash || null
}

 
export function getKeysByUserId(userId: string): ApiKey[] {
  const db = getDatabase()
  const keys = db.prepare(`
    SELECT * FROM user_agent_keys
    WHERE auth_id = ? AND status IN ('active', 'disabled')
    ORDER BY created_at DESC
  `).all(userId) as any[]
  return keys.map(mapDbKeyToKey)
}

 
export async function getUserKeyIdForUser(userId: string): Promise<string | null> {
  return await findUserKeyIdForUser(userId)
}

 
export async function rotateKey(userId: string): Promise<{ apiKey: string; userId: string }> {
  const db = getDatabase()
  
  const dbUser = db.prepare('SELECT * FROM auth WHERE id = ?').get(userId) as any
  if (!dbUser) {
    throw new Error('User not found')
  }
  
  if (dbUser.status !== 1) {
    throw new Error('User is not active')
  }
  
 
  const userKeyId = await findUserKeyIdForUser(userId)
  if (!userKeyId) {
    throw new Error('UserKey entity not found for user. User may not have been properly created.')
  }

  db.prepare(`
    UPDATE user_agent_keys SET status = 'deleted', updated_at = datetime('now')
    WHERE auth_id = ?
  `).run(userId)

  const apiKey = generateApiKey(userId)
  const keyHash = hashApiKey(apiKey)
  const keySuffix = apiKey.slice(-5)
  const keyId = `key-${randomBytes(8).toString('hex')}`

  db.prepare(`
    INSERT INTO user_agent_keys (id, key_value, key_hash, auth_id, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(keyId, keySuffix, keyHash, userId)

  return { apiKey, userId }
}

 
export async function deleteKeyById(keyId: string): Promise<void> {
  const db = getDatabase()
  const row = db.prepare('SELECT auth_id FROM user_agent_keys WHERE id = ?').get(keyId) as { auth_id: string } | undefined
  if (!row) {
    throw new Error('API key not found')
  }
  db.prepare(`
    UPDATE user_agent_keys SET status = 'deleted', updated_at = datetime('now')
    WHERE id = ?
  `).run(keyId)
  await updateUserKeyEntityStatus(row.auth_id, 'deleted')
}

export async function deleteKeysByUserId(userId: string): Promise<void> {
  const db = getDatabase()
  db.prepare(`
    UPDATE user_agent_keys SET status = 'deleted', updated_at = datetime('now')
    WHERE auth_id = ?
  `).run(userId)
  await updateUserKeyEntityStatus(userId, 'deleted')
}

async function updateUserKeyEntityStatus(userId: string, status: 'active' | 'disabled' | 'deleted'): Promise<void> {
  try {
    const entityStore = serviceFactory.getEntityStore()
    const userKeyId = await findUserKeyIdForUser(userId)
    if (!userKeyId) return
    const result = await entityStore.getEntities()
    const userKeyEntity = result.data.find(
      (e: any) => e.uid.type === 'UserKey' && e.uid.id === userKeyId
    )
    if (!userKeyEntity) return
    const updated = {
      ...userKeyEntity,
      attrs: { ...userKeyEntity.attrs, status }
    }
    const entityStatus = status === 'deleted' ? 0 : status === 'disabled' ? 2 : 1
    await entityStore.updateEntity(updated, entityStatus)
  } catch (error: any) {
    console.warn('[KEY SERVICE] Failed to update UserKey entity status:', error.message)
  }
}

 
function mapDbKeyToKey(dbKey: any): ApiKey {
  const keyValue = dbKey.key_value
  const keySuffix = (keyValue && keyValue.length <= 5) ? keyValue : '-----'
  return {
    id: dbKey.id,
    userId: dbKey.auth_id,
    keySuffix,
    createdAt: dbKey.created_at
  }
}
