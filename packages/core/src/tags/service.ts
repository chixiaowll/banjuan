import type Database from 'better-sqlite3'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { Tag, TagTarget, DocumentFileData, MindmapFileData } from '../types.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'
import { parseFrontmatter, serializeFrontmatter } from '../storage/frontmatter.js'

export class TagService {
  private tagsFilePath: string
  private docStore: JsonStore<DocumentFileData>
  private mindmapStore: JsonStore<MindmapFileData>

  constructor(private db: Database.Database, private rootPath: string, private events: EventBus) {
    this.tagsFilePath = join(rootPath, '.banjuan', 'tags.json')
    this.docStore = new JsonStore(join(rootPath, '.banjuan', 'data', 'documents'))
    this.mindmapStore = new JsonStore(join(rootPath, '.banjuan', 'data', 'mindmaps'))
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
    const color = input.color ?? null

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
        const filePath = join(this.rootPath, 'notes', row.path)
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
      const data = this.mindmapStore.read(targetId)
      if (data) {
        data.tags = [...new Set([...data.tags, ...tagNames])]
        data.updatedAt = new Date().toISOString()
        this.mindmapStore.write(data)
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
        const filePath = join(this.rootPath, 'notes', row.path)
        if (existsSync(filePath)) {
          const raw = readFileSync(filePath, 'utf-8')
          const { data, content } = parseFrontmatter(raw)
          data.tags = ((data.tags as string[]) ?? []).filter((t: string) => t !== tagName)
          data.updatedAt = new Date().toISOString()
          writeFileSync(filePath, serializeFrontmatter(data, content))
        }
      }
    } else if (targetType === 'mindmap') {
      const data = this.mindmapStore.read(targetId)
      if (data) {
        data.tags = data.tags.filter(t => t !== tagName)
        data.updatedAt = new Date().toISOString()
        this.mindmapStore.write(data)
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
}
