import { getAuthHeader } from '../../utils/auth'

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
  
  try {
    const query = getQuery(event)
    const params = new URLSearchParams()
    if (typeof query.startDate === 'string' && query.startDate.length > 0) {
      params.set('startDate', query.startDate)
    }
    if (typeof query.endDate === 'string' && query.endDate.length > 0) {
      params.set('endDate', query.endDate)
    }
    const queryString = params.toString()

    const response = await fetch(`${proxyUrl}/api/stats/overview${queryString ? `?${queryString}` : ''}`, {
      headers: {
        'Authorization': authHeader.startsWith('Bearer ') ? authHeader : `Bearer ${authHeader}`
      }
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw createError({
        statusCode: response.status,
        statusMessage: typeof error.error === 'string' && error.error.trim().length > 0
          ? error.error
          : typeof error.message === 'string' && error.message.trim().length > 0
            ? error.message
            : response.statusText
      })
    }
    
    return await response.json()
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to get overview stats: ${error.message}`
    })
  }
})
