 

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const proxyUrl = config.public.proxyUrl || 'http://localhost:3100'
  const authHeader = getHeader(event, 'authorization') || getHeader(event, 'x-root-key')
  
  if (!authHeader) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  }
  
  const headers: Record<string, string> = {}
  if (authHeader.startsWith('Bearer ')) {
    headers['Authorization'] = authHeader
  } else {
    headers['X-Root-Key'] = authHeader
  }
  
  try {
    const response = await fetch(`${proxyUrl}/api/users`, {
      headers
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw createError({
        statusCode: response.status,
        statusMessage: error.error || error.message || response.statusText
      })
    }
    
    return await response.json()
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
