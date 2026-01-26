import { loadConfig } from '../../config.js'
import { getM2MToken } from '../m2m-token-cache.js'
import { randomBytes } from 'crypto'
import type { ISchemaStore, SchemaData } from '../interfaces.js'

function generateOpId(): string {
  return randomBytes(8).toString('hex')
}

const sessionId = randomBytes(8).toString('hex')

export class LiveSchemaStore implements ISchemaStore {
  async getSchema(): Promise<SchemaData> {
    const config = loadConfig()
    
    if (!config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
      throw new Error('Backend API credentials not configured')
    }
    
    const token = await getM2MToken(config)
    const opId = generateOpId()
    
    const response = await fetch(
      `${config.backendUrl}/api/v2025-01/projects/${config.projectId}/schema`,
      {
        method: 'GET',
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
      throw new Error(`Failed to get schema: ${response.status} ${errorText}`)
    }
    
    const result = await response.json() as { data: SchemaData }
    return result.data
  }
  
  async updateSchema(schema: SchemaData['schema']): Promise<SchemaData> {
    const config = loadConfig()
    
    if (!config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
      throw new Error('Backend API credentials not configured')
    }
    
    const token = await getM2MToken(config)
    const opId = generateOpId()
    
    const response = await fetch(
      `${config.backendUrl}/api/v2025-01/projects/${config.projectId}/schema`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-project-id': config.projectId,
          'x-op-id': opId,
          'x-session-id': sessionId
        },
        body: JSON.stringify({ schema })
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to update schema: ${response.status} ${errorText}`)
    }
    
    const result = await response.json() as { success: boolean; version: string }
    return {
      schema,
      version: result.version
    }
  }
}

export const liveSchemaStore = new LiveSchemaStore()
