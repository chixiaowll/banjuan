import type Database from 'better-sqlite3'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { JsonStore } from '../storage/json-store.js'
import { parseFrontmatter } from '../storage/frontmatter.js'
import type { DocumentFileData, AnnotationFileData, MindmapFileData, NoteFileData } from '../types.js'

export class IndexService {
  private docStore: JsonStore<DocumentFileData>
  private annStore: JsonStore<AnnotationFileData>
  private mmStore: JsonStore<MindmapFileData>
  private metaPath: string
  private tagsPath: string
  private notesDir: string

  constructor(private db: Database.Database, private rootPath: string) {
    const banjuanDir = join(rootPath, '.banjuan')
    this.docStore = new JsonStore(join(banjuanDir, 'data', 'documents'))
    this.annStore = new JsonStore(join(banjuanDir, 'data', 'annotations'))
    this.mmStore = new JsonStore(join(banjuanDir, 'data', 'mindmaps'))
    this.metaPath = join(banjuanDir, 'db.meta.json')
    this.tagsPath = join(banjuanDir, 'tags.json')
    this.notesDir = join(rootPath, 'notes')
  }

  async rebuildFull(): Promise<void> {
    this.db.prepare('DELETE FROM mindmap_edges').run()
    this.db.prepare('DELETE FROM mindmap_nodes').run()
    this.db.prepare('DELETE FROM mindmap_tags').run()
    this.db.prepare('DELETE FROM note_annotations').run()
    this.db.prepare('DELETE FROM note_tags').run()
    this.db.prepare('DELETE FROM doc_tags').run()
    this.db.prepare('DELETE FROM mindmaps').run()
    this.db.prepare('DELETE FROM annotations').run()
    this.db.prepare('DELETE FROM notes').run()
    this.db.prepare('DELETE FROM documents').run()
    this.db.prepare('DELETE FROM tags').run()
    this.db.prepare("DELETE FROM search_index").run()

    this.indexTags()

    for (const doc of this.docStore.listAll()) {
      this.indexDocument(doc)
    }

    for (const ann of this.annStore.listAll()) {
      this.indexAnnotation(ann)
    }

    this.indexAllNotes()

    for (const mm of this.mmStore.listAll()) {
      this.indexMindmap(mm)
    }

    this.writeMetaTimestamp()
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

  private indexAllNotes(): void {
    if (!existsSync(this.notesDir)) return
    const files = readdirSync(this.notesDir, { withFileTypes: true })
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.md')) continue
      this.indexNoteFile(file.name)
    }
  }

  private indexNoteFile(filename: string): void {
    const filePath = join(this.notesDir, filename)
    const raw = readFileSync(filePath, 'utf-8')
    const { data, content } = parseFrontmatter<NoteFileData>(raw)

    if (!data.id) return

    this.db.prepare(
      `INSERT OR REPLACE INTO notes (id, title, path, doc_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(data.id, data.title ?? filename, filename, data.docId ?? null, data.createdAt ?? new Date().toISOString(), data.updatedAt ?? new Date().toISOString())

    this.db.prepare(
      `INSERT INTO search_index (rowid, title, content, type)
       VALUES ((SELECT COALESCE(MAX(rowid), 0) + 1 FROM search_index), ?, ?, ?)`
    ).run(data.title ?? filename, content, `note:${data.id}`)

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

  private indexMindmap(mm: MindmapFileData): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO mindmaps (id, title, doc_id, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(mm.id, mm.title, mm.docId, mm.layout, mm.createdAt, mm.updatedAt)

    for (const node of mm.nodes) {
      this.db.prepare(
        `INSERT OR REPLACE INTO mindmap_nodes (id, mindmap_id, parent_id, annotation_id, title, content, color, position_x, position_y, sort_order, collapsed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(node.id, mm.id, node.parentId, node.annotationId, node.title, node.content, node.color, node.positionX, node.positionY, node.sortOrder, node.collapsed ? 1 : 0, mm.createdAt)
    }

    for (const edge of mm.edges) {
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
