import type Database from 'better-sqlite3'
import { copyFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { v4 as uuid } from 'uuid'
import type { Document, DocumentListOptions } from '../types.js'
import { detectDocumentType, extractTitle } from './metadata.js'
import type { SearchService } from '../search/service.js'

export class DocumentService {
  constructor(
    private db: Database.Database,
    private rootPath: string,
    private search: SearchService,
  ) {}

  async import(
    filePath: string,
    options?: { title?: string; tags?: string[] },
  ): Promise<Document> {
    const content = readFileSync(filePath)
    const hash = createHash('sha256').update(content).digest('hex')

    const existing = this.db
      .prepare('SELECT id FROM documents WHERE hash = ?')
      .get(hash) as { id: string } | undefined
    if (existing) {
      throw new Error(`File already imported (id: ${existing.id})`)
    }

    const type = detectDocumentType(filePath)
    const title = options?.title ?? extractTitle(filePath)
    const id = uuid()
    const fileName = `${id}-${basename(filePath)}`
    const relativePath = fileName

    copyFileSync(filePath, join(this.rootPath, 'documents', fileName))

    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
         VALUES (?, ?, '[]', ?, ?, ?, '{}', ?, ?)`,
      )
      .run(id, title, relativePath, type, hash, now, now)

    this.search.index({ id, title, content: title, type: 'document' })

    return {
      id, title, authors: [], path: relativePath, type, hash,
      metadata: {}, createdAt: now, updatedAt: now,
    }
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

    const filePath = join(this.rootPath, 'documents', doc.path)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }

    this.search.removeById(id)
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id)
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
