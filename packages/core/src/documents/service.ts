import type Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { v4 as uuid } from 'uuid'
import type { Document, DocumentListOptions, DocumentFileData } from '../types.js'
import { detectDocumentType, extractTitle } from './metadata.js'
import type { SearchService } from '../search/service.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'

export class DocumentService {
  private store: JsonStore<DocumentFileData>

  constructor(
    private db: Database.Database,
    private rootPath: string,
    private search: SearchService,
    private events: EventBus,
  ) {
    this.store = new JsonStore(join(rootPath, '.banjuan', 'data', 'documents'))
  }

  async import(
    filePath: string,
    options?: { title?: string; tags?: string[] },
  ): Promise<Document> {
    const absPath = isAbsolute(filePath) ? filePath : join(this.rootPath, filePath)
    if (!existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`)
    }

    const relPath = relative(this.rootPath, absPath)
    if (relPath.startsWith('..')) {
      throw new Error('File must be inside the library directory')
    }

    const content = readFileSync(absPath)
    const hash = createHash('sha256').update(content).digest('hex')

    const existing = this.db
      .prepare('SELECT id FROM documents WHERE hash = ?')
      .get(hash) as { id: string } | undefined
    if (existing) {
      throw new Error(`File already imported (id: ${existing.id})`)
    }

    const type = detectDocumentType(absPath)
    const title = options?.title ?? extractTitle(absPath)
    const id = uuid()
    const now = new Date().toISOString()
    const tags = options?.tags ?? []

    const fileData: DocumentFileData = {
      id, title, authors: [], path: relPath, type, hash,
      tags, metadata: {}, createdAt: now, updatedAt: now,
    }
    this.store.write(fileData)

    this.db
      .prepare(
        `INSERT INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
         VALUES (?, ?, '[]', ?, ?, ?, '{}', ?, ?)`,
      )
      .run(id, title, relPath, type, hash, now, now)

    this.search.index({ id, title, content: title, type: 'document' })

    const doc: Document = {
      id, title, authors: [], path: relPath, type, hash,
      metadata: {}, createdAt: now, updatedAt: now,
    }
    this.events.emit('document:imported', { document: doc })
    return doc
  }

  async list(options?: DocumentListOptions): Promise<Document[]> {
    let sql = 'SELECT * FROM documents'
    const params: unknown[] = []

    if (options?.tag) {
      sql += ' WHERE id IN (SELECT doc_id FROM doc_tags JOIN tags ON tags.id = doc_tags.tag_id WHERE tags.name = ?)'
      params.push(options.tag)
    }

    if (options?.type) {
      sql += params.length ? ' AND' : ' WHERE'
      sql += ' type = ?'
      params.push(options.type)
    }

    const sort = options?.sort ?? 'created_at'
    const order = options?.order ?? 'desc'
    sql += ` ORDER BY ${sort} ${order}`

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>
    return rows.map(rowToDocument)
  }

  async get(id: string): Promise<Document | null> {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return row ? rowToDocument(row) : null
  }

  async delete(id: string): Promise<void> {
    const doc = await this.get(id)
    if (!doc) return

    this.store.delete(id)
    this.search.removeById(id)
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id)
    this.events.emit('document:deleted', { id })
  }
}

function rowToDocument(row: Record<string, unknown>): Document {
  return {
    id: row.id as string,
    title: row.title as string,
    authors: JSON.parse((row.authors as string) || '[]'),
    path: row.path as string,
    type: row.type as Document['type'],
    hash: row.hash as string,
    metadata: JSON.parse((row.metadata as string) || '{}'),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}
