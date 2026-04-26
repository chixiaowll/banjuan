import type Database from 'better-sqlite3'
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { Note, NoteCreateInput, NoteListOptions, Annotation, NoteFileData } from '../types.js'
import type { SearchService } from '../search/service.js'
import type { EventBus } from '../events/bus.js'
import type { TemplateService } from './template-service.js'
import type { NoteLinkService } from './link-service.js'

interface NoteJsonFile {
  meta: NoteFileData
  blocks: unknown[]
}

export class NoteService {
  private notesDir: string
  private templateService: TemplateService | null = null
  private linkService: NoteLinkService | null = null

  constructor(
    private db: Database.Database,
    private rootPath: string,
    private search: SearchService,
    private events: EventBus,
  ) {
    this.notesDir = join(rootPath, '.banjuan', 'notes')
  }

  setTemplateService(svc: TemplateService): void { this.templateService = svc }
  setLinkService(svc: NoteLinkService): void { this.linkService = svc }

  async create(input: NoteCreateInput): Promise<Note> {
    const id = uuid()
    const now = new Date().toISOString()
    mkdirSync(this.notesDir, { recursive: true })

    let blocks: unknown[] = []
    if (input.templateId && this.templateService) {
      const tpl = await this.templateService.get(input.templateId)
      if (tpl) blocks = JSON.parse(tpl.content)
    }
    if (input.content) {
      try { blocks = JSON.parse(input.content) } catch { blocks = [] }
    }

    const filename = `${id}.json`
    const fullPath = join(this.notesDir, filename)

    const meta: NoteFileData = {
      id, title: input.title, docId: input.docId ?? null,
      folderId: input.folderId ?? null, annotationIds: input.annotationIds ?? [],
      tags: [], contentFormat: 'json', createdAt: now, updatedAt: now,
    }

    writeFileSync(fullPath, JSON.stringify({ meta, blocks }, null, 2))

    this.db.prepare(
      'INSERT INTO notes (id, title, path, doc_id, folder_id, content_format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, input.title, filename, input.docId ?? null, input.folderId ?? null, 'json', now, now)

    this.search.index({ id, title: input.title, content: this.blocksToText(blocks), type: 'note' })

    if (input.annotationIds?.length) {
      const insertLink = this.db.prepare('INSERT INTO note_annotations (note_id, annotation_id) VALUES (?, ?)')
      for (const annId of input.annotationIds) { insertLink.run(id, annId) }
    }

    const note: Note = {
      id, title: input.title, path: filename, docId: input.docId ?? null,
      folderId: input.folderId ?? null, content: JSON.stringify(blocks),
      contentFormat: 'json', createdAt: now, updatedAt: now,
    }
    this.events.emit('note:created', { note })
    return note
  }

  async list(options?: NoteListOptions): Promise<Note[]> {
    let sql = 'SELECT * FROM notes'
    const params: unknown[] = []
    const conditions: string[] = []
    if (options?.docId) { conditions.push('doc_id = ?'); params.push(options.docId) }
    if (options?.folderId) { conditions.push('folder_id = ?'); params.push(options.folderId) }
    if (options?.tag) {
      conditions.push('id IN (SELECT note_id FROM note_tags JOIN tags ON tags.id = note_tags.tag_id WHERE tags.name = ?)')
      params.push(options.tag)
    }
    if (conditions.length) { sql += ` WHERE ${conditions.join(' AND ')}` }
    const sort = options?.sort ?? 'created_at'
    const order = options?.order ?? 'desc'
    sql += ` ORDER BY ${sort} ${order}`
    return (this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(r => this.rowToNote(r))
  }

  async get(id: string): Promise<Note | null> {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const note = this.rowToNote(row)
    const filePath = join(this.notesDir, note.path)
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8')
      if (note.contentFormat === 'json') {
        const parsed = JSON.parse(raw) as NoteJsonFile
        note.content = JSON.stringify(parsed.blocks)
      } else {
        const { parseFrontmatter } = await import('../storage/frontmatter.js')
        const { content } = parseFrontmatter(raw)
        note.content = content
      }
    }
    return note
  }

  async update(id: string, updates: { title?: string; content?: string }): Promise<Note> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
    params.push(id)
    this.db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...params)

    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, unknown>
    const filePath = join(this.notesDir, row.path as string)

    if (existsSync(filePath) && (row.content_format as string) === 'json') {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as NoteJsonFile
      if (updates.title !== undefined) raw.meta.title = updates.title
      raw.meta.updatedAt = now
      if (updates.content !== undefined) {
        try { raw.blocks = JSON.parse(updates.content) } catch { raw.blocks = [] }
      }
      writeFileSync(filePath, JSON.stringify(raw, null, 2))
    }

    const note = (await this.get(id))!
    this.events.emit('note:updated', { note })
    return note
  }

  async move(id: string, folderId: string | null): Promise<Note> {
    const now = new Date().toISOString()
    this.db.prepare('UPDATE notes SET folder_id = ?, updated_at = ? WHERE id = ?').run(folderId, now, id)
    const filePath = join(this.notesDir, `${id}.json`)
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as NoteJsonFile
      raw.meta.folderId = folderId
      raw.meta.updatedAt = now
      writeFileSync(filePath, JSON.stringify(raw, null, 2))
    }
    const note = (await this.get(id))!
    this.events.emit('note:updated', { note })
    return note
  }

  async delete(id: string): Promise<void> {
    const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(id) as { path: string } | undefined
    if (!row) return
    const filePath = join(this.notesDir, row.path)
    if (existsSync(filePath)) { unlinkSync(filePath) }
    this.search.removeById(id)
    if (this.linkService) { await this.linkService.removeAllForNote(id) }
    this.db.prepare('DELETE FROM note_annotations WHERE note_id = ?').run(id)
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    this.events.emit('note:deleted', { id })
  }

  async getAnnotations(noteId: string): Promise<Annotation[]> {
    const rows = this.db
      .prepare('SELECT a.* FROM annotations a JOIN note_annotations na ON a.id = na.annotation_id WHERE na.note_id = ?')
      .all(noteId) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id: row.id as string, docId: row.doc_id as string,
      type: row.type as Annotation['type'], page: row.page as number | null,
      position: JSON.parse(row.position as string),
      content: row.content as string | null, selectedText: row.selected_text as string | null,
      color: row.color as string, createdAt: row.created_at as string, updatedAt: row.updated_at as string,
    }))
  }

  private blocksToText(blocks: unknown[]): string {
    const texts: string[] = []
    const extract = (obj: unknown) => {
      if (!obj || typeof obj !== 'object') return
      const o = obj as Record<string, unknown>
      if ('text' in o && typeof o.text === 'string') texts.push(o.text)
      if ('content' in o && Array.isArray(o.content)) o.content.forEach(extract)
      if ('children' in o && Array.isArray(o.children)) o.children.forEach(extract)
    }
    blocks.forEach(extract)
    return texts.join(' ')
  }

  private rowToNote(row: Record<string, unknown>): Note {
    return {
      id: row.id as string, title: row.title as string, path: row.path as string,
      docId: row.doc_id as string | null, folderId: row.folder_id as string | null,
      content: '', contentFormat: (row.content_format as 'json' | 'markdown') ?? 'json',
      createdAt: row.created_at as string, updatedAt: row.updated_at as string,
    }
  }
}
