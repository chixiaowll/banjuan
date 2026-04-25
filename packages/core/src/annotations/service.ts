import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import type { Annotation, AnnotationCreateInput, AnnotationListOptions } from '../types.js'

export class AnnotationService {
  constructor(private db: Database.Database) {}

  async create(input: AnnotationCreateInput): Promise<Annotation> {
    const id = uuid()
    const now = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO annotations (id, doc_id, type, page, position, content, selected_text, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.docId, input.type, input.page ?? null,
        JSON.stringify(input.position), input.content ?? null,
        input.selectedText ?? null, input.color ?? 'yellow', now, now)

    return {
      id, docId: input.docId, type: input.type, page: input.page ?? null,
      position: input.position, content: input.content ?? null,
      selectedText: input.selectedText ?? null, color: input.color ?? 'yellow',
      createdAt: now, updatedAt: now,
    }
  }

  async list(options: AnnotationListOptions): Promise<Annotation[]> {
    let sql = 'SELECT * FROM annotations WHERE doc_id = ?'
    const params: unknown[] = [options.docId]

    if (options.page !== undefined) { sql += ' AND page = ?'; params.push(options.page) }
    if (options.type) { sql += ' AND type = ?'; params.push(options.type) }
    if (options.color) { sql += ' AND color = ?'; params.push(options.color) }

    sql += ' ORDER BY created_at ASC'
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>
    return rows.map(rowToAnnotation)
  }

  async get(id: string): Promise<Annotation | null> {
    const row = this.db.prepare('SELECT * FROM annotations WHERE id = ?').get(id) as
      | Record<string, unknown> | undefined
    return row ? rowToAnnotation(row) : null
  }

  async update(id: string, updates: { content?: string; color?: string }): Promise<Annotation> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]

    if (updates.content !== undefined) { sets.push('content = ?'); params.push(updates.content) }
    if (updates.color !== undefined) { sets.push('color = ?'); params.push(updates.color) }

    params.push(id)
    this.db.prepare(`UPDATE annotations SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    return (await this.get(id))!
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM annotations WHERE id = ?').run(id)
  }
}

function rowToAnnotation(row: Record<string, unknown>): Annotation {
  return {
    id: row.id as string, docId: row.doc_id as string,
    type: row.type as Annotation['type'], page: row.page as number | null,
    position: JSON.parse(row.position as string),
    content: row.content as string | null, selectedText: row.selected_text as string | null,
    color: row.color as string, createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}
