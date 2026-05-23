import type { PlatformDatabase, PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'
import { v4 as uuid } from 'uuid'
import type { Tag, TagTarget, DocumentFileData } from '../types.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'


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
  private docStore: JsonStore<DocumentFileData>

  constructor(private db: PlatformDatabase, private rootPath: string, private events: EventBus, private fs: PlatformFS) {
    this.tagsFilePath = join(rootPath, '.banjuan', 'tags.json')
    this.docStore = new JsonStore(join(rootPath, '.banjuan', 'data', 'documents'), fs)
  }

  private async readTagsFile(): Promise<Array<{ id: string; name: string; color: string | null }>> {
    if (!(await this.fs.exists(this.tagsFilePath))) return []
    return JSON.parse(await this.fs.readTextFile(this.tagsFilePath))
  }

  private async writeTagsFile(tags: Array<{ id: string; name: string; color: string | null }>): Promise<void> {
    await this.fs.writeTextFile(this.tagsFilePath, JSON.stringify(tags, null, 2))
  }

  async create(input: { name: string; color?: string }): Promise<Tag> {
    const id = uuid()
    const color = input.color ?? autoColor(input.name)

    const tags = await this.readTagsFile()
    tags.push({ id, name: input.name, color })
    await this.writeTagsFile(tags)

    this.db.run('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', [id, input.name, color])

    return { id, name: input.name, color }
  }

  async list(): Promise<Tag[]> {
    return this.db.query<Tag>('SELECT * FROM tags ORDER BY name')
  }

  async assign(targetId: string, targetType: TagTarget, tagNames: string[]): Promise<void> {
    if (targetType === 'document') {
      const data = await this.docStore.read(targetId)
      if (data) {
        data.tags = [...new Set([...data.tags, ...tagNames])]
        data.updatedAt = new Date().toISOString()
        await this.docStore.write(data)
      }
    } else if (targetType === 'note' || targetType === 'mindmap') {
      const queryCondition = targetType === 'mindmap'
        ? 'SELECT path FROM notes WHERE id = ? AND type = ?'
        : 'SELECT path FROM notes WHERE id = ?'
      const queryParams = targetType === 'mindmap' ? [targetId, 'mindmap'] : [targetId]
      const row = this.db.queryOne<{ path: string }>(queryCondition, queryParams)
      if (row) {
        const filePath = join(this.rootPath, '.banjuan', 'notes', row.path)
        if (await this.fs.exists(filePath)) {
          const raw = await this.fs.readTextFile(filePath)
          const fileData = JSON.parse(raw)
          const existingTags: string[] = fileData.tags ?? []
          fileData.tags = [...new Set([...existingTags, ...tagNames])]
          fileData.updatedAt = new Date().toISOString()
          await this.fs.writeTextFile(filePath, JSON.stringify(fileData, null, 2))
        }
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
      const data = await this.docStore.read(targetId)
      if (data) {
        data.tags = data.tags.filter(t => t !== tagName)
        data.updatedAt = new Date().toISOString()
        await this.docStore.write(data)
      }
    } else if (targetType === 'note' || targetType === 'mindmap') {
      const queryCondition = targetType === 'mindmap'
        ? 'SELECT path FROM notes WHERE id = ? AND type = ?'
        : 'SELECT path FROM notes WHERE id = ?'
      const queryParams = targetType === 'mindmap' ? [targetId, 'mindmap'] : [targetId]
      const row = this.db.queryOne<{ path: string }>(queryCondition, queryParams)
      if (row) {
        const filePath = join(this.rootPath, '.banjuan', 'notes', row.path)
        if (await this.fs.exists(filePath)) {
          const raw = await this.fs.readTextFile(filePath)
          const fileData = JSON.parse(raw)
          fileData.tags = ((fileData.tags as string[]) ?? []).filter((t: string) => t !== tagName)
          fileData.updatedAt = new Date().toISOString()
          await this.fs.writeTextFile(filePath, JSON.stringify(fileData, null, 2))
        }
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

    // Remove from all junction tables
    this.db.transaction(() => {
      this.db.run('DELETE FROM doc_tags WHERE tag_id = ?', [tagId])
      this.db.run('DELETE FROM note_tags WHERE tag_id = ?', [tagId])
      this.db.run('DELETE FROM mindmap_tags WHERE tag_id = ?', [tagId])
      this.db.run('DELETE FROM tags WHERE id = ?', [tagId])
    })

    // Remove from tags.json
    const tags = await this.readTagsFile()
    await this.writeTagsFile(tags.filter(t => t.id !== tagId))

    // Remove from document files
    const docRows = this.db.query<{ id: string }>('SELECT id FROM documents')
    for (const { id } of docRows) {
      const data = await this.docStore.read(id)
      if (data && data.tags.includes(tag.name)) {
        data.tags = data.tags.filter(t => t !== tag.name)
        data.updatedAt = new Date().toISOString()
        await this.docStore.write(data)
      }
    }

    // Remove from note/mindmap files (JSON)
    const noteRows = this.db.query<{ path: string }>('SELECT path FROM notes')
    for (const { path } of noteRows) {
      const filePath = join(this.rootPath, '.banjuan', 'notes', path)
      if (await this.fs.exists(filePath)) {
        try {
          const raw = await this.fs.readTextFile(filePath)
          const fileData = JSON.parse(raw)
          const noteTags: string[] = fileData.tags ?? []
          if (noteTags.includes(tag.name)) {
            fileData.tags = noteTags.filter(t => t !== tag.name)
            fileData.updatedAt = new Date().toISOString()
            await this.fs.writeTextFile(filePath, JSON.stringify(fileData, null, 2))
          }
        } catch {}
      }
    }
  }

  async rename(tagId: string, newName: string): Promise<void> {
    const tag = this.db.queryOne<Tag>('SELECT * FROM tags WHERE id = ?', [tagId])
    if (!tag) return

    const oldName = tag.name

    // Update DB
    this.db.run('UPDATE tags SET name = ? WHERE id = ?', [newName, tagId])

    // Update tags.json
    const tags = await this.readTagsFile()
    const entry = tags.find(t => t.id === tagId)
    if (entry) entry.name = newName
    await this.writeTagsFile(tags)

    // Update document files
    const docRows = this.db.query<{ id: string }>('SELECT id FROM documents')
    for (const { id } of docRows) {
      const data = await this.docStore.read(id)
      if (data && data.tags.includes(oldName)) {
        data.tags = data.tags.map(t => (t === oldName ? newName : t))
        data.updatedAt = new Date().toISOString()
        await this.docStore.write(data)
      }
    }

    // Update note/mindmap files (JSON)
    const noteRows = this.db.query<{ path: string }>('SELECT path FROM notes')
    for (const { path } of noteRows) {
      const filePath = join(this.rootPath, '.banjuan', 'notes', path)
      if (await this.fs.exists(filePath)) {
        try {
          const raw = await this.fs.readTextFile(filePath)
          const fileData = JSON.parse(raw)
          const noteTags: string[] = fileData.tags ?? []
          if (noteTags.includes(oldName)) {
            fileData.tags = noteTags.map(t => (t === oldName ? newName : t))
            fileData.updatedAt = new Date().toISOString()
            await this.fs.writeTextFile(filePath, JSON.stringify(fileData, null, 2))
          }
        } catch {}
      }
    }
  }

  async updateColor(tagId: string, color: string): Promise<void> {
    // Update DB
    this.db.run('UPDATE tags SET color = ? WHERE id = ?', [color, tagId])

    // Update tags.json
    const tags = await this.readTagsFile()
    const entry = tags.find(t => t.id === tagId)
    if (entry) entry.color = color
    await this.writeTagsFile(tags)
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

    const docDataDir = join(this.rootPath, '.banjuan', 'data', 'documents')
    if (await this.fs.exists(docDataDir)) {
      const entries = await this.fs.readdirWithTypes(docDataDir)
      for (const entry of entries) {
        if (!entry.isDirectory && entry.name.endsWith('.json')) {
          try {
            const raw = JSON.parse(await this.fs.readTextFile(join(docDataDir, entry.name)))
            const docId = raw.id as string
            const docTags = (raw.tags as string[]) ?? []
            for (const name of docTags) {
              const tagId = tagIdByName.get(name)
              if (tagId) {
                this.db.run('INSERT OR IGNORE INTO doc_tags (doc_id, tag_id) VALUES (?, ?)', [docId, tagId])
              }
            }
          } catch {}
        }
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
