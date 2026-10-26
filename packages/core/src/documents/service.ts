import type { PlatformDatabase, PlatformFS, PlatformCrypto } from '../platform/index.js'
import { join, relative, isAbsolute, dirname, basename, extname } from '../platform/path.js'
import type { Document, DocumentListOptions, DocumentFileData } from '../types.js'
import { detectDocumentType, extractTitle } from './metadata.js'
import type { SearchService } from '../search/service.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'
import { hasPlainPath } from '../storage/safe-path.js'
import { escapeLike, LIKE_ESCAPE } from '../db/like.js'
import type { TrashService } from '../trash/service.js'
import { v4 as uuid } from 'uuid'

export class DocumentService {
  private store: JsonStore<DocumentFileData>
  private trash: TrashService | null = null

  constructor(
    private db: PlatformDatabase,
    private rootPath: string,
    private search: SearchService,
    private events: EventBus,
    private fs: PlatformFS,
    private crypto: PlatformCrypto,
  ) {
    this.store = new JsonStore<DocumentFileData>(join(rootPath, '.banjuan', 'data', 'documents'), fs, hasPlainPath)
  }

  async import(
    filePath: string,
    options?: { title?: string; tags?: string[] },
  ): Promise<Document> {
    return this.importOne(filePath, options, null)
  }

  /**
   * Import many files, reading the document store at most once for the whole
   * batch. Calling import() in a loop used to re-read every document JSON per
   * file — O(N²) for a library scan or a multi-file import.
   */
  async importMany(filePaths: string[]): Promise<Array<{ path: string; doc?: Document; error?: string }>> {
    let index: Map<string, DocumentFileData> | null = null
    const lazyIndex = async () => {
      if (!index) {
        index = new Map()
        for (const d of await this.store.listAll()) index.set(d.path, d)
      }
      return index
    }
    const results: Array<{ path: string; doc?: Document; error?: string }> = []
    for (const p of filePaths) {
      try {
        results.push({ path: p, doc: await this.importOne(p, undefined, lazyIndex) })
      } catch (e) {
        results.push({ path: p, error: (e as Error).message })
      }
    }
    return results
  }

  private async importOne(
    filePath: string,
    options: { title?: string; tags?: string[] } | undefined,
    pathIndex: (() => Promise<Map<string, DocumentFileData>>) | null,
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
    const pathHash = await this.crypto.sha256(new TextEncoder().encode(relPath))
    const pathId = pathHash.slice(0, 32)
    const existing = await this.findExistingByPath(relPath, pathId, pathIndex)
    const type = detectDocumentType(absPath)
    const title = options?.title ?? existing?.title ?? extractTitle(absPath)
    // The path's id may already belong to another document: one moved away
    // from this path, or one in the recycle bin. Reusing it overwrote that
    // document's metadata and handed it this file's annotations; a fresh id instead.
    const id = existing?.id ?? ((await this.idIsFree(pathId)) ? pathId : uuid().replace(/-/g, ''))
    const hash = existing?.hash ?? pathHash
    const now = new Date().toISOString()
    const tags = options?.tags ?? existing?.tags ?? []

    const fileData: DocumentFileData = {
      id, title, authors: existing?.authors ?? [], path: relPath, type, hash,
      tags, metadata: existing?.metadata ?? {}, createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    this.db.run(
      `INSERT INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, JSON.stringify(fileData.authors), relPath, type, hash, JSON.stringify(fileData.metadata), fileData.createdAt, fileData.updatedAt],
    )
    // Metadata only once the row is in: a failed insert used to leave a JSON
    // file behind that could clobber another document's.
    if (!existing) {
      try {
        await this.store.write(fileData)
      } catch (e) {
        this.db.run('DELETE FROM documents WHERE id = ?', [id])
        throw e
      }
      if (pathIndex) (await pathIndex()).set(relPath, fileData)
    }

    this.search.index({ id, title, content: title, type: 'document' })

    const doc: Document = {
      id, title, authors: [], path: relPath, type, hash,
      metadata: {}, createdAt: now, updatedAt: now,
    }
    this.events.emit('document:imported', { document: doc })
    return doc
  }

  /**
   * Metadata already on disk for this path (e.g. after the index was wiped, or
   * synced from another device). Current ids derive from the path, so try that
   * file directly; only legacy ids need a scan — once per batch via `pathIndex`.
   */
  private async findExistingByPath(
    relPath: string,
    pathId: string,
    pathIndex: (() => Promise<Map<string, DocumentFileData>>) | null,
  ): Promise<DocumentFileData | null> {
    const byId = await this.store.read(pathId)
    if (byId && byId.path === relPath) return byId
    if (pathIndex) return (await pathIndex()).get(relPath) ?? null
    for (const doc of await this.store.listAll()) {
      if (doc.path === relPath) return doc
    }
    return null
  }

  /** No document — in the library, in its metadata, or in the recycle bin — has this id. */
  private async idIsFree(id: string): Promise<boolean> {
    if (this.db.queryOne('SELECT 1 FROM documents WHERE id = ?', [id])) return false
    if (await this.store.read(id).catch(() => null)) return false
    return !(await this.trash?.holdsDocument(id))
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
    if (!(await this.get(id))) return null
    const now = new Date().toISOString()

    // Only the fields given are written, each onto the current record: two
    // updates made together used to write back each other's stale fields.
    await this.store.update(id, (fileData) => {
      if (updates.title !== undefined) fileData.title = updates.title
      if (updates.authors !== undefined) fileData.authors = updates.authors
      if (updates.metadata) fileData.metadata = { ...(fileData.metadata ?? {}), ...updates.metadata }
      fileData.updatedAt = now
    })

    // Read and write the row with no await between (one step for other callers).
    const current = (await this.get(id))
    if (!current) return null
    const updated: Document = {
      ...current,
      title: updates.title ?? current.title,
      authors: updates.authors ?? current.authors,
      metadata: updates.metadata ? { ...current.metadata, ...updates.metadata } : current.metadata,
      updatedAt: now,
    }
    this.db.run(
      `UPDATE documents SET title = ?, authors = ?, metadata = ?, updated_at = ? WHERE id = ?`,
      [updated.title, JSON.stringify(updated.authors), JSON.stringify(updated.metadata), now, id],
    )
    this.search.index({ id, title: updated.title, content: updated.title, type: 'document' })
    return updated
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
   * Paths already in the index — a single cheap DB read, no file I/O. Lets a
   * normal open skip re-importing known files: import() otherwise does an
   * fs.exists() per file, and on mobile each is a Capacitor bridge round-trip,
   * so a full library re-imports as a visible "scan" on every open.
   */
  async listImportedPaths(): Promise<Set<string>> {
    const rows = this.db.query<{ path: string }>('SELECT path FROM documents')
    return new Set(rows.map(r => r.path))
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
    const meta = await this.store.update(id, (meta) => {
      const md: Record<string, unknown> = { ...(meta.metadata ?? {}) }
      if (missing) md.fileMissing = true
      else delete md.fileMissing
      meta.metadata = md
    })
    if (!meta) return
    this.db.run('UPDATE documents SET metadata = ? WHERE id = ?', [JSON.stringify(meta.metadata), id])
  }

  async move(id: string, destDir: string): Promise<Document | null> {
    const doc = await this.get(id)
    if (!doc) return null

    const srcAbs = join(this.rootPath, doc.path)
    const destDirAbs = join(this.rootPath, destDir)
    if (relative(this.rootPath, destDirAbs).startsWith('..')) throw new Error('Destination must be inside the library')
    if (join(destDirAbs, basename(doc.path)) === srcAbs) return doc   // already there
    await this.fs.mkdir(destDirAbs, { recursive: true })

    // A file of the same name already in the folder is kept: this one takes
    // "name (2).pdf" — rename() would have replaced the other file silently.
    const destAbs = join(destDirAbs, await this.freeName(destDirAbs, basename(doc.path)))
    const newRelPath = relative(this.rootPath, destAbs)

    await this.fs.rename(srcAbs, destAbs)

    const now = new Date().toISOString()
    this.db.run('UPDATE documents SET path = ?, updated_at = ? WHERE id = ?', [newRelPath, now, id])

    await this.store.update(id, (fileData) => {
      fileData.path = newRelPath
      fileData.updatedAt = now
    })

    this.events.emit('document:moved', { id, from: doc.path, to: newRelPath })
    return { ...doc, path: newRelPath, updatedAt: now }
  }

  async createDir(dirPath: string): Promise<void> {
    const absPath = join(this.rootPath, dirPath)
    await this.fs.mkdir(absPath, { recursive: true })
  }

  /**
   * Rename (or move) a folder of documents: the directory on disk, then each
   * document's path in the DB and its JSON metadata. Refuses to merge into an
   * existing folder — that would silently interleave two folders' files.
   */
  async renameDir(oldPath: string, newPath: string): Promise<void> {
    const oldAbs = join(this.rootPath, oldPath)
    const newAbs = join(this.rootPath, newPath)
    if (!(await this.fs.exists(oldAbs))) throw new Error('Directory not found')
    if (await this.fs.exists(newAbs)) throw new Error('DIR_EXISTS')
    await this.fs.mkdir(dirname(newAbs), { recursive: true })
    await this.fs.rename(oldAbs, newAbs)

    const prefix = oldPath + '/'
    const rows = this.db.query<{ id: string; path: string }>(
      `SELECT id, path FROM documents WHERE path LIKE ? ${LIKE_ESCAPE}`, [escapeLike(prefix) + '%'],
    )
    const now = new Date().toISOString()
    for (const row of rows) {
      const to = newPath + '/' + row.path.substring(prefix.length)
      this.db.run('UPDATE documents SET path = ?, updated_at = ? WHERE id = ?', [to, now, row.id])
      await this.store.update(row.id, (fileData) => {
        fileData.path = to
        fileData.updatedAt = now
      })
      this.events.emit('document:moved', { id: row.id, from: row.path, to })
    }
  }

  /** `name` if nothing in `dirAbs` has it (in the library or on disk), else "stem (2).ext", "stem (3).ext", … */
  private async freeName(dirAbs: string, name: string): Promise<string> {
    const taken = async (n: string) => {
      const abs = join(dirAbs, n)
      return (await this.fs.exists(abs))
        || !!this.db.queryOne('SELECT 1 FROM documents WHERE path = ?', [relative(this.rootPath, abs)])
    }
    if (!(await taken(name))) return name
    const ext = extname(name)
    const stem = basename(name, ext)
    for (let i = 2; ; i++) {
      const candidate = `${stem} (${i})${ext}`
      if (!(await taken(candidate))) return candidate
    }
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

  /** Deletes move the file to the recycle bin instead of erasing it. */
  setTrash(trash: TrashService): void { this.trash = trash }

  async delete(id: string): Promise<void> {
    const doc = await this.get(id)
    if (!doc) return
    const incoming = this.db.query<{ source_id: string; context: string }>(
      'SELECT source_id, context FROM doc_links WHERE target_id = ?', [id])

    // Database first, in one transaction, children before the row (doc_links has
    // a foreign key to documents); disk only after it commits. The old order
    // deleted the file first, so an FK failure left a row with no file behind.
    this.db.transaction(() => {
      this.db.run('DELETE FROM doc_links WHERE target_id = ?', [id])
      this.db.run('DELETE FROM doc_tags WHERE doc_id = ?', [id])
      this.db.run('DELETE FROM documents WHERE id = ?', [id])
    })
    this.search.removeById(id)
    if (this.trash) {
      try {
        await this.trash.putDocument(await this.store.read(id), doc, incoming.map(l => ({ sourceId: l.source_id, context: l.context })))
        await this.store.delete(id)
      } catch (e) {
        // Leave the file and its metadata where they are: the document comes
        // back on the next rebuild rather than being erased without a copy.
        console.error('[documents] moving to the recycle bin failed; file kept in place', id, e)
      }
    } else {
      await this.store.delete(id)
      const absPath = join(this.rootPath, doc.path)
      if (await this.fs.exists(absPath)) {
        await this.fs.remove(absPath)
      }
    }
    this.events.emit('document:deleted', { id })
  }

  async deleteDir(dirPath: string): Promise<void> {
    const rows = this.db.query<{ id: string; path: string }>(
      `SELECT id, path FROM documents WHERE path LIKE ? ${LIKE_ESCAPE}`, [escapeLike(dirPath) + '/%'],
    )
    for (const row of rows) {
      await this.delete(row.id)
    }
    const absDir = join(this.rootPath, dirPath)
    if (await this.fs.exists(absDir)) {
      // Files the library doesn't track (other formats, …) go to the bin with the folder.
      if (this.trash && (await this.trash.containsFiles(absDir))) await this.trash.putFolder(absDir, dirPath, 'documents')
      else await this.fs.rmdir(absDir, { recursive: true })
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
