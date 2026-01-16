// Local entity store using SQLite
// Uses new entities table with etype/eid composite key

import { getDatabase } from '../../db/index.js'
import type { IEntityStore } from '../interfaces.js'
import type { Entity } from '../interfaces.js'

/**
 * Local entity store implementation
 */
export class LocalEntityStore implements IEntityStore {
  /**
   * Get all entities (or filter by UID)
   */
  async getEntities(uid?: string): Promise<Entity[]> {
    const db = getDatabase()
    
    let rows: any[]
    if (uid) {
      // Parse UID format: "User::\"userId\""
      const match = uid.match(/^(\w+)::"([^"]+)"$/)
      if (!match) {
        throw new Error(`Invalid UID format: ${uid}`)
      }
      const [, type, id] = match
      
      rows = db.prepare(`
        SELECT ejson, status 
        FROM entities 
        WHERE etype = ? AND eid = ?
      `).all(type, id) as any[]
    } else {
      rows = db.prepare('SELECT ejson, status FROM entities').all() as any[]
    }
    
    return rows.map(row => {
      const entity = JSON.parse(row.ejson) as Entity
      return entity
    })
  }
  
  /**
   * Create an entity
   */
  async createEntity(entity: Entity, status: number): Promise<void> {
    const db = getDatabase()
    
    const entityData = JSON.stringify(entity)
    const etype = entity.uid.type
    const eid = entity.uid.id
    
    try {
      db.prepare(`
        INSERT INTO entities (etype, eid, ejson, status)
        VALUES (?, ?, ?, ?)
      `).run(etype, eid, entityData, status)
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint')) {
        throw new Error('Entity already exists')
      }
      throw error
    }
  }
  
  /**
   * Update an entity (full entity body required, same as create)
   */
  async updateEntity(entity: Entity, status: number): Promise<void> {
    const db = getDatabase()
    
    const entityData = JSON.stringify(entity)
    const etype = entity.uid.type
    const eid = entity.uid.id
    
    const result = db.prepare(`
      UPDATE entities 
      SET ejson = ?, status = ?, updated_at = datetime('now')
      WHERE etype = ? AND eid = ?
    `).run(entityData, status, etype, eid)
    
    if (result.changes === 0) {
      throw new Error('Entity not found')
    }
  }
  
  /**
   * Delete an entity by UID name
   */
  async deleteEntity(entityName: string): Promise<void> {
    const db = getDatabase()
    
    // Parse UID format: "User::\"userId\""
    const match = entityName.match(/^(\w+)::"([^"]+)"$/)
    if (!match) {
      throw new Error(`Invalid entity name format: ${entityName}`)
    }
    const [, type, id] = match
    
    // Soft delete (set status to 0 = inactive)
    const result = db.prepare(`
      UPDATE entities 
      SET status = 0, updated_at = datetime('now')
      WHERE etype = ? AND eid = ?
    `).run(type, id)
    
    if (result.changes === 0) {
      throw new Error('Entity not found')
    }
  }
}

// Export singleton instance
export const localEntityStore = new LocalEntityStore()
