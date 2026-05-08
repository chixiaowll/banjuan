import type Database from 'better-sqlite3'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
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

  constructor(private db: Database.Database, private rootPath: string) {
    const banjuanDir = join(rootPath, '.banjuan')
    this.docStore = new JsonStore(join(banjuanDir, 'data', 'documents'))
    this.annStore = new JsonStore(join(banjuanDir, 'data', 'annotations'))
    this.metaPath = join(banjuanDir, 'db.meta.json')
    this.tagsPath = join(banjuanDir, 'tags.json')
    this.notesDir = join(rootPath, '.banjuan', 'notes')
    this.mindmapsDir = join(rootPath, '.banjuan', 'mindmaps')
  }

  async rebuildFull(): Promise<void> {
    this.db.pragma('foreign_keys = OFF')
    try {
    this.indexTags()

    for (const doc of this.docStore.listAll()) {
      this.indexDocument(doc)
    }

    for (const ann of this.annStore.listAll()) {
      this.indexAnnotation(ann)
    }

    const { noteLinks: pendingLinks, docLinks: pendingDocLinks } = this.indexAllNotes()
    const insertNoteLink = this.db.prepare('INSERT OR IGNORE INTO note_links (source_id, target_id, context) VALUES (?, ?, ?)')
    for (const link of pendingLinks) {
      insertNoteLink.run(link.sourceId, link.targetId, link.context)
    }
    const insertDocLink = this.db.prepare('INSERT OR IGNORE INTO doc_links (source_id, target_id, context) VALUES (?, ?, ?)')
    for (const link of pendingDocLinks) {
      insertDocLink.run(link.sourceId, link.targetId, link.context)
    }

    this.indexAllMindmaps()

    this.writeMetaTimestamp()
    } finally {
      this.db.pragma('foreign_keys = ON')
    }
  }

  private indexTags(): void {
    if (!existsSync(this.tagsPath)) return
    const tags = JSON.parse(readFileSync(this.tagsPath, 'utf-8')) as Array<{ id: string; name: string; color: string | null }>
    const insert = this.db.prepare('INSERT OR REPLACE INTO tags (id, name, color) VALUES (?, ?, ?)')
    for (const tag of tags) {
      insert.run(tag.id, tag.name, tag.color)
    }
  }

  private indexDocument(doc: DocumentFileData): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(doc.id, doc.title, JSON.stringify(doc.authors), doc.path, doc.type, doc.hash, JSON.stringify(doc.metadata), doc.createdAt, doc.updatedAt)

    this.db.prepare(
      `INSERT INTO search_index (rowid, title, content, type)
       VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`
    ).run(doc.title, doc.title, `document:${doc.id}`)

    if (doc.tags?.length) {
      const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?')
      const insertTag = this.db.prepare('INSERT OR IGNORE INTO doc_tags (doc_id, tag_id) VALUES (?, ?)')
      for (const tagName of doc.tags) {
        const tag = findTag.get(tagName) as { id: string } | undefined
        if (tag) insertTag.run(doc.id, tag.id)
      }
    }
  }

  private indexAnnotation(ann: AnnotationFileData): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO annotations (id, doc_id, type, page, position, content, selected_text, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(ann.id, ann.docId, ann.type, ann.page, JSON.stringify(ann.position), ann.content, ann.selectedText, ann.color, ann.createdAt, ann.updatedAt)
  }

  private indexAllNotes(): { noteLinks: Array<{ sourceId: string; targetId: string; context: string }>; docLinks: Array<{ sourceId: string; targetId: string; context: string }> } {
    const noteLinks: Array<{ sourceId: string; targetId: string; context: string }> = []
    const docLinks: Array<{ sourceId: string; targetId: string; context: string }> = []
    if (!existsSync(this.notesDir)) return { noteLinks, docLinks }
    this.scanNotesDir(this.notesDir, '', noteLinks, docLinks)
    return { noteLinks, docLinks }
  }

  private scanNotesDir(dir: string, prefix: string, pendingLinks: Array<{ sourceId: string; targetId: string; context: string }>, pendingDocLinks: Array<{ sourceId: string; targetId: string; context: string }>): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        this.scanNotesDir(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name, pendingLinks, pendingDocLinks)
      } else if (entry.isFile()) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.name.endsWith('.json')) {
          this.indexNoteJsonFile(relPath, pendingLinks, pendingDocLinks)
        } else if (entry.name.endsWith('.md')) {
          this.indexNoteMdFile(relPath)
        }
      }
    }
  }

  private indexNoteJsonFile(relPath: string, pendingLinks: Array<{ sourceId: string; targetId: string; context: string }>, pendingDocLinks: Array<{ sourceId: string; targetId: string; context: string }>): void {
    const filePath = join(this.notesDir, relPath)
    let raw: { meta: NoteFileData; blocks: unknown[] }
    try {
      raw = JSON.parse(readFileSync(filePath, 'utf-8'))
    } catch {
      return
    }
    const data = raw.meta

    if (!data.id) return

    const noteType = data.type ?? 'markdown'
    const typeMeta = data.typeMeta ? JSON.stringify(data.typeMeta) : null
    this.db.prepare(
      `INSERT OR REPLACE INTO notes (id, title, type, path, doc_id, folder_id, content_format, type_meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(data.id, data.title ?? relPath, noteType, relPath, data.docId ?? null, null, 'json', typeMeta, data.createdAt ?? new Date().toISOString(), data.updatedAt ?? new Date().toISOString())

    const textContent = this.blocksToText(raw.blocks ?? [])
    this.db.prepare(
      `INSERT INTO search_index (rowid, title, content, type)
       VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`
    ).run(data.title ?? relPath, textContent, `note:${data.id}`)

    if (data.annotationIds?.length) {
      const insertLink = this.db.prepare('INSERT OR IGNORE INTO note_annotations (note_id, annotation_id) VALUES (?, ?)')
      for (const annId of data.annotationIds) {
        insertLink.run(data.id, annId)
      }
    }

    if (data.tags?.length) {
      const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?')
      const insertTag = this.db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)')
      for (const tagName of data.tags) {
        const tag = findTag.get(tagName) as { id: string } | undefined
        if (tag) insertTag.run(data.id, tag.id)
      }
    }

    const noteLinks = extractNoteLinks(raw.blocks ?? [])
    for (const link of noteLinks) {
      pendingLinks.push({ sourceId: data.id, targetId: link.targetId, context: link.context })
    }

    const docLinksFound = extractDocumentLinks(raw.blocks ?? [])
    for (const link of docLinksFound) {
      pendingDocLinks.push({ sourceId: data.id, targetId: link.targetId, context: link.context })
    }
  }

  private indexNoteMdFile(relPath: string): void {
    const filePath = join(this.notesDir, relPath)
    const raw = readFileSync(filePath, 'utf-8')
    const { data, content } = parseFrontmatter<NoteFileData>(raw)

    if (!data.id) return

    this.db.prepare(
      `INSERT OR REPLACE INTO notes (id, title, type, path, doc_id, folder_id, content_format, type_meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(data.id, data.title ?? relPath, 'markdown', relPath, data.docId ?? null, null, data.contentFormat ?? 'markdown', null, data.createdAt ?? new Date().toISOString(), data.updatedAt ?? new Date().toISOString())

    this.db.prepare(
      `INSERT INTO search_index (rowid, title, content, type)
       VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`
    ).run(data.title ?? relPath, content, `note:${data.id}`)

    if (data.annotationIds?.length) {
      const insertLink = this.db.prepare('INSERT OR IGNORE INTO note_annotations (note_id, annotation_id) VALUES (?, ?)')
      for (const annId of data.annotationIds) {
        insertLink.run(data.id, annId)
      }
    }

    if (data.tags?.length) {
      const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?')
      const insertTag = this.db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)')
      for (const tagName of data.tags) {
        const tag = findTag.get(tagName) as { id: string } | undefined
        if (tag) insertTag.run(data.id, tag.id)
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

  private indexAllMindmaps(): void {
    if (!existsSync(this.mindmapsDir)) return
    this.scanMindmapsDir(this.mindmapsDir, '')
  }

  private scanMindmapsDir(dir: string, prefix: string): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        this.scanMindmapsDir(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
        this.indexMindmapFile(relPath)
      }
    }
  }

  private indexMindmapFile(relPath: string): void {
    const filePath = join(this.mindmapsDir, relPath)
    let mm: MindmapFileData
    try { mm = JSON.parse(readFileSync(filePath, 'utf-8')) } catch { return }
    if (!mm.id) return

    this.db.prepare(
      `INSERT OR REPLACE INTO mindmaps (id, title, path, doc_id, layout, theme, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(mm.id, mm.title, relPath, mm.docId, mm.layout, mm.theme ?? 'classic', mm.createdAt, mm.updatedAt)

    for (const node of mm.nodes ?? []) {
      this.db.prepare(
        `INSERT OR REPLACE INTO mindmap_nodes (id, mindmap_id, parent_id, title, content, hyperlink, image_url, color, notes, shape, style_overrides, position_x, position_y, sort_order, collapsed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(node.id, mm.id, node.parentId, node.title, node.content, node.hyperlink, node.imageUrl, node.color, node.notes, node.shape, node.styleOverrides, node.positionX, node.positionY, node.sortOrder, node.collapsed ? 1 : 0, mm.createdAt)
    }

    for (const edge of mm.edges ?? []) {
      this.db.prepare(
        `INSERT OR REPLACE INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(edge.id, mm.id, edge.sourceId, edge.targetId, edge.label, edge.style)
    }

    if (mm.tags?.length) {
      const findTag = this.db.prepare('SELECT id FROM tags WHERE name = ?')
      const insertTag = this.db.prepare('INSERT OR IGNORE INTO mindmap_tags (mindmap_id, tag_id) VALUES (?, ?)')
      for (const tagName of mm.tags) {
        const tag = findTag.get(tagName) as { id: string } | undefined
        if (tag) insertTag.run(mm.id, tag.id)
      }
    }
  }

  private writeMetaTimestamp(): void {
    writeFileSync(this.metaPath, JSON.stringify({ lastIndexTime: Date.now() }))
  }
}
