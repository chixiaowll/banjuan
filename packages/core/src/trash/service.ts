import type { PlatformDatabase, PlatformFS } from '../platform/index.js'
import { join, dirname, basename, extname } from '../platform/path.js'
import type { DocumentFileData } from '../types.js'
import type { IndexService } from '../indexing/service.js'
import type { AnnotationService } from '../annotations/service.js'
import { JsonStore } from '../storage/json-store.js'

/**
 * Recycle bin. Deleting a document, note or folder moves its files into
 * `.banjuan/.trash/<entry>/` instead of erasing them — documents are the
 * user's own files (PDFs that existed before the library), so a delete must be
 * undoable. Entries are restored to where they came from (next to it if that
 * path was taken meanwhile), purged on request, and expire after 30 days.
 * The bin is never synced (sync/exclusions).
 */

export type TrashKind = 'document' | 'note' | 'folder'

export interface TrashEntry {
  /** Entry id (its directory name). */
  id: string
  kind: TrashKind
  /** Document / note id; for a folder, its path. */
  itemId: string
  title: string
  /** Documents and document folders: relative to the library root. Notes and note folders: relative to the notes directory. */
  originalPath: string
  /** Which tree a folder belonged to. */
  area?: 'documents' | 'notes'
  deletedAt: string
  /** Note type (markdown / mindmap / handwriting) or document type (pdf / epub / …). */
  itemType?: string
}

interface StoredEntry extends TrashEntry {
  /** The deleted file's name inside the entry directory. */
  fileName?: string
  /** Fallback document fields when its metadata JSON was missing. */
  docRow?: { title: string; type: string; path: string }
  /** Links that pointed at the item; restored when their source still exists. */
  incomingNoteLinks?: Array<{ sourceId: string; context: string }>
  incomingDocLinks?: Array<{ sourceId: string; context: string }>
}

export const TRASH_RETENTION_DAYS = 30
const ENTRY_FILE = 'entry.json'

export class TrashService {
  private readonly dir: string
  private readonly notesDir: string
  private readonly docStore: JsonStore<DocumentFileData>

  constructor(
    private db: PlatformDatabase,
    private rootPath: string,
    private fs: PlatformFS,
    private createIndex: () => IndexService,
    private annotations: AnnotationService,
  ) {
    this.dir = join(rootPath, '.banjuan', '.trash')
    this.notesDir = join(rootPath, '.banjuan', 'notes')
    this.docStore = new JsonStore(join(rootPath, '.banjuan', 'data', 'documents'), fs)
  }

  // ---- putting things in -------------------------------------------------

  async putDocument(
    record: DocumentFileData | null,
    doc: { id: string; title: string; type: string; path: string },
    incomingDocLinks: Array<{ sourceId: string; context: string }>,
  ): Promise<void> {
    const entryDir = await this.newEntryDir('document', doc.id)
    const abs = join(this.rootPath, doc.path)
    let fileName: string | undefined
    if (await this.fs.exists(abs)) {
      fileName = basename(doc.path)
      await this.fs.rename(abs, join(entryDir, fileName))
    }
    if (record) await this.fs.writeTextFile(join(entryDir, 'meta.json'), JSON.stringify(record, null, 2))
    await this.writeEntry(entryDir, {
      kind: 'document', itemId: doc.id, title: doc.title, originalPath: doc.path, itemType: doc.type,
      fileName, docRow: { title: doc.title, type: doc.type, path: doc.path }, incomingDocLinks,
    })
  }

  async putNote(
    note: { id: string; title: string; type: string; path: string },
    incomingNoteLinks: Array<{ sourceId: string; context: string }>,
  ): Promise<void> {
    const entryDir = await this.newEntryDir('note', note.id)
    await this.fs.rename(join(this.notesDir, note.path), join(entryDir, 'note.json'))
    await this.writeEntry(entryDir, {
      kind: 'note', itemId: note.id, title: note.title, originalPath: note.path, itemType: note.type,
      fileName: 'note.json', incomingNoteLinks,
    })
  }

  /** A deleted folder that still holds files the library doesn't track. */
  async putFolder(absDir: string, relPath: string, area: 'documents' | 'notes'): Promise<void> {
    const entryDir = await this.newEntryDir('folder', relPath)
    await this.fs.rename(absDir, join(entryDir, 'folder'))
    await this.writeEntry(entryDir, {
      kind: 'folder', itemId: relPath, title: basename(relPath), originalPath: relPath, area, fileName: 'folder',
    })
  }

  /** True when a directory still contains any (non-hidden) file, at any depth. */
  async containsFiles(absDir: string): Promise<boolean> {
    let entries: Array<{ name: string; isDirectory: boolean }>
    try { entries = await this.fs.readdirWithTypes(absDir) } catch { return false }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      if (!e.isDirectory) return true
      if (await this.containsFiles(join(absDir, e.name))) return true
    }
    return false
  }

  // ---- reading ------------------------------------------------------------

  async list(): Promise<TrashEntry[]> {
    if (!(await this.fs.exists(this.dir))) return []
    const entries: TrashEntry[] = []
    for (const name of await this.fs.readdir(this.dir)) {
      const entry = await this.readEntry(name)
      if (!entry) continue
      const { id, kind, itemId, title, originalPath, area, deletedAt, itemType } = entry
      entries.push({ id, kind, itemId, title, originalPath, area, deletedAt, itemType })
    }
    return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  }

  // ---- restoring ----------------------------------------------------------

  /** Put an entry back. Returns what was restored (for folders, the path it was restored to). */
  async restore(entryId: string): Promise<{ kind: TrashKind; id: string }> {
    const entry = await this.readEntry(entryId)
    if (!entry) throw new Error('Trash entry not found')
    const entryDir = join(this.dir, entryId)
    let result: { kind: TrashKind; id: string }

    if (entry.kind === 'document') {
      const target = await this.freePath(this.rootPath, entry.originalPath)
      if (entry.fileName && (await this.fs.exists(join(entryDir, entry.fileName)))) {
        await this.fs.mkdir(dirname(join(this.rootPath, target)), { recursive: true })
        await this.fs.rename(join(entryDir, entry.fileName), join(this.rootPath, target))
      }
      const now = new Date().toISOString()
      const metaPath = join(entryDir, 'meta.json')
      const record: DocumentFileData = (await this.fs.exists(metaPath))
        ? JSON.parse(await this.fs.readTextFile(metaPath))
        : {
            id: entry.itemId, title: entry.docRow?.title ?? entry.title, authors: [], path: target,
            type: (entry.docRow?.type ?? entry.itemType ?? 'unknown') as DocumentFileData['type'],
            hash: '', tags: [], metadata: {}, createdAt: now, updatedAt: now,
          }
      record.path = target
      await this.docStore.write(record)
      this.createIndex().indexDocumentRecord(record)
      for (const l of entry.incomingDocLinks ?? []) {
        if (this.db.queryOne('SELECT 1 FROM notes WHERE id = ?', [l.sourceId])) {
          this.db.run('INSERT OR IGNORE INTO doc_links (source_id, target_id, context) VALUES (?, ?, ?)', [l.sourceId, entry.itemId, l.context])
        }
      }
      result = { kind: 'document', id: entry.itemId }
    } else if (entry.kind === 'note') {
      const target = join(this.notesDir, entry.originalPath)
      await this.fs.mkdir(dirname(target), { recursive: true })
      await this.fs.rename(join(entryDir, 'note.json'), target)
      await this.createIndex().indexNoteFile(entry.originalPath)
      for (const l of entry.incomingNoteLinks ?? []) {
        if (this.db.queryOne('SELECT 1 FROM notes WHERE id = ?', [l.sourceId])) {
          this.db.run('INSERT OR IGNORE INTO note_links (source_id, target_id, context) VALUES (?, ?, ?)', [l.sourceId, entry.itemId, l.context])
        }
      }
      result = { kind: 'note', id: entry.itemId }
    } else {
      const base = entry.area === 'notes' ? this.notesDir : this.rootPath
      await this.mergeInto(join(entryDir, 'folder'), join(base, entry.originalPath))
      result = { kind: 'folder', id: entry.originalPath }
    }

    await this.fs.rmdir(entryDir, { recursive: true })
    return result
  }

  // ---- deleting for good ----------------------------------------------------

  async purge(entryId: string): Promise<void> {
    const entry = await this.readEntry(entryId)
    if (entry?.kind === 'document' && !this.db.queryOne('SELECT 1 FROM documents WHERE id = ?', [entry.itemId])) {
      // Annotations stay while their document is in the bin (so a restore brings
      // them back); once it's gone for good they go too.
      for (const ann of await this.annotations.list({ docId: entry.itemId })) await this.annotations.delete(ann.id)
    }
    const entryDir = join(this.dir, entryId)
    if (await this.fs.exists(entryDir)) await this.fs.rmdir(entryDir, { recursive: true })
  }

  async empty(): Promise<void> {
    for (const e of await this.list()) await this.purge(e.id)
  }

  /** Purge entries older than the retention period; returns how many. */
  async purgeExpired(days = TRASH_RETENTION_DAYS): Promise<number> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    let n = 0
    for (const e of await this.list()) {
      if (Date.parse(e.deletedAt) < cutoff) { await this.purge(e.id); n++ }
    }
    return n
  }

  // ---- helpers --------------------------------------------------------------

  private async newEntryDir(kind: TrashKind, itemId: string): Promise<string> {
    const safe = itemId.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60)
    const name = `${Date.now()}-${kind}-${safe}-${Math.random().toString(36).slice(2, 6)}`
    const dir = join(this.dir, name)
    await this.fs.mkdir(dir, { recursive: true })
    return dir
  }

  private async writeEntry(entryDir: string, entry: Omit<StoredEntry, 'id' | 'deletedAt'>): Promise<void> {
    const stored: StoredEntry = { ...entry, id: basename(entryDir), deletedAt: new Date().toISOString() }
    await this.fs.writeTextFile(join(entryDir, ENTRY_FILE), JSON.stringify(stored, null, 2))
  }

  private async readEntry(name: string): Promise<StoredEntry | null> {
    try {
      const stored = JSON.parse(await this.fs.readTextFile(join(this.dir, name, ENTRY_FILE))) as StoredEntry
      return { ...stored, id: name }
    } catch {
      return null   // not an entry, or a half-written one
    }
  }

  /** `rel` if nothing is there, else "name (2).ext", "name (3).ext", … */
  private async freePath(base: string, rel: string): Promise<string> {
    if (!(await this.fs.exists(join(base, rel)))) return rel
    const dir = dirname(rel)
    const ext = extname(rel)
    const stem = basename(rel, ext)
    for (let i = 2; ; i++) {
      const name = `${stem} (${i})${ext}`
      const candidate = dir && dir !== '.' ? `${dir}/${name}` : name
      if (!(await this.fs.exists(join(base, candidate)))) return candidate
    }
  }

  /** Move a directory to `target`; if `target` exists, merge child by child (renaming clashes). */
  private async mergeInto(src: string, target: string): Promise<void> {
    if (!(await this.fs.exists(target))) {
      await this.fs.mkdir(dirname(target), { recursive: true })
      await this.fs.rename(src, target)
      return
    }
    for (const e of await this.fs.readdirWithTypes(src)) {
      const from = join(src, e.name)
      if (e.isDirectory) { await this.mergeInto(from, join(target, e.name)); continue }
      const rel = await this.freePath(target, e.name)
      await this.fs.rename(from, join(target, rel))
    }
  }
}
