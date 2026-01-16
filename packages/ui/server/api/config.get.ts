import { readConfig, getConfigPath } from '@zs-ai/config'
import { readFileSync, existsSync } from 'fs'

export default defineEventHandler(async (event) => {
  try {
    // Try to get config from proxy server first (preferred - includes master key)
    try {
      const configRuntime = useRuntimeConfig()
      const proxyUrl = configRuntime.public.proxyUrl || 'http://localhost:3100'
      const response = await fetch(`${proxyUrl}/api/config`)
      if (response.ok) {
        const proxyConfig = await response.json()
        return proxyConfig
      }
    } catch (e) {
      // Proxy server not available, fall back to config file
    }
    
    // Fall back to reading config file
    const config = readConfig()
    
    // If readConfig returns null (validation failed), try to read raw file
    if (!config) {
      const configPath = getConfigPath()
      if (existsSync(configPath)) {
        try {
          const rawConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
          // Return config with server/email settings (local mode)
          return {
            mode: rawConfig.mode || 'local',
            server: rawConfig.server || {
              host: rawConfig.host || '127.0.0.1',
              port: rawConfig.port || 3100
            },
            publicUrl: rawConfig.publicUrl || '',
            email: rawConfig.email || {
              enabled: false,
              provider: 'manual'
            },
            logLevel: rawConfig.logLevel || 'info',
            masterKey: ''  // Not available from file
          }
        } catch (e) {
          // File exists but can't parse, return default config
        }
      }
      
      // Return default config object if file doesn't exist
      return {
        mode: 'local',
        server: {
          host: '127.0.0.1',
          port: 3100
        },
        publicUrl: '',
        email: {
          enabled: false,
          provider: 'manual'
        },
        logLevel: 'info',
        masterKey: ''  // Not available
      }
    }
    
    // Return config (master key not available from file)
    return {
      ...config,
      masterKey: ''  // Not available from file, must get from proxy server
    }
  } catch (error: any) {
    console.error('[API] Error reading config:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to read config: ${error.message}`
    })
  }
})
