import type { IAuthorizationService, AuthorizationRequest, AuthorizationResult } from '../interfaces.js'
import { localPolicyStore } from './local-policy-store.js'
import { localEntityStore } from './local-entity-store.js'
import { localSchemaStore } from './local-schema-store.js'
import { parsePolicyId } from '../../utils/cedar-policy.js'

import type * as cedarType from '@cedar-policy/cedar-wasm'

let cedar: typeof cedarType | null = null
let cedarLoadingPromise: Promise<typeof cedarType> | null = null

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

function parseEntityUid(entityUid: string): { type: string; id: string } {
  const match = entityUid.match(/^([^:]+)::"([^"]+)"$/)
  if (!match) {
    throw new Error(`Invalid EntityUID format: ${entityUid}`)
  }
  return {
    type: match[1],
    id: match[2]
  }
}

export class LocalAuthorizationService implements IAuthorizationService {
  async authorize(request: AuthorizationRequest): Promise<AuthorizationResult> {
    const startTime = Date.now()

    try {
      const cedarModule = await loadCedar()

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

      const parsePrincipal = parseEntityUid(request.principal)
      const parseAction = parseEntityUid(request.action)
      const parseResource = parseEntityUid(request.resource)

      const policiesMap: Record<string, string> = {}
      policies.forEach((policy, idx) => {
        const extractedPolicyId = parsePolicyId(policy.policy)
        policiesMap[extractedPolicyId || `policy${idx + 1}`] = policy.policy
      })

      const cedarEntities = entities.map(entity => {
        const convertedParents = (entity.parents || []).map((parent: { type: string; id: string }) => ({
          type: parent.type,
          id: parent.id
        }))

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

      let schema: any
      try {
        schema = typeof schemaData.schema === 'string'
          ? JSON.parse(schemaData.schema)
          : schemaData.schema
      } catch {
        schema = {}
      }

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

      const call: cedarType.AuthorizationCall = {
        principal: parsePrincipal,
        action: parseAction,
        resource: parseResource,
        context: request.context || {},
        schema: schema,
        policies: {
          staticPolicies: policiesMap,
          templates: {},
          templateLinks: []
        },
        entities: cedarEntities
      }

      console.log('[LOCAL AUTH] Cedar WASM call structure:', {
        principal: parsePrincipal,
        action: parseAction,
        resource: parseResource,
        policyCount: Object.keys(policiesMap).length,
        entityCount: cedarEntities.length
      })

      const result = cedarModule.isAuthorized(call)

      const evaluationTime = Date.now() - startTime

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

      const response = result.response
      const decision = response.decision === 'allow' ? 'Allow' : 'Deny'

      const diagnostics = {
        reason: response.diagnostics?.reason || [],
        errors: (response.diagnostics?.errors || []).map((e: any) =>
          typeof e === 'string' ? e : (e.message || JSON.stringify(e))
        )
      }

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

  async isHealthy(): Promise<boolean> {
    try {
      await loadCedar()
      if (!cedar) {
        return false
      }
      await localSchemaStore.getSchema()
      await localPolicyStore.getPolicies()
      return true
    } catch (error) {
      console.error('[LOCAL AUTH] Health check failed:', error)
      return false
    }
  }
}
