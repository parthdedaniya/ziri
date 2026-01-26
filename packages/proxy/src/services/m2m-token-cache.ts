 

import { M2MAuthProvider } from '../auth-plugin/index.js'
import type { ProxyConfig } from '../config.js'

interface CachedToken {
  token: string
  expiresAt: Date // Token expiry from Backend API
  cachedAt: Date // When we cached it
}

 
const tokenCache = new Map<string, CachedToken>()

 
const PROACTIVE_REFRESH_MINUTES = 5

 
function getCacheKey(config: Pick<ProxyConfig, 'orgId' | 'projectId' | 'clientId'>): string {
  return `${config.orgId}:${config.projectId}:${config.clientId || ''}`
}

 
function isTokenValid(cached: CachedToken): boolean {
  const now = new Date()
  const refreshThreshold = new Date(now.getTime() + PROACTIVE_REFRESH_MINUTES * 60 * 1000)
  
 
  return cached.expiresAt > refreshThreshold
}

 
export async function getM2MToken(config: ProxyConfig): Promise<string> {
  if (!config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
    throw new Error('Backend API credentials not configured')
  }
  
  const cacheKey = getCacheKey(config)
  const cached = tokenCache.get(cacheKey)
  
 
  if (cached && isTokenValid(cached)) {
    return cached.token
  }
  
 
        if (!config.backendUrl || !config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
          throw new Error('Backend API credentials not configured')
        }
        
        const authProvider = new M2MAuthProvider({
          backendUrl: config.backendUrl,
          orgId: config.orgId,
          projectId: config.projectId,
          clientId: config.clientId,
          clientSecret: config.clientSecret
        })
  
  const token = await authProvider.getToken()
  
 
 
 
  const expiresIn = 3600 // 1 hour in seconds
  const expiresAt = new Date(Date.now() + (expiresIn - PROACTIVE_REFRESH_MINUTES * 60) * 1000)
  
 
  tokenCache.set(cacheKey, {
    token,
    expiresAt,
    cachedAt: new Date()
  })
  
  return token
}

 
export function invalidateCache(config: Pick<ProxyConfig, 'orgId' | 'projectId' | 'clientId'>): void {
  const cacheKey = getCacheKey(config)
  tokenCache.delete(cacheKey)
}

 
export function clearCache(): void {
  tokenCache.clear()
}
