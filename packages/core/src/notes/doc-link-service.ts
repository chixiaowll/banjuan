import type Database from 'better-sqlite3'

export interface DocLinkEntry {
  targetId: string
  context: string
}

export interface DocLink {
  sourceId: string
  targetId: string
  context: string
}

export class DocLinkService {
  constructor(private db: Database.Database) {}

  async sync(sourceId: string, links: DocLinkEntry[]): Promise<void> {
    this.db.prepare('DELETE FROM doc_links WHERE source_id = ?').run(sourceId)
    const insert = this.db.prepare('INSERT OR IGNORE INTO doc_links (source_id, target_id, context) VALUES (?, ?, ?)')
    for (const link of links) {
      try {
        insert.run(sourceId, link.targetId, link.context)
      } catch {
        // target document may not exist
      }
    }
  }

  async getForwardLinks(noteId: string): Promise<DocLink[]> {
    const rows = this.db.prepare('SELECT * FROM doc_links WHERE source_id = ?').all(noteId) as Array<Record<string, unknown>>
    return rows.map(r => this.rowToLink(r))
  }

  async getBacklinks(docId: string): Promise<DocLink[]> {
    const rows = this.db.prepare('SELECT * FROM doc_links WHERE target_id = ?').all(docId) as Array<Record<string, unknown>>
    return rows.map(r => this.rowToLink(r))
  }

  async removeAllForNote(noteId: string): Promise<void> {
    this.db.prepare('DELETE FROM doc_links WHERE source_id = ?').run(noteId)
  }

  private rowToLink(row: Record<string, unknown>): DocLink {
    return {
      sourceId: row.source_id as string,
      targetId: row.target_id as string,
      context: (row.context as string) ?? '',
    }
  }
}
