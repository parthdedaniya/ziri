 
 
import { readConfig, type ZsAiConfig } from './config/index.js'
import { getMasterKey, initializeMasterKey } from './utils/master-key.js'

export interface ProxyConfig {
  mode: 'local' | 'live'  // Storage and authorization mode
  port: number
  host: string  // Server host binding
  publicUrl?: string  // Public URL for sharing
  backendUrl?: string  // For live mode only
  pdpUrl?: string  // For live mode only
  projectId?: string  // For live mode only
  orgId?: string  // For live mode only
  clientId?: string  // For live mode only
  clientSecret?: string  // For live mode only
  masterKey: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  email?: {
    enabled: boolean
    provider: 'smtp' | 'sendgrid' | 'manual'
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
}

const DEFAULT_PORT = 3100
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_MODE = 'local' as const
const DEFAULT_LOG_LEVEL = 'info' as const

export function loadConfig(): ProxyConfig {
  let fileConfig: ZsAiConfig | null = null
  
  try {
    fileConfig = readConfig()
  } catch (error) {
 
    console.warn('[CONFIG] Config file not found, using defaults')
  }
  
  let masterKey = getMasterKey()
  if (!masterKey) {
    masterKey = initializeMasterKey()
  }

  const mode = fileConfig?.mode || DEFAULT_MODE
  const serverConfig = fileConfig?.server || {}
  const port = serverConfig.port || (fileConfig as any)?.port || DEFAULT_PORT
  const host = serverConfig.host || DEFAULT_HOST

 
  let emailConfig: ProxyConfig['email'] = undefined
  if (fileConfig?.email) {
    emailConfig = {
      enabled: fileConfig.email.enabled ?? false,
      provider: fileConfig.email.provider || 'manual',
      smtp: fileConfig.email.smtp,
      sendgrid: fileConfig.email.sendgrid,
      from: fileConfig.email.from
    }
  }

  return {
    mode,
    port,
    host,
    publicUrl: fileConfig?.publicUrl,
 
    backendUrl: fileConfig?.backendUrl,
    pdpUrl: fileConfig?.pdpUrl,
    projectId: fileConfig?.projectId,
    orgId: fileConfig?.orgId,
    clientId: fileConfig?.clientId,
    clientSecret: fileConfig?.clientSecret,
    masterKey,
    logLevel: ((fileConfig as any)?.logLevel as ProxyConfig['logLevel']) || DEFAULT_LOG_LEVEL,
    email: emailConfig
  }
}
