import type Database from 'better-sqlite3'
import type { NoteLink } from '../types.js'

export interface LinkSyncEntry {
  targetId: string
  context: string
}

export class NoteLinkService {
  constructor(private db: Database.Database) {}

  async sync(sourceId: string, links: LinkSyncEntry[]): Promise<void> {
    this.db.prepare('DELETE FROM note_links WHERE source_id = ?').run(sourceId)
    const insert = this.db.prepare('INSERT OR IGNORE INTO note_links (source_id, target_id, context) VALUES (?, ?, ?)')
    for (const link of links) {
      try {
        insert.run(sourceId, link.targetId, link.context)
      } catch {
        // target note may not exist yet (deleted or not synced)
      }
    }
  }

  async getForwardLinks(noteId: string): Promise<NoteLink[]> {
    const rows = this.db.prepare('SELECT * FROM note_links WHERE source_id = ?').all(noteId) as Array<Record<string, unknown>>
    return rows.map(r => this.rowToLink(r))
  }

  async getBacklinks(noteId: string): Promise<NoteLink[]> {
    const rows = this.db.prepare('SELECT * FROM note_links WHERE target_id = ?').all(noteId) as Array<Record<string, unknown>>
    return rows.map(r => this.rowToLink(r))
  }

  async removeAllForNote(noteId: string): Promise<void> {
    this.db.prepare('DELETE FROM note_links WHERE source_id = ? OR target_id = ?').run(noteId, noteId)
  }

  private rowToLink(row: Record<string, unknown>): NoteLink {
    return {
      sourceId: row.source_id as string,
      targetId: row.target_id as string,
      context: (row.context as string) ?? '',
    }
  }
}
