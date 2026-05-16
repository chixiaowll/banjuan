import type { PlatformDatabase } from '../platform/index.js'
import type { SearchResult, SearchOptions } from '../types.js'

export class SearchService {
  private ftsAvailable: boolean

  constructor(private db: PlatformDatabase) {
    try {
      db.query('SELECT 1 FROM search_index LIMIT 0')
      this.ftsAvailable = true
    } catch {
      this.ftsAvailable = false
    }
  }

  index(entry: { id: string; title: string; content: string; type: string }): void {
    if (!this.ftsAvailable) return
    this.db.run(
      `INSERT INTO search_index (rowid, title, content, type)
         VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`,
      [entry.title, entry.content, `${entry.type}:${entry.id}`],
    )
  }

  removeById(id: string): void {
    if (!this.ftsAvailable) return
    this.db.run("DELETE FROM search_index WHERE type LIKE '%:' || ?", [id])
  }

  async query(queryStr: string, options?: SearchOptions): Promise<SearchResult[]> {
    const limit = options?.limit ?? 50
    const results = new Map<string, SearchResult>()
    const likePattern = `%${queryStr}%`

    // Search notes table (title)
    if (!options?.type || options.type === 'note') {
      try {
        const rows = this.db.query<{ id: string; title: string }>(
          'SELECT id, title FROM notes WHERE title LIKE ? LIMIT ?',
          [likePattern, limit],
        )
        for (const row of rows) {
          results.set(row.id, { type: 'note', id: row.id, title: row.title, snippet: '', score: 1 })
        }
      } catch { /* ignore */ }
    }

    // Search documents table (title)
    if (!options?.type || options.type === 'document') {
      try {
        const rows = this.db.query<{ id: string; title: string }>(
          'SELECT id, title FROM documents WHERE title LIKE ? LIMIT ?',
          [likePattern, limit],
        )
        for (const row of rows) {
          results.set(row.id, { type: 'document', id: row.id, title: row.title, snippet: '', score: 1 })
        }
      } catch { /* ignore */ }
    }

    // FTS5 full-text search (title + content)
    if (this.ftsAvailable) {
      try {
        const tokens = queryStr.trim().split(/\s+/).filter(Boolean)
        if (tokens.length > 0) {
          const ftsQuery = tokens.map(t => t.replace(/['"]/g, '') + '*').join(' ')
          let sql = `SELECT title, content, type, rank FROM search_index WHERE search_index MATCH ?`
          const params: unknown[] = [ftsQuery]
          if (options?.type) {
            sql += " AND type LIKE ? || ':%'"
            params.push(options.type)
          }
          sql += ' ORDER BY rank LIMIT ?'
          params.push(limit)
          const rows = this.db.query<{ title: string; content: string; type: string; rank: number }>(sql, params)
          for (const row of rows) {
            const parts = row.type.split(':')
            const type = parts[0]
            const id = parts.slice(1).join(':')
            if (!results.has(id)) {
              results.set(id, { type: type as SearchResult['type'], id, title: row.title, snippet: row.content.slice(0, 200), score: -row.rank })
            }
          }
        }
      } catch { /* FTS query failed */ }
    }

    return Array.from(results.values()).sort((a, b) => b.score - a.score).slice(0, limit)
  }
}
