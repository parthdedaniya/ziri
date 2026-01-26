 

import { getAuthHeader } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const proxyUrl = config.public.proxyUrl || 'http://localhost:3100'
  const authHeader = getAuthHeader(event)
  
  if (!authHeader) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  }
  
 
  const headers: Record<string, string> = {
    'Authorization': authHeader.startsWith('Bearer ') ? authHeader : `Bearer ${authHeader}`
  }
  
  try {
    const response = await fetch(`${proxyUrl}/api/schema`, {
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
 
    return {
      data: data.data
    }
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
