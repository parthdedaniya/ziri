 
 

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import { getEncryptionKey } from './encryption-key.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 128 bits
const AUTH_TAG_LENGTH = 16 // 128 bits

 
export function encrypt(value: string): string {
  if (!value || value.trim().length === 0) {
    return value
  }

  const key = getEncryptionKey()
  if (!key) {
    throw new Error('Encryption key not found. Initialize encryption key first.')
  }

 
  const keyBuffer = Buffer.from(key, 'hex')
  if (keyBuffer.length !== 32) {
    throw new Error('Invalid encryption key length. Expected 32 bytes (256 bits).')
  }

 
  const iv = randomBytes(IV_LENGTH)

 
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv)

 
  let encrypted = cipher.update(value, 'utf8', 'base64')
  encrypted += cipher.final('base64')

 
  const authTag = cipher.getAuthTag()

 
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64')
  ])

 
  return combined.toString('base64')
}

 
export function decrypt(encryptedValue: string): string {
  if (!encryptedValue || encryptedValue.trim().length === 0) {
    return encryptedValue
  }

  const key = getEncryptionKey()
  if (!key) {
    throw new Error('Encryption key not found. Initialize encryption key first.')
  }

 
  const keyBuffer = Buffer.from(key, 'hex')
  if (keyBuffer.length !== 32) {
    throw new Error('Invalid encryption key length. Expected 32 bytes (256 bits).')
  }

  try {
 
    const combined = Buffer.from(encryptedValue, 'base64')

 
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Invalid encrypted data format')
    }

    const iv = combined.subarray(0, IV_LENGTH)
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

 
    const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv)
    decipher.setAuthTag(authTag)

 
    let decrypted = decipher.update(encrypted, undefined, 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (error: any) {
 
 
    console.warn('[ENCRYPTION] Failed to decrypt value, treating as plain text:', error.message)
    return encryptedValue
  }
}

 
export function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
