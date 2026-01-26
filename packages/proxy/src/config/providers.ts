

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs'
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto'
import { join } from 'path'
import { getConfigDir } from './index.js'

export interface ProviderMetadata {
  name: string
  displayName: string
  baseUrl: string
  models: string[]
  defaultModel?: string
  hasCredentials?: boolean
}

export interface ProviderCredentials {
  apiKey: string
}

export interface ProviderConfig {
  metadata: ProviderMetadata
  credentials?: ProviderCredentials
}

 
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const SALT_LENGTH = 32
const TAG_LENGTH = 16
const KEY_LENGTH = 32
const PBKDF2_ITERATIONS = 100000

 
function getCredentialsPath(): string {
  const configDir = getConfigDir()
  return join(configDir, 'credentials.json')
}

 
function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')
}

 
export function encryptCredentials(credentials: Record<string, ProviderCredentials>, masterKey: string): string {
  try {
    const salt = randomBytes(SALT_LENGTH)
    const key = deriveKey(masterKey, salt)
    const iv = randomBytes(IV_LENGTH)
    
    const cipher = createCipheriv(ALGORITHM, key, iv)
    
    const plaintext = JSON.stringify(credentials)
    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const tag = cipher.getAuthTag()
    
 
    const result = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]).toString('base64')
    
    return result
  } catch (error: any) {
    throw new Error(`Encryption failed: ${error.message}`)
  }
}

 
export function decryptCredentials(encryptedData: string, masterKey: string): Record<string, ProviderCredentials> {
  try {
    const buffer = Buffer.from(encryptedData, 'base64')
    
    const salt = buffer.subarray(0, SALT_LENGTH)
    const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
    const tag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
    const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
    
    const key = deriveKey(masterKey, salt)
    
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    
    let decrypted = decipher.update(encrypted, undefined, 'utf8')
    decrypted += decipher.final('utf8')
    
    return JSON.parse(decrypted)
  } catch (error: any) {
    throw new Error(`Decryption failed: ${error.message}`)
  }
}

 
export function getMasterKey(): string | null {
 
  const envKey = process.env.ZS_AI_MASTER_KEY
  if (envKey) {
    return envKey
  }
  
 

  return null
}

 
export function readCredentials(masterKey: string): Record<string, ProviderCredentials> | null {
  const credentialsPath = getCredentialsPath()
  
  if (!existsSync(credentialsPath)) {
    return null
  }
  
  try {
    const encrypted = readFileSync(credentialsPath, 'utf-8')
    return decryptCredentials(encrypted, masterKey)
  } catch (error: any) {
    console.error('Failed to read credentials:', error.message)
    return null
  }
}

 
export function writeCredentials(credentials: Record<string, ProviderCredentials>, masterKey: string): void {
  const credentialsPath = getCredentialsPath()
  const configDir = getConfigDir()
  
 
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  
  try {
    const encrypted = encryptCredentials(credentials, masterKey)
    writeFileSync(credentialsPath, encrypted, 'utf-8')
 
    if (process.platform !== 'win32') {
      try {
        chmodSync(credentialsPath, 0o600)
      } catch (error) {
 
      }
    }
  } catch (error: any) {
    console.error('Failed to write credentials:', error.message)
    throw error
  }
}

 
export function setProviderCredentials(
  providerName: string,
  apiKey: string,
  masterKey: string
): void {
  const existing = readCredentials(masterKey) || {}
  existing[providerName] = { apiKey }
  writeCredentials(existing, masterKey)
}

 
export function getProviderCredentials(
  providerName: string,
  masterKey: string
): ProviderCredentials | null {
  const credentials = readCredentials(masterKey)
  if (!credentials) {
    return null
  }
  return credentials[providerName] || null
}

 
export function removeProviderCredentials(
  providerName: string,
  masterKey: string
): void {
  const existing = readCredentials(masterKey)
  if (!existing || !existing[providerName]) {
    return
  }
  
  delete existing[providerName]
  writeCredentials(existing, masterKey)
}

 
export function listProvidersWithCredentials(masterKey: string): string[] {
  const credentials = readCredentials(masterKey)
  if (!credentials) {
    return []
  }
  return Object.keys(credentials)
}

 
export function validateProviderApiKey(providerName: string, apiKey: string): { valid: boolean; error?: string } {
  if (!apiKey || apiKey.trim().length === 0) {
    return { valid: false, error: 'API key cannot be empty' }
  }
  
 
  switch (providerName.toLowerCase()) {
    case 'openai':
      if (!apiKey.startsWith('sk-')) {
        return { valid: false, error: 'Invalid OpenAI API key format. Expected format: sk-...' }
      }
      break
    case 'anthropic':
      if (!apiKey.startsWith('sk-ant-')) {
        return { valid: false, error: 'Invalid Anthropic API key format. Expected format: sk-ant-...' }
      }
      break
    default:
 
      if (apiKey.length < 10) {
        return { valid: false, error: 'API key seems too short' }
      }
  }
  
  return { valid: true }
}
