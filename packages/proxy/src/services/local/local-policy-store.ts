import { getDatabase } from '../../db/index.js'
import { randomBytes } from 'crypto'
import { parsePolicyId } from '../../utils/cedar-policy.js'
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
    
    const extractedPolicyId = parsePolicyId(policy)
    if (!extractedPolicyId) {
      throw new Error('Policy ID is required. Policy must start with @id("your-id").')
    }
    
    const existing = db.prepare(`
      SELECT 1 FROM schema_policy WHERE obj_type = 'policy' AND policy_id = ?
    `).get(extractedPolicyId) as { '1': number } | undefined
    if (existing) {
      throw new Error('Policy ID already exists')
    }
    
    const rowId = `policy-${randomBytes(8).toString('hex')}`
    
    try {
      db.prepare(`
        INSERT INTO schema_policy (id, obj_type, content, description, status, policy_id)
        VALUES (?, 'policy', ?, ?, 1, ?)
      `).run(rowId, policy, description, extractedPolicyId)
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint')) {
        throw new Error('Policy ID already exists')
      }
      throw error
    }
  }
  
  async updatePolicy(oldPolicy: string, newPolicy: string, description: string): Promise<void> {
    const db = getDatabase()
    
    const extractedPolicyId = parsePolicyId(newPolicy)
    if (!extractedPolicyId) {
      throw new Error('Policy ID is required. Policy must start with @id("your-id").')
    }
    
    const currentRow = db.prepare(`
      SELECT id FROM schema_policy WHERE obj_type = 'policy' AND content = ?
    `).get(oldPolicy) as { id: string } | undefined
    if (!currentRow) {
      throw new Error('Policy not found')
    }
    
    const existing = db.prepare(`
      SELECT 1 FROM schema_policy WHERE obj_type = 'policy' AND policy_id = ? AND id != ?
    `).get(extractedPolicyId, currentRow.id) as { '1': number } | undefined
    if (existing) {
      throw new Error('Policy ID already exists')
    }
    
    const result = db.prepare(`
      UPDATE schema_policy 
      SET content = ?, description = ?, policy_id = ?, updated_at = datetime('now')
      WHERE obj_type = 'policy' AND content = ?
    `).run(newPolicy, description, extractedPolicyId, oldPolicy)
    
    if (result.changes === 0) {
      throw new Error('Policy not found')
    }
  }
  
   
  async deletePolicy(policy: string): Promise<void> {
    const db = getDatabase()
    
    const result = db.prepare(`
      DELETE FROM schema_policy 
      WHERE obj_type = 'policy' AND content = ?
    `).run(policy)
    
    if (result.changes === 0) {
      throw new Error('Policy not found')
    }
  }
}

export const localPolicyStore = new LocalPolicyStore()
