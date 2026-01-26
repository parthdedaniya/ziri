 
 

import { getDatabase } from '../db/index.js'
import { generateApiKey, hashApiKey, extractUserIdFromApiKey } from '../utils/api-key.js'
import { encrypt, decrypt } from '../utils/encryption.js'
import { randomBytes } from 'crypto'
import * as userService from './user-service.js'
import { serviceFactory } from './service-factory.js'
import type { Entity } from '../types/entity.js'

export interface CreateKeyInput {
  userId: string
 
}

export interface ApiKey {
  id: string // user_agent_keys.id (TEXT)
  userId: string // auth_id
  apiKey: string // Decrypted
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

 
export async function createKey(input: CreateKeyInput): Promise<{ apiKey: string; userId: string }> {
  const db = getDatabase()
  
 
  const user = userService.getUserById(input.userId)
  if (!user) {
    throw new Error('User not found')
  }
  
 
  const userKeyId = await findUserKeyIdForUser(input.userId)
  if (!userKeyId) {
    throw new Error('UserKey entity not found for user. User may not have been properly created.')
  }
  
 
  const apiKey = generateApiKey(input.userId)
  const keyHash = hashApiKey(apiKey)
  
 
  const encryptedKey = encrypt(apiKey)
  
 
  const keyId = `key-${randomBytes(8).toString('hex')}`
  
 
  db.prepare(`
    INSERT INTO user_agent_keys (id, key_value, key_hash, auth_id)
    VALUES (?, ?, ?, ?)
  `).run(keyId, encryptedKey, keyHash, input.userId)
  
  return { apiKey, userId: input.userId }
}

 
export function listKeys(): ApiKey[] {
  const db = getDatabase()
  const keys = db.prepare('SELECT * FROM user_agent_keys ORDER BY created_at DESC').all() as any[]
  return keys.map(mapDbKeyToKey)
}

 
export function getKeyByHash(keyHash: string): ApiKey | null {
  const db = getDatabase()
  const key = db.prepare('SELECT * FROM user_agent_keys WHERE key_hash = ?').get(keyHash) as any
  return key ? mapDbKeyToKey(key) : null
}

 
export function getKeyByApiKey(apiKey: string): ApiKey | null {
  const keyHash = hashApiKey(apiKey)
  return getKeyByHash(keyHash)
}

 
export function getKeyHashByApiKey(apiKey: string): string | null {
  const db = getDatabase()
  const keyHash = hashApiKey(apiKey)
 
  const dbKey = db.prepare('SELECT key_hash FROM user_agent_keys WHERE key_hash = ?').get(keyHash) as { key_hash: string } | undefined
  return dbKey?.key_hash || null
}

 
export function getKeysByUserId(userId: string): ApiKey[] {
  const db = getDatabase()
  const keys = db.prepare('SELECT * FROM user_agent_keys WHERE auth_id = ? ORDER BY created_at DESC').all(userId) as any[]
  return keys.map(mapDbKeyToKey)
}

 
export async function getUserKeyIdForUser(userId: string): Promise<string | null> {
  return await findUserKeyIdForUser(userId)
}

 
export async function rotateKey(userId: string): Promise<{ apiKey: string; userId: string }> {
  const db = getDatabase()
  
 
  const user = userService.getUserById(userId)
  if (!user) {
    throw new Error('User not found')
  }
  
 
  const userKeyId = await findUserKeyIdForUser(userId)
  if (!userKeyId) {
    throw new Error('UserKey entity not found for user. User may not have been properly created.')
  }
  
 
  db.prepare('DELETE FROM user_agent_keys WHERE auth_id = ?').run(userId)
  
 
  const apiKey = generateApiKey(userId)
  const keyHash = hashApiKey(apiKey)
  
 
  const encryptedKey = encrypt(apiKey)
  
 
  const keyId = `key-${randomBytes(8).toString('hex')}`
  
 
  db.prepare(`
    INSERT INTO user_agent_keys (id, key_value, key_hash, auth_id)
    VALUES (?, ?, ?, ?)
  `).run(keyId, encryptedKey, keyHash, userId)
  
  return { apiKey, userId }
}

 
export function deleteKeyById(keyId: string): void {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM user_agent_keys WHERE id = ?').run(keyId)
  if (result.changes === 0) {
    throw new Error('API key not found')
  }
}

 
export function deleteKeysByUserId(userId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM user_agent_keys WHERE auth_id = ?').run(userId)
}

 
function mapDbKeyToKey(dbKey: any): ApiKey {
 
  let decryptedKey: string
  try {
    decryptedKey = decrypt(dbKey.key_value)
  } catch (error: any) {
 
    console.warn('[KEY SERVICE] Failed to decrypt API key, treating as plain text:', error.message)
    decryptedKey = dbKey.key_value
  }
  
  return {
    id: dbKey.id,
    userId: dbKey.auth_id,
    apiKey: decryptedKey,
    createdAt: dbKey.created_at
  }
}
