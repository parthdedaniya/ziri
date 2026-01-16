// Encryption key management utility
// Manages persistent encryption key with multi-source fallback

import { randomBytes } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs'
import { join } from 'path'
import { getConfigDir, readConfig, writeConfig } from '@zs-ai/config'

const CONFIG_DIR = getConfigDir()
const ENCRYPTION_KEY_FILE = join(CONFIG_DIR, 'encryption.key')

// Store encryption key in memory
let currentEncryptionKey: string | null = null

/**
 * Generate a new encryption key (cryptographically secure)
 */
export function generateEncryptionKey(): string {
  // Generate 32 random bytes (256 bits)
  const key = randomBytes(32).toString('hex')
  return key
}

/**
 * Get encryption key from multiple sources (priority order)
 * 1. Environment variable (ZS_AI_ENCRYPTION_KEY)
 * 2. Secure file (~/.zs-ai/encryption.key)
 * 3. Config file (encryptionKey field)
 * 4. Auto-generate and store in config
 */
export function getEncryptionKey(): string | null {
  // Priority 1: Environment variable
  const envKey = process.env.ZS_AI_ENCRYPTION_KEY
  if (envKey && envKey.trim().length > 0) {
    currentEncryptionKey = envKey.trim()
    return currentEncryptionKey
  }

  // Priority 2: Secure file
  if (existsSync(ENCRYPTION_KEY_FILE)) {
    try {
      const fileKey = readFileSync(ENCRYPTION_KEY_FILE, 'utf-8').trim()
      if (fileKey.length > 0) {
        currentEncryptionKey = fileKey
        return currentEncryptionKey
      }
    } catch (error: any) {
      console.warn('[ENCRYPTION KEY] Failed to read encryption key file:', error.message)
    }
  }

  // Priority 3: Config file
  try {
    const config = readConfig()
    if (config && (config as any).encryptionKey && typeof (config as any).encryptionKey === 'string') {
      const configKey = (config as any).encryptionKey.trim()
      if (configKey.length > 0) {
        currentEncryptionKey = configKey
        return currentEncryptionKey
      }
    }
  } catch (error: any) {
    console.warn('[ENCRYPTION KEY] Failed to read encryption key from config:', error.message)
  }

  // Priority 4: Return in-memory key if set
  if (currentEncryptionKey) {
    return currentEncryptionKey
  }

  return null
}

/**
 * Initialize encryption key (called on startup)
 * Generates new key if none exists and stores it
 */
export function initializeEncryptionKey(): string {
  // Check if key already exists
  const existingKey = getEncryptionKey()
  if (existingKey) {
    console.log('[ENCRYPTION KEY] Using existing encryption key')
    return existingKey
  }

  // Generate new key
  const newKey = generateEncryptionKey()
  currentEncryptionKey = newKey

  // Try to save to secure file first
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }
    writeFileSync(ENCRYPTION_KEY_FILE, newKey, { mode: 0o600 }) // Read/write for owner only
    chmodSync(ENCRYPTION_KEY_FILE, 0o600) // Ensure permissions
    console.log(`[ENCRYPTION KEY] Generated and saved to secure file: ${ENCRYPTION_KEY_FILE}`)
  } catch (error: any) {
    // If file write fails, save to config file as fallback
    console.warn('[ENCRYPTION KEY] Failed to save to secure file, saving to config file instead:', error.message)
    try {
      const config = readConfig() || {}
      const updatedConfig = {
        ...config,
        encryptionKey: newKey
      }
      writeConfig(updatedConfig)
      console.log('[ENCRYPTION KEY] Generated and saved to config file')
    } catch (configError: any) {
      console.error('[ENCRYPTION KEY] Failed to save encryption key to config file:', configError.message)
      console.warn('[ENCRYPTION KEY] Encryption key is in memory only - will be lost on restart!')
      console.warn('[ENCRYPTION KEY] Set ZS_AI_ENCRYPTION_KEY environment variable for persistence')
    }
  }

  return newKey
}

/**
 * Save encryption key to a specific location
 */
export function saveEncryptionKey(key: string, location: 'file' | 'config'): void {
  currentEncryptionKey = key.trim()

  if (location === 'file') {
    try {
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true })
      }
      writeFileSync(ENCRYPTION_KEY_FILE, key, { mode: 0o600 })
      chmodSync(ENCRYPTION_KEY_FILE, 0o600)
      console.log(`[ENCRYPTION KEY] Saved to secure file: ${ENCRYPTION_KEY_FILE}`)
    } catch (error: any) {
      throw new Error(`Failed to save encryption key to file: ${error.message}`)
    }
  } else {
    try {
      const config = readConfig() || {}
      const updatedConfig = {
        ...config,
        encryptionKey: key
      }
      writeConfig(updatedConfig)
      console.log('[ENCRYPTION KEY] Saved to config file')
    } catch (error: any) {
      throw new Error(`Failed to save encryption key to config: ${error.message}`)
    }
  }
}
