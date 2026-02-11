import { getAuthHeader } from '../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const configRuntime = useRuntimeConfig()
    const proxyUrl = configRuntime.public.proxyUrl || 'http://localhost:3100'
    
    const authHeader = getAuthHeader(event)
    if (!authHeader) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Authentication required to access configuration'
      })
    }
    
    try {
      const headers: Record<string, string> = {}
      if (authHeader.startsWith('Bearer ')) {
        headers['Authorization'] = authHeader
      } else {
        headers['X-Root-Key'] = authHeader
      }
      
      const response = await fetch(`${proxyUrl}/api/config`, {
        headers
      })
      
      if (response.status === 401 || response.status === 403) {
        throw createError({
          statusCode: response.status,
          statusMessage: 'Unauthorized to access configuration'
        })
      }
      
      if (response.ok) {
        const proxyConfig = await response.json()
        return proxyConfig
      }

      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw createError({
        statusCode: response.status,
        statusMessage: error.error || error.message || response.statusText
      })
    } catch (e: any) {
      if (e.statusCode) {
        throw e
      }
      console.warn('[API] Failed to fetch config from proxy:', e)
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to fetch config from proxy: ${e.message}`
      })
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    console.error('[API] Error reading config:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to read config: ${error.message}`
    })
  }
})
