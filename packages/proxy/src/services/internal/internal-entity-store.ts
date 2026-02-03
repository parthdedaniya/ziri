import { getDatabase } from '../../db/index.js'
import type { Entity } from '../interfaces.js'

export interface InternalEntity {
  uid: {
    type: string
    id: string
  }
  attrs: {
    user_id: string
    role: string
    status: string
    email?: string
    name?: string
  }
  parents: any[]
}

export interface IInternalEntityStore {
  getEntity(userId: string): Promise<InternalEntity | null>
  createEntity(entity: InternalEntity): Promise<void>
  updateEntity(userId: string, updates: Partial<InternalEntity['attrs']>): Promise<void>
  deleteEntity(userId: string): Promise<void>
  getAllEntities(): Promise<InternalEntity[]>
}

export class InternalEntityStore implements IInternalEntityStore {
  async getEntity(userId: string): Promise<InternalEntity | null> {
    const db = getDatabase()
    
    const row = db.prepare(`
      SELECT ejson FROM internal_entities
      WHERE etype = ? AND eid = ? AND status IN (1, 2)
    `).get('DashboardUser', userId) as any
    
    if (!row) {
      return null
    }
    
    return JSON.parse(row.ejson) as InternalEntity
  }
  
  async createEntity(entity: InternalEntity): Promise<void> {
    const db = getDatabase()
    
    const ejson = JSON.stringify(entity)
    
    try {
      db.prepare(`
        INSERT INTO internal_entities (etype, eid, ejson, status)
        VALUES (?, ?, ?, ?)
      `).run('DashboardUser', entity.uid.id, ejson, 1)
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint')) {
        throw new Error(`Internal entity already exists for user ${entity.uid.id}`)
      }
      throw error
    }
  }
  
  async updateEntity(userId: string, updates: Partial<InternalEntity['attrs']>): Promise<void> {
    const db = getDatabase()
    
    const existing = await this.getEntity(userId)
    if (!existing) {
      throw new Error(`Internal entity not found for user ${userId}`)
    }
    
    const updatedAttrs = {
      ...existing.attrs,
      ...updates
    }
    
    const updatedEntity: InternalEntity = {
      ...existing,
      attrs: updatedAttrs
    }
    
    const ejson = JSON.stringify(updatedEntity)
    
    db.prepare(`
      UPDATE internal_entities
      SET ejson = ?, updated_at = datetime('now')
      WHERE etype = ? AND eid = ?
    `).run(ejson, 'DashboardUser', userId)
  }
  
  async deleteEntity(userId: string): Promise<void> {
    const db = getDatabase()
    
    const result = db.prepare(`
      DELETE FROM internal_entities
      WHERE etype = ? AND eid = ?
    `).run('DashboardUser', userId)
    
    if (result.changes === 0) {
      throw new Error(`Internal entity not found for user ${userId}`)
    }
  }
  
  async getAllEntities(): Promise<InternalEntity[]> {
    const db = getDatabase()
    
    const rows = db.prepare(`
      SELECT ejson FROM internal_entities
      WHERE etype = ? AND status IN (1, 2)
    `).all('DashboardUser') as any[]
    
    return rows.map(row => JSON.parse(row.ejson) as InternalEntity)
  }
}

export const internalEntityStore = new InternalEntityStore()
