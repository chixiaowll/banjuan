import type Database from 'better-sqlite3'
import type { SearchResult, SearchOptions } from '../types.js'

export class SearchService {
  constructor(private db: Database.Database) {}

  index(entry: { id: string; title: string; content: string; type: string }): void {
    this.db
      .prepare(`INSERT INTO search_index (rowid, title, content, type)
         VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`)
      .run(entry.title, entry.content, `${entry.type}:${entry.id}`)
  }

  removeById(id: string): void {
    this.db.prepare("DELETE FROM search_index WHERE type LIKE '%:' || ?").run(id)
  }

  async query(queryStr: string, options?: SearchOptions): Promise<SearchResult[]> {
    // Wrap in double quotes to treat as a phrase, escaping any existing double quotes
    const safeQuery = `"${queryStr.replace(/"/g, '""')}"`
    let sql = `SELECT title, content, type, rank FROM search_index WHERE search_index MATCH ?`
    const params: unknown[] = [safeQuery]

    if (options?.type) {
      sql += " AND type LIKE ? || ':%'"
      params.push(options.type)
    }

    sql += ' ORDER BY rank LIMIT ?'
    params.push(options?.limit ?? 50)

    const rows = this.db.prepare(sql).all(...params) as Array<{
      title: string; content: string; type: string; rank: number
    }>

    return rows.map((row) => {
      const [type, id] = row.type.split(':')
      return {
        type: type as SearchResult['type'], id, title: row.title,
        snippet: row.content.slice(0, 200), score: -row.rank,
      }
    })
  }
}
