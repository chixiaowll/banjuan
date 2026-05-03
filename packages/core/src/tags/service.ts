import type Database from 'better-sqlite3'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { Tag, TagTarget, DocumentFileData } from '../types.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'
import { parseFrontmatter, serializeFrontmatter } from '../storage/frontmatter.js'

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

  constructor(private db: Database.Database, private rootPath: string, private events: EventBus) {
    this.tagsFilePath = join(rootPath, '.banjuan', 'tags.json')
    this.docStore = new JsonStore(join(rootPath, '.banjuan', 'data', 'documents'))
  }

  private readTagsFile(): Array<{ id: string; name: string; color: string | null }> {
    if (!existsSync(this.tagsFilePath)) return []
    return JSON.parse(readFileSync(this.tagsFilePath, 'utf-8'))
  }

  private writeTagsFile(tags: Array<{ id: string; name: string; color: string | null }>): void {
    writeFileSync(this.tagsFilePath, JSON.stringify(tags, null, 2))
  }

  async create(input: { name: string; color?: string }): Promise<Tag> {
    const id = uuid()
    const color = input.color ?? autoColor(input.name)

    const tags = this.readTagsFile()
    tags.push({ id, name: input.name, color })
    this.writeTagsFile(tags)

    this.db.prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)').run(id, input.name, color)

    return { id, name: input.name, color }
  }

  async list(): Promise<Tag[]> {
    return this.db.prepare('SELECT * FROM tags ORDER BY name').all() as Tag[]
  }

  async assign(targetId: string, targetType: TagTarget, tagNames: string[]): Promise<void> {
    if (targetType === 'document') {
      const data = this.docStore.read(targetId)
      if (data) {
        data.tags = [...new Set([...data.tags, ...tagNames])]
        data.updatedAt = new Date().toISOString()
        this.docStore.write(data)
      }
    } else if (targetType === 'note') {
      const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(targetId) as { path: string } | undefined
      if (row) {
        const filePath = join(this.rootPath, '.banjuan', 'notes', row.path)
        if (existsSync(filePath)) {
          const raw = readFileSync(filePath, 'utf-8')
          const { data, content } = parseFrontmatter(raw)
          const existingTags = (data.tags as string[]) ?? []
          data.tags = [...new Set([...existingTags, ...tagNames])]
          data.updatedAt = new Date().toISOString()
          writeFileSync(filePath, serializeFrontmatter(data, content))
        }
      }
    } else if (targetType === 'mindmap') {
      const row = this.db.prepare('SELECT path FROM notes WHERE id = ? AND type = ?').get(targetId, 'mindmap') as { path: string } | undefined
      if (row) {
        const filePath = join(this.rootPath, '.banjuan', 'notes', row.path)
        if (existsSync(filePath)) {
          const raw = readFileSync(filePath, 'utf-8')
          const fileData = JSON.parse(raw)
          const existingTags: string[] = fileData.tags ?? []
          fileData.tags = [...new Set([...existingTags, ...tagNames])]
          fileData.updatedAt = new Date().toISOString()
          writeFileSync(filePath, JSON.stringify(fileData, null, 2))
        }
      }
    }

    const tableMap: Record<TagTarget, { table: string; idCol: string }> = {
      document: { table: 'doc_tags', idCol: 'doc_id' },
      note: { table: 'note_tags', idCol: 'note_id' },
      mindmap: { table: 'mindmap_tags', idCol: 'mindmap_id' },
    }
    const { table, idCol } = tableMap[targetType]
    const insertTag = this.db.prepare(`INSERT OR IGNORE INTO ${table} (${idCol}, tag_id) VALUES (?, ?)`)
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
    if (targetType === 'document') {
      const data = this.docStore.read(targetId)
      if (data) {
        data.tags = data.tags.filter(t => t !== tagName)
        data.updatedAt = new Date().toISOString()
        this.docStore.write(data)
      }
    } else if (targetType === 'note') {
      const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(targetId) as { path: string } | undefined
      if (row) {
        const filePath = join(this.rootPath, '.banjuan', 'notes', row.path)
        if (existsSync(filePath)) {
          const raw = readFileSync(filePath, 'utf-8')
          const { data, content } = parseFrontmatter(raw)
          data.tags = ((data.tags as string[]) ?? []).filter((t: string) => t !== tagName)
          data.updatedAt = new Date().toISOString()
          writeFileSync(filePath, serializeFrontmatter(data, content))
        }
      }
    } else if (targetType === 'mindmap') {
      const row = this.db.prepare('SELECT path FROM notes WHERE id = ? AND type = ?').get(targetId, 'mindmap') as { path: string } | undefined
      if (row) {
        const filePath = join(this.rootPath, '.banjuan', 'notes', row.path)
        if (existsSync(filePath)) {
          const raw = readFileSync(filePath, 'utf-8')
          const fileData = JSON.parse(raw)
          fileData.tags = ((fileData.tags as string[]) ?? []).filter((t: string) => t !== tagName)
          fileData.updatedAt = new Date().toISOString()
          writeFileSync(filePath, JSON.stringify(fileData, null, 2))
        }
      }
    }

    const tableMap: Record<TagTarget, { table: string; idCol: string }> = {
      document: { table: 'doc_tags', idCol: 'doc_id' },
      note: { table: 'note_tags', idCol: 'note_id' },
      mindmap: { table: 'mindmap_tags', idCol: 'mindmap_id' },
    }
    const { table, idCol } = tableMap[targetType]
    const tag = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName) as { id: string } | undefined
    if (tag) {
      this.db.prepare(`DELETE FROM ${table} WHERE ${idCol} = ? AND tag_id = ?`).run(targetId, tag.id)
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

    return this.db
      .prepare(`SELECT tags.* FROM tags JOIN ${table} ON tags.id = ${table}.tag_id WHERE ${table}.${idCol} = ?`)
      .all(targetId) as Tag[]
  }

  async delete(tagId: string): Promise<void> {
    const tag = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as Tag | undefined
    if (!tag) return

    // Remove from all junction tables
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM doc_tags WHERE tag_id = ?').run(tagId)
      this.db.prepare('DELETE FROM note_tags WHERE tag_id = ?').run(tagId)
      this.db.prepare('DELETE FROM mindmap_tags WHERE tag_id = ?').run(tagId)
      this.db.prepare('DELETE FROM tags WHERE id = ?').run(tagId)
    })()

    // Remove from tags.json
    const tags = this.readTagsFile()
    this.writeTagsFile(tags.filter(t => t.id !== tagId))

    // Remove from document files
    const docRows = this.db.prepare('SELECT id FROM documents').all() as { id: string }[]
    for (const { id } of docRows) {
      const data = this.docStore.read(id)
      if (data && data.tags.includes(tag.name)) {
        data.tags = data.tags.filter(t => t !== tag.name)
        data.updatedAt = new Date().toISOString()
        this.docStore.write(data)
      }
    }

    // Remove from note files (frontmatter)
    const noteRows = this.db.prepare("SELECT path FROM notes WHERE type != 'mindmap'").all() as { path: string }[]
    for (const { path } of noteRows) {
      const filePath = join(this.rootPath, '.banjuan', 'notes', path)
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf-8')
        const { data, content } = parseFrontmatter(raw)
        const noteTags = (data.tags as string[]) ?? []
        if (noteTags.includes(tag.name)) {
          data.tags = noteTags.filter(t => t !== tag.name)
          data.updatedAt = new Date().toISOString()
          writeFileSync(filePath, serializeFrontmatter(data, content))
        }
      }
    }

    // Remove from mindmap files (JSON)
    const mindmapRows = this.db.prepare("SELECT path FROM notes WHERE type = 'mindmap'").all() as { path: string }[]
    for (const { path } of mindmapRows) {
      const filePath = join(this.rootPath, '.banjuan', 'notes', path)
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf-8')
        const fileData = JSON.parse(raw)
        const mmTags: string[] = fileData.tags ?? []
        if (mmTags.includes(tag.name)) {
          fileData.tags = mmTags.filter(t => t !== tag.name)
          fileData.updatedAt = new Date().toISOString()
          writeFileSync(filePath, JSON.stringify(fileData, null, 2))
        }
      }
    }
  }

  async rename(tagId: string, newName: string): Promise<void> {
    const tag = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as Tag | undefined
    if (!tag) return

    const oldName = tag.name

    // Update DB
    this.db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(newName, tagId)

    // Update tags.json
    const tags = this.readTagsFile()
    const entry = tags.find(t => t.id === tagId)
    if (entry) entry.name = newName
    this.writeTagsFile(tags)

    // Update document files
    const docRows = this.db.prepare('SELECT id FROM documents').all() as { id: string }[]
    for (const { id } of docRows) {
      const data = this.docStore.read(id)
      if (data && data.tags.includes(oldName)) {
        data.tags = data.tags.map(t => (t === oldName ? newName : t))
        data.updatedAt = new Date().toISOString()
        this.docStore.write(data)
      }
    }

    // Update note files (frontmatter)
    const noteRows = this.db.prepare("SELECT path FROM notes WHERE type != 'mindmap'").all() as { path: string }[]
    for (const { path } of noteRows) {
      const filePath = join(this.rootPath, '.banjuan', 'notes', path)
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf-8')
        const { data, content } = parseFrontmatter(raw)
        const noteTags = (data.tags as string[]) ?? []
        if (noteTags.includes(oldName)) {
          data.tags = noteTags.map(t => (t === oldName ? newName : t))
          data.updatedAt = new Date().toISOString()
          writeFileSync(filePath, serializeFrontmatter(data, content))
        }
      }
    }

    // Update mindmap files (JSON)
    const mindmapRows = this.db.prepare("SELECT path FROM notes WHERE type = 'mindmap'").all() as { path: string }[]
    for (const { path } of mindmapRows) {
      const filePath = join(this.rootPath, '.banjuan', 'notes', path)
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf-8')
        const fileData = JSON.parse(raw)
        const mmTags: string[] = fileData.tags ?? []
        if (mmTags.includes(oldName)) {
          fileData.tags = mmTags.map(t => (t === oldName ? newName : t))
          fileData.updatedAt = new Date().toISOString()
          writeFileSync(filePath, JSON.stringify(fileData, null, 2))
        }
      }
    }
  }

  async updateColor(tagId: string, color: string): Promise<void> {
    // Update DB
    this.db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(color, tagId)

    // Update tags.json
    const tags = this.readTagsFile()
    const entry = tags.find(t => t.id === tagId)
    if (entry) entry.color = color
    this.writeTagsFile(tags)
  }

  async listWithCounts(): Promise<Array<Tag & { count: number }>> {
    return this.db
      .prepare(
        `SELECT tags.*,
          (
            SELECT COUNT(*) FROM doc_tags WHERE doc_tags.tag_id = tags.id
          ) + (
            SELECT COUNT(*) FROM note_tags WHERE note_tags.tag_id = tags.id
          ) + (
            SELECT COUNT(*) FROM mindmap_tags WHERE mindmap_tags.tag_id = tags.id
          ) AS count
        FROM tags
        ORDER BY tags.name`
      )
      .all() as Array<Tag & { count: number }>
  }
}
