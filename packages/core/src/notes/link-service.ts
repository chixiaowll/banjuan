import type { PlatformDatabase } from '../platform/index.js'
import type { NoteLink } from '../types.js'

export interface LinkSyncEntry {
  targetId: string
  context: string
}

export class NoteLinkService {
  constructor(private db: PlatformDatabase) {}

  async sync(sourceId: string, links: LinkSyncEntry[]): Promise<void> {
    this.db.run('DELETE FROM note_links WHERE source_id = ?', [sourceId])
    for (const link of links) {
      try {
        this.db.run('INSERT OR IGNORE INTO note_links (source_id, target_id, context) VALUES (?, ?, ?)', [sourceId, link.targetId, link.context])
      } catch {
        // target note may not exist yet (deleted or not synced)
      }
    }
  }

  async getForwardLinks(noteId: string): Promise<NoteLink[]> {
    const rows = this.db.query<Record<string, unknown>>('SELECT * FROM note_links WHERE source_id = ?', [noteId])
    return rows.map(r => this.rowToLink(r))
  }

  async getBacklinks(noteId: string): Promise<NoteLink[]> {
    const rows = this.db.query<Record<string, unknown>>('SELECT * FROM note_links WHERE target_id = ?', [noteId])
    return rows.map(r => this.rowToLink(r))
  }

  async removeAllForNote(noteId: string): Promise<void> {
    this.db.run('DELETE FROM note_links WHERE source_id = ? OR target_id = ?', [noteId, noteId])
  }

  private rowToLink(row: Record<string, unknown>): NoteLink {
    return {
      sourceId: row.source_id as string,
      targetId: row.target_id as string,
      context: (row.context as string) ?? '',
    }
  }
}
