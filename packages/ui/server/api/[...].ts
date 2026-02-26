export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const proxyUrl = config.public.proxyUrl || 'http://localhost:3100'


  const path = event.path || getRequestURL(event).pathname
  const targetUrl = `${proxyUrl}${path}`


  const incomingHeaders = getHeaders(event)
  const headers: Record<string, string> = {}


  const forwardHeaders = [
    'authorization',
    'x-api-key',
    'x-root-key',
    'x-project-id',
    'x-op-id',
    'x-session-id',
    'content-type',
    'accept',
  ]

  for (const key of forwardHeaders) {
    if (incomingHeaders[key]) {
      headers[key] = incomingHeaders[key] as string
    }
  }

  const method = getMethod(event)
  const fetchOptions: RequestInit = {
    method,
    headers,
  }


  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const body = await readRawBody(event)
      if (body) {
        fetchOptions.body = body
      }
    } catch {

    }
  }

  try {
    const response = await fetch(targetUrl, fetchOptions)


    setResponseStatus(event, response.status, response.statusText)


    const contentType = response.headers.get('content-type')
    if (contentType) {
      setResponseHeader(event, 'content-type', contentType)
    }


    if (contentType?.includes('text/event-stream')) {
      setResponseHeader(event, 'cache-control', 'no-cache')
      setResponseHeader(event, 'connection', 'keep-alive')
      return sendStream(event, response.body as any)
    }


    if (contentType?.includes('application/json')) {
      return await response.json()
    }

    return await response.text()
  } catch (error: any) {
    throw createError({
      statusCode: 503,
      statusMessage: `Proxy server unavailable: ${error.message}`
    })
  }
})
