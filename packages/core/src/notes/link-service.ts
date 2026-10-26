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

  // With the other note's title and type: the panels showing links used to
  // load every linked note in full (its file) just for those.
  async getForwardLinks(noteId: string): Promise<NoteLink[]> {
    const rows = this.db.query<Record<string, unknown>>(
      'SELECT l.*, n.title AS target_title, n.type AS target_type FROM note_links l LEFT JOIN notes n ON n.id = l.target_id WHERE l.source_id = ?', [noteId])
    return rows.map(r => this.rowToLink(r))
  }

  async getBacklinks(noteId: string): Promise<NoteLink[]> {
    const rows = this.db.query<Record<string, unknown>>(
      'SELECT l.*, n.title AS source_title, n.type AS source_type FROM note_links l LEFT JOIN notes n ON n.id = l.source_id WHERE l.target_id = ?', [noteId])
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
      ...(row.source_title != null ? { sourceTitle: row.source_title as string, sourceType: row.source_type as string } : {}),
      ...(row.target_title != null ? { targetTitle: row.target_title as string, targetType: row.target_type as string } : {}),
    }
  }
}
