import type { PlatformDatabase, PlatformFS } from '../platform/index.js'
import { join, dirname } from '../platform/path.js'
import { v4 as uuid } from 'uuid'
import { escapeLike, LIKE_ESCAPE } from '../db/like.js'
import type { Note, NoteCreateInput, NoteListOptions, Annotation, NoteFileData, NoteType, HandwritingNoteJsonFile } from '../types.js'
import type { SearchService } from '../search/service.js'
import type { EventBus } from '../events/bus.js'
import type { TemplateService } from './template-service.js'
import type { NoteLinkService } from './link-service.js'
import type { DocLinkService } from './doc-link-service.js'
import { extractNoteLinks, extractDocumentLinks, resolveNoteLinks } from './extract-links.js'
import { contentToBlocks, parseBlockList } from './migration.js'
import { AttachmentService } from './attachment-service.js'
import type { TrashService } from '../trash/service.js'
import { importMarkdownImages } from './import-images.js'
import { isSafeId } from '../storage/safe-path.js'
import { noteFileLock } from '../storage/keyed-lock.js'
import { noteLockKey } from './note-file.js'
import { NoteHistory, type NoteVersion } from './history.js'
import { parseHeadingLine, upsertSection } from './sections.js'

/** The app's own saves (an editor saving as you type) keep at most one version per note this often. */
const EDIT_VERSION_INTERVAL_MS = 10 * 60_000

export interface NoteWriteOptions {
  /** 'external': a program or AI through the local API — always keeps the previous version. */
  source?: 'app' | 'external'
  /** What the kept version is labelled (default: 'external' / 'edit'). */
  reason?: string
  /** The program writing ('cc-desk', 'cli'), recorded as who wrote the new content. */
  by?: string
}

/** A writer's name: short, plain (it ends up in files and lists). */
export function checkWriterName(by: string | undefined): void {
  if (by !== undefined && !/^[A-Za-z0-9._-]{1,40}$/.test(by)) throw new Error(`Invalid source name: ${by} (letters, digits, . _ -, up to 40)`)
}

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
  private docLinkService: DocLinkService | null = null

  constructor(
    private db: PlatformDatabase,
    private rootPath: string,
    private search: SearchService,
    private events: EventBus,
    private fs: PlatformFS,
  ) {
    this.notesDir = join(rootPath, '.banjuan', 'notes')
    this.versions = new NoteHistory(rootPath, fs)
  }

  /** Earlier versions of Markdown notes (history.ts). */
  private versions: NoteHistory
  /** Notes last written from outside: the next save from the app keeps that write as a version. */
  private externallyWritten = new Set<string>()

  /** A note titled `title` right in `folder` ('' = top level), not one of a document's notes. */
  private findInFolder(title: string, folder: string): string | null {
    const pathPrefix = folder ? folder + '/' : ''
    const row = pathPrefix
      ? this.db.queryOne<{ id: string }>(
          `SELECT id FROM notes WHERE title = ? AND path LIKE ? ${LIKE_ESCAPE} AND path NOT LIKE ? ${LIKE_ESCAPE}`,
          [title, escapeLike(pathPrefix) + '%', escapeLike(pathPrefix) + '%/%'])
      : this.db.queryOne<{ id: string }>(
          'SELECT id FROM notes WHERE title = ? AND path NOT LIKE ? AND doc_id IS NULL',
          [title, '%/%'])
    return row?.id ?? null
  }

  private trash: TrashService | null = null
  /** Deletes move the note file to the recycle bin instead of erasing it. */
  setTrash(trash: TrashService): void { this.trash = trash }

  setTemplateService(svc: TemplateService): void { this.templateService = svc }

  async syncDisk(): Promise<void> {
    if (!(await this.fs.exists(this.notesDir))) return
    const knownPaths = new Set(
      (this.db.query<{ path: string }>('SELECT path FROM notes')).map(r => r.path)
    )
    const pendingLinks: Array<{ noteId: string; rawText: string }> = []
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
              // The id becomes part of file paths (attachments): a file from a peer must not smuggle in "../".
              if (!isSafeId(m?.id)) {
                console.warn('[notes] skipping note file with an invalid id', relPath)
                continue
              }
              const noteType = m.type ?? 'markdown'
              const typeMeta = m.typeMeta ? JSON.stringify(m.typeMeta) : null
              this.db.run(
                'INSERT OR IGNORE INTO notes (id, title, type, path, doc_id, folder_id, content_format, type_meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [m.id, m.title, noteType, relPath, m.docId ?? null, null, m.contentFormat ?? 'json', typeMeta, m.createdAt, m.updatedAt],
              )
              if (noteType === 'mindmap' && raw.nodes) {
                this.importMindmapNodesFromFile(m.id, raw.nodes, raw.edges ?? [])
              }
              pendingLinks.push({ noteId: m.id, rawText })
            } catch { /* skip malformed files */ }
          }
        }
      }
    }
    await scan(this.notesDir, '')
    for (const { noteId, rawText } of pendingLinks) {
      this.syncLinksFromFile(noteId, rawText)
    }
  }

  private syncLinksFromFile(noteId: string, rawJson: string): void {
    if (!this.linkService) return
    const seen = new Set<string>()
    const links: Array<{ targetId: string; context: string }> = []
    const patterns = [
      /"noteId"\s*:\s*"([a-f0-9-]{36})"/g,
      /\\"noteId\\"\s*:\s*\\"([a-f0-9-]{36})\\"/g,
    ]
    for (const re of patterns) {
      let match: RegExpExecArray | null
      while ((match = re.exec(rawJson)) !== null) {
        const targetId = match[1]
        if (targetId !== noteId && !seen.has(targetId)) {
          seen.add(targetId)
          links.push({ targetId, context: '' })
        }
      }
    }
    if (links.length > 0) {
      this.linkService.sync(noteId, links)
    }
  }
  setLinkService(svc: NoteLinkService): void { this.linkService = svc }
  setDocLinkService(svc: DocLinkService): void { this.docLinkService = svc }

  /**
   * Keep note_links + doc_links in sync with a note's current content. Uses the
   * same extractors as IndexService.rebuildFull so incremental results match a
   * full rebuild exactly. Must be called AFTER the note's row exists (FK on
   * note_links.source_id). Both sync() calls delete-then-insert for this source,
   * so removed links are pruned. No-op for note types without block content.
   */
  private async syncLinksFromBlocks(noteId: string, blocks: unknown[]): Promise<void> {
    const arr = Array.isArray(blocks) ? blocks : []
    if (this.linkService) {
      // Markdown-imported links carry only a title — resolve them against the
      // notes table so CLI-written notes get forward/backlinks without needing
      // an editor save or a full index rebuild.
      const titleMap = new Map<string, string>()
      for (const r of this.db.query<{ id: string; title: string }>('SELECT id, title FROM notes')) {
        if (!titleMap.has(r.title)) titleMap.set(r.title, r.id)
      }
      const links = resolveNoteLinks(extractNoteLinks(arr), noteId, t => titleMap.get(t))
      await this.linkService.sync(noteId, links)
    }
    if (this.docLinkService) await this.docLinkService.sync(noteId, extractDocumentLinks(arr))
  }

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

  async deleteDir(dirPath: string): Promise<void> {
    const fullPath = join(this.notesDir, dirPath)
    if (!(await this.fs.exists(fullPath))) return
    const prefix = dirPath + '/'
    const notes = this.db.query<{ id: string }>(`SELECT id FROM notes WHERE path LIKE ? ${LIKE_ESCAPE}`, [escapeLike(prefix) + '%'])
    for (const note of notes) {
      await this.delete(note.id)
    }
    if (await this.fs.exists(fullPath)) {
      if (this.trash && (await this.trash.containsFiles(fullPath))) await this.trash.putFolder(fullPath, dirPath, 'notes')
      else await this.fs.rmdir(fullPath, { recursive: true })
    }
  }

  async renameDir(oldPath: string, newPath: string): Promise<void> {
    const oldFull = join(this.notesDir, oldPath)
    const newFull = join(this.notesDir, newPath)
    const prefix = oldPath + '/'
    const inDir = () => this.db.query<{ id: string; path: string }>(`SELECT id, path FROM notes WHERE path LIKE ? ${LIKE_ESCAPE}`, [escapeLike(prefix) + '%'])
    // Holding every moved note's lock: an edit queued on one of them looked up
    // the old path and, writing after the rename, recreated the old folder with
    // a stale copy of the note.
    await noteFileLock.runAll(inDir().map(n => noteLockKey(this.notesDir, n.id)), async () => {
      if (!(await this.fs.exists(oldFull))) throw new Error('Directory not found')
      await this.fs.mkdir(dirname(newFull), { recursive: true })
      await this.fs.rename(oldFull, newFull)
      const now = new Date().toISOString()
      for (const note of inDir()) {
        this.db.run('UPDATE notes SET path = ?, updated_at = ? WHERE id = ?', [newPath + '/' + note.path.substring(prefix.length), now, note.id])
      }
    })
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
    } else if (this.findInFolder(input.title, folder)) {
      throw new Error('DUPLICATE_TITLE')
    }

    const filename = `${id}.json`
    const relPath = folder ? `${folder}/${filename}` : filename
    const fullPath = join(this.notesDir, relPath)

    let typeMeta: Record<string, unknown> | null = null
    let linkBlocks: unknown[] | null = null
    if (noteType === 'mindmap') {
      typeMeta = { layout: input.layout ?? 'mindmap', theme: input.theme ?? 'classic' }
    }
    if (noteType === 'handwriting') {
      typeMeta = {
        pageSize: { width: 1024, height: 768 },
        defaultTemplate: 'blank',
      }
    }

    checkWriterName(input.by)
    const meta: NoteFileData = {
      id, title: input.title, type: noteType, docId: input.docId ?? null,
      folderId: input.folderId ?? null, annotationIds: input.annotationIds ?? [],
      tags: [], contentFormat: 'json', typeMeta, createdAt: now, updatedAt: now,
      ...(input.by ? { updatedBy: input.by } : {}),
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
        let content = input.content
        // Markdown with local images: pull them in (relative to the source
        // file) before converting, so they resolve inside the library.
        if (input.contentBaseDir && !parseBlockList(content)) {
          const attachments = new AttachmentService(this.rootPath, this.fs)
          content = await importMarkdownImages(this.fs, attachments, id, content, input.contentBaseDir)
        }
        blocks = contentToBlocks(content)
      }
      await this.fs.writeTextFile(fullPath, JSON.stringify({ meta, blocks }, null, 2))
      contentStr = JSON.stringify(blocks)
      this.search.index({ id, title: input.title, content: this.blocksToText(blocks), type: 'note' })
      linkBlocks = blocks
    }

    this.db.run(
      'INSERT INTO notes (id, title, type, path, doc_id, folder_id, content_format, type_meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, input.title, noteType, relPath, input.docId ?? null, input.folderId ?? null, 'json', typeMeta ? JSON.stringify(typeMeta) : null, now, now],
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

    if (linkBlocks) await this.syncLinksFromBlocks(id, linkBlocks)

    const note: Note = {
      id, title: input.title, type: noteType, path: relPath, docId: input.docId ?? null,
      folderId: input.folderId ?? null, content: contentStr,
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
    if (options?.folder) { conditions.push(`path LIKE ? ${LIKE_ESCAPE}`); params.push(escapeLike(options.folder) + '/%') }
    if (options?.since) { conditions.push('updated_at >= ?'); params.push(options.since) }
    if (options?.tag) {
      conditions.push(`(id IN (SELECT note_id FROM note_tags JOIN tags ON tags.id = note_tags.tag_id WHERE tags.name = ?) OR id IN (SELECT mindmap_id FROM mindmap_tags JOIN tags ON tags.id = mindmap_tags.tag_id WHERE tags.name = ?))`)
      params.push(options.tag, options.tag)
    }
    if (conditions.length) { sql += ` WHERE ${conditions.join(' AND ')}` }
    const sort = options?.sort ?? 'created_at'
    const order = options?.order ?? 'desc'
    sql += ` ORDER BY ${sort} ${order}`
    const notes = this.db.query<Record<string, unknown>>(sql, params).map(r => this.rowToNote(r))
    this.attachExcerpts(notes)
    return notes
  }

  /**
   * A line of each note's text for the lists: the start of a note's body (from
   * the search index — no file is read) or a mind map's first branches.
   */
  private attachExcerpts(notes: Note[]): void {
    if (!notes.length) return
    const wanted = new Set(notes.map(n => n.id))
    const text = new Map<string, string>()
    try {
      for (const r of this.db.query<{ type: string; head: string | null }>(
        "SELECT type, substr(content, 1, 240) AS head FROM search_index WHERE type LIKE 'note:%'",
      )) {
        const id = r.type.slice('note:'.length)
        if (r.head && wanted.has(id)) text.set(id, r.head)
      }
    } catch { /* no full-text index on this platform */ }
    const maps = notes.filter(n => n.type === 'mindmap').map(n => n.id)
    if (maps.length) {
      const topics = new Map<string, string[]>()
      for (const r of this.db.query<{ mindmap_id: string; title: string | null }>(
        // Not the root: it carries the map's title, which the list shows already.
        `SELECT mindmap_id, title FROM mindmap_nodes WHERE parent_id IS NOT NULL AND mindmap_id IN (${maps.map(() => '?').join(',')})
          ORDER BY mindmap_id, sort_order`, maps,
      )) {
        const list = topics.get(r.mindmap_id) ?? []
        if (list.length < 6 && r.title?.trim()) list.push(r.title.trim())
        topics.set(r.mindmap_id, list)
      }
      for (const [id, list] of topics) if (list.length) text.set(id, list.join(' · '))
    }
    for (const n of notes) {
      const t = text.get(n.id)?.replace(/\s+/g, ' ').trim()
      if (t) n.excerpt = t.length > 160 ? t.slice(0, 160) + '…' : t
    }
  }

  resolveId(id: string): string {
    const row = this.db.queryOne<{ id: string }>('SELECT id FROM notes WHERE id = ?', [id])
    if (row) return row.id
    const prefix = this.db.queryOne<{ id: string }>('SELECT id FROM notes WHERE id LIKE ?', [id + '%'])
    return prefix?.id ?? id
  }

  async get(id: string): Promise<Note | null> {
    id = this.resolveId(id)
    // The file can move (the note or its folder moved) while it is being read.
    // Then wait for that move — it holds the note's lock — and follow the row
    // to the new path, rather than fail with ENOENT. (Not for use inside that lock.)
    for (let attempt = 0; ; attempt++) {
      const row = this.db.queryOne<Record<string, unknown>>('SELECT * FROM notes WHERE id = ?', [id])
      if (!row) return null
      const note = this.rowToNote(row)
      let raw: string
      try {
        raw = await this.fs.readTextFile(join(this.notesDir, note.path))
      } catch (e) {
        if (attempt === 0) {
          await noteFileLock.run(noteLockKey(this.notesDir, id), async () => {})
          continue
        }
        if (!(await this.fs.exists(join(this.notesDir, note.path)))) return note   // no file: the row alone
        throw e
      }
      return this.withContent(note, raw)
    }
  }

  private async withContent(note: Note, raw: string): Promise<Note> {
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
    return note
  }

  async update(id: string, updates: { title?: string; content?: string; typeMeta?: Record<string, unknown> }, opts: NoteWriteOptions = {}): Promise<Note> {
    checkWriterName(opts.by)
    id = this.resolveId(id)
    // A late save from an editor whose note was just deleted: fail clearly
    // instead of a TypeError on the missing row below.
    if (!this.db.queryOne('SELECT id FROM notes WHERE id = ?', [id])) throw new Error('Note not found')
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
    if (updates.typeMeta !== undefined) { sets.push('type_meta = ?'); params.push(JSON.stringify(updates.typeMeta)) }
    params.push(id)
    this.db.run(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`, params)

    // Under the note's file lock (mind-map node edits, tag changes and moves
    // rewrite this file too), with the row — and so the path — read inside it.
    await noteFileLock.run(noteLockKey(this.notesDir, id), async () => {
      const row = this.db.queryOne<Record<string, unknown>>('SELECT * FROM notes WHERE id = ?', [id])
      if (!row) throw new Error('Note not found')   // deleted while this save waited
      if ((row.content_format as string) !== 'json') return
      const filePath = join(this.notesDir, row.path as string)
      if (!(await this.fs.exists(filePath))) return
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
        const before = await this.fs.readTextFile(filePath)
        const raw = JSON.parse(before) as NoteJsonFile
        if (updates.content !== undefined || updates.title !== undefined) {
          await this.keepVersion(id, before, opts)
          raw.meta.updatedBy = opts.by ?? (opts.source === 'external' ? 'external' : 'app')
        }
        if (updates.title !== undefined) raw.meta.title = updates.title
        raw.meta.updatedAt = now
        if (updates.content !== undefined) raw.blocks = contentToBlocks(updates.content)
        await this.fs.writeTextFile(filePath, JSON.stringify(raw, null, 2))
        // Content may have added/removed wiki-links — keep link tables current
        // so we don't depend on a full rebuild to fix them.
        if (updates.content !== undefined) await this.syncLinksFromBlocks(id, raw.blocks)
        // Keep full-text search current: it was only written on create, so
        // search kept finding a note's first draft until a full rebuild.
        if (updates.content !== undefined || updates.title !== undefined) {
          this.search.removeById(id)
          this.search.index({ id, title: raw.meta.title, content: this.blocksToText(raw.blocks ?? []), type: 'note' })
        }
      }
    })

    const note = (await this.get(id))!
    this.events.emit('note:updated', { note })
    return note
  }

  /**
   * Before a write: keep the note as it was. Every write from outside does;
   * the app's own saves at most every 10 minutes — but always right after a
   * write from outside, so an editor saving over it can't lose it.
   */
  private async keepVersion(id: string, fileText: string, opts: NoteWriteOptions): Promise<void> {
    const external = opts.source === 'external'
    try {
      const newest = await this.versions.newestAt(id)
      if (external || this.externallyWritten.has(id) || newest === null || Date.now() - newest > EDIT_VERSION_INTERVAL_MS) {
        await this.versions.save(id, fileText, opts.reason ?? (external ? 'external' : 'edit'))
      }
    } catch (e) {
      console.warn(`[notes] could not keep a version of ${id}:`, e)   // never block the save itself
    }
    if (external) this.externallyWritten.add(id)
    else this.externallyWritten.delete(id)
  }

  /** Earlier versions of a Markdown note, newest first. */
  async history(id: string): Promise<NoteVersion[]> {
    return this.versions.list(id)
  }

  /** Put a note back as it was in `version` (what it replaces is kept as a version too). */
  async restore(id: string, version: string, write: NoteWriteOptions = {}): Promise<Note> {
    const file = JSON.parse(await this.versions.read(id, version)) as Partial<NoteJsonFile>
    return this.update(id, {
      ...(typeof file.meta?.title === 'string' ? { title: file.meta.title } : {}),
      content: JSON.stringify(Array.isArray(file.blocks) ? file.blocks : []),
    }, { ...write, source: 'external', reason: 'restore' })
  }

  /**
   * Write one section of a Markdown note — `heading` is a Markdown heading
   * line ("## 20261028") — leaving the rest of it as it is (sections.ts).
   */
  async updateSection(id: string, heading: string, content: string, opts: { mode?: 'replace' | 'append'; newAt?: 'top' | 'bottom' | 'sorted'; order?: 'asc' | 'desc' } = {}, write: NoteWriteOptions = {}): Promise<Note> {
    const target = parseHeadingLine(heading)
    if (!target) throw new Error(`Not a Markdown heading line: ${heading}`)
    const note = await this.get(id)
    if (!note) throw new Error('Note not found')
    if (note.type !== 'markdown') throw new Error('Only Markdown notes have sections')
    const blocks = parseBlockList(note.content ?? '[]') ?? []
    const next = upsertSection(blocks, { heading: target, content: contentToBlocks(content), mode: opts.mode, newAt: opts.newAt, order: opts.order })
    return this.update(id, { content: JSON.stringify(next) }, { ...write, source: 'external' })
  }

  /** The note titled `title` right in `folder`, created (with `content`) when there is none. */
  async ensure(input: { title: string; folder?: string; content?: string; by?: string }): Promise<{ note: Note; created: boolean }> {
    const existing = this.findInFolder(input.title, input.folder ?? '')
    if (existing) return { note: (await this.get(existing))!, created: false }
    return { note: await this.create({ title: input.title, folder: input.folder, content: input.content, by: input.by }), created: true }
  }

  async move(id: string, targetFolder: string | null): Promise<Note> {
    const now = new Date().toISOString()
    const row = this.db.queryOne<{ path: string; title: string }>('SELECT path, title FROM notes WHERE id = ?', [id])
    if (!row) throw new Error('Note not found')

    const pathPrefix = targetFolder ? targetFolder + '/' : ''
    const dup = pathPrefix
      ? this.db.queryOne<{ id: string }>(
          `SELECT id FROM notes WHERE title = ? AND id != ? AND path LIKE ? ${LIKE_ESCAPE} AND path NOT LIKE ? ${LIKE_ESCAPE}`,
          [row.title, id, escapeLike(pathPrefix) + '%', escapeLike(pathPrefix) + '%/%'])
      : this.db.queryOne<{ id: string }>(
          'SELECT id FROM notes WHERE title = ? AND id != ? AND path NOT LIKE ? AND doc_id IS NULL',
          [row.title, id, '%/%'])
    if (dup) throw new Error('DUPLICATE_TITLE')

    const filename = `${id}.json`
    const newRelPath = targetFolder ? `${targetFolder}/${filename}` : filename
    const newFullPath = join(this.notesDir, newRelPath)

    // Under the note's lock: a queued edit must write to the file where it ends up.
    await noteFileLock.run(noteLockKey(this.notesDir, id), async () => {
      const current = this.db.queryOne<{ path: string }>('SELECT path FROM notes WHERE id = ?', [id])
      const oldPath = join(this.notesDir, current?.path ?? row.path)
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
    })
    const note = (await this.get(id))!
    this.events.emit('note:updated', { note })
    return note
  }

  async delete(id: string): Promise<void> {
    id = this.resolveId(id)
    // Under the note's lock: an edit already reading the file would otherwise
    // write it back after it went to the bin, and the note came back.
    await noteFileLock.run(noteLockKey(this.notesDir, id), () => this.deleteLocked(id))
  }

  private async deleteLocked(id: string): Promise<void> {
    const row = this.db.queryOne<{ path: string; type: string; title: string }>('SELECT path, type, title FROM notes WHERE id = ?', [id])
    if (!row) return
    const incoming = this.db.query<{ source_id: string; context: string }>(
      'SELECT source_id, context FROM note_links WHERE target_id = ? AND source_id != ?', [id, id])
    // Database first, in one transaction, children before parents — note_links
    // and mindmap_* reference notes, mindmap_summaries references mindmap_nodes —
    // and the file only after it commits. Previously the file went first and a
    // mind map with a summary/boundary then failed its FK, leaving a broken row.
    this.db.transaction(() => {
      this.db.run('DELETE FROM note_links WHERE source_id = ? OR target_id = ?', [id, id])  // = LinkService.removeAllForNote
      this.db.run('DELETE FROM doc_links WHERE source_id = ?', [id])                        // = DocLinkService.removeAllForNote
      this.db.run('DELETE FROM note_annotations WHERE note_id = ?', [id])
      if (row.type === 'mindmap') {
        this.db.run('DELETE FROM mindmap_summaries WHERE mindmap_id = ?', [id])
        this.db.run('DELETE FROM mindmap_boundaries WHERE mindmap_id = ?', [id])
        this.db.run('DELETE FROM mindmap_edges WHERE mindmap_id = ?', [id])
        this.db.run('DELETE FROM mindmap_nodes WHERE mindmap_id = ?', [id])
        this.db.run('DELETE FROM mindmap_tags WHERE mindmap_id = ?', [id])
      }
      this.db.run('DELETE FROM note_tags WHERE note_id = ?', [id])
      this.db.run('DELETE FROM notes WHERE id = ?', [id])
    })
    this.search.removeById(id)
    const filePath = join(this.notesDir, row.path)
    if (await this.fs.exists(filePath)) {
      if (this.trash) {
        try {
          await this.trash.putNote({ id, title: row.title, type: row.type, path: row.path }, incoming.map(l => ({ sourceId: l.source_id, context: l.context })))
        } catch (e) {
          console.error('[notes] moving to the recycle bin failed; file kept in place', id, e)
        }
      } else {
        await this.fs.remove(filePath)
        await new AttachmentService(this.rootPath, this.fs).deleteAllForNote(id)
      }
    }
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
