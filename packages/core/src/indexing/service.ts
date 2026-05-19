import type { PlatformDatabase, PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'
import { JsonStore } from '../storage/json-store.js'
import { parseFrontmatter } from '../storage/frontmatter.js'
import type { DocumentFileData, AnnotationFileData, MindmapFileData, NoteFileData } from '../types.js'
import { extractNoteLinks, extractDocumentLinks } from '../notes/extract-links.js'

export class IndexService {
  private docStore: JsonStore<DocumentFileData>
  private annStore: JsonStore<AnnotationFileData>
  private metaPath: string
  private tagsPath: string
  private notesDir: string
  private mindmapsDir: string
  private ftsAvailable: boolean

  constructor(private db: PlatformDatabase, private rootPath: string, private fs: PlatformFS) {
    try {
      db.query('SELECT 1 FROM search_index LIMIT 0')
      this.ftsAvailable = true
    } catch {
      this.ftsAvailable = false
    }
    const banjuanDir = join(rootPath, '.banjuan')
    this.docStore = new JsonStore(join(banjuanDir, 'data', 'documents'), fs)
    this.annStore = new JsonStore(join(banjuanDir, 'data', 'annotations'), fs)
    this.metaPath = join(banjuanDir, 'db.meta.json')
    this.tagsPath = join(banjuanDir, 'tags.json')
    this.notesDir = join(rootPath, '.banjuan', 'notes')
    this.mindmapsDir = join(rootPath, '.banjuan', 'mindmaps')
  }

  async rebuildFull(): Promise<void> {
    this.db.pragma('foreign_keys = OFF')
    try {
    await this.indexTags()

    for (const doc of await this.docStore.listAll()) {
      this.indexDocument(doc)
    }

    for (const ann of await this.annStore.listAll()) {
      this.indexAnnotation(ann)
    }

    const { noteLinks: pendingLinks, docLinks: pendingDocLinks } = await this.indexAllNotes()
    for (const link of pendingLinks) {
      this.db.run('INSERT OR IGNORE INTO note_links (source_id, target_id, context) VALUES (?, ?, ?)', [link.sourceId, link.targetId, link.context])
    }
    for (const link of pendingDocLinks) {
      this.db.run('INSERT OR IGNORE INTO doc_links (source_id, target_id, context) VALUES (?, ?, ?)', [link.sourceId, link.targetId, link.context])
    }

    await this.indexAllMindmaps()

    await this.writeMetaTimestamp()
    } finally {
      this.db.pragma('foreign_keys = ON')
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

  private async indexAllNotes(): Promise<{ noteLinks: Array<{ sourceId: string; targetId: string; context: string }>; docLinks: Array<{ sourceId: string; targetId: string; context: string }> }> {
    const noteLinks: Array<{ sourceId: string; targetId: string; context: string }> = []
    const docLinks: Array<{ sourceId: string; targetId: string; context: string }> = []
    if (!(await this.fs.exists(this.notesDir))) {
      return { noteLinks, docLinks }
    }
    await this.scanNotesDir(this.notesDir, '', noteLinks, docLinks)
    return { noteLinks, docLinks }
  }

  private async scanNotesDir(dir: string, prefix: string, pendingLinks: Array<{ sourceId: string; targetId: string; context: string }>, pendingDocLinks: Array<{ sourceId: string; targetId: string; context: string }>): Promise<void> {
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

  private async indexNoteJsonFile(relPath: string, pendingLinks: Array<{ sourceId: string; targetId: string; context: string }>, pendingDocLinks: Array<{ sourceId: string; targetId: string; context: string }>): Promise<void> {
    const filePath = join(this.notesDir, relPath)
    let raw: { meta: NoteFileData; blocks?: unknown[]; nodes?: any[]; edges?: any[]; boundaries?: any[]; summaries?: any[] }
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

    if (data.tags?.length) {
      for (const tagName of data.tags) {
        const tag = this.db.queryOne<{ id: string }>('SELECT id FROM tags WHERE name = ?', [tagName])
        if (tag) this.db.run('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', [data.id, tag.id])
      }
    }

    const noteLinks = extractNoteLinks(Array.isArray(raw.blocks) ? raw.blocks : [])
    for (const link of noteLinks) {
      pendingLinks.push({ sourceId: data.id, targetId: link.targetId, context: link.context })
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

  private async indexAllMindmaps(): Promise<void> {
    if (!(await this.fs.exists(this.mindmapsDir))) return
    await this.scanMindmapsDir(this.mindmapsDir, '')
  }

  private async scanMindmapsDir(dir: string, prefix: string): Promise<void> {
    const entries = await this.fs.readdirWithTypes(dir)
    for (const entry of entries) {
      if (entry.isDirectory) {
        await this.scanMindmapsDir(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
      } else if (entry.name.endsWith('.json')) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
        await this.indexMindmapFile(relPath)
      }
    }
  }

  private async indexMindmapFile(relPath: string): Promise<void> {
    const filePath = join(this.mindmapsDir, relPath)
    let mm: MindmapFileData
    try { mm = JSON.parse(await this.fs.readTextFile(filePath)) } catch { return }
    if (!mm.id) return

    this.db.run(
      `INSERT OR REPLACE INTO mindmaps (id, title, path, doc_id, layout, theme, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [mm.id, mm.title, relPath, mm.docId, mm.layout, mm.theme ?? 'classic', mm.createdAt, mm.updatedAt],
    )

    for (const node of mm.nodes ?? []) {
      this.db.run(
        `INSERT OR REPLACE INTO mindmap_nodes (id, mindmap_id, parent_id, title, content, hyperlink, image_url, color, notes, shape, style_overrides, position_x, position_y, sort_order, collapsed, floating, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [node.id, mm.id, node.parentId, node.title, node.content, node.hyperlink, node.imageUrl, node.color, node.notes, node.shape, node.styleOverrides, node.positionX, node.positionY, node.sortOrder, node.collapsed ? 1 : 0, node.floating ? 1 : 0, mm.createdAt],
      )
    }

    for (const edge of mm.edges ?? []) {
      this.db.run(
        `INSERT OR REPLACE INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)`,
        [edge.id, mm.id, edge.sourceId, edge.targetId, edge.label, edge.style],
      )
    }

    if (mm.tags?.length) {
      for (const tagName of mm.tags) {
        const tag = this.db.queryOne<{ id: string }>('SELECT id FROM tags WHERE name = ?', [tagName])
        if (tag) this.db.run('INSERT OR IGNORE INTO mindmap_tags (mindmap_id, tag_id) VALUES (?, ?)', [mm.id, tag.id])
      }
    }
  }

  private async writeMetaTimestamp(): Promise<void> {
    await this.fs.writeTextFile(this.metaPath, JSON.stringify({ lastIndexTime: Date.now() }))
  }
}
