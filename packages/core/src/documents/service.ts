import type { PlatformDatabase, PlatformFS, PlatformCrypto } from '../platform/index.js'
import { join, relative, isAbsolute, dirname, basename } from '../platform/path.js'
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

    // Skip paths already imported into this DB.
    const existingByPath = this.db.queryOne<{ id: string }>('SELECT id FROM documents WHERE path = ?', [relPath])
    if (existingByPath) {
      throw new Error(`File already imported at path: ${relPath}`)
    }

    // Identify the document purely from its path — a directory scan never reads
    // or hashes file contents. Both `id` and `hash` derive from the path hash
    // (dedup is path-based; `hash`'s only consumer is a cosmetic detail field),
    // so importing is O(1) per file regardless of file size.
    const existing = await this.findExistingByPath(relPath)
    const type = detectDocumentType(absPath)
    const title = options?.title ?? existing?.title ?? extractTitle(absPath)
    const pathHash = await this.crypto.sha256(new TextEncoder().encode(relPath))
    const id = existing?.id ?? pathHash.slice(0, 32)
    const hash = existing?.hash ?? pathHash
    const now = new Date().toISOString()
    const tags = options?.tags ?? existing?.tags ?? []

    const fileData: DocumentFileData = {
      id, title, authors: existing?.authors ?? [], path: relPath, type, hash,
      tags, metadata: existing?.metadata ?? {}, createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    if (!existing) {
      await this.store.write(fileData)
    }

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
    const newMetadata = updates.metadata ? { ...existing.metadata, ...updates.metadata } : existing.metadata

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

  /** Raw document metadata straight from the JSON store (source of truth). */
  async listAllMetadata(): Promise<DocumentFileData[]> {
    return this.store.listAll()
  }

  /**
   * Permanently remove a document's metadata + index entry. Does NOT touch the
   * disk file (callers use this for documents whose file is already gone).
   * Annotations are handled separately by the caller (AnnotationService.deleteByDoc).
   */
  async purgeById(id: string): Promise<void> {
    await this.store.delete(id)
    this.search.removeById(id)
    this.db.run('DELETE FROM documents WHERE id = ?', [id])
    this.events.emit('document:deleted', { id })
  }

  /**
   * Reconcile the `fileMissing` flag against what is actually on disk, without
   * ever deleting metadata. A document whose file disappeared is flagged
   * missing (preserving its metadata + annotations); one whose file is back
   * has the flag cleared. Returns how many documents are currently missing.
   */
  async reconcileMissing(diskFiles: Set<string>): Promise<number> {
    // Drive from the (persisted) documents table, not the JSON store, so a
    // normal open does ZERO file reads here — only a document whose
    // missing-state actually flips pays for a single JSON+DB write.
    const rows = this.db.query<{ id: string; path: string; metadata: string }>('SELECT id, path, metadata FROM documents')
    let missing = 0
    for (const row of rows) {
      const onDisk = diskFiles.has(row.path)
      let flagged = false
      try { flagged = !!(JSON.parse(row.metadata || '{}') as Record<string, unknown>).fileMissing } catch { /* not flagged */ }
      if (!onDisk) {
        missing++
        if (!flagged) await this.setFileMissing(row.id, true)
      } else if (flagged) {
        await this.setFileMissing(row.id, false)
      }
    }
    return missing
  }

  /** Set/clear the fileMissing flag in both the JSON store (source of truth) and the DB row. */
  private async setFileMissing(id: string, missing: boolean): Promise<void> {
    const meta = await this.store.read(id)
    if (!meta) return
    const md: Record<string, unknown> = { ...(meta.metadata ?? {}) }
    if (missing) md.fileMissing = true
    else delete md.fileMissing
    meta.metadata = md
    await this.store.write(meta)
    this.db.run('UPDATE documents SET metadata = ? WHERE id = ?', [JSON.stringify(md), id])
  }

  async move(id: string, destDir: string): Promise<Document | null> {
    const doc = await this.get(id)
    if (!doc) return null

    const srcAbs = join(this.rootPath, doc.path)
    const destDirAbs = join(this.rootPath, destDir)
    await this.fs.mkdir(destDirAbs, { recursive: true })

    const fileName = basename(doc.path)
    const destAbs = join(destDirAbs, fileName)
    const newRelPath = relative(this.rootPath, destAbs)

    await this.fs.rename(srcAbs, destAbs)

    const now = new Date().toISOString()
    this.db.run('UPDATE documents SET path = ?, updated_at = ? WHERE id = ?', [newRelPath, now, id])

    const fileData = await this.store.read(id)
    if (fileData) {
      fileData.path = newRelPath
      fileData.updatedAt = now
      await this.store.write(fileData)
    }

    this.events.emit('document:moved', { id, from: doc.path, to: newRelPath })
    return { ...doc, path: newRelPath, updatedAt: now }
  }

  async createDir(dirPath: string): Promise<void> {
    const absPath = join(this.rootPath, dirPath)
    await this.fs.mkdir(absPath, { recursive: true })
  }

  async listDirs(): Promise<string[]> {
    const dirs = new Set<string>()
    const rows = this.db.query<{ path: string }>('SELECT DISTINCT path FROM documents', [])
    for (const row of rows) {
      const dir = dirname(row.path)
      if (dir && dir !== '.') dirs.add(dir)
    }
    const scan = async (dir: string, prefix: string) => {
      try {
        const entries = await this.fs.readdirWithTypes(dir)
        for (const e of entries) {
          if (e.isDirectory && !e.name.startsWith('.')) {
            const rel = prefix ? `${prefix}/${e.name}` : e.name
            dirs.add(rel)
            await scan(join(dir, e.name), rel)
          }
        }
      } catch {}
    }
    await scan(this.rootPath, '')
    return Array.from(dirs).sort()
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

  async deleteDir(dirPath: string): Promise<void> {
    const rows = this.db.query<{ id: string; path: string }>(
      'SELECT id, path FROM documents WHERE path LIKE ?', [dirPath + '/%'],
    )
    for (const row of rows) {
      await this.delete(row.id)
    }
    const absDir = join(this.rootPath, dirPath)
    if (await this.fs.exists(absDir)) {
      await this.fs.rmdir(absDir, { recursive: true })
    }
  }

  async markRead(id: string): Promise<void> {
    const now = new Date().toISOString()
    this.db.run('UPDATE documents SET last_read_at = ? WHERE id = ?', [now, id])
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
    lastReadAt: (row.last_read_at as string) || undefined,
  }
}
