import type { PlatformDatabase, PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'
import { v4 as uuid } from 'uuid'
import type { Annotation, AnnotationCreateInput, AnnotationListOptions, AnnotationFileData } from '../types.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'

export class AnnotationService {
  private store: JsonStore<AnnotationFileData>

  constructor(private db: PlatformDatabase, rootPath: string, private events: EventBus, fs: PlatformFS) {
    this.store = new JsonStore(join(rootPath, '.banjuan', 'data', 'annotations'), fs)
  }

  async create(input: AnnotationCreateInput): Promise<Annotation> {
    const id = uuid()
    const now = new Date().toISOString()
    const color = input.color ?? 'yellow'

    const fileData: AnnotationFileData = {
      id, docId: input.docId, type: input.type, page: input.page ?? null,
      position: input.position, content: input.content ?? null,
      selectedText: input.selectedText ?? null, color, createdAt: now, updatedAt: now,
    }
    await this.store.write(fileData)

    this.db.run(
      `INSERT INTO annotations (id, doc_id, type, page, position, content, selected_text, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.docId, input.type, input.page ?? null,
        JSON.stringify(input.position), input.content ?? null,
        input.selectedText ?? null, color, now, now],
    )

    const annotation: Annotation = {
      id, docId: input.docId, type: input.type, page: input.page ?? null,
      position: input.position, content: input.content ?? null,
      selectedText: input.selectedText ?? null, color, createdAt: now, updatedAt: now,
    }
    this.events.emit('annotation:created', { annotation })
    return annotation
  }

  async list(options: AnnotationListOptions): Promise<Annotation[]> {
    let sql = 'SELECT * FROM annotations WHERE doc_id = ?'
    const params: unknown[] = [options.docId]
    if (options.page !== undefined) { sql += ' AND page = ?'; params.push(options.page) }
    if (options.type) { sql += ' AND type = ?'; params.push(options.type) }
    if (options.color) { sql += ' AND color = ?'; params.push(options.color) }
    sql += ' ORDER BY created_at ASC'
    const rows = this.db.query<Record<string, unknown>>(sql, params)
    return rows.map(rowToAnnotation)
  }

  async get(id: string): Promise<Annotation | null> {
    const row = this.db.queryOne<Record<string, unknown>>('SELECT * FROM annotations WHERE id = ?', [id])
    return row ? rowToAnnotation(row) : null
  }

  async update(id: string, updates: { content?: string; color?: string; position?: unknown }): Promise<Annotation> {
    const now = new Date().toISOString()

    const fileData = await this.store.read(id)
    if (fileData) {
      if (updates.content !== undefined) fileData.content = updates.content
      if (updates.color !== undefined) fileData.color = updates.color
      if (updates.position !== undefined) fileData.position = updates.position as any
      fileData.updatedAt = now
      await this.store.write(fileData)
    }

    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (updates.content !== undefined) { sets.push('content = ?'); params.push(updates.content) }
    if (updates.color !== undefined) { sets.push('color = ?'); params.push(updates.color) }
    if (updates.position !== undefined) { sets.push('position = ?'); params.push(JSON.stringify(updates.position)) }
    params.push(id)
    this.db.run(`UPDATE annotations SET ${sets.join(', ')} WHERE id = ?`, params)

    const annotation = (await this.get(id))!
    this.events.emit('annotation:updated', { annotation })
    return annotation
  }

  async delete(id: string): Promise<void> {
    const ann = this.db.queryOne<{ doc_id: string }>('SELECT doc_id FROM annotations WHERE id = ?', [id])
    await this.store.delete(id)
    this.db.run('DELETE FROM annotations WHERE id = ?', [id])
    if (ann) this.events.emit('annotation:deleted', { id, docId: ann.doc_id })
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
