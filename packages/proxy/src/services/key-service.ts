// Key service - business logic for API key management
// Uses new user_agent_keys table with encryption

import { getDatabase } from '../db/index.js'
import { generateApiKey, hashApiKey, extractUserIdFromApiKey } from '../utils/api-key.js'
import { encrypt, decrypt } from '../utils/encryption.js'
import { randomBytes } from 'crypto'
import * as userService from './user-service.js'
import { serviceFactory } from './service-factory.js'
import type { Entity } from '../types/entity.js'

export interface CreateKeyInput {
  userId: string
  // No entity attributes - UserKey is created when user is created
}

export interface ApiKey {
  id: string // user_agent_keys.id (TEXT)
  userId: string // auth_id
  apiKey: string // Decrypted
  createdAt: string
}

/**
 * Get UserKey ID for a user (finds UserKey entity by user reference)
 */
async function findUserKeyIdForUser(userId: string): Promise<string | null> {
  const entityStore = serviceFactory.getEntityStore()
  
  // Get all UserKey entities and find the one for this user
  const allEntities = await entityStore.getEntities()
  const userKeyEntity = allEntities.find(e => 
    e.uid.type === 'UserKey' && 
    (e.attrs as any).user && 
    (e.attrs as any).user.__entity && 
    (e.attrs as any).user.__entity.id === userId
  )
  
  return userKeyEntity ? userKeyEntity.uid.id : null
}

/**
 * Create a new API key for a user
 * Links to existing UserKey entity (created when user was created)
 */
export async function createKey(input: CreateKeyInput): Promise<{ apiKey: string; userId: string }> {
  const db = getDatabase()
  
  // Verify user exists
  const user = userService.getUserById(input.userId)
  if (!user) {
    throw new Error('User not found')
  }
  
  // Find UserKey entity for this user
  const userKeyId = await findUserKeyIdForUser(input.userId)
  if (!userKeyId) {
    throw new Error('UserKey entity not found for user. User may not have been properly created.')
  }
  
  // Generate API key
  const apiKey = generateApiKey(input.userId)
  const keyHash = hashApiKey(apiKey)
  
  // Encrypt API key
  const encryptedKey = encrypt(apiKey)
  
  // Generate key ID
  const keyId = `key-${randomBytes(8).toString('hex')}`
  
  // Store in user_agent_keys table
  db.prepare(`
    INSERT INTO user_agent_keys (id, key_value, key_hash, auth_id)
    VALUES (?, ?, ?, ?)
  `).run(keyId, encryptedKey, keyHash, input.userId)
  
  return { apiKey, userId: input.userId }
}

/**
 * List all API keys
 */
export function listKeys(): ApiKey[] {
  const db = getDatabase()
  const keys = db.prepare('SELECT * FROM user_agent_keys ORDER BY created_at DESC').all() as any[]
  return keys.map(mapDbKeyToKey)
}

/**
 * Get API key by key hash (for validation)
 */
export function getKeyByHash(keyHash: string): ApiKey | null {
  const db = getDatabase()
  const key = db.prepare('SELECT * FROM user_agent_keys WHERE key_hash = ?').get(keyHash) as any
  return key ? mapDbKeyToKey(key) : null
}

/**
 * Get API key by API key string
 */
export function getKeyByApiKey(apiKey: string): ApiKey | null {
  const keyHash = hashApiKey(apiKey)
  return getKeyByHash(keyHash)
}

/**
 * Get keyHash for an API key (from database)
 */
export function getKeyHashByApiKey(apiKey: string): string | null {
  const db = getDatabase()
  const keyHash = hashApiKey(apiKey)
  // Get keyHash directly from database using the hash
  const dbKey = db.prepare('SELECT key_hash FROM user_agent_keys WHERE key_hash = ?').get(keyHash) as { key_hash: string } | undefined
  return dbKey?.key_hash || null
}

/**
 * Get keys for a specific user
 */
export function getKeysByUserId(userId: string): ApiKey[] {
  const db = getDatabase()
  const keys = db.prepare('SELECT * FROM user_agent_keys WHERE auth_id = ? ORDER BY created_at DESC').all(userId) as any[]
  return keys.map(mapDbKeyToKey)
}

/**
 * Get UserKey ID for a user (for chat endpoint authorization)
 * Exported version of the internal function
 */
export async function getUserKeyIdForUser(userId: string): Promise<string | null> {
  return await findUserKeyIdForUser(userId)
}

/**
 * Rotate an API key (generate new key for same user)
 * Reuses existing UserKey entity (same user, same spend tracking)
 * Deletes old keys (no revocation)
 */
export async function rotateKey(userId: string): Promise<{ apiKey: string; userId: string }> {
  const db = getDatabase()
  
  // Verify user exists
  const user = userService.getUserById(userId)
  if (!user) {
    throw new Error('User not found')
  }
  
  // Find UserKey entity for this user (should exist from user creation)
  const userKeyId = await findUserKeyIdForUser(userId)
  if (!userKeyId) {
    throw new Error('UserKey entity not found for user. User may not have been properly created.')
  }
  
  // Delete all existing keys for this user (instead of revoking)
  db.prepare('DELETE FROM user_agent_keys WHERE auth_id = ?').run(userId)
  
  // Generate new API key
  const apiKey = generateApiKey(userId)
  const keyHash = hashApiKey(apiKey)
  
  // Encrypt API key
  const encryptedKey = encrypt(apiKey)
  
  // Generate key ID
  const keyId = `key-${randomBytes(8).toString('hex')}`
  
  // Store new key in user_agent_keys table
  db.prepare(`
    INSERT INTO user_agent_keys (id, key_value, key_hash, auth_id)
    VALUES (?, ?, ?, ?)
  `).run(keyId, encryptedKey, keyHash, userId)
  
  return { apiKey, userId }
}

/**
 * Delete API key by ID
 */
export function deleteKeyById(keyId: string): void {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM user_agent_keys WHERE id = ?').run(keyId)
  if (result.changes === 0) {
    throw new Error('API key not found')
  }
}

/**
 * Delete all keys for a user (called when user is deleted)
 */
export function deleteKeysByUserId(userId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM user_agent_keys WHERE auth_id = ?').run(userId)
}

/**
 * Map database key (user_agent_keys table) to ApiKey interface
 */
function mapDbKeyToKey(dbKey: any): ApiKey {
  // Decrypt API key
  let decryptedKey: string
  try {
    decryptedKey = decrypt(dbKey.key_value)
  } catch (error: any) {
    // If decryption fails, it might be plain text (for migration)
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
