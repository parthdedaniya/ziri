// Live authorization service - wraps existing PDP calls

import { loadConfig } from '../../config.js'
import type { IAuthorizationService, AuthorizationRequest, AuthorizationResult } from '../interfaces.js'

/**
 * Live authorization service implementation (wraps PDP)
 */
export class LiveAuthorizationService implements IAuthorizationService {
  /**
   * Authorize a request using external PDP
   */
  async authorize(request: AuthorizationRequest): Promise<AuthorizationResult> {
    const config = loadConfig()
    
    if (!config.pdpUrl) {
      throw new Error('PDP URL not configured')
    }
    
    try {
      const requestBody = {
        principal: request.principal,
        action: request.action,
        resource: request.resource,
        context: {
          request_time: new Date().toISOString(),
          ...request.context
        }
      }
      
      const response = await fetch(`${config.pdpUrl}/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-project-id': config.projectId || ''
        },
        body: JSON.stringify(requestBody)
      })
      
      if (!response.ok) {
        try {
          const errorData = await response.json() as {
            code?: number
            description?: string
            data?: {
              decision: string
              diagnostics?: {
                reason?: string[]
                errors?: string[]
              }
            }
          }
          
          return {
            decision: 'Deny',
            diagnostics: {
              errors: [errorData.data?.diagnostics?.errors?.[0] || errorData.description || `PDP returned error: ${response.statusText}`]
            }
          }
        } catch {
          return {
            decision: 'Deny',
            diagnostics: {
              errors: [`PDP returned error: ${response.statusText}`]
            }
          }
        }
      }
      
      const result = await response.json() as {
        decision: string
        diagnostics?: {
          reason?: string[]
          errors?: string[]
        }
        data?: {
          decision: string
          diagnostics?: {
            reason?: string[]
            errors?: string[]
          }
        }
      }
      
      // Handle nested data structure
      const decision = result.data?.decision || result.decision
      
      return {
        decision: decision === 'Allow' ? 'Allow' : 'Deny',
        diagnostics: result.data?.diagnostics || result.diagnostics
      }
    } catch (error: any) {
      throw new Error(`PDP request failed: ${error.message}`)
    }
  }
  
  /**
   * Check if authorization service is healthy
   */
  async isHealthy(): Promise<boolean> {
    const config = loadConfig()
    
    if (!config.pdpUrl) {
      return false
    }
    
    try {
      // Try a simple health check (if PDP supports it) or just check URL is configured
      return true
    } catch {
      return false
    }
  }
}

// Export singleton instance
export const liveAuthorizationService = new LiveAuthorizationService()
