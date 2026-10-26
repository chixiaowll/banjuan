import type { PlatformDatabase, PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'
import { JsonStore } from '../storage/json-store.js'
import { hasPlainPath } from '../storage/safe-path.js'
import { parseFrontmatter } from '../storage/frontmatter.js'
import type { DocumentFileData, AnnotationFileData, NoteFileData } from '../types.js'
import { extractNoteLinks, extractDocumentLinks } from '../notes/extract-links.js'

/**
 * Bump whenever the indexing logic or schema-derived data changes shape. On
 * open, a persisted DB whose stamped version differs (or is absent) triggers a
 * one-time full rebuild; matching versions skip rebuildFull entirely.
 */
// 2: search_index switched to the trigram tokenizer (Chinese substring search).
export const INDEX_VERSION = 2

export class IndexService {
  private docStore: JsonStore<DocumentFileData>
  private annStore: JsonStore<AnnotationFileData>
  private metaPath: string
  private tagsPath: string
  private notesDir: string
  private ftsAvailable: boolean

  constructor(private db: PlatformDatabase, private rootPath: string, private fs: PlatformFS) {
    try {
      db.query('SELECT 1 FROM search_index LIMIT 0')
      this.ftsAvailable = true
    } catch {
      this.ftsAvailable = false
    }
    const banjuanDir = join(rootPath, '.banjuan')
    this.docStore = new JsonStore<DocumentFileData>(join(banjuanDir, 'data', 'documents'), fs, hasPlainPath)
    this.annStore = new JsonStore(join(banjuanDir, 'data', 'annotations'), fs)
    this.metaPath = join(banjuanDir, 'db.meta.json')
    this.tagsPath = join(banjuanDir, 'tags.json')
    this.notesDir = join(rootPath, '.banjuan', 'notes')
  }

  async rebuildFull(): Promise<void> {
    this.db.pragma('foreign_keys = OFF')   // must be set outside a transaction
    // One transaction for the whole rebuild: a failure part-way rolls back to the
    // previous index instead of leaving cleared tables half refilled (which still
    // looked valid, so nothing re-triggered a rebuild). One commit is also far
    // faster than auto-committing every row. better-sqlite3's own transaction()
    // nests as a SAVEPOINT if other code writes during an await here.
    this.db.execute('BEGIN')
    let committed = false
    try {
    // The DB now persists across opens, so a rebuild may run on a populated DB.
    // Clear the derived tables first, otherwise FTS rows duplicate (append-only
    // INSERT) and removed links/notes linger (INSERT OR IGNORE never deletes).
    // Reading history (last_read_at) exists only in the DB — it isn't in the
    // document JSON — so carry it over instead of wiping "recently read".
    const lastRead = this.db.query<{ id: string; last_read_at: string }>(
      'SELECT id, last_read_at FROM documents WHERE last_read_at IS NOT NULL')
    this.clearDerivedTables()
    await this.indexTags()

    for (const doc of await this.docStore.listAll()) {
      this.indexDocument(doc)
    }
    for (const r of lastRead) {
      this.db.run('UPDATE documents SET last_read_at = ? WHERE id = ?', [r.last_read_at, r.id])
    }

    for (const ann of await this.annStore.listAll()) {
      this.indexAnnotation(ann)
    }

    const { noteLinks: pendingLinks, docLinks: pendingDocLinks } = await this.indexAllNotes()
    // Title-only links (markdown-imported) resolve here, after every note row
    // exists — first note wins on duplicate titles, same as click-to-open.
    const titleToId = new Map<string, string>()
    for (const r of this.db.query<{ id: string; title: string }>('SELECT id, title FROM notes')) {
      if (!titleToId.has(r.title)) titleToId.set(r.title, r.id)
    }
    for (const link of pendingLinks) {
      const targetId = link.targetId || (link.targetTitle ? titleToId.get(link.targetTitle) ?? '' : '')
      if (!targetId || targetId === link.sourceId) continue
      this.db.run('INSERT OR IGNORE INTO note_links (source_id, target_id, context) VALUES (?, ?, ?)', [link.sourceId, targetId, link.context])
    }
    for (const link of pendingDocLinks) {
      this.db.run('INSERT OR IGNORE INTO doc_links (source_id, target_id, context) VALUES (?, ?, ?)', [link.sourceId, link.targetId, link.context])
    }

    this.db.execute('COMMIT')
    committed = true
    await this.writeMetaTimestamp()
    } finally {
      if (!committed) this.db.execute('ROLLBACK')
      this.db.pragma('foreign_keys = ON')
    }
  }

  /** Index one document record (restoring it from the recycle bin). */
  indexDocumentRecord(doc: DocumentFileData): void {
    this.indexDocument(doc)
  }

  /**
   * Index one note file (restoring it from the recycle bin): its row, text,
   * tags, mind-map data and the links it makes to notes / documents that exist.
   */
  async indexNoteFile(relPath: string): Promise<void> {
    const noteLinks: Array<{ sourceId: string; targetId: string; targetTitle?: string; context: string }> = []
    const docLinks: Array<{ sourceId: string; targetId: string; context: string }> = []
    await this.indexNoteJsonFile(relPath, noteLinks, docLinks)
    for (const link of noteLinks) {
      const targetId = link.targetId
        || (link.targetTitle ? this.db.queryOne<{ id: string }>('SELECT id FROM notes WHERE title = ? LIMIT 1', [link.targetTitle])?.id ?? '' : '')
      if (!targetId || targetId === link.sourceId || !this.db.queryOne('SELECT 1 FROM notes WHERE id = ?', [targetId])) continue
      this.db.run('INSERT OR IGNORE INTO note_links (source_id, target_id, context) VALUES (?, ?, ?)', [link.sourceId, targetId, link.context])
    }
    for (const link of docLinks) {
      if (!this.db.queryOne('SELECT 1 FROM documents WHERE id = ?', [link.targetId])) continue
      this.db.run('INSERT OR IGNORE INTO doc_links (source_id, target_id, context) VALUES (?, ?, ?)', [link.sourceId, link.targetId, link.context])
    }
  }

  private async indexTags(): Promise<void> {
    if (!(await this.fs.exists(this.tagsPath))) return
    const tags = JSON.parse(await this.fs.readTextFile(this.tagsPath)) as Array<{ id: string; name: string; color: string | null }>
    for (const tag of tags) {
      this.db.run('INSERT OR REPLACE INTO tags (id, name, color) VALUES (?, ?, ?)', [tag.id, tag.name, tag.color])
    }
  }

  private indexDocument(doc: DocumentFileData): void {
    const existing = this.db.queryOne<{ metadata: string }>('SELECT metadata FROM documents WHERE id = ?', [doc.id])
    let mergedMeta = doc.metadata || {}
    if (existing?.metadata) {
      try {
        const dbMeta = JSON.parse(existing.metadata)
        mergedMeta = { ...dbMeta, ...mergedMeta }
      } catch {}
    }
    this.db.run(
      `INSERT OR REPLACE INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [doc.id, doc.title, JSON.stringify(doc.authors), doc.path, doc.type, doc.hash, JSON.stringify(mergedMeta), doc.createdAt, doc.updatedAt],
    )

    if (this.ftsAvailable) this.db.run(
      `INSERT INTO search_index (rowid, title, content, type)
       VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`,
      [doc.title, doc.title, `document:${doc.id}`],
    )

    if (doc.tags?.length) {
      for (const tagName of doc.tags) {
        const tag = this.db.queryOne<{ id: string }>('SELECT id FROM tags WHERE name = ?', [tagName])
        if (tag) this.db.run('INSERT OR IGNORE INTO doc_tags (doc_id, tag_id) VALUES (?, ?)', [doc.id, tag.id])
      }
    }
  }

  private indexAnnotation(ann: AnnotationFileData): void {
    this.db.run(
      `INSERT OR REPLACE INTO annotations (id, doc_id, type, page, position, content, selected_text, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ann.id, ann.docId, ann.type, ann.page, JSON.stringify(ann.position), ann.content, ann.selectedText, ann.color, ann.createdAt, ann.updatedAt],
    )
  }

  private async indexAllNotes(): Promise<{ noteLinks: Array<{ sourceId: string; targetId: string; targetTitle?: string; context: string }>; docLinks: Array<{ sourceId: string; targetId: string; context: string }> }> {
    const noteLinks: Array<{ sourceId: string; targetId: string; targetTitle?: string; context: string }> = []
    const docLinks: Array<{ sourceId: string; targetId: string; context: string }> = []
    if (!(await this.fs.exists(this.notesDir))) {
      return { noteLinks, docLinks }
    }
    await this.scanNotesDir(this.notesDir, '', noteLinks, docLinks)
    return { noteLinks, docLinks }
  }

  private async scanNotesDir(dir: string, prefix: string, pendingLinks: Array<{ sourceId: string; targetId: string; targetTitle?: string; context: string }>, pendingDocLinks: Array<{ sourceId: string; targetId: string; context: string }>): Promise<void> {
    const entries = await this.fs.readdirWithTypes(dir)
    for (const entry of entries) {
      if (entry.isDirectory) {
        await this.scanNotesDir(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name, pendingLinks, pendingDocLinks)
      } else {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.name.endsWith('.json')) {
          await this.indexNoteJsonFile(relPath, pendingLinks, pendingDocLinks)
        } else if (entry.name.endsWith('.md')) {
          await this.indexNoteMdFile(relPath)
        }
      }
    }
  }

  private async indexNoteJsonFile(relPath: string, pendingLinks: Array<{ sourceId: string; targetId: string; targetTitle?: string; context: string }>, pendingDocLinks: Array<{ sourceId: string; targetId: string; context: string }>): Promise<void> {
    const filePath = join(this.notesDir, relPath)
    let raw: { meta: NoteFileData; tags?: string[]; blocks?: unknown[]; nodes?: any[]; edges?: any[]; boundaries?: any[]; summaries?: any[] }
    try {
      raw = JSON.parse(await this.fs.readTextFile(filePath))
    } catch (e) {
      console.error(`[index] failed to read/parse note ${relPath}:`, (e as Error)?.message)
      return
    }
    const data = raw.meta

    if (!data.id) {
      console.warn(`[index] note ${relPath} has no id, skipping`)
      return
    }

    const noteType = data.type ?? 'markdown'
    const typeMeta = data.typeMeta ? JSON.stringify(data.typeMeta) : null
    try {
      this.db.run(
        `INSERT OR REPLACE INTO notes (id, title, type, path, doc_id, folder_id, content_format, type_meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.id, data.title ?? relPath, noteType, relPath, data.docId ?? null, null, 'json', typeMeta, data.createdAt ?? new Date().toISOString(), data.updatedAt ?? new Date().toISOString()],
      )
      console.log(`[index] indexed note: ${data.title ?? relPath} (${data.id})`)
    } catch (e) {
      console.error(`[index] DB insert failed for note ${relPath}:`, (e as Error)?.message)
      return
    }

    const textContent = this.blocksToText(Array.isArray(raw.blocks) ? raw.blocks : [])
    if (this.ftsAvailable) this.db.run(
      `INSERT INTO search_index (rowid, title, content, type)
       VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`,
      [data.title ?? relPath, textContent, `note:${data.id}`],
    )

    if (data.annotationIds?.length) {
      for (const annId of data.annotationIds) {
        this.db.run('INSERT OR IGNORE INTO note_annotations (note_id, annotation_id) VALUES (?, ?)', [data.id, annId])
      }
    }

    // TagService writes note tags to the file's top-level `tags` (older files may
    // have them in meta), and keeps mind-map tags in mindmap_tags — mirror both,
    // or every sync (which ends in rebuildFull) wipes the tags from the UI.
    const tagNames = [...new Set([...(raw.tags ?? []), ...(data.tags ?? [])])]
    const [tagTable, tagIdCol] = noteType === 'mindmap' ? ['mindmap_tags', 'mindmap_id'] : ['note_tags', 'note_id']
    for (const tagName of tagNames) {
      const tag = this.db.queryOne<{ id: string }>('SELECT id FROM tags WHERE name = ?', [tagName])
      if (tag) this.db.run(`INSERT OR IGNORE INTO ${tagTable} (${tagIdCol}, tag_id) VALUES (?, ?)`, [data.id, tag.id])
    }

    const noteLinks = extractNoteLinks(Array.isArray(raw.blocks) ? raw.blocks : [])
    for (const link of noteLinks) {
      pendingLinks.push({ sourceId: data.id, targetId: link.targetId, targetTitle: link.targetTitle, context: link.context })
    }

    const docLinksFound = extractDocumentLinks(Array.isArray(raw.blocks) ? raw.blocks : [])
    for (const link of docLinksFound) {
      pendingDocLinks.push({ sourceId: data.id, targetId: link.targetId, context: link.context })
    }

    if (noteType === 'mindmap' && raw.nodes) {
      for (const node of raw.nodes) {
        this.db.run(
          `INSERT OR REPLACE INTO mindmap_nodes (id, mindmap_id, parent_id, title, content, hyperlink, image_url, color, notes, shape, style_overrides, position_x, position_y, sort_order, collapsed, floating, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [node.id, data.id, node.parentId ?? null, node.title ?? '', node.content ?? null, node.hyperlink ?? null, node.imageUrl ?? null, node.color ?? null, node.notes ?? null, node.shape ?? null, node.styleOverrides ?? null, node.positionX ?? null, node.positionY ?? null, node.sortOrder ?? 0, node.collapsed ? 1 : 0, node.floating ? 1 : 0, data.createdAt ?? new Date().toISOString()],
        )
      }
      for (const edge of raw.edges ?? []) {
        this.db.run(
          `INSERT OR REPLACE INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)`,
          [edge.id, data.id, edge.sourceId, edge.targetId, edge.label ?? null, edge.style ?? null],
        )
      }
      for (const b of raw.boundaries ?? []) {
        this.db.run(
          `INSERT OR REPLACE INTO mindmap_boundaries (id, mindmap_id, node_ids, label, color) VALUES (?, ?, ?, ?, ?)`,
          [b.id, data.id, JSON.stringify(b.nodeIds ?? []), b.label ?? '', b.color ?? null],
        )
      }
      for (const s of raw.summaries ?? []) {
        this.db.run(
          `INSERT OR REPLACE INTO mindmap_summaries (id, mindmap_id, node_ids, summary_node_id) VALUES (?, ?, ?, ?)`,
          [s.id, data.id, JSON.stringify(s.nodeIds ?? []), s.summaryNodeId],
        )
      }
    }
  }

  private async indexNoteMdFile(relPath: string): Promise<void> {
    const filePath = join(this.notesDir, relPath)
    const raw = await this.fs.readTextFile(filePath)
    const { data, content } = parseFrontmatter<NoteFileData>(raw)

    if (!data.id) return

    this.db.run(
      `INSERT OR REPLACE INTO notes (id, title, type, path, doc_id, folder_id, content_format, type_meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.title ?? relPath, 'markdown', relPath, data.docId ?? null, null, data.contentFormat ?? 'markdown', null, data.createdAt ?? new Date().toISOString(), data.updatedAt ?? new Date().toISOString()],
    )

    if (this.ftsAvailable) this.db.run(
      `INSERT INTO search_index (rowid, title, content, type)
       VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`,
      [data.title ?? relPath, content, `note:${data.id}`],
    )

    if (data.annotationIds?.length) {
      for (const annId of data.annotationIds) {
        this.db.run('INSERT OR IGNORE INTO note_annotations (note_id, annotation_id) VALUES (?, ?)', [data.id, annId])
      }
    }

    if (data.tags?.length) {
      for (const tagName of data.tags) {
        const tag = this.db.queryOne<{ id: string }>('SELECT id FROM tags WHERE name = ?', [tagName])
        if (tag) this.db.run('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', [data.id, tag.id])
      }
    }
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

  private clearDerivedTables(): void {
    const tables = [
      'documents', 'annotations', 'notes', 'note_links', 'doc_links',
      'note_annotations', 'doc_tags', 'note_tags', 'mindmap_tags',
      'mindmap_nodes', 'mindmap_edges', 'mindmap_boundaries', 'mindmap_summaries',
      'tags',
    ]
    for (const t of tables) {
      try { this.db.run(`DELETE FROM ${t}`) } catch { /* table may not exist */ }
    }
    if (this.ftsAvailable) {
      try { this.db.run('DELETE FROM search_index') } catch { /* fts absent */ }
    }
  }

  private async writeMetaTimestamp(): Promise<void> {
    await this.fs.writeTextFile(this.metaPath, JSON.stringify({ lastIndexTime: Date.now(), indexVersion: INDEX_VERSION }))
  }

  /**
   * True when the persisted DB needs a full rebuild: no meta file (DB was never
   * stamped — e.g. first open after upgrading from the always-wipe model) or a
   * version mismatch. False means the DB is trusted and rebuildFull can be skipped.
   */
  async isStale(): Promise<boolean> {
    if (!(await this.fs.exists(this.metaPath))) return true
    try {
      const meta = JSON.parse(await this.fs.readTextFile(this.metaPath)) as { indexVersion?: number }
      if (meta.indexVersion !== INDEX_VERSION) return true
    } catch {
      return true
    }
    // Notes but an empty text index: built where it couldn't be stored (iPad
    // before search_index had a non-FTS fallback) — fill it now.
    try {
      const notes = this.db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM notes')?.n ?? 0
      const indexed = this.db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM search_index')?.n ?? 0
      return notes > 0 && indexed === 0
    } catch {
      return false
    }
  }
}
