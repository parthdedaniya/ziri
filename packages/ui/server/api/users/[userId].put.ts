import { proxyJsonRequest } from '../../utils/proxy-request'

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'userId')
  const body = await readBody(event)
  return proxyJsonRequest(event, {
    path: `/api/users/${userId}`,
    method: 'PUT',
    body,
    authMode: 'passthrough',
    authRequiredMessage: 'Authentication required'
  })
})
