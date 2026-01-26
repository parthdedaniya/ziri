export default defineEventHandler(async (event) => {
  try {
    const configRuntime = useRuntimeConfig()
    const proxyUrl = configRuntime.public.proxyUrl || 'http://localhost:3100'
    
    try {
      const response = await fetch(`${proxyUrl}/api/config`)
      if (response.ok) {
        const proxyConfig = await response.json()
        return proxyConfig
      }
    } catch (e) {
      console.warn('[API] Failed to fetch config from proxy:', e)
    }
    
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
      masterKey: ''
    }
  } catch (error: any) {
    console.error('[API] Error reading config:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to read config: ${error.message}`
    })
  }
})
