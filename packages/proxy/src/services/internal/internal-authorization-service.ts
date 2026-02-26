import { internalSchemaStore } from './internal-schema-store.js'
import { internalPolicyStore } from './internal-policy-store.js'
import { internalEntityStore, type InternalEntity } from './internal-entity-store.js'
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

export interface InternalAuthorizationRequest {
  principal: string
  action: string
  resourceType: string
  context?: Record<string, any>
}

export interface InternalAuthorizationResult {
  allowed: boolean
  reason?: string
}

export interface IInternalAuthorizationService {
  authorize(request: InternalAuthorizationRequest): Promise<InternalAuthorizationResult>
}

export class InternalAuthorizationService implements IInternalAuthorizationService {
  async authorize(request: InternalAuthorizationRequest): Promise<InternalAuthorizationResult> {
    const startTime = Date.now()

    try {
      const cedarModule = await loadCedar()

      const schemaData = await internalSchemaStore.getSchema()
      const policies = await internalPolicyStore.getPolicies()
      const allEntities = await internalEntityStore.getAllEntities()

      const parsePrincipal = parseEntityUid(request.principal)
      const parseAction = parseEntityUid(request.action)

      const parseResource = { type: 'Dashboard', id: 'app' }

      const policiesMap: Record<string, string> = {}
      policies.forEach((policy, idx) => {
        const extractedPolicyId = parsePolicyId(policy.policy)
        policiesMap[extractedPolicyId || `policy${idx + 1}`] = policy.policy
      })

      const cedarEntities = allEntities.map(entity => {
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
        console.error('[INTERNAL AUTH] Schema validation failed:', schemaValidation.errors)
        return {
          allowed: false,
          reason: `Schema validation failed: ${schemaValidation.errors.map((e: any) => e.message || JSON.stringify(e)).join(', ')}`
        }
      }


      const context = {
        resourceType: request.resourceType,
        ...(request.context || {})
      }

      const call: cedarType.AuthorizationCall = {
        principal: parsePrincipal,
        action: parseAction,
        resource: parseResource,
        context: context,
        schema: schema,
        policies: {
          staticPolicies: policiesMap,
          templates: {},
          templateLinks: []
        },
        entities: cedarEntities
      }

      const result = cedarModule.isAuthorized(call)

      const evaluationTime = Date.now() - startTime

      if (result.type === 'failure') {
        console.error('[INTERNAL AUTH] Cedar WASM returned failure:', result.errors)
        return {
          allowed: false,
          reason: `Authorization evaluation failed: ${result.errors?.map((e: any) => e.message || JSON.stringify(e)).join(', ') || 'Unknown error'}`
        }
      }

      const response = result.response
      const allowed = response.decision === 'allow'

      const reason = response.diagnostics?.reason?.join('; ') || undefined

      return {
        allowed,
        reason
      }
    } catch (error: any) {
      const evaluationTime = Date.now() - startTime
      console.error('[INTERNAL AUTH] Authorization error:', error)
      console.error('[INTERNAL AUTH] Error stack:', error.stack)

      return {
        allowed: false,
        reason: error.message || 'Authorization evaluation failed'
      }
    }
  }
}

export const internalAuthorizationService = new InternalAuthorizationService()
