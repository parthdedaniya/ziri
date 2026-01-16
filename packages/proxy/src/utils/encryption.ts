// Encryption/decryption utility using AES-256-GCM
// Uses the persistent encryption key from encryption-key.ts

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import { getEncryptionKey } from './encryption-key.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 128 bits
const AUTH_TAG_LENGTH = 16 // 128 bits

/**
 * Encrypt a string value
 * Returns base64-encoded string: IV + AuthTag + EncryptedData
 */
export function encrypt(value: string): string {
  if (!value || value.trim().length === 0) {
    return value
  }

  const key = getEncryptionKey()
  if (!key) {
    throw new Error('Encryption key not found. Initialize encryption key first.')
  }

  // Convert hex key to buffer (32 bytes = 256 bits)
  const keyBuffer = Buffer.from(key, 'hex')
  if (keyBuffer.length !== 32) {
    throw new Error('Invalid encryption key length. Expected 32 bytes (256 bits).')
  }

  // Generate random IV
  const iv = randomBytes(IV_LENGTH)

  // Create cipher
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv)

  // Encrypt
  let encrypted = cipher.update(value, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  // Get authentication tag
  const authTag = cipher.getAuthTag()

  // Combine IV + AuthTag + EncryptedData
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64')
  ])

  // Return as base64 string
  return combined.toString('base64')
}

/**
 * Decrypt a base64-encoded encrypted string
 * Expects format: IV (16 bytes) + AuthTag (16 bytes) + EncryptedData
 */
export function decrypt(encryptedValue: string): string {
  if (!encryptedValue || encryptedValue.trim().length === 0) {
    return encryptedValue
  }

  const key = getEncryptionKey()
  if (!key) {
    throw new Error('Encryption key not found. Initialize encryption key first.')
  }

  // Convert hex key to buffer
  const keyBuffer = Buffer.from(key, 'hex')
  if (keyBuffer.length !== 32) {
    throw new Error('Invalid encryption key length. Expected 32 bytes (256 bits).')
  }

  try {
    // Decode base64
    const combined = Buffer.from(encryptedValue, 'base64')

    // Extract IV, AuthTag, and EncryptedData
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Invalid encrypted data format')
    }

    const iv = combined.subarray(0, IV_LENGTH)
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv)
    decipher.setAuthTag(authTag)

    // Decrypt
    let decrypted = decipher.update(encrypted, undefined, 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (error: any) {
    // If decryption fails, it might be plain text (for migration)
    // Return as-is and log warning
    console.warn('[ENCRYPTION] Failed to decrypt value, treating as plain text:', error.message)
    return encryptedValue
  }
}

/**
 * Hash a string using SHA-256 (for email_hash, key_hash)
 * Returns hex-encoded hash
 */
export function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
