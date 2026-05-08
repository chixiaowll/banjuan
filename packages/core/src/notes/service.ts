import type { PlatformDatabase, PlatformFS } from '../platform/index.js'
import { join, dirname } from '../platform/path.js'
import { v4 as uuid } from 'uuid'
import type { Note, NoteCreateInput, NoteListOptions, Annotation, NoteFileData, NoteType, HandwritingNoteJsonFile } from '../types.js'
import type { SearchService } from '../search/service.js'
import type { EventBus } from '../events/bus.js'
import type { TemplateService } from './template-service.js'
import type { NoteLinkService } from './link-service.js'

interface NoteJsonFile {
  meta: NoteFileData
  blocks: unknown[]
}

interface MindmapNoteJsonFile {
  meta: NoteFileData
  nodes: Array<Record<string, unknown>>
  edges: Array<Record<string, unknown>>
}

export class NoteService {
  private notesDir: string
  private templateService: TemplateService | null = null
  private linkService: NoteLinkService | null = null

  constructor(
    private db: PlatformDatabase,
    private rootPath: string,
    private search: SearchService,
    private events: EventBus,
    private fs: PlatformFS,
  ) {
    this.notesDir = join(rootPath, '.banjuan', 'notes')
  }

  setTemplateService(svc: TemplateService): void { this.templateService = svc }

  async syncDisk(): Promise<void> {
    if (!(await this.fs.exists(this.notesDir))) return
    const knownPaths = new Set(
      (this.db.query<{ path: string }>('SELECT path FROM notes')).map(r => r.path)
    )
    const scan = async (dir: string, prefix: string) => {
      const entries = await this.fs.readdirWithTypes(dir)
      for (const entry of entries) {
        if (entry.isDirectory) {
          await scan(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
        } else if (entry.name.endsWith('.json')) {
          const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
          if (!knownPaths.has(relPath)) {
            try {
              const rawText = await this.fs.readTextFile(join(dir, entry.name))
              const raw = JSON.parse(rawText)
              const m = raw.meta as NoteFileData
              const noteType = m.type ?? 'markdown'
              const typeMeta = m.typeMeta ? JSON.stringify(m.typeMeta) : null
              this.db.run(
                'INSERT OR IGNORE INTO notes (id, title, type, path, doc_id, folder_id, content_format, type_meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [m.id, m.title, noteType, relPath, m.docId ?? null, null, m.contentFormat ?? 'json', typeMeta, m.createdAt, m.updatedAt],
              )
              if (noteType === 'mindmap' && raw.nodes) {
                this.importMindmapNodesFromFile(m.id, raw.nodes, raw.edges ?? [])
              }
              this.syncLinksFromFile(m.id, rawText)
            } catch { /* skip malformed files */ }
          }
        }
      }
    }
    await scan(this.notesDir, '')
  }

  private syncLinksFromFile(noteId: string, rawJson: string): void {
    if (!this.linkService) return
    const seen = new Set<string>()
    const links: Array<{ targetId: string; context: string }> = []
    const re = /"noteId"\s*:\s*"([a-f0-9-]{36})"/g
    let match: RegExpExecArray | null
    while ((match = re.exec(rawJson)) !== null) {
      const targetId = match[1]
      if (targetId !== noteId && !seen.has(targetId)) {
        seen.add(targetId)
        links.push({ targetId, context: '' })
      }
    }
    if (links.length > 0) {
      this.linkService.sync(noteId, links)
    }
  }
  setLinkService(svc: NoteLinkService): void { this.linkService = svc }

  async listDirs(): Promise<string[]> {
    await this.fs.mkdir(this.notesDir, { recursive: true })
    const dirs: string[] = []
    const scan = async (dir: string, prefix: string) => {
      const entries = await this.fs.readdirWithTypes(dir)
      for (const entry of entries) {
        if (entry.isDirectory) {
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name
          dirs.push(rel)
          await scan(join(dir, entry.name), rel)
        }
      }
    }
    await scan(this.notesDir, '')
    return dirs.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }

  async createDir(dirPath: string): Promise<void> {
    await this.fs.mkdir(join(this.notesDir, dirPath), { recursive: true })
  }

  async renameDir(oldPath: string, newPath: string): Promise<void> {
    const oldFull = join(this.notesDir, oldPath)
    const newFull = join(this.notesDir, newPath)
    if (!(await this.fs.exists(oldFull))) throw new Error('Directory not found')
    await this.fs.mkdir(dirname(newFull), { recursive: true })
    await this.fs.rename(oldFull, newFull)
    const prefix = oldPath + '/'
    const notes = this.db.query<{ id: string; path: string }>('SELECT id, path FROM notes WHERE path LIKE ?', [prefix + '%'])
    const now = new Date().toISOString()
    for (const note of notes) {
      this.db.run('UPDATE notes SET path = ?, updated_at = ? WHERE id = ?', [newPath + '/' + note.path.substring(prefix.length), now, note.id])
    }
  }

  async create(input: NoteCreateInput): Promise<Note> {
    const id = uuid()
    const now = new Date().toISOString()
    const noteType: NoteType = input.type ?? 'markdown'

    const folder = input.folder ?? ''
    const targetDir = folder ? join(this.notesDir, folder) : this.notesDir
    await this.fs.mkdir(targetDir, { recursive: true })

    if (input.docId) {
      const dup = this.db.queryOne<{ id: string }>(
        'SELECT id FROM notes WHERE title = ? AND doc_id = ?', [input.title, input.docId])
      if (dup) throw new Error('DUPLICATE_TITLE')
    } else {
      const pathPrefix = folder ? folder + '/' : ''
      const dup = pathPrefix
        ? this.db.queryOne<{ id: string }>(
            'SELECT id FROM notes WHERE title = ? AND path LIKE ? AND path NOT LIKE ?',
            [input.title, pathPrefix + '%', pathPrefix + '%/%'])
        : this.db.queryOne<{ id: string }>(
            'SELECT id FROM notes WHERE title = ? AND path NOT LIKE ? AND doc_id IS NULL',
            [input.title, '%/%'])
      if (dup) throw new Error('DUPLICATE_TITLE')
    }

    const filename = `${id}.json`
    const relPath = folder ? `${folder}/${filename}` : filename
    const fullPath = join(this.notesDir, relPath)

    let typeMeta: Record<string, unknown> | null = null
    if (noteType === 'mindmap') {
      typeMeta = { layout: input.layout ?? 'mindmap', theme: input.theme ?? 'classic' }
    }
    if (noteType === 'handwriting') {
      typeMeta = {
        pageSize: { width: 1024, height: 768 },
        defaultTemplate: 'blank',
      }
    }

    const meta: NoteFileData = {
      id, title: input.title, type: noteType, docId: input.docId ?? null,
      folderId: null, annotationIds: input.annotationIds ?? [],
      tags: [], contentFormat: 'json', typeMeta, createdAt: now, updatedAt: now,
    }

    let contentStr: string
    let pendingRootNode: { id: string; title: string } | null = null
    if (noteType === 'mindmap') {
      const rootNodeId = uuid()
      const rootNode = {
        id: rootNodeId, parentId: null,
        title: input.title || 'Central Topic',
        content: null, hyperlink: null, imageUrl: null,
        color: null, notes: null, shape: null, styleOverrides: null,
        positionX: null, positionY: null,
        sortOrder: 0, collapsed: false, floating: false,
      }
      await this.fs.writeTextFile(fullPath, JSON.stringify({ meta, nodes: [rootNode], edges: [] }, null, 2))
      pendingRootNode = { id: rootNodeId, title: rootNode.title }
      contentStr = JSON.stringify({ nodes: [rootNode], edges: [] })
    } else if (noteType === 'handwriting') {
      const initialPageId = uuid()
      const initialPage = { id: initialPageId, template: 'blank', snapshot: { strokes: [] } }
      const fileData = { meta, pages: [initialPage], currentPageIndex: 0 }
      await this.fs.writeTextFile(fullPath, JSON.stringify(fileData, null, 2))
      contentStr = JSON.stringify({ pages: [initialPage], currentPageIndex: 0 })
    } else {
      let blocks: unknown[] = []
      if (input.templateId && this.templateService) {
        const tpl = await this.templateService.get(input.templateId)
        if (tpl) blocks = JSON.parse(tpl.content)
      }
      if (input.content) {
        try { blocks = JSON.parse(input.content) } catch { blocks = [] }
      }
      await this.fs.writeTextFile(fullPath, JSON.stringify({ meta, blocks }, null, 2))
      contentStr = JSON.stringify(blocks)
      this.search.index({ id, title: input.title, content: this.blocksToText(blocks), type: 'note' })
    }

    this.db.run(
      'INSERT INTO notes (id, title, type, path, doc_id, folder_id, content_format, type_meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, input.title, noteType, relPath, input.docId ?? null, null, 'json', typeMeta ? JSON.stringify(typeMeta) : null, now, now],
    )

    if (pendingRootNode) {
      this.db.run(
        `INSERT INTO mindmap_nodes (id, mindmap_id, parent_id, title, content, hyperlink, image_url, color, notes, shape, style_overrides, position_x, position_y, sort_order, collapsed, floating, created_at)
         VALUES (?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, ?)`,
        [pendingRootNode.id, id, pendingRootNode.title, now],
      )
    }

    if (input.annotationIds?.length) {
      for (const annId of input.annotationIds) {
        this.db.run('INSERT INTO note_annotations (note_id, annotation_id) VALUES (?, ?)', [id, annId])
      }
    }

    const note: Note = {
      id, title: input.title, type: noteType, path: relPath, docId: input.docId ?? null,
      folderId: null, content: contentStr,
      contentFormat: 'json', typeMeta, createdAt: now, updatedAt: now,
    }
    this.events.emit('note:created', { note })
    return note
  }

  async list(options?: NoteListOptions): Promise<Note[]> {
    let sql = 'SELECT * FROM notes'
    const params: unknown[] = []
    const conditions: string[] = []
    if (options?.type) { conditions.push('type = ?'); params.push(options.type) }
    if (options?.docId) { conditions.push('doc_id = ?'); params.push(options.docId) }
    if (options?.folderId) { conditions.push('folder_id = ?'); params.push(options.folderId) }
    if (options?.tag) {
      conditions.push('id IN (SELECT note_id FROM note_tags JOIN tags ON tags.id = note_tags.tag_id WHERE tags.name = ?)')
      params.push(options.tag)
    }
    if (conditions.length) { sql += ` WHERE ${conditions.join(' AND ')}` }
    const sort = options?.sort ?? 'created_at'
    const order = options?.order ?? 'desc'
    sql += ` ORDER BY ${sort} ${order}`
    return (this.db.query<Record<string, unknown>>(sql, params)).map(r => this.rowToNote(r))
  }

  async get(id: string): Promise<Note | null> {
    const row = this.db.queryOne<Record<string, unknown>>('SELECT * FROM notes WHERE id = ?', [id])
    if (!row) return null
    const note = this.rowToNote(row)
    const filePath = join(this.notesDir, note.path)
    if (await this.fs.exists(filePath)) {
      const raw = await this.fs.readTextFile(filePath)
      if (note.type === 'mindmap') {
        const parsed = JSON.parse(raw) as MindmapNoteJsonFile
        note.content = JSON.stringify({ nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] })
      } else if (note.type === 'handwriting') {
        const parsed = JSON.parse(raw) as HandwritingNoteJsonFile
        note.content = JSON.stringify({ pages: parsed.pages ?? [], currentPageIndex: parsed.currentPageIndex ?? 0 })
      } else if (note.contentFormat === 'json') {
        const parsed = JSON.parse(raw) as NoteJsonFile
        note.content = JSON.stringify(parsed.blocks)
      } else {
        const { parseFrontmatter } = await import('../storage/frontmatter.js')
        const { content } = parseFrontmatter(raw)
        note.content = content
      }
    }
    return note
  }

  async update(id: string, updates: { title?: string; content?: string; typeMeta?: Record<string, unknown> }): Promise<Note> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
    if (updates.typeMeta !== undefined) { sets.push('type_meta = ?'); params.push(JSON.stringify(updates.typeMeta)) }
    params.push(id)
    this.db.run(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`, params)

    const row = this.db.queryOne<Record<string, unknown>>('SELECT * FROM notes WHERE id = ?', [id])!
    const filePath = join(this.notesDir, row.path as string)

    if ((await this.fs.exists(filePath)) && (row.content_format as string) === 'json') {
      if ((row.type as string) === 'mindmap') {
        const raw = JSON.parse(await this.fs.readTextFile(filePath)) as MindmapNoteJsonFile
        if (updates.title !== undefined) raw.meta.title = updates.title
        if (updates.typeMeta !== undefined) raw.meta.typeMeta = updates.typeMeta
        raw.meta.updatedAt = now
        await this.fs.writeTextFile(filePath, JSON.stringify(raw, null, 2))
      } else if ((row.type as string) === 'handwriting') {
        const raw = JSON.parse(await this.fs.readTextFile(filePath)) as HandwritingNoteJsonFile
        if (updates.title !== undefined) raw.meta.title = updates.title
        if (updates.typeMeta !== undefined) raw.meta.typeMeta = updates.typeMeta
        raw.meta.updatedAt = now
        if (updates.content !== undefined) {
          try {
            const parsed = JSON.parse(updates.content)
            raw.pages = parsed.pages ?? raw.pages
            raw.currentPageIndex = parsed.currentPageIndex ?? raw.currentPageIndex
          } catch { /* keep existing */ }
        }
        await this.fs.writeTextFile(filePath, JSON.stringify(raw, null, 2))
      } else {
        const raw = JSON.parse(await this.fs.readTextFile(filePath)) as NoteJsonFile
        if (updates.title !== undefined) raw.meta.title = updates.title
        raw.meta.updatedAt = now
        if (updates.content !== undefined) {
          try { raw.blocks = JSON.parse(updates.content) } catch { raw.blocks = [] }
        }
        await this.fs.writeTextFile(filePath, JSON.stringify(raw, null, 2))
      }
    }

    const note = (await this.get(id))!
    this.events.emit('note:updated', { note })
    return note
  }

  async move(id: string, targetFolder: string | null): Promise<Note> {
    const now = new Date().toISOString()
    const row = this.db.queryOne<{ path: string; title: string }>('SELECT path, title FROM notes WHERE id = ?', [id])
    if (!row) throw new Error('Note not found')

    const pathPrefix = targetFolder ? targetFolder + '/' : ''
    const dup = pathPrefix
      ? this.db.queryOne<{ id: string }>(
          'SELECT id FROM notes WHERE title = ? AND id != ? AND path LIKE ? AND path NOT LIKE ?',
          [row.title, id, pathPrefix + '%', pathPrefix + '%/%'])
      : this.db.queryOne<{ id: string }>(
          'SELECT id FROM notes WHERE title = ? AND id != ? AND path NOT LIKE ? AND doc_id IS NULL',
          [row.title, id, '%/%'])
    if (dup) throw new Error('DUPLICATE_TITLE')

    const oldPath = join(this.notesDir, row.path)
    const filename = `${id}.json`
    const newRelPath = targetFolder ? `${targetFolder}/${filename}` : filename
    const newFullPath = join(this.notesDir, newRelPath)

    if (oldPath !== newFullPath && (await this.fs.exists(oldPath))) {
      await this.fs.mkdir(dirname(newFullPath), { recursive: true })
      await this.fs.rename(oldPath, newFullPath)
    }

    if (await this.fs.exists(newFullPath)) {
      const raw = JSON.parse(await this.fs.readTextFile(newFullPath)) as NoteJsonFile
      raw.meta.folderId = null
      raw.meta.updatedAt = now
      await this.fs.writeTextFile(newFullPath, JSON.stringify(raw, null, 2))
    }

    this.db.run('UPDATE notes SET path = ?, folder_id = NULL, updated_at = ? WHERE id = ?', [newRelPath, now, id])
    const note = (await this.get(id))!
    this.events.emit('note:updated', { note })
    return note
  }

  async delete(id: string): Promise<void> {
    const row = this.db.queryOne<{ path: string; type: string }>('SELECT path, type FROM notes WHERE id = ?', [id])
    if (!row) return
    const filePath = join(this.notesDir, row.path)
    if (await this.fs.exists(filePath)) { await this.fs.remove(filePath) }
    this.search.removeById(id)
    if (this.linkService) { await this.linkService.removeAllForNote(id) }
    this.db.run('DELETE FROM note_annotations WHERE note_id = ?', [id])
    if (row.type === 'mindmap') {
      this.db.run('DELETE FROM mindmap_edges WHERE mindmap_id = ?', [id])
      this.db.run('DELETE FROM mindmap_nodes WHERE mindmap_id = ?', [id])
    }
    this.db.run('DELETE FROM note_tags WHERE note_id = ?', [id])
    this.db.run('DELETE FROM notes WHERE id = ?', [id])
    this.events.emit('note:deleted', { id })
  }

  async getAnnotations(noteId: string): Promise<Annotation[]> {
    const rows = this.db.query<Record<string, unknown>>(
      'SELECT a.* FROM annotations a JOIN note_annotations na ON a.id = na.annotation_id WHERE na.note_id = ?', [noteId])
    return rows.map((row) => ({
      id: row.id as string, docId: row.doc_id as string,
      type: row.type as Annotation['type'], page: row.page as number | null,
      position: JSON.parse(row.position as string),
      content: row.content as string | null, selectedText: row.selected_text as string | null,
      color: row.color as string, createdAt: row.created_at as string, updatedAt: row.updated_at as string,
    }))
  }

  importMindmapNodesFromFile(noteId: string, nodes: Array<Record<string, unknown>>, edges: Array<Record<string, unknown>>): void {
    for (const n of nodes) {
      this.db.run(
        `INSERT OR IGNORE INTO mindmap_nodes (id, mindmap_id, parent_id, title, content, hyperlink, image_url, color, notes, shape, style_overrides, position_x, position_y, sort_order, collapsed, floating, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [n.id, noteId, n.parentId ?? null,
          n.title, n.content ?? null,
          n.hyperlink ?? null, n.imageUrl ?? null,
          n.color ?? null, n.notes ?? null,
          n.shape ?? null, n.styleOverrides ?? null,
          n.positionX ?? null, n.positionY ?? null,
          n.sortOrder ?? 0, n.collapsed ? 1 : 0, n.floating ? 1 : 0, n.createdAt ?? new Date().toISOString()],
      )
    }
    for (const e of edges) {
      this.db.run(
        'INSERT OR IGNORE INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)',
        [e.id, noteId, e.sourceId, e.targetId, e.label ?? null, e.style ?? null],
      )
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

  private rowToNote(row: Record<string, unknown>): Note {
    let typeMeta: Record<string, unknown> | null = null
    if (row.type_meta) {
      try { typeMeta = JSON.parse(row.type_meta as string) } catch { /* ignore */ }
    }
    return {
      id: row.id as string, title: row.title as string,
      type: (row.type as NoteType) ?? 'markdown',
      path: row.path as string,
      docId: row.doc_id as string | null, folderId: row.folder_id as string | null,
      content: '', contentFormat: (row.content_format as 'json' | 'markdown') ?? 'json',
      typeMeta,
      createdAt: row.created_at as string, updatedAt: row.updated_at as string,
    }
  }
}
