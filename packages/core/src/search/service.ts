import type { PlatformDatabase } from '../platform/index.js'
import type { SearchResult, SearchOptions } from '../types.js'

export class SearchService {
  constructor(private db: PlatformDatabase) {}

  index(entry: { id: string; title: string; content: string; type: string }): void {
    this.db.run(
      `INSERT INTO search_index (rowid, title, content, type)
         VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`,
      [entry.title, entry.content, `${entry.type}:${entry.id}`],
    )
  }

  removeById(id: string): void {
    this.db.run("DELETE FROM search_index WHERE type LIKE '%:' || ?", [id])
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

    const rows = this.db.query<{
      title: string; content: string; type: string; rank: number
    }>(sql, params)

    return rows.map((row) => {
      const [type, id] = row.type.split(':')
      return {
        type: type as SearchResult['type'], id, title: row.title,
        snippet: row.content.slice(0, 200), score: -row.rank,
      }
    })
  }
}
