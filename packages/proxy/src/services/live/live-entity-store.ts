import { loadConfig } from '../../config.js'
import { getM2MToken } from '../m2m-token-cache.js'
import { randomBytes } from 'crypto'
import type { IEntityStore } from '../interfaces.js'
import type { Entity } from '../interfaces.js'
import {
  filterAndSortEntities,
  paginateEntities,
  type EntityQueryParams
} from '../entity-query-utils.js'

function generateOpId(): string {
  return randomBytes(8).toString('hex')
}

const sessionId = randomBytes(8).toString('hex')

export class LiveEntityStore implements IEntityStore {
  async getEntities(uid?: string, params?: EntityQueryParams): Promise<{ data: Entity[]; total: number }> {
    const config = loadConfig()
    
    if (!config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
      throw new Error('Backend API credentials not configured')
    }
    
    const token = await getM2MToken(config)
    const opId = generateOpId()
    
    let url = `${config.backendUrl}/api/v2025-01/projects/${config.projectId}/entities`
    const queryParams = new URLSearchParams()
    if (uid) {
      queryParams.set('uid', uid)
    }
    if (queryParams.toString()) {
      url += `?${queryParams.toString()}`
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
    const entities = filterAndSortEntities(result.data || [], params)
    const total = entities.length
    const shouldPaginate = typeof params?.limit === 'number' || typeof params?.offset === 'number'
    const data = shouldPaginate ? paginateEntities(entities, params) : entities
    return { data, total }
  }
  
   
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

export const liveEntityStore = new LiveEntityStore()
