import type { PlatformDatabase } from '../platform/index.js'

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
  constructor(private db: PlatformDatabase) {}

  async sync(sourceId: string, links: DocLinkEntry[]): Promise<void> {
    this.db.run('DELETE FROM doc_links WHERE source_id = ?', [sourceId])
    for (const link of links) {
      try {
        this.db.run('INSERT OR IGNORE INTO doc_links (source_id, target_id, context) VALUES (?, ?, ?)', [sourceId, link.targetId, link.context])
      } catch {
        // target document may not exist
      }
    }
  }

  async getForwardLinks(noteId: string): Promise<DocLink[]> {
    const rows = this.db.query<Record<string, unknown>>('SELECT * FROM doc_links WHERE source_id = ?', [noteId])
    return rows.map(r => this.rowToLink(r))
  }

  async getBacklinks(docId: string): Promise<DocLink[]> {
    const rows = this.db.query<Record<string, unknown>>('SELECT * FROM doc_links WHERE target_id = ?', [docId])
    return rows.map(r => this.rowToLink(r))
  }

  async removeAllForNote(noteId: string): Promise<void> {
    this.db.run('DELETE FROM doc_links WHERE source_id = ?', [noteId])
  }

  private rowToLink(row: Record<string, unknown>): DocLink {
    return {
      sourceId: row.source_id as string,
      targetId: row.target_id as string,
      context: (row.context as string) ?? '',
    }
  }
}
