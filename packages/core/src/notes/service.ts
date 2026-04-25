import type Database from 'better-sqlite3'
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { Note, NoteCreateInput, NoteListOptions, Annotation, NoteFileData } from '../types.js'
import type { SearchService } from '../search/service.js'
import type { EventBus } from '../events/bus.js'
import { parseFrontmatter, serializeFrontmatter } from '../storage/frontmatter.js'

function titleToFilename(title: string): string {
  const safe = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
  return `${safe || 'untitled'}.md`
}

function uniqueFilename(dir: string, filename: string): string {
  if (!existsSync(join(dir, filename))) return filename
  const ext = '.md'
  const base = filename.slice(0, -ext.length)
  let i = 2
  while (existsSync(join(dir, `${base} ${i}${ext}`))) i++
  return `${base} ${i}${ext}`
}

export class NoteService {
  private notesDir: string

  constructor(
    private db: Database.Database,
    private rootPath: string,
    private search: SearchService,
    private events: EventBus,
  ) {
    this.notesDir = join(rootPath, 'notes')
  }

  async create(input: NoteCreateInput): Promise<Note> {
    const id = uuid()
    const now = new Date().toISOString()
    const filename = uniqueFilename(this.notesDir, titleToFilename(input.title))
    const fullPath = join(this.notesDir, filename)

    mkdirSync(this.notesDir, { recursive: true })

    const frontmatterData: NoteFileData = {
      id,
      title: input.title,
      docId: input.docId ?? null,
      annotationIds: input.annotationIds ?? [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    }

    const mdContent = serializeFrontmatter(frontmatterData as unknown as Record<string, unknown>, input.content ?? '')
    writeFileSync(fullPath, mdContent)

    this.db.prepare(`INSERT INTO notes (id, title, path, doc_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, input.title, filename, input.docId ?? null, now, now)

    this.search.index({ id, title: input.title, content: input.content ?? '', type: 'note' })

    if (input.annotationIds?.length) {
      const insertLink = this.db.prepare('INSERT INTO note_annotations (note_id, annotation_id) VALUES (?, ?)')
      for (const annId of input.annotationIds) { insertLink.run(id, annId) }
    }

    const note: Note = { id, title: input.title, path: filename, docId: input.docId ?? null, content: input.content ?? '', createdAt: now, updatedAt: now }
    this.events.emit('note:created', { note })
    return note
  }

  async list(options?: NoteListOptions): Promise<Note[]> {
    let sql = 'SELECT * FROM notes'
    const params: unknown[] = []
    const conditions: string[] = []
    if (options?.docId) { conditions.push('doc_id = ?'); params.push(options.docId) }
    if (options?.tag) {
      conditions.push('id IN (SELECT note_id FROM note_tags JOIN tags ON tags.id = note_tags.tag_id WHERE tags.name = ?)')
      params.push(options.tag)
    }
    if (conditions.length) { sql += ` WHERE ${conditions.join(' AND ')}` }
    const sort = options?.sort ?? 'created_at'
    const order = options?.order ?? 'desc'
    sql += ` ORDER BY ${sort} ${order}`
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>
    return rows.map((row) => this.rowToNote(row))
  }

  async get(id: string): Promise<Note | null> {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const note = this.rowToNote(row)
    const filePath = join(this.notesDir, note.path)
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8')
      const { content } = parseFrontmatter(raw)
      note.content = content
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

    const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(id) as { path: string }
    const filePath = join(this.notesDir, row.path)
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8')
      const { data, content } = parseFrontmatter(raw)
      if (updates.title !== undefined) data.title = updates.title
      data.updatedAt = now
      const newContent = updates.content !== undefined ? updates.content : content
      writeFileSync(filePath, serializeFrontmatter(data, newContent))
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
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    this.events.emit('note:deleted', { id })
  }

  async getAnnotations(noteId: string): Promise<Annotation[]> {
    const rows = this.db
      .prepare(`SELECT a.* FROM annotations a JOIN note_annotations na ON a.id = na.annotation_id WHERE na.note_id = ?`)
      .all(noteId) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id: row.id as string, docId: row.doc_id as string,
      type: row.type as Annotation['type'], page: row.page as number | null,
      position: JSON.parse(row.position as string),
      content: row.content as string | null, selectedText: row.selected_text as string | null,
      color: row.color as string, createdAt: row.created_at as string, updatedAt: row.updated_at as string,
    }))
  }

  private rowToNote(row: Record<string, unknown>): Note {
    return {
      id: row.id as string, title: row.title as string, path: row.path as string,
      docId: row.doc_id as string | null, content: '',
      createdAt: row.created_at as string, updatedAt: row.updated_at as string,
    }
  }
}
