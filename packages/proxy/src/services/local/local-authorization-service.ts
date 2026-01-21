// Local authorization service using Cedar-WASM

import type { IAuthorizationService, AuthorizationRequest, AuthorizationResult } from '../interfaces.js'
import { localPolicyStore } from './local-policy-store.js'
import { localEntityStore } from './local-entity-store.js'
import { localSchemaStore } from './local-schema-store.js'

// Type import for Cedar WASM
import type * as cedarType from '@cedar-policy/cedar-wasm'

// Cedar-WASM module (lazy loaded)
let cedar: typeof cedarType | null = null
let cedarLoadingPromise: Promise<typeof cedarType> | null = null

/**
 * Lazy load Cedar WASM module
 * Uses centralized loading pattern to ensure single load
 */
async function loadCedar(): Promise<typeof cedarType> {
  if (cedar) {
    return cedar
  }
  
  if (!cedarLoadingPromise) {
    cedarLoadingPromise = import('@cedar-policy/cedar-wasm/nodejs')
  }
  
  cedar = await cedarLoadingPromise
  console.log('[LOCAL AUTH] Cedar-WASM loaded successfully')
  return cedar
}

/**
 * Parse Cedar EntityUID string format to object format
 * Input: 'User::"alice"' or 'Action::"QueryLLM"'
 * Output: { type: "User", id: "alice" }
 */
function parseEntityUid(entityUid: string): { type: string; id: string } {
  // EntityUID format: Type::"id"
  const match = entityUid.match(/^([^:]+)::"([^"]+)"$/)
  if (!match) {
    throw new Error(`Invalid EntityUID format: ${entityUid}`)
  }
  return {
    type: match[1],
    id: match[2]
  }
}

/**
 * Local authorization service using Cedar-WASM
 */
export class LocalAuthorizationService implements IAuthorizationService {
  /**
   * Authorize a request using Cedar-WASM
   */
  async authorize(request: AuthorizationRequest): Promise<AuthorizationResult> {
    const startTime = Date.now()
    
    try {
      // Lazy load Cedar WASM module
      const cedarModule = await loadCedar()
      
      // Load schema, policies, and entities
      const schemaData = await localSchemaStore.getSchema()
      const policies = await localPolicyStore.getPolicies()
      const entitiesResult = await localEntityStore.getEntities()
      const entities = entitiesResult.data
      
      console.log('[LOCAL AUTH] Evaluating authorization:', {
        principal: request.principal,
        action: request.action,
        resource: request.resource,
        policyCount: policies.length,
        entityCount: entities.length
      })
      
      // Parse EntityUID strings to extract type and id
      const parsePrincipal = parseEntityUid(request.principal)
      const parseAction = parseEntityUid(request.action)
      const parseResource = parseEntityUid(request.resource)
      
      // Build policies map (matching test file format)
      // Cedar WASM expects staticPolicies as a map of policy IDs to policy text
      const policiesMap: Record<string, string> = {}
      policies.forEach((policy, idx) => {
        policiesMap[`policy${idx + 1}`] = policy.policy
      })
      
      // Convert entities to Cedar format
      // Entities need uid as object { type, id } and parents as array of { type, id }
      const cedarEntities = entities.map(entity => {
        // Convert parent UIDs from objects to objects (already in correct format)
        const convertedParents = (entity.parents || []).map((parent: { type: string; id: string }) => ({
          type: parent.type,
          id: parent.id
        }))
        
        // Convert attrs to ensure proper typing
        const attrs = entity.attrs as Record<string, any>
        
        return {
          uid: {
            type: entity.uid.type,
            id: entity.uid.id
          },
          attrs: attrs,
          parents: convertedParents
        }
      })
      
      // Prepare schema (ensure it's a JSON object)
      // The schema from schemaToJson() includes 'shape' wrapper and should work as-is
      let schema: any
      try {
        schema = typeof schemaData.schema === 'string' 
          ? JSON.parse(schemaData.schema) 
          : schemaData.schema
      } catch {
        schema = {}
      }
      
      // Validate schema format (matching test file)
      const schemaValidation = cedarModule.checkParseSchema(schema)
      if (schemaValidation.type === 'failure') {
        console.error('[LOCAL AUTH] Schema validation failed:', schemaValidation.errors)
        return {
          decision: 'Deny',
          diagnostics: {
            reason: [],
            errors: schemaValidation.errors.map((e: any) => e.message || JSON.stringify(e))
          },
          evaluationTime: Date.now() - startTime
        }
      }
      
      // Build Cedar WASM AuthorizationCall object (matching test file format exactly)
      const call: cedarType.AuthorizationCall = {
        principal: parsePrincipal,  // { type: "User", id: "alice" }
        action: parseAction,         // { type: "Action", id: "QueryLLM" }
        resource: parseResource,     // { type: "Resource", id: "gpt-4" }
        context: request.context || {},
        schema: schema,              // Schema JSON object (with shape wrapper - works in test)
        policies: {
          staticPolicies: policiesMap,  // ✅ Map of policy IDs to policy text (matching test file)
          templates: {},
          templateLinks: []
        },
        entities: cedarEntities      // Entities with uid as objects
      }
      
      console.log('[LOCAL AUTH] Cedar WASM call structure:', {
        principal: parsePrincipal,
        action: parseAction,
        resource: parseResource,
        policyCount: Object.keys(policiesMap).length,
        entityCount: cedarEntities.length
      })
      
      // Call Cedar-WASM isAuthorized function
      const result = cedarModule.isAuthorized(call)
      
      const evaluationTime = Date.now() - startTime
      
      // Handle Cedar WASM response format
      // Result structure: { type: 'success', response: { decision: 'allow'|'deny' } } | { type: 'failure', errors: [] }
      if (result.type === 'failure') {
        console.error('[LOCAL AUTH] Cedar WASM returned failure:', result.errors)
        return {
          decision: 'Deny',
          diagnostics: {
            reason: [],
            errors: result.errors?.map((e: any) => e.message || JSON.stringify(e)) || ['Authorization evaluation failed']
          },
          evaluationTime
        }
      }
      
      // Success case - extract decision from response
      const response = result.response
      const decision = response.decision === 'allow' ? 'Allow' : 'Deny'
      
      // Extract diagnostics if available
      const diagnostics = {
        reason: response.diagnostics?.reason || [],
        errors: (response.diagnostics?.errors || []).map((e: any) => 
          typeof e === 'string' ? e : (e.message || JSON.stringify(e))
        )
      }
      
      // Extract determining policies if available (may not exist in all versions)
      const determiningPolicies: string[] = []
      
      console.log('[LOCAL AUTH] Authorization decision:', decision, {
        reason: diagnostics.reason,
        errors: diagnostics.errors,
        evaluationTime: `${evaluationTime}ms`
      })
      
      return {
        decision,
        diagnostics,
        determiningPolicies,
        evaluationTime
      }
    } catch (error: any) {
      const evaluationTime = Date.now() - startTime
      console.error('[LOCAL AUTH] Authorization error:', error)
      console.error('[LOCAL AUTH] Error stack:', error.stack)
      
      return {
        decision: 'Deny',
        diagnostics: {
          reason: [],
          errors: [error.message || 'Authorization evaluation failed']
        },
        evaluationTime
      }
    }
  }
  
  /**
   * Check if authorization service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Try to load Cedar WASM
      await loadCedar()
      if (!cedar) {
        return false
      }
      // Check if we can load schema and policies
      await localSchemaStore.getSchema()
      await localPolicyStore.getPolicies()
      return true
    } catch (error) {
      console.error('[LOCAL AUTH] Health check failed:', error)
      return false
    }
  }
}
