import type Database from 'better-sqlite3'
import { watch, type FSWatcher, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { JsonStore } from '../storage/json-store.js'
import { parseFrontmatter } from '../storage/frontmatter.js'
import type { DocumentFileData, AnnotationFileData, MindmapFileData, NoteFileData } from '../types.js'

export class FileWatcher {
  private watchers: FSWatcher[] = []
  private debounceTimers = new Map<string, NodeJS.Timeout>()
  private docStore: JsonStore<DocumentFileData>
  private annStore: JsonStore<AnnotationFileData>
  private mmStore: JsonStore<MindmapFileData>

  constructor(private db: Database.Database, private rootPath: string) {
    const banjuanDir = join(rootPath, '.banjuan')
    this.docStore = new JsonStore(join(banjuanDir, 'data', 'documents'))
    this.annStore = new JsonStore(join(banjuanDir, 'data', 'annotations'))
    this.mmStore = new JsonStore(join(banjuanDir, 'data', 'mindmaps'))
  }

  start(): void {
    const dataDir = join(this.rootPath, '.banjuan', 'data')
    const notesDir = join(this.rootPath, '.banjuan', 'notes')

    const watchDir = (dir: string) => {
      if (!existsSync(dir)) return
      try {
        const watcher = watch(dir, { recursive: true }, (_event, filename) => {
          if (filename) this.handleChange(dir, filename)
        })
        this.watchers.push(watcher)
      } catch {
        // recursive watch not supported on all platforms
      }
    }

    watchDir(dataDir)
    watchDir(notesDir)
  }

  stop(): void {
    for (const watcher of this.watchers) {
      watcher.close()
    }
    this.watchers = []
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
  }

  private handleChange(baseDir: string, filename: string): void {
    const fullPath = join(baseDir, filename)
    const key = fullPath

    const existing = this.debounceTimers.get(key)
    if (existing) clearTimeout(existing)

    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key)
      this.processChange(baseDir, filename)
    }, 200))
  }

  private processChange(baseDir: string, filename: string): void {
    const fullPath = join(baseDir, filename)
    const isNotesDir = baseDir === join(this.rootPath, '.banjuan', 'notes')

    if (isNotesDir && filename.endsWith('.md')) {
      this.reindexNote(filename)
    } else if (filename.endsWith('.json')) {
      if (filename.includes('documents')) {
        this.reindexDocumentFile(fullPath)
      } else if (filename.includes('annotations')) {
        this.reindexAnnotationFile(fullPath)
      } else if (filename.includes('mindmaps')) {
        this.reindexMindmapFile(fullPath)
      }
    }
  }

  private reindexDocumentFile(fullPath: string): void {
    if (!existsSync(fullPath)) return
    try {
      const doc = JSON.parse(readFileSync(fullPath, 'utf-8')) as DocumentFileData
      this.db.prepare(
        `INSERT OR REPLACE INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(doc.id, doc.title, JSON.stringify(doc.authors), doc.path, doc.type, doc.hash, JSON.stringify(doc.metadata), doc.createdAt, doc.updatedAt)
    } catch { /* ignore malformed files */ }
  }

  private reindexAnnotationFile(fullPath: string): void {
    if (!existsSync(fullPath)) return
    try {
      const ann = JSON.parse(readFileSync(fullPath, 'utf-8')) as AnnotationFileData
      this.db.prepare(
        `INSERT OR REPLACE INTO annotations (id, doc_id, type, page, position, content, selected_text, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(ann.id, ann.docId, ann.type, ann.page, JSON.stringify(ann.position), ann.content, ann.selectedText, ann.color, ann.createdAt, ann.updatedAt)
    } catch { /* ignore malformed files */ }
  }

  private reindexMindmapFile(fullPath: string): void {
    if (!existsSync(fullPath)) return
    try {
      const mm = JSON.parse(readFileSync(fullPath, 'utf-8')) as MindmapFileData
      this.db.prepare('INSERT OR REPLACE INTO mindmaps (id, title, doc_id, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(mm.id, mm.title, mm.docId, mm.layout, mm.createdAt, mm.updatedAt)

      this.db.prepare('DELETE FROM mindmap_edges WHERE mindmap_id = ?').run(mm.id)
      this.db.prepare('DELETE FROM mindmap_nodes WHERE mindmap_id = ?').run(mm.id)
      for (const node of mm.nodes) {
        this.db.prepare(
          `INSERT OR REPLACE INTO mindmap_nodes (id, mindmap_id, parent_id, title, content, hyperlink, image_url, color, notes, shape, style_overrides, position_x, position_y, sort_order, collapsed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(node.id, mm.id, node.parentId, node.title, node.content, node.hyperlink, node.imageUrl, node.color, node.notes, node.shape, node.styleOverrides, node.positionX, node.positionY, node.sortOrder, node.collapsed ? 1 : 0, mm.createdAt)
      }
      for (const edge of mm.edges) {
        this.db.prepare('INSERT OR REPLACE INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)').run(edge.id, mm.id, edge.sourceId, edge.targetId, edge.label, edge.style)
      }
    } catch { /* ignore malformed files */ }
  }

  private reindexNote(filename: string): void {
    const filePath = join(this.rootPath, '.banjuan', 'notes', filename)
    if (!existsSync(filePath)) return
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const { data } = parseFrontmatter<NoteFileData>(raw)
      if (!data.id) return
      this.db.prepare(
        `INSERT OR REPLACE INTO notes (id, title, path, doc_id, folder_id, content_format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(data.id, data.title ?? filename, filename, data.docId ?? null, data.folderId ?? null, data.contentFormat ?? 'json', data.createdAt ?? new Date().toISOString(), data.updatedAt ?? new Date().toISOString())
    } catch { /* ignore malformed files */ }
  }
}
