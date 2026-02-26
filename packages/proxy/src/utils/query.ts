import type Database from 'better-sqlite3'

interface ListOpts {
  search?: string
  searchColumns?: string[]       // db column names to LIKE-match against
  limit?: number
  offset?: number
  sortBy?: string | null
  sortOrder?: 'asc' | 'desc' | null
  columnMap?: Record<string, string>  // camelCase key -> db column
}

// Builds a paginated, sortable, searchable SELECT from a base table.
// Returns { rows, total } where rows are raw db objects.
export function paginatedQuery<T = any>(
  db: Database.Database,
  table: string,
  baseWhere: string,
  baseArgs: any[],
  opts: ListOpts
): { rows: T[]; total: number } {
  let where = baseWhere
  const args = [...baseArgs]

  if (opts.search && opts.searchColumns?.length) {
    const clauses = opts.searchColumns.map(c => `${c} LIKE ?`)
    where += ` AND (${clauses.join(' OR ')})`
    const pattern = `%${opts.search}%`
    for (let i = 0; i < opts.searchColumns.length; i++) args.push(pattern)
  }

  const total = (db.prepare(`SELECT COUNT(*) as n FROM ${table} WHERE ${where}`).get(...args) as any).n

  let orderBy = 'ORDER BY created_at DESC'
  if (opts.sortBy && opts.sortOrder && opts.columnMap) {
    const col = opts.columnMap[opts.sortBy]
    if (col) orderBy = `ORDER BY ${col} ${opts.sortOrder.toUpperCase()}`
  }

  const limit = opts.limit || 100
  const offset = opts.offset || 0
  const rows = db.prepare(
    `SELECT * FROM ${table} WHERE ${where} ${orderBy} LIMIT ? OFFSET ?`
  ).all(...args, limit, offset) as T[]

  return { rows, total }
}
