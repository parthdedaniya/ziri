import { getDatabase } from '../../db/index.js'
import type { IEntityStore } from '../interfaces.js'
import type { Entity } from '../interfaces.js'
import {
  filterAndSortEntities,
  getDbSortClause,
  paginateEntities,
  shouldUseInMemoryFilterOrSort,
  type EntityQueryParams
} from '../entity-query-utils.js'

export class LocalEntityStore implements IEntityStore {
  async getEntities(uid?: string, params?: EntityQueryParams): Promise<{ data: Entity[]; total: number }> {
    const db = getDatabase()
    let whereClause = 'WHERE status IN (1, 2)'
    const args: any[] = []

    if (uid) {
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

    const useInMemory = shouldUseInMemoryFilterOrSort(params)

    if (!useInMemory) {
      const countSql = `SELECT COUNT(*) as total FROM entities ${whereClause}`
      const countResult = db.prepare(countSql).get(...args) as { total: number }
      const total = countResult.total

      const orderByClause = getDbSortClause(params?.sortBy, params?.sortOrder)
      const limit = params?.limit ?? 100
      const offset = params?.offset ?? 0

      const dataSql = `
        SELECT ejson
        FROM entities
        ${whereClause}
        ${orderByClause || ''}
        LIMIT ? OFFSET ?
      `
      const rows = db.prepare(dataSql).all(...args, limit, offset) as Array<{ ejson: string }>
      const entities = rows.map(row => JSON.parse(row.ejson) as Entity)
      return { data: entities, total }
    }

    const rows = db.prepare(`SELECT ejson FROM entities ${whereClause}`).all(...args) as Array<{ ejson: string }>
    const entities = rows.map(row => JSON.parse(row.ejson) as Entity)
    const processed = filterAndSortEntities(entities, params)
    const total = processed.length
    const paged = paginateEntities(processed, params)
    return { data: paged, total }
  }
  
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
  
  async deleteEntity(entityName: string): Promise<void> {
    const db = getDatabase()
    
    const match = entityName.match(/^(\w+)::"([^"]+)"$/)
    if (!match) {
      throw new Error(`Invalid entity name format: ${entityName}`)
    }
    const [, type, id] = match
    
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

export const localEntityStore = new LocalEntityStore()
