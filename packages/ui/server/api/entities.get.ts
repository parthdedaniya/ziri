// Proxy entities API to proxy server

import { getAuthHeader } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const proxyUrl = config.public.proxyUrl || 'http://localhost:3100'
  const authHeader = getAuthHeader(event)
  const query = getQuery(event)
  
  if (!authHeader) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  }
  
  // Always use Authorization header (admin JWT token)
  const headers: Record<string, string> = {
    'Authorization': authHeader.startsWith('Bearer ') ? authHeader : `Bearer ${authHeader}`
  }
  
  try {
    // Build URL with query params
    const url = new URL(`${proxyUrl}/api/entities`)
    if (query.uid) {
      url.searchParams.set('uid', query.uid as string)
    }
    if (query.includeApiKeys) {
      url.searchParams.set('includeApiKeys', query.includeApiKeys as string)
    }
    
    const response = await fetch(url.toString(), {
      headers
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw createError({
        statusCode: response.status,
        statusMessage: error.error || response.statusText
      })
    }
    
    const data = await response.json()
    // Return in format expected by UI
    return data
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to proxy request: ${error.message}`
    })
  }
})
