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
    // Phase 1 — read every source file, leaving the index as it is: the library
    // stays usable meanwhile. The rebuild used to clear the tables and then
    // await these reads, and an edit made in that gap found no row for its
    // note and was dropped (or went into the rebuild's transaction).
    // Rows changed while reading are noted by temporary triggers and carried
    // over in phase 2, so the slower file reads can't overwrite them.
    this.startChangeLog()
    let changed: Set<string>
    let tags: TagFileEntry[], docs: DocumentFileData[], anns: AnnotationFileData[], notes: NoteSource[]
    try {
      tags = await this.readTagsFile()
      docs = await this.docStore.listAll()
      anns = await this.annStore.listAll()
      notes = await this.readAllNotes()
    } finally {
      changed = this.stopChangeLog()
    }

    // Phase 2 — swap in one synchronous step: no other code runs between
    // clearing the tables and the commit. One transaction: a failure rolls back
    // to the previous index instead of leaving tables half refilled.
    this.db.pragma('foreign_keys = OFF')   // must be set outside a transaction
    this.db.execute('BEGIN')
    let committed = false
    try {
      // Reading history (last_read_at) exists only in the DB — it isn't in the
      // document JSON — so carry it over instead of wiping "recently read".
      const lastRead = this.db.query<{ id: string; last_read_at: string }>(
        'SELECT id, last_read_at FROM documents WHERE last_read_at IS NOT NULL')
      const notePaths = new Map(this.db.query<{ id: string; path: string }>('SELECT id, path FROM notes').map(r => [r.id, r.path]))
      const carried = this.snapshotRows(changed)
      this.clearDerivedTables()

      for (const tag of tags) {
        this.db.run('INSERT OR REPLACE INTO tags (id, name, color) VALUES (?, ?, ?)', [tag.id, tag.name, tag.color])
      }
      for (const doc of docs) this.indexDocument(doc)
      for (const r of lastRead) {
        this.db.run('UPDATE documents SET last_read_at = ? WHERE id = ?', [r.last_read_at, r.id])
      }
      for (const ann of anns) this.indexAnnotation(ann)

      const pendingLinks: PendingNoteLink[] = []
      const pendingDocLinks: PendingDocLink[] = []
      for (const note of pickOnePerId(notes, notePaths)) this.insertNote(note, pendingLinks, pendingDocLinks)
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

      this.restoreRows(changed, carried)
      this.db.execute('COMMIT')
      committed = true
    } finally {
      if (!committed) this.db.execute('ROLLBACK')
      this.db.pragma('foreign_keys = ON')
    }
    await this.writeMetaTimestamp()
  }

  // ---- rows changed while a rebuild reads files ------------------------------

  private startChangeLog(): void {
    this.stopChangeLog()
    this.db.execute('CREATE TEMP TABLE IF NOT EXISTS rebuild_changed (id TEXT PRIMARY KEY)')
    this.db.execute('DELETE FROM temp.rebuild_changed')
    for (const [table, col] of [...ITEM_TABLES, ['tags', null] as const]) {
      const key = (row: 'NEW' | 'OLD') => (col ? `${row}.${col}` : `'${TAGS_CHANGED}'`)
      for (const [op, rows] of [['INSERT', ['NEW']], ['UPDATE', ['OLD', 'NEW']], ['DELETE', ['OLD']]] as const) {
        const body = rows.map(r => `INSERT OR IGNORE INTO rebuild_changed (id) VALUES (${key(r)});`).join(' ')
        try {
          this.db.execute(`CREATE TEMP TRIGGER IF NOT EXISTS rebuild_log_${table}_${op.toLowerCase()} AFTER ${op} ON ${table} BEGIN ${body} END`)
        } catch { /* table absent in this schema */ }
      }
    }
  }

  /** Drops the triggers; returns the ids of items whose rows changed. */
  private stopChangeLog(): Set<string> {
    for (const [table] of [...ITEM_TABLES, ['tags', null] as const]) {
      for (const op of ['insert', 'update', 'delete']) this.db.execute(`DROP TRIGGER IF EXISTS temp.rebuild_log_${table}_${op}`)
    }
    try {
      const ids = new Set(this.db.query<{ id: string }>('SELECT id FROM temp.rebuild_changed').map(r => r.id))
      this.db.execute('DELETE FROM temp.rebuild_changed')
      return ids
    } catch {
      return new Set()
    }
  }

  private snapshotRows(changed: Set<string>): CarriedRows {
    const carried: CarriedRows = { tables: new Map(), search: [], tags: null }
    if (changed.size === 0) return carried
    const ids = [...changed]
    for (const [table, col] of ITEM_TABLES) {
      try { carried.tables.set(table, this.rowsWhereIn(`SELECT * FROM ${table} WHERE ${col} IN`, ids)) } catch { /* table absent */ }
    }
    if (this.ftsAvailable) {
      carried.search = this.rowsWhereIn('SELECT title, content, type FROM search_index WHERE type IN', searchKeys(ids)) as CarriedRows['search']
    }
    if (changed.has(TAGS_CHANGED)) carried.tags = this.db.query('SELECT * FROM tags')
    return carried
  }

  /** Put back the rows of items changed while files were read: they are newer than what was read. */
  private restoreRows(changed: Set<string>, carried: CarriedRows): void {
    if (changed.size === 0) return
    const ids = [...changed]
    if (carried.tags) {
      this.db.run('DELETE FROM tags')
      for (const row of carried.tags) this.insertRow('tags', row)
    }
    for (const [table, col] of ITEM_TABLES) {
      const rows = carried.tables.get(table)
      if (!rows) continue
      this.runWhereIn(`DELETE FROM ${table} WHERE ${col} IN`, ids)
      for (const row of rows) this.insertRow(table, row)
    }
    if (this.ftsAvailable) {
      this.runWhereIn('DELETE FROM search_index WHERE type IN', searchKeys(ids))
      for (const r of carried.search) {
        this.db.run(
          `INSERT INTO search_index (rowid, title, content, type)
           VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`,
          [r.title, r.content, r.type],
        )
      }
    }
  }

  private insertRow(table: string, row: Record<string, unknown>): void {
    const cols = Object.keys(row)
    this.db.run(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map(c => row[c]))
  }

  private rowsWhereIn(sqlPrefix: string, values: string[]): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = []
    for (let i = 0; i < values.length; i += 500) {
      const chunk = values.slice(i, i + 500)
      out.push(...this.db.query<Record<string, unknown>>(`${sqlPrefix} (${chunk.map(() => '?').join(',')})`, chunk))
    }
    return out
  }

  private runWhereIn(sqlPrefix: string, values: string[]): void {
    for (let i = 0; i < values.length; i += 500) {
      const chunk = values.slice(i, i + 500)
      this.db.run(`${sqlPrefix} (${chunk.map(() => '?').join(',')})`, chunk)
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
    const note = await this.readNote(relPath)
    if (!note) return
    const noteLinks: PendingNoteLink[] = []
    const docLinks: PendingDocLink[] = []
    this.insertNote(note, noteLinks, docLinks)
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

  private async readTagsFile(): Promise<TagFileEntry[]> {
    if (!(await this.fs.exists(this.tagsPath))) return []
    return JSON.parse(await this.fs.readTextFile(this.tagsPath)) as TagFileEntry[]
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

  private async readAllNotes(): Promise<NoteSource[]> {
    const out: NoteSource[] = []
    if (!(await this.fs.exists(this.notesDir))) return out
    await this.scanNotesDir(this.notesDir, '', out)
    return out
  }

  private async scanNotesDir(dir: string, prefix: string, out: NoteSource[]): Promise<void> {
    const entries = await this.fs.readdirWithTypes(dir)
    for (const entry of entries) {
      if (entry.isDirectory) {
        await this.scanNotesDir(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name, out)
      } else if (entry.name.endsWith('.json') || entry.name.endsWith('.md')) {
        const note = await this.readNote(prefix ? `${prefix}/${entry.name}` : entry.name)
        if (note) out.push(note)
      }
    }
  }

  private async readNote(relPath: string): Promise<NoteSource | null> {
    const filePath = join(this.notesDir, relPath)
    if (relPath.endsWith('.md')) {
      try {
        const { data, content } = parseFrontmatter<NoteFileData>(await this.fs.readTextFile(filePath))
        return data.id ? { kind: 'md', relPath, id: data.id, data, content } : null
      } catch (e) {
        console.error(`[index] failed to read note ${relPath}:`, (e as Error)?.message)
        return null
      }
    }
    let raw: NoteJson
    try {
      raw = JSON.parse(await this.fs.readTextFile(filePath))
    } catch (e) {
      console.error(`[index] failed to read/parse note ${relPath}:`, (e as Error)?.message)
      return null
    }
    if (!raw?.meta?.id) {
      console.warn(`[index] note ${relPath} has no id, skipping`)
      return null
    }
    return { kind: 'json', relPath, id: raw.meta.id, raw }
  }

  private insertNote(note: NoteSource, pendingLinks: PendingNoteLink[], pendingDocLinks: PendingDocLink[]): void {
    if (note.kind === 'md') this.insertNoteMd(note.relPath, note.data, note.content)
    else this.insertNoteJson(note.relPath, note.raw, pendingLinks, pendingDocLinks)
  }

  private insertNoteJson(relPath: string, raw: NoteJson, pendingLinks: PendingNoteLink[], pendingDocLinks: PendingDocLink[]): void {
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

  private insertNoteMd(relPath: string, data: NoteFileData, content: string): void {
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

type PendingNoteLink = { sourceId: string; targetId: string; targetTitle?: string; context: string }
type PendingDocLink = { sourceId: string; targetId: string; context: string }
type TagFileEntry = { id: string; name: string; color: string | null }
type NoteJson = { meta: NoteFileData; tags?: string[]; blocks?: unknown[]; nodes?: any[]; edges?: any[]; boundaries?: any[]; summaries?: any[] }
type NoteSource =
  | { kind: 'json'; relPath: string; id: string; raw: NoteJson }
  | { kind: 'md'; relPath: string; id: string; data: NoteFileData; content: string }
type CarriedRows = {
  tables: Map<string, Array<Record<string, unknown>>>
  search: Array<{ title: string; content: string; type: string }>
  tags: Array<Record<string, unknown>> | null
}

/** Tables holding an item's rows, and the column naming the item (note, document or annotation). */
const ITEM_TABLES: ReadonlyArray<readonly [string, string]> = [
  ['notes', 'id'], ['note_tags', 'note_id'], ['mindmap_tags', 'mindmap_id'],
  ['mindmap_nodes', 'mindmap_id'], ['mindmap_edges', 'mindmap_id'],
  ['mindmap_boundaries', 'mindmap_id'], ['mindmap_summaries', 'mindmap_id'],
  ['note_links', 'source_id'], ['doc_links', 'source_id'], ['note_annotations', 'note_id'],
  ['documents', 'id'], ['doc_tags', 'doc_id'], ['annotations', 'id'],
]
/** Marks a change to the tag catalog table in the change log. */
const TAGS_CHANGED = '*tags*'

const searchKeys = (ids: string[]) => ids.flatMap(id => [`note:${id}`, `document:${id}`])

/**
 * Two note files with the same id (a copied file, a sync conflict): index one —
 * the one at the path the index already had, else the first found — instead of
 * letting whichever was read last take over the row.
 */
function pickOnePerId(notes: NoteSource[], knownPaths: Map<string, string>): NoteSource[] {
  const chosen = new Map<string, NoteSource>()
  for (const n of notes) {
    const prev = chosen.get(n.id)
    if (!prev) { chosen.set(n.id, n); continue }
    console.warn(`[index] two note files with id ${n.id}: ${prev.relPath} and ${n.relPath}`)
    if (knownPaths.get(n.id) === n.relPath) chosen.set(n.id, n)
  }
  return [...chosen.values()]
}
