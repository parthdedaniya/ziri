import { proxyJsonRequest } from '../../../utils/proxy-request'

export default defineEventHandler((event) => {
  const userId = getRouterParam(event, 'userId')
  return proxyJsonRequest(event, {
    path: `/api/users/${userId}/reset-password`,
    method: 'POST',
    authMode: 'passthrough',
    authRequiredMessage: 'Authentication required'
  })
})
