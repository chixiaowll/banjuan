import type Database from 'better-sqlite3'
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { Note, NoteCreateInput, NoteListOptions, Annotation } from '../types.js'
import type { SearchService } from '../search/service.js'

export class NoteService {
  constructor(
    private db: Database.Database,
    private rootPath: string,
    private search: SearchService,
  ) {}

  async create(input: NoteCreateInput): Promise<Note> {
    const id = uuid()
    const now = new Date().toISOString()
    const slug = input.title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '')
    const relativePath = `${slug}-${id.slice(0, 8)}.md`
    const fullPath = join(this.rootPath, 'notes', relativePath)

    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, input.content ?? '')

    this.db
      .prepare(`INSERT INTO notes (id, title, path, doc_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, input.title, relativePath, input.docId ?? null, now, now)

    if (input.annotationIds?.length) {
      const insertLink = this.db.prepare('INSERT INTO note_annotations (note_id, annotation_id) VALUES (?, ?)')
      for (const annId of input.annotationIds) { insertLink.run(id, annId) }
    }

    return { id, title: input.title, path: relativePath, docId: input.docId ?? null, content: input.content ?? '', createdAt: now, updatedAt: now }
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
    const filePath = join(this.rootPath, 'notes', note.path)
    if (existsSync(filePath)) { note.content = readFileSync(filePath, 'utf-8') }
    return note
  }

  async update(id: string, updates: { title?: string; content?: string }): Promise<Note> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]

    if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
    params.push(id)
    this.db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...params)

    if (updates.content !== undefined) {
      const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(id) as { path: string }
      writeFileSync(join(this.rootPath, 'notes', row.path), updates.content)
    }

    return (await this.get(id))!
  }

  async delete(id: string): Promise<void> {
    const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(id) as { path: string } | undefined
    if (!row) return
    const filePath = join(this.rootPath, 'notes', row.path)
    if (existsSync(filePath)) { unlinkSync(filePath) }
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
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
