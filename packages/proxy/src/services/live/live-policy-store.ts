import { loadConfig } from '../../config.js'
import { getM2MToken } from '../m2m-token-cache.js'
import { randomBytes } from 'crypto'
import type { IPolicyStore, Policy } from '../interfaces.js'

function generateOpId(): string {
  return randomBytes(8).toString('hex')
}

const sessionId = randomBytes(8).toString('hex')

export class LivePolicyStore implements IPolicyStore {
  async getPolicies(): Promise<Policy[]> {
    const config = loadConfig()
    
    if (!config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
      throw new Error('Backend API credentials not configured')
    }
    
    const token = await getM2MToken(config)
    const opId = generateOpId()
    
    const response = await fetch(
      `${config.backendUrl}/api/v2025-01/projects/${config.projectId}/policies`,
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
      throw new Error(`Failed to get policies: ${response.status} ${errorText}`)
    }
    
    const result = await response.json() as { data: { policies: Policy[] } }
    return result.data.policies || []
  }
  
  async createPolicy(policy: string, description: string): Promise<void> {
    const config = loadConfig()
    
    if (!config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
      throw new Error('Backend API credentials not configured')
    }
    
    const token = await getM2MToken(config)
    const opId = generateOpId()
    
    const response = await fetch(
      `${config.backendUrl}/api/v2025-01/projects/${config.projectId}/policies`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-project-id': config.projectId,
          'x-op-id': opId,
          'x-session-id': sessionId
        },
        body: JSON.stringify({ policy, description })
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to create policy: ${response.status} ${errorText}`)
    }
  }
  
  async updatePolicy(oldPolicy: string, newPolicy: string, description: string): Promise<void> {
    await this.deletePolicy(oldPolicy)
    await this.createPolicy(newPolicy, description)
  }
  
  async deletePolicy(policy: string): Promise<void> {
    const config = loadConfig()
    
    if (!config.orgId || !config.projectId || !config.clientId || !config.clientSecret) {
      throw new Error('Backend API credentials not configured')
    }
    
    const token = await getM2MToken(config)
    const opId = generateOpId()
    
    const response = await fetch(
      `${config.backendUrl}/api/v2025-01/projects/${config.projectId}/policies`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-project-id': config.projectId,
          'x-op-id': opId,
          'x-session-id': sessionId
        },
        body: JSON.stringify({ policy })
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to delete policy: ${response.status} ${errorText}`)
    }
  }
}

export const livePolicyStore = new LivePolicyStore()
