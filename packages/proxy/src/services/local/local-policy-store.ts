import { getDatabase } from '../../db/index.js'
import { randomBytes } from 'crypto'
import type { IPolicyStore, Policy } from '../interfaces.js'

export class LocalPolicyStore implements IPolicyStore {
  async getPolicies(): Promise<Policy[]> {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT content, description 
      FROM schema_policy 
      WHERE obj_type = 'policy' AND status = 1
      ORDER BY created_at ASC
    `).all() as any[]
    
    return rows.map(row => ({
      policy: row.content,
      description: row.description || ''
    }))
  }
  
  async createPolicy(policy: string, description: string): Promise<void> {
    const db = getDatabase()
    
    const policyId = `policy-${randomBytes(8).toString('hex')}`
    
    try {
      db.prepare(`
        INSERT INTO schema_policy (id, obj_type, content, description, status)
        VALUES (?, 'policy', ?, ?, 1)
      `).run(policyId, policy, description)
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint')) {
        throw new Error('Policy already exists')
      }
      throw error
    }
  }
  
  async updatePolicy(oldPolicy: string, newPolicy: string, description: string): Promise<void> {
    const db = getDatabase()
    
    const result = db.prepare(`
      UPDATE schema_policy 
      SET content = ?, description = ?, updated_at = datetime('now')
      WHERE obj_type = 'policy' AND content = ?
    `).run(newPolicy, description, oldPolicy)
    
    if (result.changes === 0) {
      throw new Error('Policy not found')
    }
  }
  
   
  async deletePolicy(policy: string): Promise<void> {
    const db = getDatabase()
    
 
    const result = db.prepare(`
      UPDATE schema_policy 
      SET status = 0, updated_at = datetime('now')
      WHERE obj_type = 'policy' AND content = ? AND status = 1
    `).run(policy)
    
    if (result.changes === 0) {
      throw new Error('Policy not found')
    }
  }
}

export const localPolicyStore = new LocalPolicyStore()
