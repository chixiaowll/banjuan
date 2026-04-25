import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import type { Tag, TagTarget } from '../types.js'
import type { EventBus } from '../events/bus.js'

export class TagService {
  constructor(private db: Database.Database, private _rootPath: string, private events: EventBus) {}

  async create(input: { name: string; color?: string }): Promise<Tag> {
    const id = uuid()
    this.db
      .prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)')
      .run(id, input.name, input.color ?? null)
    return { id, name: input.name, color: input.color ?? null }
  }

  async list(): Promise<Tag[]> {
    return this.db.prepare('SELECT * FROM tags ORDER BY name').all() as Tag[]
  }

  async assign(targetId: string, targetType: TagTarget, tagNames: string[]): Promise<void> {
    const table = targetType === 'document' ? 'doc_tags' : 'note_tags'
    const idCol = targetType === 'document' ? 'doc_id' : 'note_id'

    const insertTag = this.db.prepare(
      `INSERT OR IGNORE INTO ${table} (${idCol}, tag_id) VALUES (?, ?)`,
    )
    const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?')

    const assignAll = this.db.transaction(() => {
      for (const name of tagNames) {
        const tag = findTag.get(name) as { id: string } | undefined
        if (tag) {
          insertTag.run(targetId, tag.id)
          this.events.emit('tag:assigned', { targetId, targetType, tagName: name })
        }
      }
    })
    assignAll()
  }

  async unassign(targetId: string, targetType: TagTarget, tagName: string): Promise<void> {
    const table = targetType === 'document' ? 'doc_tags' : 'note_tags'
    const idCol = targetType === 'document' ? 'doc_id' : 'note_id'

    const tag = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName) as
      | { id: string }
      | undefined
    if (tag) {
      this.db.prepare(`DELETE FROM ${table} WHERE ${idCol} = ? AND tag_id = ?`).run(targetId, tag.id)
      this.events.emit('tag:removed', { targetId, targetType, tagName })
    }
  }

  async forTarget(targetId: string, targetType: TagTarget): Promise<Tag[]> {
    const table = targetType === 'document' ? 'doc_tags' : 'note_tags'
    const idCol = targetType === 'document' ? 'doc_id' : 'note_id'

    return this.db
      .prepare(`SELECT tags.* FROM tags JOIN ${table} ON tags.id = ${table}.tag_id WHERE ${table}.${idCol} = ?`)
      .all(targetId) as Tag[]
  }
}
