import type { PlatformDatabase, PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'
import { v4 as uuid } from 'uuid'
import type { Tag, TagTarget, DocumentFileData } from '../types.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'
import { hasPlainPath } from '../storage/safe-path.js'
import { mutateNoteFile } from '../notes/note-file.js'
import { tagCatalogLock } from '../storage/keyed-lock.js'
import type { TagEntry, TagTombstone } from '../sync/tag-merge.js'


const TAG_PALETTE = [
  '#4a7ab5', '#7b6ba8', '#a07842', '#3d8a66',
  '#5d5da0', '#9a8035', '#a35882', '#3a7f86',
  '#737a84', '#6b8a3d', '#8a6b3d', '#3d6b8a',
]
function autoColor(name: string): string {
  const hash = name.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

export class TagService {
  private tagsFilePath: string
  private tombstonesFilePath: string
  private notesDir: string
  private docStore: JsonStore<DocumentFileData>

  constructor(private db: PlatformDatabase, private rootPath: string, private events: EventBus, private fs: PlatformFS) {
    this.tagsFilePath = join(rootPath, '.banjuan', 'tags.json')
    this.tombstonesFilePath = join(rootPath, '.banjuan', 'tags-deleted.json')
    this.notesDir = join(rootPath, '.banjuan', 'notes')
    this.docStore = new JsonStore<DocumentFileData>(join(rootPath, '.banjuan', 'data', 'documents'), fs, hasPlainPath)
  }

  private async readTagsFile(): Promise<TagEntry[]> {
    if (!(await this.fs.exists(this.tagsFilePath))) return []
    const raw = JSON.parse(await this.fs.readTextFile(this.tagsFilePath)) as Array<Partial<TagEntry>>
    // Legacy entries have no updatedAt — default to 0 (oldest), so a later
    // deletion tombstone can supersede them, while absent tombstones keep them.
    return raw.map(t => ({ id: t.id!, name: t.name!, color: t.color ?? null, updatedAt: t.updatedAt ?? 0 }))
  }

  private async writeTagsFile(tags: TagEntry[]): Promise<void> {
    await this.fs.writeTextFile(this.tagsFilePath, JSON.stringify(tags, null, 2))
  }

  private async readTombstones(): Promise<TagTombstone[]> {
    if (!(await this.fs.exists(this.tombstonesFilePath))) return []
    try { return JSON.parse(await this.fs.readTextFile(this.tombstonesFilePath)) } catch { return [] }
  }

  private async writeTombstones(tombstones: TagTombstone[]): Promise<void> {
    await this.fs.writeTextFile(this.tombstonesFilePath, JSON.stringify(tombstones, null, 2))
  }

  // Record a deletion so it can propagate across devices on sync.
  private async addTombstone(name: string): Promise<void> {
    const tombs = await this.readTombstones()
    const existing = tombs.find(t => t.name === name)
    if (existing) existing.deletedAt = Date.now()
    else tombs.push({ name, deletedAt: Date.now() })
    await this.writeTombstones(tombs)
  }

  // Re-adding (or renaming to) a name clears any prior deletion of that name.
  private async clearTombstone(name: string): Promise<void> {
    const tombs = await this.readTombstones()
    const filtered = tombs.filter(t => t.name !== name)
    if (filtered.length !== tombs.length) await this.writeTombstones(filtered)
  }

  async create(input: { name: string; color?: string }): Promise<Tag> {
    const id = uuid()
    const color = input.color ?? autoColor(input.name)

    await this.changeCatalog(async () => {
      const tags = await this.readTagsFile()
      tags.push({ id, name: input.name, color, updatedAt: Date.now() })
      await this.writeTagsFile(tags)
      await this.clearTombstone(input.name)
    })

    this.db.run('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', [id, input.name, color])

    return { id, name: input.name, color }
  }

  async list(): Promise<Tag[]> {
    return this.db.query<Tag>('SELECT * FROM tags ORDER BY name')
  }

  async assign(targetId: string, targetType: TagTarget, tagNames: string[]): Promise<void> {
    if (targetType === 'document') {
      await this.docStore.update(targetId, (data) => {
        data.tags = [...new Set([...(data.tags ?? []), ...tagNames])]
        data.updatedAt = new Date().toISOString()
      })
    } else if (targetType === 'note' || targetType === 'mindmap') {
      const queryCondition = targetType === 'mindmap'
        ? 'SELECT id FROM notes WHERE id = ? AND type = ?'
        : 'SELECT id FROM notes WHERE id = ?'
      const queryParams = targetType === 'mindmap' ? [targetId, 'mindmap'] : [targetId]
      if (this.db.queryOne<{ id: string }>(queryCondition, queryParams)) {
        await mutateNoteFile(this.db, this.fs, this.notesDir, targetId, (fileData) => {
          const existingTags: string[] = fileData.tags ?? []
          fileData.tags = [...new Set([...existingTags, ...tagNames])]
          fileData.updatedAt = new Date().toISOString()
        })
      }
    }

    const tableMap: Record<TagTarget, { table: string; idCol: string }> = {
      document: { table: 'doc_tags', idCol: 'doc_id' },
      note: { table: 'note_tags', idCol: 'note_id' },
      mindmap: { table: 'mindmap_tags', idCol: 'mindmap_id' },
    }
    const { table, idCol } = tableMap[targetType]

    this.db.transaction(() => {
      for (const name of tagNames) {
        const tag = this.db.queryOne<{ id: string }>('SELECT id FROM tags WHERE name = ?', [name])
        if (tag) {
          this.db.run(`INSERT OR IGNORE INTO ${table} (${idCol}, tag_id) VALUES (?, ?)`, [targetId, tag.id])
          this.events.emit('tag:assigned', { targetId, targetType, tagName: name })
        }
      }
    })
  }

  async unassign(targetId: string, targetType: TagTarget, tagName: string): Promise<void> {
    if (targetType === 'document') {
      await this.docStore.update(targetId, (data) => {
        data.tags = (data.tags ?? []).filter(t => t !== tagName)
        data.updatedAt = new Date().toISOString()
      })
    } else if (targetType === 'note' || targetType === 'mindmap') {
      const queryCondition = targetType === 'mindmap'
        ? 'SELECT id FROM notes WHERE id = ? AND type = ?'
        : 'SELECT id FROM notes WHERE id = ?'
      const queryParams = targetType === 'mindmap' ? [targetId, 'mindmap'] : [targetId]
      if (this.db.queryOne<{ id: string }>(queryCondition, queryParams)) {
        await mutateNoteFile(this.db, this.fs, this.notesDir, targetId, (fileData) => {
          fileData.tags = ((fileData.tags as string[]) ?? []).filter((t: string) => t !== tagName)
          fileData.updatedAt = new Date().toISOString()
        })
      }
    }

    const tableMap: Record<TagTarget, { table: string; idCol: string }> = {
      document: { table: 'doc_tags', idCol: 'doc_id' },
      note: { table: 'note_tags', idCol: 'note_id' },
      mindmap: { table: 'mindmap_tags', idCol: 'mindmap_id' },
    }
    const { table, idCol } = tableMap[targetType]
    const tag = this.db.queryOne<{ id: string }>('SELECT id FROM tags WHERE name = ?', [tagName])
    if (tag) {
      this.db.run(`DELETE FROM ${table} WHERE ${idCol} = ? AND tag_id = ?`, [targetId, tag.id])
      this.events.emit('tag:removed', { targetId, targetType, tagName })
    }
  }

  /** Tag names of every tagged target of `targetType`, keyed by target id — one query instead of one per item. */
  async namesByTarget(targetType: TagTarget): Promise<Record<string, string[]>> {
    const { table, idCol } = ({
      document: { table: 'doc_tags', idCol: 'doc_id' },
      note: { table: 'note_tags', idCol: 'note_id' },
      mindmap: { table: 'mindmap_tags', idCol: 'mindmap_id' },
    } as const)[targetType]
    const map: Record<string, string[]> = {}
    for (const r of this.db.query<{ id: string; name: string }>(
      `SELECT ${table}.${idCol} AS id, tags.name AS name FROM ${table} JOIN tags ON tags.id = ${table}.tag_id ORDER BY tags.name`)) {
      (map[r.id] ??= []).push(r.name)
    }
    return map
  }

  async forTarget(targetId: string, targetType: TagTarget): Promise<Tag[]> {
    const tableMap: Record<TagTarget, { table: string; idCol: string }> = {
      document: { table: 'doc_tags', idCol: 'doc_id' },
      note: { table: 'note_tags', idCol: 'note_id' },
      mindmap: { table: 'mindmap_tags', idCol: 'mindmap_id' },
    }
    const { table, idCol } = tableMap[targetType]

    return this.db.query<Tag>(
      `SELECT tags.* FROM tags JOIN ${table} ON tags.id = ${table}.tag_id WHERE ${table}.${idCol} = ?`,
      [targetId],
    )
  }

  async delete(tagId: string): Promise<void> {
    const tag = this.db.queryOne<Tag>('SELECT * FROM tags WHERE id = ?', [tagId])
    if (!tag) return
    const { docIds, noteIds } = this.taggedWith(tagId)

    // Remove from all junction tables
    this.db.transaction(() => {
      this.db.run('DELETE FROM doc_tags WHERE tag_id = ?', [tagId])
      this.db.run('DELETE FROM note_tags WHERE tag_id = ?', [tagId])
      this.db.run('DELETE FROM mindmap_tags WHERE tag_id = ?', [tagId])
      this.db.run('DELETE FROM tags WHERE id = ?', [tagId])
    })

    // Remove from tags.json and record a tombstone so the deletion syncs.
    await this.changeCatalog(async () => {
      const tags = await this.readTagsFile()
      await this.writeTagsFile(tags.filter(t => t.id !== tagId))
      await this.addTombstone(tag.name)
    })

    // Remove from the files of what carried it
    for (const id of docIds) {
      await this.docStore.update(id, (data) => {
        if (!data.tags?.includes(tag.name)) return false
        data.tags = data.tags.filter(t => t !== tag.name)
        data.updatedAt = new Date().toISOString()
      }).catch(() => {})
    }
    for (const id of noteIds) {
      await mutateNoteFile(this.db, this.fs, this.notesDir, id, (fileData) => {
        const noteTags: string[] = fileData.tags ?? []
        if (!noteTags.includes(tag.name)) return false
        fileData.tags = noteTags.filter(t => t !== tag.name)
        fileData.updatedAt = new Date().toISOString()
      }).catch(() => {})
    }
  }

  async rename(tagId: string, newName: string): Promise<void> {
    const tag = this.db.queryOne<Tag>('SELECT * FROM tags WHERE id = ?', [tagId])
    if (!tag) return

    const oldName = tag.name
    const { docIds, noteIds } = this.taggedWith(tagId)

    // Update DB
    this.db.run('UPDATE tags SET name = ? WHERE id = ?', [newName, tagId])

    // Update tags.json (bump updatedAt; renaming to a name clears its tombstone)
    await this.changeCatalog(async () => {
      const tags = await this.readTagsFile()
      const entry = tags.find(t => t.id === tagId)
      if (entry) { entry.name = newName; entry.updatedAt = Date.now() }
      await this.writeTagsFile(tags)
      await this.clearTombstone(newName)
    })

    // Update the files of what carries it
    for (const id of docIds) {
      await this.docStore.update(id, (data) => {
        if (!data.tags?.includes(oldName)) return false
        data.tags = data.tags.map(t => (t === oldName ? newName : t))
        data.updatedAt = new Date().toISOString()
      }).catch(() => {})
    }
    for (const id of noteIds) {
      await mutateNoteFile(this.db, this.fs, this.notesDir, id, (fileData) => {
        const noteTags: string[] = fileData.tags ?? []
        if (!noteTags.includes(oldName)) return false
        fileData.tags = noteTags.map(t => (t === oldName ? newName : t))
        fileData.updatedAt = new Date().toISOString()
      }).catch(() => {})
    }
  }

  async updateColor(tagId: string, color: string): Promise<void> {
    // Update DB
    this.db.run('UPDATE tags SET color = ? WHERE id = ?', [color, tagId])

    // Update tags.json (bump updatedAt)
    await this.changeCatalog(async () => {
      const tags = await this.readTagsFile()
      const entry = tags.find(t => t.id === tagId)
      if (entry) { entry.color = color; entry.updatedAt = Date.now() }
      await this.writeTagsFile(tags)
    })
  }

  /** Read → change → write of tags.json / tags-deleted.json, one at a time (sync's merge takes the same lock). */
  private changeCatalog(job: () => Promise<void>): Promise<void> {
    return tagCatalogLock.run(this.tagsFilePath, job)
  }

  /**
   * What carries a tag, from the index — a rename or delete then rewrites only
   * those files instead of reading every document and note in the library.
   */
  private taggedWith(tagId: string): { docIds: string[]; noteIds: string[] } {
    const docIds = this.db.query<{ id: string }>('SELECT doc_id AS id FROM doc_tags WHERE tag_id = ?', [tagId]).map(r => r.id)
    const noteIds = this.db.query<{ id: string }>(
      'SELECT note_id AS id FROM note_tags WHERE tag_id = ? UNION SELECT mindmap_id AS id FROM mindmap_tags WHERE tag_id = ?',
      [tagId, tagId]).map(r => r.id)
    return { docIds, noteIds }
  }

  async syncFromFiles(): Promise<void> {
    const tags = await this.readTagsFile()
    for (const t of tags) {
      this.db.run('INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, ?, ?)', [t.id, t.name, t.color])
    }

    const tagIdByName = new Map<string, string>()
    for (const t of this.db.query<{ id: string; name: string }>('SELECT id, name FROM tags')) {
      tagIdByName.set(t.name, t.id)
    }

    // Document JSON is sharded into two-char prefix folders — read it through
    // the store (a flat readdir of data/documents finds nothing).
    for (const doc of await this.docStore.listAll()) {
      for (const name of doc.tags ?? []) {
        const tagId = tagIdByName.get(name)
        if (tagId) this.db.run('INSERT OR IGNORE INTO doc_tags (doc_id, tag_id) VALUES (?, ?)', [doc.id, tagId])
      }
    }

    const notesDir = join(this.rootPath, '.banjuan', 'notes')
    if (await this.fs.exists(notesDir)) {
      const scanNotes = async (dir: string) => {
        const entries = await this.fs.readdirWithTypes(dir)
        for (const entry of entries) {
          if (entry.isDirectory) {
            await scanNotes(join(dir, entry.name))
          } else if (entry.name.endsWith('.json')) {
            try {
              const raw = await this.fs.readTextFile(join(dir, entry.name))
              const parsed = JSON.parse(raw)
              const meta = parsed.meta
              if (!meta?.id) continue
              const noteId = meta.id as string
              const noteType = (meta.type as string) ?? 'markdown'
              const noteTags: string[] = parsed.tags ?? []
              if (noteType === 'mindmap') {
                for (const name of noteTags) {
                  const tagId = tagIdByName.get(name)
                  if (tagId) {
                    this.db.run('INSERT OR IGNORE INTO mindmap_tags (mindmap_id, tag_id) VALUES (?, ?)', [noteId, tagId])
                  }
                }
              } else {
                for (const name of noteTags) {
                  const tagId = tagIdByName.get(name)
                  if (tagId) {
                    this.db.run('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', [noteId, tagId])
                  }
                }
              }
            } catch {}
          }
        }
      }
      await scanNotes(notesDir)
    }
  }

  async listWithCounts(): Promise<Array<Tag & { count: number }>> {
    return this.db.query<Tag & { count: number }>(
      `SELECT tags.*,
          (
            SELECT COUNT(*) FROM doc_tags WHERE doc_tags.tag_id = tags.id
          ) + (
            SELECT COUNT(*) FROM note_tags WHERE note_tags.tag_id = tags.id
          ) + (
            SELECT COUNT(*) FROM mindmap_tags WHERE mindmap_tags.tag_id = tags.id
          ) AS count
        FROM tags
        ORDER BY tags.name`,
    )
  }
}
