// Shared config module for all packages

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ProviderMetadata } from './providers.js'

export interface ZsAiConfig {
  // Mode configuration
  mode?: 'local' | 'live'  // Default: 'local'
  
  // Server configuration
  server?: {
    host?: string  // Default: '127.0.0.1'
    port?: number  // Default: 3100
  }
  publicUrl?: string  // Public URL for sharing (ngrok, Tailscale, etc.)
  
  // Email configuration
  email?: {
    enabled?: boolean
    provider?: 'smtp' | 'sendgrid' | 'manual'
    smtp?: {
      host: string
      port: number
      secure?: boolean
      auth: {
        user: string
        pass: string
      }
    }
    sendgrid?: {
      apiKey: string
    }
    from?: string
  }
  
  // Backend API configuration (for live mode - commented out for now)
  // backendUrl: string
  // orgId: string
  // projectId: string
  // clientId: string
  // clientSecret: string
  // pdpUrl?: string
  
  // Legacy fields (kept for backward compatibility, will be ignored in local mode)
  backendUrl?: string
  orgId?: string
  projectId?: string
  clientId?: string
  clientSecret?: string
  pdpUrl?: string
  refreshInterval?: number
  refreshFailRetry?: number
  refreshFailRetryDelay?: number
  maxStaleTime?: number
  providers?: Record<string, ProviderMetadata>
  [key: string]: any
}

export function getConfigDir(): string {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || homedir(), 'zs-ai')
  }
  return join(homedir(), '.zs-ai')
}

export function getConfigPath(): string {
  const configDir = getConfigDir()
  
  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  
  return join(configDir, 'config.json')
}

export function readConfig(): ZsAiConfig | null {
  const configPath = getConfigPath()
  
  if (!existsSync(configPath)) {
    return null
  }
  
  try {
    const content = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content) as Partial<ZsAiConfig>
    
    // In local mode, we don't need Backend API credentials
    // Only validate if mode is 'live' or not specified (backward compatibility)
    const mode = config.mode || 'local'
    
    if (mode === 'live') {
      // Live mode requires Backend API credentials
      if (!config.backendUrl || !config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
        return null
      }
    }
    // Local mode doesn't require Backend API credentials - just return the config
    
    return config as ZsAiConfig
  } catch (error) {
    console.error('Failed to read config:', error)
    return null
  }
}

export function writeConfig(config: Partial<ZsAiConfig>): void {
  const configPath = getConfigPath()
  const existing = readConfig() || {}
  
  const merged = {
    ...existing,
    ...config
  }
  
  try {
    writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save config:', error)
    throw error
  }
}

export function validateConfig(config: any): ZsAiConfig {
  if (!config.backendUrl) {
    throw new Error('backendUrl is required')
  }
  if (!config.orgId) {
    throw new Error('orgId is required')
  }
  if (!config.projectId) {
    throw new Error('projectId is required')
  }
  if (!config.clientId) {
    throw new Error('clientId is required')
  }
  if (!config.clientSecret) {
    throw new Error('clientSecret is required')
  }
  
  return config as ZsAiConfig
}

export function getConfigValue(key: keyof ZsAiConfig): any {
  const config = readConfig()
  return config ? config[key] : undefined
}

export function setConfigValue(key: keyof ZsAiConfig, value: any): void {
  writeConfig({ [key]: value })
}

// Export provider functions (must come before other exports that use ProviderMetadata)
export * from './providers.js'

// Provider metadata management (public config only, not credentials)
export function getProviderMetadata(providerName: string): ProviderMetadata | null {
  const config = readConfig()
  if (!config || !config.providers) {
    return null
  }
  return config.providers[providerName] || null
}

export function setProviderMetadata(providerName: string, metadata: ProviderMetadata): void {
  const config = readConfig() || ({} as ZsAiConfig)
  if (!config.providers) {
    config.providers = {}
  }
  config.providers[providerName] = metadata
  writeConfig(config)
}

export function removeProviderMetadata(providerName: string): void {
  const config = readConfig()
  if (!config || !config.providers) {
    return
  }
  delete config.providers[providerName]
  writeConfig(config)
}

export function listProviderMetadata(): Record<string, ProviderMetadata> {
  const config = readConfig()
  return config?.providers || {}
}
