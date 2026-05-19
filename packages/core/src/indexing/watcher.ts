import type { PlatformDatabase, PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'
import { JsonStore } from '../storage/json-store.js'
import { parseFrontmatter } from '../storage/frontmatter.js'
import type { DocumentFileData, AnnotationFileData, MindmapFileData, NoteFileData } from '../types.js'

export class FileWatcher {
  private watchers: Array<{ close(): void }> = []
  private debounceTimers = new Map<string, NodeJS.Timeout>()
  private docStore: JsonStore<DocumentFileData>
  private annStore: JsonStore<AnnotationFileData>
  private mmStore: JsonStore<MindmapFileData>

  constructor(private db: PlatformDatabase, private rootPath: string, private fs: PlatformFS) {
    const banjuanDir = join(rootPath, '.banjuan')
    this.docStore = new JsonStore(join(banjuanDir, 'data', 'documents'), fs)
    this.annStore = new JsonStore(join(banjuanDir, 'data', 'annotations'), fs)
    this.mmStore = new JsonStore(join(banjuanDir, 'data', 'mindmaps'), fs)
  }

  async start(): Promise<void> {
    const dataDir = join(this.rootPath, '.banjuan', 'data')
    const notesDir = join(this.rootPath, '.banjuan', 'notes')

    if (!this.fs.watch) return

    const watchDir = async (dir: string) => {
      if (!(await this.fs.exists(dir))) return
      try {
        const watcher = this.fs.watch!(dir, { recursive: true }, (_event, filename) => {
          if (filename) this.handleChange(dir, filename)
        })
        this.watchers.push(watcher)
      } catch {
        // recursive watch not supported on all platforms
      }
    }

    await watchDir(dataDir)
    await watchDir(notesDir)
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

  private async reindexDocumentFile(fullPath: string): Promise<void> {
    if (!(await this.fs.exists(fullPath))) return
    try {
      const doc = JSON.parse(await this.fs.readTextFile(fullPath)) as DocumentFileData
      const existing = this.db.queryOne<{ metadata: string }>('SELECT metadata FROM documents WHERE id = ?', [doc.id])
      let mergedMeta = doc.metadata || {}
      if (existing?.metadata) {
        try { mergedMeta = { ...JSON.parse(existing.metadata), ...mergedMeta } } catch {}
      }
      this.db.run(
        `INSERT OR REPLACE INTO documents (id, title, authors, path, type, hash, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [doc.id, doc.title, JSON.stringify(doc.authors), doc.path, doc.type, doc.hash, JSON.stringify(mergedMeta), doc.createdAt, doc.updatedAt],
      )
    } catch { /* ignore malformed files */ }
  }

  private async reindexAnnotationFile(fullPath: string): Promise<void> {
    if (!(await this.fs.exists(fullPath))) return
    try {
      const ann = JSON.parse(await this.fs.readTextFile(fullPath)) as AnnotationFileData
      this.db.run(
        `INSERT OR REPLACE INTO annotations (id, doc_id, type, page, position, content, selected_text, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ann.id, ann.docId, ann.type, ann.page, JSON.stringify(ann.position), ann.content, ann.selectedText, ann.color, ann.createdAt, ann.updatedAt],
      )
    } catch { /* ignore malformed files */ }
  }

  private async reindexMindmapFile(fullPath: string): Promise<void> {
    if (!(await this.fs.exists(fullPath))) return
    try {
      const mm = JSON.parse(await this.fs.readTextFile(fullPath)) as MindmapFileData
      this.db.run('INSERT OR REPLACE INTO mindmaps (id, title, doc_id, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [mm.id, mm.title, mm.docId, mm.layout, mm.createdAt, mm.updatedAt])

      this.db.run('DELETE FROM mindmap_edges WHERE mindmap_id = ?', [mm.id])
      this.db.run('DELETE FROM mindmap_nodes WHERE mindmap_id = ?', [mm.id])
      for (const node of mm.nodes) {
        this.db.run(
          `INSERT OR REPLACE INTO mindmap_nodes (id, mindmap_id, parent_id, title, content, hyperlink, image_url, color, notes, shape, style_overrides, position_x, position_y, sort_order, collapsed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [node.id, mm.id, node.parentId, node.title, node.content, node.hyperlink, node.imageUrl, node.color, node.notes, node.shape, node.styleOverrides, node.positionX, node.positionY, node.sortOrder, node.collapsed ? 1 : 0, mm.createdAt],
        )
      }
      for (const edge of mm.edges) {
        this.db.run(
          'INSERT OR REPLACE INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)',
          [edge.id, mm.id, edge.sourceId, edge.targetId, edge.label, edge.style],
        )
      }
    } catch { /* ignore malformed files */ }
  }

  private async reindexNote(filename: string): Promise<void> {
    const filePath = join(this.rootPath, '.banjuan', 'notes', filename)
    if (!(await this.fs.exists(filePath))) return
    try {
      const raw = await this.fs.readTextFile(filePath)
      const { data } = parseFrontmatter<NoteFileData>(raw)
      if (!data.id) return
      this.db.run(
        `INSERT OR REPLACE INTO notes (id, title, path, doc_id, folder_id, content_format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.id, data.title ?? filename, filename, data.docId ?? null, data.folderId ?? null, data.contentFormat ?? 'json', data.createdAt ?? new Date().toISOString(), data.updatedAt ?? new Date().toISOString()],
      )
    } catch { /* ignore malformed files */ }
  }
}
