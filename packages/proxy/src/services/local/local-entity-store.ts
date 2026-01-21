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
   * Supports optional search, limit, and offset for pagination
   */
  async getEntities(uid?: string, params?: {
    search?: string
    limit?: number
    offset?: number
    entityType?: string // Filter by entity type (e.g., 'UserKey')
  }): Promise<{ data: Entity[]; total: number }> {
    const db = getDatabase()
    
    // Build WHERE clause
    let whereClause = 'WHERE 1=1'
    const args: any[] = []
    
    if (uid) {
      // Parse UID format: "User::\"userId\""
      const match = uid.match(/^(\w+)::"([^"]+)"$/)
      if (!match) {
        throw new Error(`Invalid UID format: ${uid}`)
      }
      const [, type, id] = match
      whereClause += ' AND etype = ? AND eid = ?'
      args.push(type, id)
    }
    
    if (params?.entityType) {
      whereClause += ' AND etype = ?'
      args.push(params.entityType)
    }
    
    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM entities ${whereClause}`
    const countResult = db.prepare(countSql).get(...args) as { total: number }
    let total = countResult.total
    
    // Get paginated data
    const limit = params?.limit || 100
    const offset = params?.offset || 0
    const dataSql = `SELECT ejson, status FROM entities ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    const rows = db.prepare(dataSql).all(...args, limit, offset) as any[]
    
    // Parse entities
    let entities = rows.map(row => {
      const entity = JSON.parse(row.ejson) as Entity
      return entity
    })
    
    // If search provided, filter by JSON fields
    // For UserKey entities, search across userId (from user reference), and we'll need to join with User entities
    if (params?.search && !uid) {
      const searchLower = params.search.toLowerCase()
      entities = entities.filter(entity => {
        // Search in entity attrs (varies by type)
        const attrs = entity.attrs as any
        
        // For UserKey: search userId from user reference
        if (entity.uid.type === 'UserKey' && attrs.user?.__entity?.id) {
          if (attrs.user.__entity.id.toLowerCase().includes(searchLower)) {
            return true
          }
        }
        
        // For User: search name, email, userId
        if (entity.uid.type === 'User') {
          if (
            (attrs.name && attrs.name.toLowerCase().includes(searchLower)) ||
            (attrs.email && attrs.email.toLowerCase().includes(searchLower)) ||
            (attrs.user_id && attrs.user_id.toLowerCase().includes(searchLower)) ||
            entity.uid.id.toLowerCase().includes(searchLower)
          ) {
            return true
          }
        }
        
        // Search in UID id
        if (entity.uid.id.toLowerCase().includes(searchLower)) {
          return true
        }
        
        return false
      })
      
      // Recalculate total based on filtered results
      // Note: limit and offset are passed separately, not in args array, so we can use args directly
      const allRows = db.prepare(`SELECT ejson FROM entities ${whereClause}`).all(...args) as any[]
      const allEntities = allRows.map(row => JSON.parse(row.ejson) as Entity)
      const filtered = allEntities.filter(entity => {
        const searchLower = params.search!.toLowerCase()
        const attrs = entity.attrs as any
        
        if (entity.uid.type === 'UserKey' && attrs.user?.__entity?.id) {
          if (attrs.user.__entity.id.toLowerCase().includes(searchLower)) return true
        }
        
        if (entity.uid.type === 'User') {
          if (
            (attrs.name && attrs.name.toLowerCase().includes(searchLower)) ||
            (attrs.email && attrs.email.toLowerCase().includes(searchLower)) ||
            (attrs.user_id && attrs.user_id.toLowerCase().includes(searchLower)) ||
            entity.uid.id.toLowerCase().includes(searchLower)
          ) {
            return true
          }
        }
        
        return entity.uid.id.toLowerCase().includes(searchLower)
      })
      total = filtered.length
    }
    
    return { data: entities, total }
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
