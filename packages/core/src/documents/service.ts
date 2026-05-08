import type { PlatformDatabase, PlatformFS, PlatformCrypto } from '../platform/index.js'
import { join, relative, isAbsolute } from '../platform/path.js'
import type { Document, DocumentListOptions, DocumentFileData } from '../types.js'
import { detectDocumentType, extractTitle } from './metadata.js'
import type { SearchService } from '../search/service.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'

export class DocumentService {
  private store: JsonStore<DocumentFileData>

  constructor(
    private db: PlatformDatabase,
    private rootPath: string,
    private search: SearchService,
    private events: EventBus,
    private fs: PlatformFS,
    private crypto: PlatformCrypto,
  ) {
    this.store = new JsonStore(join(rootPath, '.banjuan', 'data', 'documents'), fs)
  }

  async import(
    filePath: string,
    options?: { title?: string; tags?: string[] },
  ): Promise<Document> {
    const absPath = isAbsolute(filePath) ? filePath : join(this.rootPath, filePath)
    if (!(await this.fs.exists(absPath))) {
      throw new Error(`File not found: ${absPath}`)
    }

    const relPath = relative(this.rootPath, absPath)
    if (relPath.startsWith('..')) {
      throw new Error('File must be inside the library directory')
    }

    const content = await this.fs.readFile(absPath)
    const hash = await this.crypto.sha256(content)

    const existingByPath = this.db.queryOne<{ id: string }>('SELECT id FROM documents WHERE path = ?', [relPath])
    if (existingByPath) {
      throw new Error(`File already imported at path: ${relPath}`)
    }

    const existing = await this.findExistingByPath(relPath)

    const type = detectDocumentType(absPath)
    const title = options?.title ?? existing?.title ?? extractTitle(absPath)
    const id = existing?.id ?? (await this.crypto.sha256(new TextEncoder().encode(relPath))).slice(0, 32)
    const now = new Date().toISOString()
    const tags = options?.tags ?? existing?.tags ?? []

    const fileData: DocumentFileData = {
      id, title, authors: existing?.authors ?? [], path: relPath, type, hash,
      tags, metadata: existing?.metadata ?? {}, createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    await this.store.write(fileData)

    this.db.run(
      `INSERT INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, JSON.stringify(fileData.authors), relPath, type, hash, JSON.stringify(fileData.metadata), fileData.createdAt, fileData.updatedAt],
    )

    this.search.index({ id, title, content: title, type: 'document' })

    const doc: Document = {
      id, title, authors: [], path: relPath, type, hash,
      metadata: {}, createdAt: now, updatedAt: now,
    }
    this.events.emit('document:imported', { document: doc })
    return doc
  }

  private async findExistingByPath(relPath: string): Promise<DocumentFileData | null> {
    for (const doc of await this.store.listAll()) {
      if (doc.path === relPath) return doc
    }
    return null
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

    const rows = this.db.query<Record<string, unknown>>(sql, params)
    return rows.map(rowToDocument)
  }

  async get(id: string): Promise<Document | null> {
    const row = this.db.queryOne<Record<string, unknown>>('SELECT * FROM documents WHERE id = ?', [id])
    return row ? rowToDocument(row) : null
  }

  async update(id: string, updates: { title?: string; authors?: string[]; metadata?: Record<string, unknown> }): Promise<Document | null> {
    const existing = await this.get(id)
    if (!existing) return null

    const now = new Date().toISOString()
    const newTitle = updates.title ?? existing.title
    const newAuthors = updates.authors ?? existing.authors
    const newMetadata = updates.metadata ?? existing.metadata

    this.db.run(
      `UPDATE documents SET title = ?, authors = ?, metadata = ?, updated_at = ? WHERE id = ?`,
      [newTitle, JSON.stringify(newAuthors), JSON.stringify(newMetadata), now, id],
    )

    const fileData = await this.store.read(id)
    if (fileData) {
      fileData.title = newTitle
      fileData.authors = newAuthors
      fileData.metadata = newMetadata
      fileData.updatedAt = now
      await this.store.write(fileData)
    }

    this.search.index({ id, title: newTitle, content: newTitle, type: 'document' })

    return { ...existing, title: newTitle, authors: newAuthors, metadata: newMetadata, updatedAt: now }
  }

  async purgeOrphanMetadata(diskFiles: Set<string>): Promise<number> {
    let removed = 0
    for (const meta of await this.store.listAll()) {
      if (!diskFiles.has(meta.path)) {
        await this.store.delete(meta.id)
        removed++
      }
    }
    return removed
  }

  async delete(id: string): Promise<void> {
    const doc = await this.get(id)
    if (!doc) return

    const absPath = join(this.rootPath, doc.path)
    if (await this.fs.exists(absPath)) {
      await this.fs.remove(absPath)
    }

    await this.store.delete(id)
    this.search.removeById(id)
    this.db.run('DELETE FROM documents WHERE id = ?', [id])
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
