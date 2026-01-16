// Live entity store - wraps existing Backend API calls

import { loadConfig } from '../../config.js'
import { getM2MToken } from '../m2m-token-cache.js'
import { randomBytes } from 'crypto'
import type { IEntityStore } from '../interfaces.js'
import type { Entity } from '../interfaces.js'

// Generate unique IDs for requests
function generateOpId(): string {
  return randomBytes(8).toString('hex')
}

// Generate session ID (persists for the lifetime of the service)
const sessionId = randomBytes(8).toString('hex')

/**
 * Live entity store implementation (wraps Backend API)
 */
export class LiveEntityStore implements IEntityStore {
  /**
   * Get all entities (or filter by UID)
   */
  async getEntities(uid?: string): Promise<Entity[]> {
    const config = loadConfig()
    
    if (!config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
      throw new Error('Backend API credentials not configured')
    }
    
    const token = await getM2MToken(config)
    const opId = generateOpId()
    
    let url = `${config.backendUrl}/api/v2025-01/projects/${config.projectId}/entities`
    if (uid) {
      url += `?uid=${encodeURIComponent(uid)}`
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-project-id': config.projectId,
        'x-op-id': opId,
        'x-session-id': sessionId
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get entities: ${response.status} ${errorText}`)
    }
    
    const result = await response.json() as { data: Entity[] }
    return result.data || []
  }
  
  /**
   * Create an entity
   */
  async createEntity(entity: Entity, status: number): Promise<void> {
    const config = loadConfig()
    
    if (!config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
      throw new Error('Backend API credentials not configured')
    }
    
    const token = await getM2MToken(config)
    const opId = generateOpId()
    
    const response = await fetch(
      `${config.backendUrl}/api/v2025-01/projects/${config.projectId}/entity`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-project-id': config.projectId,
          'x-op-id': opId,
          'x-session-id': sessionId
        },
        body: JSON.stringify({ entity, status })
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to create entity: ${response.status} ${errorText}`)
    }
  }
  
  /**
   * Update an entity (full entity body required, same as create)
   */
  async updateEntity(entity: Entity, status: number): Promise<void> {
    const config = loadConfig()
    
    if (!config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
      throw new Error('Backend API credentials not configured')
    }
    
    const token = await getM2MToken(config)
    const opId = generateOpId()
    
    const response = await fetch(
      `${config.backendUrl}/api/v2025-01/projects/${config.projectId}/entity`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-project-id': config.projectId,
          'x-op-id': opId,
          'x-session-id': sessionId
        },
        body: JSON.stringify({ entity, status })
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to update entity: ${response.status} ${errorText}`)
    }
  }
  
  /**
   * Delete an entity by UID name
   */
  async deleteEntity(entityName: string): Promise<void> {
    const config = loadConfig()
    
    if (!config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
      throw new Error('Backend API credentials not configured')
    }
    
    const token = await getM2MToken(config)
    const opId = generateOpId()
    
    const response = await fetch(
      `${config.backendUrl}/api/v2025-01/projects/${config.projectId}/entity?entityName=${encodeURIComponent(entityName)}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-project-id': config.projectId,
          'x-op-id': opId,
          'x-session-id': sessionId
        }
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to delete entity: ${response.status} ${errorText}`)
    }
  }
}

// Export singleton instance
export const liveEntityStore = new LiveEntityStore()
