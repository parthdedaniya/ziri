import type { Entity } from './interfaces.js'

export interface EntityQueryParams {
  search?: string
  limit?: number
  offset?: number
  entityType?: string
  sortBy?: string | null
  sortOrder?: 'asc' | 'desc' | null
}

export const DEFAULT_ENTITY_LIMIT = 100
export const DEFAULT_ENTITY_OFFSET = 0

const DB_SORT_COLUMN_MAP: Record<string, string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  status: 'status'
}

export function getDbSortClause(
  sortBy?: string | null,
  sortOrder?: 'asc' | 'desc' | null
): string | null {
  if (!sortBy || !sortOrder) {
    return 'ORDER BY created_at DESC'
  }

  const dbColumn = DB_SORT_COLUMN_MAP[sortBy]
  if (!dbColumn) {
    return null
  }

  return `ORDER BY ${dbColumn} ${sortOrder.toUpperCase()}`
}

export function shouldUseInMemoryFilterOrSort(params?: EntityQueryParams): boolean {
  if (!params) return false
  if (params.search) return true
  if (params.sortBy && params.sortOrder && !DB_SORT_COLUMN_MAP[params.sortBy]) return true
  return false
}

export function filterAndSortEntities(
  entities: Entity[],
  params?: EntityQueryParams
): Entity[] {
  let result = entities

  if (params?.entityType) {
    result = result.filter(entity => entity.uid.type === params.entityType)
  }

  if (params?.search) {
    const searchLower = params.search.toLowerCase()
    result = result.filter(entity => matchesEntitySearch(entity, searchLower))
  }

  if (params?.sortBy && params?.sortOrder) {
    const sortKey = params.sortBy
    const sortOrder = params.sortOrder

    result = [...result].sort((a, b) => {
      const aVal = getSortValue(a, sortKey)
      const bVal = getSortValue(b, sortKey)

      if (aVal === undefined || aVal === null) return 1
      if (bVal === undefined || bVal === null) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comparison = aVal.toLowerCase().localeCompare(bVal.toLowerCase())
        return sortOrder === 'asc' ? comparison : -comparison
      }

      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }

  return result
}

export function paginateEntities(
  entities: Entity[],
  params?: EntityQueryParams
): Entity[] {
  const limit = params?.limit ?? DEFAULT_ENTITY_LIMIT
  const offset = params?.offset ?? DEFAULT_ENTITY_OFFSET
  return entities.slice(offset, offset + limit)
}

function matchesEntitySearch(entity: Entity, searchLower: string): boolean {
  const attrs = entity.attrs as any

  if (entity.uid.type === 'UserKey' && attrs.user?.__entity?.id) {
    if (attrs.user.__entity.id.toLowerCase().includes(searchLower)) {
      return true
    }
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
}

function getSortValue(entity: Entity, sortKey: string): string | number | null | undefined {
  const attrs = entity.attrs as any

  if (sortKey === 'userId') {
    if (entity.uid.type === 'UserKey' && attrs.user?.__entity?.id) {
      return attrs.user.__entity.id
    }
    if (entity.uid.type === 'User') {
      return attrs.user_id || entity.uid.id
    }
    return entity.uid.id
  }

  if (sortKey === 'name' || sortKey === 'email') {
    if (entity.uid.type === 'User') {
      return attrs[sortKey] || ''
    }
    return ''
  }

  if (sortKey === 'currentDailySpend' || sortKey === 'currentMonthlySpend') {
    const attrKey = sortKey === 'currentDailySpend'
      ? 'current_daily_spend'
      : 'current_monthly_spend'
    const attrValue = attrs[attrKey]
    return toNumber(attrValue)
  }

  if (sortKey === 'status') {
    return attrs.status || 'active'
  }

  return attrs[sortKey] || entity.uid.id
}

function toNumber(value: any): number {
  if (typeof value === 'object' && value?.__extn?.arg) {
    return parseFloat(value.__extn.arg)
  }
  if (typeof value === 'string') {
    return parseFloat(value)
  }
  if (typeof value === 'number') {
    return value
  }
  return 0
}
