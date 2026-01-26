 

import type { Entity } from '../types/entity.js'

 
export type { Entity }

 
export interface AuthorizationResult {
  decision: 'Allow' | 'Deny'
  diagnostics?: {
    reason?: string[]
    errors?: string[]
  }
  determiningPolicies?: string[]
  evaluationTime?: number
}

 
export interface AuthorizationRequest {
  principal: string  // e.g., "User::\"userId\""
  action: string    // e.g., "Action::\"completion\""
  resource: string   // e.g., "Resource::\"gpt-4\""
  context?: Record<string, any>
}

 
export interface IAuthorizationService {
   
  authorize(request: AuthorizationRequest): Promise<AuthorizationResult>
  
   
  isHealthy(): Promise<boolean>
}

 
export interface Policy {
  policy: string  // Cedar policy string
  description: string
}

 
export interface IPolicyStore {
   
  getPolicies(): Promise<Policy[]>
  
   
  createPolicy(policy: string, description: string): Promise<void>
  
   
  updatePolicy(oldPolicy: string, newPolicy: string, description: string): Promise<void>
  
   
  deletePolicy(policy: string): Promise<void>
}

 
export interface IEntityStore {
   
  getEntities(uid?: string, params?: {
    search?: string
    limit?: number
    offset?: number
    entityType?: string
    sortBy?: string | null
    sortOrder?: 'asc' | 'desc' | null
  }): Promise<{ data: Entity[]; total: number }>
  
   
  createEntity(entity: Entity, status: number): Promise<void>
  
   
  updateEntity(entity: Entity, status: number): Promise<void>
  
   
  deleteEntity(entityName: string): Promise<void>
}

 
export interface SchemaData {
  schema: {
    [namespace: string]: {
      entityTypes?: Record<string, any>
      actions?: Record<string, any>
      commonTypes?: Record<string, any>
    }
  }
  version: string
}

 
export interface ISchemaStore {
   
  getSchema(): Promise<SchemaData>
  
   
  updateSchema(schema: SchemaData['schema']): Promise<SchemaData>
  
   
  getSchemaAsCedarText?(): Promise<string>
}
