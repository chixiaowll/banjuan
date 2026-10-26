import { Library, LAN_PREFERRED_PORTS, MAX_LIBRARY_FILES } from '@banjuan/core'
import { flushAll } from '@banjuan/shared-ui'
import type { PlatformDeps, NearbyShare, TagTarget } from '@banjuan/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { CapacitorFS, CapacitorDatabaseFactory, WebCrypto } from '@banjuan/platform-capacitor'
import type { BanjuanAPI } from '@banjuan/shared-ui'
import { CapacitorHttp, Capacitor, registerPlugin } from '@capacitor/core'
import { getDeviceIdentity } from './capacitor-device-identity'
import { scanNearby as mdnsScanNearby } from './capacitor-mdns'
import { startDocTextIndexer, docTextStatus } from './doc-text-indexer'
import { getCover } from './covers'
import { newExportFolder, exportMarkdown, exportPdf, exportFile, finishExport } from './exporter'

// Native AVPlayer fallback (see NativeVideoPlugin.swift). Plays codecs the
// WebView <video> element rejects — HEVC 10-bit HDR, E-AC-3 (Dolby DD+).
const NativeVideo = registerPlugin<{
  play(options: { url: string; startAt?: number }): Promise<void>
}>('NativeVideo')

// Toggles WKWebView text-selection gestures so they don't swallow handwriting
// strokes (see DrawingModePlugin.swift).
const DrawingMode = registerPlugin<{
  setEnabled(options: { enabled: boolean }): Promise<void>
}>('DrawingMode')
// Every visible handwriting editor (a tab, a PDF's side panel) asks for it:
// it stays on while any of them is shown, and the native calls stay in order.
let drawingModeUsers = 0
let drawingModeCalls: Promise<unknown> = Promise.resolve()

// Files in and out of the library (see FilePreviewPlugin.swift): Quick Look,
// the share sheet, and the system document picker.
const FilePreview = registerPlugin<{
  preview(options: { url: string }): Promise<void>
  share(options: { url: string }): Promise<{ completed: boolean }>
  pickFiles(options: { dest: string; extensions?: string[]; multiple?: boolean }): Promise<{ files: Array<{ name: string; error?: string }> }>
}>('FilePreview')

/** Document types the library imports (same list as the desktop import dialog). */
const DOCUMENT_EXTENSIONS = ['pdf', 'epub', 'txt', 'md', 'markdown', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'mp4', 'mov', 'm4v', 'webm', 'html', 'htm', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'json', 'xml', 'csv', 'tsv', 'log', 'conf', 'cfg', 'ini', 'toml', 'env', 'py', 'js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'less', 'sql', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'swift', 'kt', 'r', 'tex', 'bib', 'rst']

/** file:// URI of a path under Documents. */
async function documentsUri(path: string): Promise<string> {
  return (await Filesystem.getUri({ path, directory: Directory.Documents })).uri
}

type ImportResult = { title: string; success: boolean; error?: string }

/** Pick files in the system picker; they land in `destDir` of the library and are imported. Null when cancelled. */
/** Files dropped onto the app (no paths here): copied into the library, then imported. */
async function importDroppedDocuments(files: File[], destDir?: string): Promise<ImportResult[]> {
  const lib = getLib()
  const results: ImportResult[] = []
  for (const file of files) {
    const dot = file.name.lastIndexOf('.')
    const ext = dot > 0 ? file.name.slice(dot) : ''
    const stem = ext ? file.name.slice(0, -ext.length) : file.name
    let name = file.name
    const relOf = (n: string) => (destDir ? `${destDir}/${n}` : n)
    const exists = (n: string) => Filesystem.stat({ path: `${lib.rootPath}/${relOf(n)}`, directory: Directory.Documents }).then(() => true, () => false)
    for (let i = 2; await exists(name); i++) name = `${stem} (${i})${ext}`
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      await Filesystem.writeFile({ path: `${lib.rootPath}/${relOf(name)}`, data: base64, directory: Directory.Documents, recursive: true })
      await lib.documents.import(relOf(name))
      results.push({ title: name, success: true })
    } catch (e) {
      results.push({ title: name, success: false, error: (e as Error)?.message ?? String(e) })
    }
  }
  try { await lib.flush() } catch { /* the index is rebuilt from files if needed */ }
  return results
}

async function pickAndImportDocuments(destDir?: string): Promise<ImportResult[] | null> {
  const lib = getLib()
  const dir = destDir ? `${lib.rootPath}/${destDir}` : lib.rootPath
  const { files } = await FilePreview.pickFiles({ dest: await documentsUri(dir), extensions: DOCUMENT_EXTENSIONS, multiple: true })
  if (!files.length) return null
  const results: ImportResult[] = []
  for (const f of files) {
    if (f.error) { results.push({ title: f.name, success: false, error: f.error }); continue }
    try {
      await lib.documents.import(destDir ? `${destDir}/${f.name}` : f.name)
      results.push({ title: f.name, success: true })
    } catch (e) {
      results.push({ title: f.name, success: false, error: (e as Error)?.message ?? String(e) })
    }
  }
  try { await lib.flush() } catch { /* the index is rebuilt from files if needed */ }
  return results
}

/** Pick Markdown files and make each a note (in `targetFolder`). Null when cancelled. */
async function pickAndImportMarkdown(targetFolder: string | null): Promise<ImportResult[] | null> {
  // Staged outside every library, read, then removed.
  const staging = `${LIBRARIES_ROOT}/.import-${Date.now().toString(36)}`
  try {
    const { files } = await FilePreview.pickFiles({ dest: await documentsUri(staging), extensions: ['md', 'markdown', 'txt'], multiple: true })
    if (!files.length) return null
    return await importStagedMarkdown(staging, files, targetFolder)
  } finally {
    await Filesystem.rmdir({ path: staging, directory: Directory.Documents, recursive: true }).catch(() => {})
  }
}

/** Markdown files copied into `staging` (a folder under Documents) become notes in the open library. */
export async function importStagedMarkdown(
  staging: string, files: Array<{ name: string; error?: string }>, targetFolder: string | null,
): Promise<ImportResult[]> {
  // Read straight from Documents: the staging folder is outside the library,
  // and a library-rooted CapacitorFS prefixed the path a second time.
  return importMarkdownTexts(files.map(f => ({
    name: f.name,
    content: async () => {
      if (f.error) throw new Error(f.error)
      return (await Filesystem.readFile({ path: `${staging}/${f.name}`, directory: Directory.Documents, encoding: Encoding.UTF8 })).data as string
    },
  })), targetFolder)
}

/** Each text becomes a markdown note titled after its file (numbered on a clash). */
async function importMarkdownTexts(files: Array<{ name: string; content: () => Promise<string> }>, targetFolder: string | null): Promise<ImportResult[]> {
  const lib = getLib()
  const results: ImportResult[] = []
  for (const f of files) {
    const baseName = f.name.replace(/\.(md|markdown|txt)$/i, '')
    if (!/\.(md|markdown|txt)$/i.test(f.name)) { results.push({ title: f.name, success: false, error: 'NOT_MARKDOWN' }); continue }
    let content: string
    try { content = await f.content() } catch (e) {
      results.push({ title: baseName, success: false, error: (e as Error)?.message ?? String(e) }); continue
    }
    let done = false
    for (let attempt = 0; attempt < 100 && !done; attempt++) {
      const title = attempt === 0 ? baseName : `${baseName} (${attempt + 1})`
      try {
        await lib.notes.create({ title, type: 'markdown', content, folder: targetFolder ?? undefined })
        results.push({ title, success: true })
        done = true
      } catch (e) {
        if ((e as Error)?.message === 'DUPLICATE_TITLE') continue
        results.push({ title, success: false, error: (e as Error)?.message ?? String(e) })
        done = true
      }
    }
    if (!done) results.push({ title: baseName, success: false, error: 'TOO_MANY_DUPLICATES' })
  }
  try { await lib.flush() } catch { /* ignore */ }
  return results
}

let library: Library | null = null
let currentLibraryPath: string | null = null

// Document text for search (PDF / EPUB / text), extracted in the background.
startDocTextIndexer(() => library)

// iOS suspends a backgrounded app and may kill it without warning: going to
// the background is the last safe moment to write pending edits (debounced
// note/handwriting/mind-map saves) and the in-memory index.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    void (async () => {
      try { await flushAll() } catch (e) { console.warn('[background] flushing edits failed', e) }
      try { await library?.flush() } catch (e) { console.warn('[background] saving the index failed', e) }
    })()
  })
}

export interface LibraryEntry {
  path: string
  name: string
  id?: string   // book-room identity, for "already joined this host?" dedupe
  incomplete?: boolean   // dir exists under BanJuanLibrary but has no readable config (leftover/broken)
}

const LIBRARIES_ROOT = 'BanJuanLibrary'

export async function listLibraries(): Promise<LibraryEntry[]> {
  const entries: LibraryEntry[] = []
  try {
    await Filesystem.mkdir({ path: LIBRARIES_ROOT, directory: Directory.Documents, recursive: true }).catch(() => {})
    const result = await Filesystem.readdir({ path: LIBRARIES_ROOT, directory: Directory.Documents })
    console.log('[lib] listLibraries: dirs under', LIBRARIES_ROOT, '=', result.files.map(f => `${f.name}(${f.type})`))
    for (const item of result.files) {
      if (item.type !== 'directory') continue
      try {
        const configResult = await Filesystem.readFile({
          path: `${LIBRARIES_ROOT}/${item.name}/.banjuan/config.json`,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        })
        const config = JSON.parse(configResult.data as string)
        entries.push({ path: `${LIBRARIES_ROOT}/${item.name}`, name: config.name || item.name, id: config.id })
      } catch (e) {
        // Directory exists under BanJuanLibrary but has no readable config —
        // surface it as an incomplete/leftover book-room so it can still be
        // seen and deleted (e.g. residue from a failed join or partial delete).
        console.log(`[lib] listLibraries: incomplete "${item.name}" — config unreadable: ${(e as Error).message}`)
        entries.push({ path: `${LIBRARIES_ROOT}/${item.name}`, name: item.name, incomplete: true })
      }
    }
  } catch {
    // root dir might not exist yet
  }
  return entries
}

export function getLibrariesRoot(): string {
  return LIBRARIES_ROOT
}

function createDeps(baseDir: string): PlatformDeps {
  const fs = new CapacitorFS(baseDir)
  return {
    fs,
    dbFactory: new CapacitorDatabaseFactory(fs),
    crypto: new WebCrypto(),
  }
}

/** Save pending edits and the index of the open library, then close it. */
async function leaveCurrentLibrary(): Promise<void> {
  const old = library
  if (!old) return
  try { await flushAll() } catch { /* each flusher reports its own failure */ }
  library = null
  currentLibraryPath = null
  try { await old.flush() } catch { /* rebuilt from files if needed */ }
  try { await old.close() } catch (e) { console.warn('[lib] closing the previous library failed', e) }
}

function getLib(): Library {
  if (!library) throw new Error('Library not open')
  return library
}

export function createCapacitorAPI(): BanjuanAPI {
  return {
    library: {
      async check(path) {
        const deps = createDeps(path)
        const exists = await Library.isLibrary(path, deps)
        if (!exists) return null
        const config = await deps.fs.readTextFile(`${path}/.banjuan/config.json`)
        return JSON.parse(config)
      },
      async init(path, name) {
        await leaveCurrentLibrary()
        library = await Library.init(path, createDeps(path), name)
        currentLibraryPath = path
        return { rootPath: library.rootPath, name: await library.getName(), imported: 0, skipped: 0, truncated: false, limit: MAX_LIBRARY_FILES }
      },
      async open(path) {
        // The same library again: keep its instance (reconciled below). Another:
        // the one open now is saved and closed first — it used to stay open
        // in the background, its database still in memory.
        if (!(library && currentLibraryPath === path)) {
          await leaveCurrentLibrary()
          library = await Library.open(path, createDeps(path))
          currentLibraryPath = path
        }
        const indexSvc = library.createIndexService()
        // Whether the persisted DB came up populated. Checked BEFORE the syncs
        // below repopulate it, so we can tell a genuinely-cached open from a
        // cold one (empty db.sqlite — e.g. first open after enabling flush).
        const dbWasEmpty = (await library.documents.listImportedPaths()).size === 0
        // Reconcile disk → DB. Cheap when the DB is already populated: both
        // skip files already known (no content reads), leaving just directory
        // listings to discover anything new (in-app edits, LAN-synced files).
        const synced = await library.syncWithDisk()
        try { await library.notes.syncDisk() } catch {}
        try { await library.tags.syncFromFiles() } catch {}
        // Full rebuild only when the index is stale, or the DB loaded empty (so
        // it isn't left half-built). Once flushed below, later opens hit
        // neither branch and skip the rebuild entirely.
        if (dbWasEmpty || await indexSvc.isStale()) await indexSvc.rebuildFull()
        // Persist the cache. iOS kills the app without running close(), so
        // without this the sql.js DB is never written back and every launch
        // rebuilds it from disk — re-reading every note/doc as a visible "scan".
        try { await library.flush() } catch {}
        return { rootPath: library.rootPath, name: await library.getName(), imported: synced.imported, removed: synced.removed, truncated: synced.truncated, limit: synced.limit }
      },
      async openNewWindow() {
        // Not supported on mobile
      },
      async isOpen() {
        return library !== null
      },
      async detectMissing() {
        return getLib().detectMissingFiles()
      },
      // Same as the desktop: purge the chosen missing documents, then rebuild
      // everything from the files on disk — on the open instance. Closing and
      // reopening it left anything running meanwhile (the text indexer, an
      // import, a save) writing to a closed database.
      async rebuild(purgeIds: string[] = []) {
        const lib = getLib()
        const purged = await lib.purgeDocuments(purgeIds)
        await Library.migrateNotes(lib.rootPath, createDeps(lib.rootPath).fs)
        const sync = await lib.syncWithDisk()
        try { await lib.notes.syncDisk() } catch { /* non-critical */ }
        try { await lib.tags.syncFromFiles() } catch { /* non-critical */ }
        await lib.createIndexService().rebuildFull()
        try { await lib.flush() } catch { /* ignore */ }
        return { reimported: sync.imported, purged, markedMissing: sync.missing }
      },
      async rename(name: string) {
        const lib = getLib()
        await lib.setName(name)
        return { name }
      },
      async delete(path: string) {
        // Safety guard: only delete a directory directly under BanJuanLibrary/,
        // never an arbitrary path, so a bad value can't wipe unrelated files.
        const segments = path.split('/').filter(Boolean)
        if (segments.length !== 2 || segments[0] !== LIBRARIES_ROOT) {
          throw new Error(`Refusing to delete non-library path: ${path}`)
        }
        // If we're deleting the currently-open library, drop our references
        // WITHOUT closing it. WasmDatabase.close() writes db.sqlite back to disk
        // via a fire-and-forget async writeFile; that write would land AFTER the
        // rmdir below and re-create .banjuan/db.sqlite (with recursive:true also
        // re-creating .banjuan/), leaving a broken residue that can't be listed
        // or re-joined. Deleting a library must never flush its db.
        if (currentLibraryPath === path) {
          library = null
          currentLibraryPath = null
        }
        console.log(`[lib] delete: rmdir "${path}" (recursive)`)
        await Filesystem.rmdir({ path, directory: Directory.Documents, recursive: true })
        // Verify the removal actually took — recursive rmdir can leave residue.
        let dirStillExists = false
        try { await Filesystem.stat({ path, directory: Directory.Documents }); dirStillExists = true } catch {}
        console.log(`[lib] delete done: "${path}" dirStillExists=${dirStillExists}`)
        if (dirStillExists) {
          // Residue left behind — try once more, then surface it.
          try { await Filesystem.rmdir({ path, directory: Directory.Documents, recursive: true }) } catch (e) {
            console.log(`[lib] delete retry failed: ${(e as Error).message}`)
          }
          let stillAfterRetry = false
          try { await Filesystem.stat({ path, directory: Directory.Documents }); stillAfterRetry = true } catch {}
          console.log(`[lib] delete after retry: "${path}" dirStillExists=${stillAfterRetry}`)
          if (stillAfterRetry) throw new Error(`Directory not fully removed: ${path}`)
        }
      },
    },

    dialog: {
      // No folder picker on iPad: a fresh export folder, shared when the export
      // finishes (export.finish). It used to return the libraries' root, so an
      // export wrote files in among the book-rooms.
      async openDirectory() {
        return newExportFolder()
      },
    },

    export: {
      async markdown(input) {
        return exportMarkdown(getLib(), input)
      },
      async pdf(input) {
        return exportPdf(getLib(), input)
      },
      async writeFile(input) {
        return exportFile(input)
      },
      async finish(outputDir) {
        await finishExport(outputDir)
      },
    },

    documents: {
      async import(destDir?: string) {
        await pickAndImportDocuments(destDir)
        return null
      },
      async importFilesDialog(destDir?: string) {
        return pickAndImportDocuments(destDir)
      },
      async importDropped(files: File[], destDir?: string) {
        return importDroppedDocuments(files, destDir)
      },
      async deleteDir(dirPath: string) {
        return getLib().documents.deleteDir(dirPath)
      },
      async getCover(id: string) {
        return getCover(getLib(), id)
      },
      async list(options) {
        return getLib().documents.list(options)
      },
      async get(id) {
        return getLib().documents.get(id)
      },
      async delete(id) {
        return getLib().documents.delete(id)
      },
      async markRead(id) {
        return getLib().documents.markRead(id)
      },
      async refresh() {
        return getLib().syncWithDisk()
      },
      async createDir(dirPath) {
        return getLib().documents.createDir(dirPath)
      },
      async move(id, destDir) {
        return getLib().documents.move(id, destDir)
      },
      async renameDir(oldPath, newPath) {
        return getLib().documents.renameDir(oldPath, newPath)
      },
      async listDirs() {
        return getLib().documents.listDirs()
      },
      async update(id, updates) {
        return (await getLib().documents.update(id, updates))!
      },
      async getFilePath(relativePath) {
        return `${getLib().rootPath}/${relativePath}`
      },
      // A WebView-loadable URL for the file. iOS can't load raw file paths /
      // file:// in <img>/<video>/pdf.js — Capacitor.convertFileSrc turns the
      // native file URI into a streamable http(s)://…/_capacitor_file_/… URL.
      async getFileSrc(relativePath) {
        const { uri } = await Filesystem.getUri({
          path: `${getLib().rootPath}/${relativePath}`,
          directory: Directory.Documents,
        })
        return Capacitor.convertFileSrc(uri)
      },
      async readContent(relativePath) {
        const deps = createDeps(getLib().rootPath)
        return deps.fs.readTextFile(`${getLib().rootPath}/${relativePath}`)
      },
      async readFileBuffer(relativePath) {
        const deps = createDeps(getLib().rootPath)
        const data = await deps.fs.readFile(`${getLib().rootPath}/${relativePath}`)
        return data.buffer as ArrayBuffer
      },
      // No default app to hand it to on iPad: Quick Look, whose share button
      // offers "Open in…" other apps.
      async openInSystem(relativePath) {
        await FilePreview.preview({ url: await documentsUri(`${getLib().rootPath}/${relativePath}`) })
        return ''
      },
      // Hand the raw file:// URI to the native AVPlayer. convertFileSrc's
      // localhost URL is served only inside the WebView, so the native player
      // needs the real on-disk path instead.
      async playVideoNative(relativePath, startAt) {
        const { uri } = await Filesystem.getUri({
          path: `${getLib().rootPath}/${relativePath}`,
          directory: Directory.Documents,
        })
        await NativeVideo.play({ url: uri, startAt })
      },
    },

    tags: {
      async list() {
        return getLib().tags.list()
      },
      async listWithCounts() {
        return getLib().tags.listWithCounts()
      },
      async create(input) {
        return getLib().tags.create(input)
      },
      async namesByTarget(type) {
        return getLib().tags.namesByTarget(type as any)
      },
      async forTarget(id, type) {
        return getLib().tags.forTarget(id, type as TagTarget)
      },
      async assign(targetId, targetType, tagNames) {
        return getLib().tags.assign(targetId, targetType as TagTarget, tagNames)
      },
      async unassign(targetId, targetType, tagName) {
        return getLib().tags.unassign(targetId, targetType as TagTarget, tagName)
      },
      async delete(tagId) {
        return getLib().tags.delete(tagId)
      },
      async rename(tagId, newName) {
        return getLib().tags.rename(tagId, newName)
      },
      async updateColor(tagId, color) {
        return getLib().tags.updateColor(tagId, color)
      },
    },

    annotations: {
      async create(input) {
        return getLib().annotations.create(input)
      },
      async list(options) {
        return getLib().annotations.list(options)
      },
      async get(id) {
        return getLib().annotations.get(id)
      },
      async update(id, updates) {
        return getLib().annotations.update(id, updates)
      },
      async delete(id) {
        return getLib().annotations.delete(id)
      },
      async listRecent(limit?: number) {
        return getLib().annotations.listRecent(limit)
      },
    },

    notes: {
      async create(input) {
        return getLib().notes.create(input)
      },
      async list(options) {
        return getLib().notes.list(options)
      },
      async get(id) {
        return getLib().notes.get(id)
      },
      async update(id, updates) {
        return getLib().notes.update(id, updates)
      },
      async delete(id) {
        return getLib().notes.delete(id)
      },
      async getAnnotations(noteId) {
        return getLib().notes.getAnnotations(noteId)
      },
      async move(id, targetFolder) {
        await getLib().notes.move(id, targetFolder)
      },
      async refresh() {
        return getLib().notes.syncDisk()
      },
      async listDirs() {
        return getLib().notes.listDirs()
      },
      async createDir(dirPath) {
        return getLib().notes.createDir(dirPath)
      },
      async deleteDir(dirPath: string) {
        return getLib().notes.deleteDir(dirPath)
      },
      async importMarkdownDialog(targetFolder: string | null) {
        return pickAndImportMarkdown(targetFolder)
      },
      async importDroppedMarkdown(files, targetFolder) {
        return importMarkdownTexts(files.map(f => ({ name: f.name, content: () => f.text() })), targetFolder)
      },
      async renameDir(oldPath, newPath) {
        return getLib().notes.renameDir(oldPath, newPath)
      },
      onNavigateLink(callback) {
        // No-op on mobile for now; events can be wired later
        return () => {}
      },
    },

    folders: {
      async create(input) {
        return getLib().folders.create(input)
      },
      async getTree() {
        return getLib().folders.getTree()
      },
      async update(id, updates) {
        return getLib().folders.update(id, updates)
      },
      async delete(id) {
        return getLib().folders.delete(id)
      },
    },

    attachments: {
      async save(noteId, fileName, data) {
        return getLib().attachments.save(noteId, fileName, new Uint8Array(data))
      },
      async getPath(relativePath) {
        return getLib().attachments.getFullPath(relativePath)
      },
      async delete(relativePath) {
        return getLib().attachments.delete(relativePath)
      },
      async open(relativePath) {
        await FilePreview.preview({ url: await documentsUri(getLib().attachments.getFullPath(relativePath)) })
      },
      // banjuan-attachment:// isn't served here: images and videos in notes
      // load from the file through Capacitor's local file URL instead.
      async getFileSrc(relativePath) {
        return Capacitor.convertFileSrc(await documentsUri(getLib().attachments.getFullPath(relativePath)))
      },
    },

    noteLinks: {
      async getBacklinks(noteId) {
        return getLib().noteLinks.getBacklinks(noteId)
      },
      async getForwardLinks(noteId) {
        return getLib().noteLinks.getForwardLinks(noteId)
      },
      async sync(noteId, links) {
        return getLib().noteLinks.sync(noteId, links)
      },
    },

    docLinks: {
      async getBacklinks(docId) {
        return getLib().docLinks.getBacklinks(docId)
      },
      async getForwardLinks(noteId) {
        return getLib().docLinks.getForwardLinks(noteId)
      },
      async sync(noteId, links) {
        return getLib().docLinks.sync(noteId, links)
      },
    },

    templates: {
      async list() {
        return getLib().templates.list()
      },
      async get(id) {
        return getLib().templates.get(id)
      },
      async create(input) {
        return getLib().templates.create(input)
      },
      async update(id, updates) {
        return getLib().templates.update(id, updates)
      },
      async delete(id) {
        return getLib().templates.delete(id)
      },
    },

    mindmaps: {
      async addNode(noteId, input) {
        return getLib().mindmaps.addNode(noteId, input)
      },
      async getNodes(noteId) {
        return getLib().mindmaps.getNodes(noteId)
      },
      async findNodesByNoteId(noteId) {
        return getLib().mindmaps.findNodesByNoteId(noteId)
      },
      async updateNode(id, updates) {
        return getLib().mindmaps.updateNode(id, updates)
      },
      async removeNode(id) {
        return getLib().mindmaps.removeNode(id)
      },
      async restore(noteId, snapshot) {
        return getLib().mindmaps.restore(noteId, snapshot)
      },
      async addEdge(noteId, input) {
        return getLib().mindmaps.addEdge(noteId, input)
      },
      async getEdges(noteId) {
        return getLib().mindmaps.getEdges(noteId)
      },
      async updateEdge(id, updates) {
        return getLib().mindmaps.updateEdge(id, updates)
      },
      async removeEdge(id) {
        return getLib().mindmaps.removeEdge(id)
      },
      async addBoundary(mindmapId, input) {
        return getLib().mindmaps.addBoundary(mindmapId, input)
      },
      async getBoundaries(mindmapId) {
        return getLib().mindmaps.getBoundaries(mindmapId)
      },
      async updateBoundary(id, updates) {
        return getLib().mindmaps.updateBoundary(id, updates)
      },
      async removeBoundary(id) {
        return getLib().mindmaps.removeBoundary(id)
      },
      async addSummary(mindmapId, input) {
        return getLib().mindmaps.addSummary(mindmapId, input)
      },
      async getSummaries(mindmapId) {
        return getLib().mindmaps.getSummaries(mindmapId)
      },
      async removeSummary(id) {
        return getLib().mindmaps.removeSummary(id)
      },
    },

    graph: {
      async getData() {
        return getLib().graph.getData()
      },
    },

    sync: {
      async getConfig() {
        return getLib().getSyncConfig()
      },
      async saveConfig(config) {
        return getLib().saveSyncConfig(config)
      },
      async testConnection(config) {
        try {
          const { CapacitorWebDAVAdapter } = await import('./capacitor-webdav-adapter')
          const adapter = new CapacitorWebDAVAdapter(createDeps(getLib().rootPath).fs)
          await adapter.connect(config)
          const files = await adapter.list(config.remotePath || '/')
          await adapter.disconnect()
          return { ok: true, message: `Connected. Found ${files.length} items on server.` }
        } catch (err: any) {
          return { ok: false, message: err?.message ?? String(err) }
        }
      },
      async run(onProgress) {
        const config = await getLib().getSyncConfig()
        if (!config) throw new Error('No sync config')
        const { SyncService } = await import('@banjuan/core')
        const { CapacitorWebDAVAdapter } = await import('./capacitor-webdav-adapter')
        const adapter = new CapacitorWebDAVAdapter(createDeps(getLib().rootPath).fs)
        await adapter.connect(config)
        const deps = createDeps(getLib().rootPath)
        const me = await getDeviceIdentity()
        const { webdavTarget } = await import('@banjuan/core')
        const svc = new SyncService(getLib().rootPath, adapter, getLib().events, deps.fs, config.remotePath, deps.crypto, me.deviceName, webdavTarget(config))
        const result = await svc.sync(onProgress)
        // Upload-only / no-op sync: no local file changed, nothing to import or re-index.
        if (!result.localChanged) return result
        await refreshAfterSync(getLib(), onProgress)
        return result
      },
      async stubList() {
        return []
      },
      async stubDownload() {},
      async stubUpload() {},
      async getDocStatus() {
        return 'local'
      },
    },

    lan: {
      canHost: false,   // mobile is client-only — UI hides the host controls
      async startHost() { return { running: false, url: null, pin: null, port: null } },
      async stopHost() { /* mobile cannot host */ },
      async getHostStatus() { return { running: false, url: null, pin: null, port: null } },

      async scanNearby() {
        const results = new Map<string, NearbyShare>()
        // Run BOTH discovery paths concurrently. On the iOS simulator
        // ZeroConf.watch can hang and never resolve, so we must not await it
        // before the localhost probe — and we cap the whole scan with a timeout
        // so a stuck Bonjour browse can't freeze the UI on "scanning…".
        const mdnsP = (async () => {
          try { for (const n of await mdnsScanNearby()) results.set(n.deviceId, n) } catch { /* ignore */ }
        })()
        // Same-machine probe: on the simulator localhost reaches the Mac host
        // but Bonjour is unreliable, so hit the known fixed ports on 127.0.0.1
        // directly. Harmless on a real device (nothing listens, fails fast).
        const localP = Promise.all(LAN_PREFERRED_PORTS.map(async (port) => {
          const url = `http://127.0.0.1:${port}`
          try {
            const resp = await CapacitorHttp.get({ url: `${url}/.banjuan-info`, connectTimeout: 1500, readTimeout: 1500 } as any)
            if (resp.status >= 400) return
            const info = (typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data) as { deviceId?: string; deviceName?: string; libraryId?: string; libraryName?: string }
            if (!info?.deviceId) return
            results.set(info.deviceId, {
              deviceId: info.deviceId,
              deviceName: info.deviceName ?? '',
              libraryName: info.libraryName ?? '',
              libraryId: info.libraryId ?? '',
              url,
            })
          } catch { /* port not listening */ }
        }))
        await Promise.race([
          Promise.allSettled([mdnsP, localP]),
          new Promise((r) => setTimeout(r, 7000)),
        ])
        const out = [...results.values()]
        console.log('[scan] scanNearby returning', out.length, out.map(r => `${r.deviceName}@${r.url}`))
        return out
      },

      async pairDevice(peerUrl: string, pin: string) {
        if (!/^https?:\/\//i.test(peerUrl)) throw new Error('PAIR_FAILED:invalid-url')
        const base = peerUrl.replace(/\/$/, '')
        const me = await getDeviceIdentity()
        const lib = getLib()
        const myLibraryId = await lib.getId()
        const { PairingStore } = await import('@banjuan/core')

        // CapacitorHttp does NOT throw on non-2xx — check status explicitly.
        const infoResp = await CapacitorHttp.get({ url: `${base}/.banjuan-info` })
        if (infoResp.status >= 400) throw new Error(`PAIR_FAILED:${infoResp.status}`)
        const info = (typeof infoResp.data === 'string' ? JSON.parse(infoResp.data) : infoResp.data) as { deviceId?: string; deviceName?: string; libraryId?: string; libraryName?: string }
        const hostDeviceId = info.deviceId ?? ''
        if (!hostDeviceId) throw new Error('PAIR_FAILED:no-device-id')

        const pairResp = await CapacitorHttp.get({ url: `${base}/.banjuan-pair`, params: { pin, deviceId: me.deviceId, deviceName: me.deviceName, libraryId: myLibraryId } })
        if (pairResp.status >= 400) throw new Error(`PAIR_FAILED:${pairResp.status}`)
        const pair = (typeof pairResp.data === 'string' ? JSON.parse(pairResp.data) : pairResp.data) as { token?: string }
        if (!pair.token) throw new Error('PAIR_FAILED:no-token')

        const store = new PairingStore(lib.rootPath, createDeps(lib.rootPath).fs)
        await store.addOrUpdate({ peerDeviceId: hostDeviceId, peerDeviceName: info.deviceName ?? '', peerLibraryId: info.libraryId ?? '', token: pair.token })
        return { ok: true as const, deviceName: info.deviceName ?? '', libraryName: info.libraryName ?? '' }
      },

      async syncDevice(peerUrl: string, onProgress?: (p: any) => void, force?: boolean) {
        if (!/^https?:\/\//i.test(peerUrl)) throw new Error('SYNC_FAILED:invalid-url')
        const base = peerUrl.replace(/\/$/, '')
        const lib = getLib()
        const myLibraryId = await lib.getId()
        const { PairingStore, SyncService } = await import('@banjuan/core')
        const { CapacitorWebDAVAdapter } = await import('./capacitor-webdav-adapter')

        const infoResp = await CapacitorHttp.get({ url: `${base}/.banjuan-info` })
        if (infoResp.status >= 400) throw new Error(`SYNC_FAILED:${infoResp.status}`)
        const info = (typeof infoResp.data === 'string' ? JSON.parse(infoResp.data) : infoResp.data) as { deviceId?: string; libraryId?: string; libraryName?: string }
        const hostDeviceId = info.deviceId ?? ''
        const hostLibraryId = info.libraryId ?? ''
        const hostLibraryName = info.libraryName ?? ''

        const store = new PairingStore(lib.rootPath, createDeps(lib.rootPath).fs)
        const existing = hostDeviceId ? await store.findByDeviceId(hostDeviceId) : undefined
        if (!existing) return { needsPair: true as const }

        if (hostLibraryId && hostLibraryId !== myLibraryId) {
          // Notes count too: a notes-only library used to be taken as empty and merged without asking.
          const isEmpty = (await lib.documents.list()).length === 0 && (await lib.notes.list({})).length === 0
          if (isEmpty || force) {
            await lib.adoptLibraryId(hostLibraryId)
          } else {
            return { needsConfirm: true as const, peerName: hostLibraryName, localName: await lib.getName() }
          }
        }

        const syncDeps = createDeps(lib.rootPath)
        const adapter = new CapacitorWebDAVAdapter(syncDeps.fs)
        await adapter.connect({ type: 'webdav', url: base, username: 'banjuan', password: existing.token, remotePath: '/' })
        const me = await getDeviceIdentity()
        const svc = new SyncService(lib.rootPath, adapter, lib.events, syncDeps.fs, '/', syncDeps.crypto, me.deviceName, `lan:${hostDeviceId}`)
        const result = await svc.sync(onProgress)
        // Same as after a WebDAV sync: import what arrived, re-index, and persist
        // the index — it used to skip the import and the save, so a later launch
        // (iOS kills apps in the background) started from a stale index.
        if (result.localChanged) await refreshAfterSync(lib, onProgress)
        return result
      },

      async listPairedDevices() {
        const lib = getLib()
        const { PairingStore } = await import('@banjuan/core')
        const devices = await new PairingStore(lib.rootPath, createDeps(lib.rootPath).fs).list()
        return devices.map(({ token: _t, ...rest }) => rest)
      },

      async unpairDevice(peerDeviceId: string) {
        const lib = getLib()
        const { PairingStore } = await import('@banjuan/core')
        await new PairingStore(lib.rootPath, createDeps(lib.rootPath).fs).removeByDeviceId(peerDeviceId)
      },
    },

    search: {
      async query(query, options) {
        return getLib().search.query(query, options)
      },
      async textIndexStatus() {
        return docTextStatus(getLib())
      },
    },

    trash: {
      async list() { return getLib().trash.list() },
      async restore(entryId) { return getLib().trash.restore(entryId) },
      async purge(entryId) { return getLib().trash.purge(entryId) },
      async empty() { return getLib().trash.empty() },
    },

    index: {
      async rebuild() {
        const indexSvc = getLib().createIndexService()
        await indexSvc.rebuildFull()
      },
    },

    async setDrawingMode(enabled: boolean) {
      const wasOn = drawingModeUsers > 0
      drawingModeUsers = Math.max(0, drawingModeUsers + (enabled ? 1 : -1))
      const on = drawingModeUsers > 0
      if (on === wasOn) return
      drawingModeCalls = drawingModeCalls
        .then(() => DrawingMode.setEnabled({ enabled: on }))
        .catch(() => { /* native plugin unavailable */ })
      await drawingModeCalls
    },
  }
}

/** After a sync brought files in: import them, rebuild the index, and write the (in-memory) index to disk. */
async function refreshAfterSync(lib: Library, onProgress?: (p: any) => void): Promise<void> {
  onProgress?.({ phase: 'finalizing', current: 0, total: 0, currentFile: 'Rebuilding index...' })
  try {
    const deps = createDeps(lib.rootPath)
    const notesDir = `${lib.rootPath}/.banjuan/notes`
    const notesExist = await deps.fs.exists(notesDir)
    console.log('[sync] notesDir:', notesDir, 'exists:', notesExist)
    if (notesExist) {
      const noteFiles = await deps.fs.readdirWithTypes(notesDir)
      console.log('[sync] note files:', noteFiles.map(f => f.name))
    }
    await lib.syncWithDisk()
    try { await lib.notes.syncDisk() } catch {}
    try { await lib.tags.syncFromFiles() } catch {}
    await lib.createIndexService().rebuildFull()
    await lib.flush()
    const noteCount = await lib.notes.list({})
    console.log('[sync] rebuild done, notes in db:', noteCount.length)
    const docCount = await lib.documents.list({})
    console.log('[sync] docs in db:', docCount.length)
  } catch (e: any) {
    console.error('[sync] rebuild error:', e?.message, e?.stack)
  }
}
