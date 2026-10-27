import { ipcMain, dialog, clipboard, shell, BrowserWindow, app, safeStorage, webContents } from 'electron'
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync, unlinkSync, readdirSync, statSync, renameSync, realpathSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { readByteRange } from './read-range.js'
import { join, basename, dirname, resolve, sep } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { webdavTarget } from '@banjuan/core'
import { Library, MAX_LIBRARY_FILES, type MindmapNodeCreateInput, type MindmapNode, type MindmapSnapshot, type PlatformDeps, type SearchOptions } from '@banjuan/core'
import { NodeFS, NodeDatabaseFactory, NodeCrypto } from '@banjuan/platform-node'
import { setLibraryGetter } from './api-server.js'
import { createWindow, getLastFocusedLibraryWindow } from './windows.js'
import { LanHostServer, type HostStatus } from './lan-host-server.js'
import { getDeviceIdentity } from './device-identity.js'
import { writeZip } from './zip.js'
import { DiscoveryService } from './discovery-service.js'
import { docTextStatus } from './doc-text-indexer.js'
import { getCover } from './covers.js'
import { importDocumentFiles } from './document-import.js'
import { libraryPath, rememberPickedDir, exportDir, openPathSafely, rememberUserChosenPath, assertUserChosen, uniquePath } from './path-guard.js'

// Global plugins live here (shared by every library), à la Claude Code's
// global plugin dir. Built-in plugins are installed here once at startup.
const GLOBAL_PLUGINS_DIR = join(homedir(), '.banjuan', 'plugins')

// Which library plugins the user allowed on this machine, by library + plugin
// id → code hash. Kept outside every library so a shared or synced folder can't
// mark its own plugins as allowed.
const PLUGIN_TRUST_FILE = join(homedir(), '.banjuan', 'plugin-trust.json')

function readPluginTrust(): Record<string, Record<string, string>> {
  try { return JSON.parse(readFileSync(PLUGIN_TRUST_FILE, 'utf8')) } catch { return {} }
}

const deps: PlatformDeps = {
  fs: new NodeFS(),
  dbFactory: new NodeDatabaseFactory(),
  crypto: new NodeCrypto(),
  globalPluginsDir: GLOBAL_PLUGINS_DIR,
  pluginTrust: {
    isTrusted: async (root, id, hash) => readPluginTrust()[resolve(root)]?.[id] === hash,
    trust: async (root, id, hash) => {
      const all = readPluginTrust()
      ;(all[resolve(root)] ??= {})[id] = hash
      mkdirSync(dirname(PLUGIN_TRUST_FILE), { recursive: true })
      const tmp = `${PLUGIN_TRUST_FILE}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(all, null, 2))
      renameSync(tmp, PLUGIN_TRUST_FILE)
    },
  },
  // The WebDAV password in sync.json, sealed by the OS keychain (macOS Keychain,
  // Windows DPAPI, libsecret). Unavailable → seal throws and it stays as before.
  secrets: {
    seal: (plain) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('No keychain available')
      return safeStorage.encryptString(plain).toString('base64')
    },
    open: (sealed) => safeStorage.decryptString(Buffer.from(sealed, 'base64')),
  },
}

let lanHost: LanHostServer | null = null
// The host is a single per-process server, but it belongs to the ONE window that
// started it (serving that window's library). Other windows must not see it as
// "their" host — they act as clients instead. Tracked by webContents id.
let lanHostOwner: number | null = null
const HOST_OFFLINE: HostStatus = { running: false, url: null, pin: null, port: null }
const discovery = new DiscoveryService()

// Install/refresh bundled plugins into the GLOBAL plugins dir (~/.banjuan/plugins),
// once at startup. Per-plugin config.json (user settings/sessions) is preserved.
export function installBundledPlugins(): void {
  const bundledDir = app.isPackaged
    ? join(process.resourcesPath, 'plugins')
    : join(dirname(dirname(dirname(dirname(__dirname)))), 'plugins')
  if (!existsSync(bundledDir)) return
  if (!existsSync(GLOBAL_PLUGINS_DIR)) mkdirSync(GLOBAL_PLUGINS_DIR, { recursive: true })

  for (const entry of readdirSync(bundledDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const srcDir = join(bundledDir, entry.name)
    const destDir = join(GLOBAL_PLUGINS_DIR, entry.name)
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
    for (const file of readdirSync(srcDir)) {
      if (file === 'config.json') continue
      copyFileSync(join(srcDir, file), join(destDir, file))
    }
  }
}

/**
 * Absolute path of a note attachment for export, or null if it is missing or
 * resolves outside the library's .banjuan dir (a `..` in the renderer-supplied path).
 */
function attachmentSource(lib: Library, relPath: string): string | null {
  try {
    const root = resolve(lib.attachments.getFullPath(''))
    const p = resolve(lib.attachments.getFullPath(relPath))
    return p.startsWith(root + sep) && existsSync(p) ? p : null
  } catch {
    return null   // not a plain attachment path
  }
}

/** Zip entries for a list of attachments under `prefix` (e.g. "Title/attachments"). */
function attachmentEntries(lib: Library, relPaths: string[], prefix: string): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {}
  for (const relPath of relPaths) {
    const src = attachmentSource(lib, relPath)
    if (src) out[`${prefix}/${basename(src)}`] = readFileSync(src)
  }
  return out
}


const HISTORY_FILE = join(homedir(), '.banjuan', 'library-history.json')

interface LibraryHistoryEntry {
  path: string
  name: string
  lastOpened: string
}

function readHistory(): LibraryHistoryEntry[] {
  try {
    const entries: LibraryHistoryEntry[] = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
    entries.sort((a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime())
    return entries
  } catch {
    return []
  }
}

function recordLibraryOpen(path: string, name: string): void {
  const history = readHistory()
  const idx = history.findIndex(h => h.path === path)
  const entry: LibraryHistoryEntry = { path, name, lastOpened: new Date().toISOString() }
  if (idx >= 0) {
    history[idx] = entry
  } else {
    history.push(entry)
  }
  const dir = join(homedir(), '.banjuan')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
}

export function getLibraryHistory(): LibraryHistoryEntry[] {
  return readHistory()
}

export const libraries = new Map<number, Library>()
// Paths listed by the last clipboard:readFiles — the only ones clipboard:readFileBuffer reads.
const clipboardFiles = new Set<string>()
let nextApiKey = -1

/**
 * Drop the library a window had open — when it opens another one, or closes.
 * It used to stay open for the rest of the session (database handle, loaded
 * plugins, a LAN host serving it). Closed unless another key still uses it.
 */
export async function releaseLibrary(key: number): Promise<void> {
  const lib = libraries.get(key)
  if (!lib) return
  libraries.delete(key)
  if (lanHost && lanHostOwner === key) {
    await lanHost.stop().catch(() => {})
    lanHost = null
    lanHostOwner = null
    discovery.stopAdvertise()   // or nearby devices kept finding a host that was gone
  }
  if ([...libraries.values()].includes(lib)) return
  try { await lib.close() } catch (e) { console.warn('[library] closing failed', lib.rootPath, e) }
}

/** Point `key` (a window) at `lib`, releasing what it pointed at before. */
export async function assignLibrary(key: number, lib: Library): Promise<void> {
  if (libraries.get(key) === lib) return
  await releaseLibrary(key)
  libraries.set(key, lib)
}

/** The instance of the library at `path` some window or the local API already has open. */
function openInstanceOf(path: string): Library | undefined {
  const target = resolve(path)
  return [...libraries.values()].find(l => resolve(l.rootPath) === target)
}

/**
 * Show `absPath` in a library window of the library at `root`: imported into it
 * (a file inside the library in place, one from outside copied in) and opened.
 * A window already showing that library does it; otherwise a new window opens
 * that library and does it.
 */
export function openPathInLibraryWindow(root: string, absPath: string): void {
  rememberUserChosenPath(absPath)   // the library window's import takes only files the user chose
  const target = realOrResolved(root)
  for (const [key, lib] of libraries) {
    if (key < 0 || realOrResolved(lib.rootPath) !== target) continue
    const wc = webContents.fromId(key)
    if (!wc || wc.isDestroyed()) continue
    const win = BrowserWindow.fromWebContents(wc)
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus() }
    wc.send('library:import-open', absPath)
    return
  }
  createWindow({ hash: `library=${encodeURIComponent(root)}&importOpen=${encodeURIComponent(absPath)}` })
}

const realOrResolved = (p: string) => { try { return realpathSync(p) } catch { return resolve(p) } }

/** Plugin messages for a library go to every window showing it. */
function sendToLibraryWindows(lib: Library): (channel: string, data: any) => void {
  return (channel, data) => {
    for (const [key, l] of libraries) {
      if (l !== lib || key < 0) continue
      const wc = webContents.fromId(key)
      if (wc && !wc.isDestroyed()) wc.send(channel, data)
    }
  }
}

const releasedOnDestroy = new Set<number>()
function releaseWhenClosed(sender: Electron.WebContents): void {
  const id = sender.id
  if (releasedOnDestroy.has(id)) return
  releasedOnDestroy.add(id)
  sender.once('destroyed', () => { releasedOnDestroy.delete(id); void releaseLibrary(id) })
}

function getLib(event: Electron.IpcMainInvokeEvent): Library {
  const lib = libraries.get(event.sender.id)
  if (!lib) throw new Error('No library open')
  return lib
}


/** Opens under way, by resolved path: a second open of the same library joins the first. */
const opening = new Map<string, Promise<{ lib: Library; syncResult: Awaited<ReturnType<Library['syncWithDisk']>> | null }>>()

/**
 * The open instance of the library at `path`, opening it if no window or API
 * client has it yet. Two opens racing (two windows, a window and the local
 * API) each made their own instance before; the index is rebuilt only when stale.
 */
async function openShared(path: string): Promise<{ lib: Library; syncResult: Awaited<ReturnType<Library['syncWithDisk']>> | null }> {
  const shared = openInstanceOf(path)
  if (shared) return { lib: shared, syncResult: null }
  const key = resolve(path)
  let job = opening.get(key)
  if (!job) {
    job = (async () => {
      const lib = await Library.open(path, deps)
      try {
        await Library.migrateNotes(path, deps.fs)
        const syncResult = await lib.syncWithDisk()
        try { await lib.notes.syncDisk() } catch { /* non-critical */ }
        try { await lib.tags.syncFromFiles() } catch { /* non-critical */ }
        lib.plugins.setWebContentsSender(sendToLibraryWindows(lib))
        await lib.plugins.loadAll()
        // The DB persists across opens: a full rebuild only when it is stale
        // (never stamped / version changed).
        const indexService = lib.createIndexService()
        if (await indexService.isStale()) await indexService.rebuildFull()
        return { lib, syncResult }
      } catch (e) {
        await lib.close().catch(() => {})
        throw e
      }
    })().finally(() => opening.delete(key))
    opening.set(key, job)
  }
  return job
}

export async function initLibraryForApi(path: string, name?: string): Promise<Library> {
  const existing = openInstanceOf(path)
  if (existing) return existing
  if (await Library.isLibrary(path, deps)) return openLibraryForApi(path)
  const lib = await Library.init(path, deps, name)
  await lib.scanAndImport()
  lib.plugins.setWebContentsSender(sendToLibraryWindows(lib))
  await lib.plugins.loadAll()
  const indexService = lib.createIndexService()
  await indexService.rebuildFull()
  libraries.set(nextApiKey--, lib)
  const libName = await lib.getName()
  recordLibraryOpen(lib.rootPath, libName)
  return lib
}

export async function openLibraryForApi(path: string): Promise<Library> {
  const existing = openInstanceOf(path)
  if (existing) return existing
  const { lib } = await openShared(path)
  if (![...libraries.values()].includes(lib)) libraries.set(nextApiKey--, lib)
  const libName = await lib.getName()
  recordLibraryOpen(lib.rootPath, libName)
  return lib
}

export function registerIpcHandlers() {
  ipcMain.handle('library:check', async (_event, path: string) => {
    return Library.isLibrary(path, deps)
  })

  // Pre-check directory size BEFORE creating a library, so a too-large folder
  // never leaves a stray .banjuan / DB behind.
  ipcMain.handle('library:checkSize', async (_event, path: string) => {
    const exceeds = await Library.exceedsFileCap(path, deps.fs)
    return { exceeds, limit: MAX_LIBRARY_FILES }
  })

  ipcMain.handle('library:init', async (event, path: string, name?: string) => {
    // Backstop: refuse to create anything when over the cap (the renderer also
    // pre-checks via library:checkSize before showing the name dialog).
    if (await Library.exceedsFileCap(path, deps.fs)) {
      throw new Error(`FILE_CAP_EXCEEDED:${MAX_LIBRARY_FILES}`)
    }
    await releaseLibrary(event.sender.id)
    const lib = await Library.init(path, deps, name)
    libraries.set(event.sender.id, lib)
    releaseWhenClosed(event.sender)
    const scanResult = await lib.scanAndImport()
    lib.plugins.setWebContentsSender(sendToLibraryWindows(lib))
    await lib.plugins.loadAll()
    const indexService = lib.createIndexService()
    await indexService.rebuildFull()
    const libName = await lib.getName()
    recordLibraryOpen(lib.rootPath, libName)
    return { rootPath: lib.rootPath, name: libName, imported: scanResult.imported, skipped: scanResult.skipped, truncated: scanResult.truncated, limit: scanResult.limit }
  })

  ipcMain.handle('library:open', async (event, path: string) => {
    await releaseLibrary(event.sender.id)
    // Already open in another window (or by the local API): share that instance.
    // A second one loaded the library's plugins twice and kept a second copy of
    // everything in memory, both writing the same files.
    const { lib, syncResult } = await openShared(path)
    libraries.set(event.sender.id, lib)
    releaseWhenClosed(event.sender)
    lib.plugins.setWebContentsSender(sendToLibraryWindows(lib))
    const libName = await lib.getName()
    recordLibraryOpen(lib.rootPath, libName)
    return syncResult
      ? { rootPath: lib.rootPath, name: libName, imported: syncResult.imported, removed: syncResult.removed, truncated: syncResult.truncated, limit: syncResult.limit }
      : { rootPath: lib.rootPath, name: libName, imported: 0, removed: 0, truncated: false, limit: MAX_LIBRARY_FILES }
  })

  ipcMain.handle('library:openNewWindow', () => {
    createWindow()
  })

  ipcMain.handle('library:isOpen', (event) => libraries.has(event.sender.id))

  ipcMain.handle('library:getHistory', () => readHistory())

  ipcMain.handle('library:removeHistory', (_event, path: string) => {
    const history = readHistory().filter(h => h.path !== path)
    const dir = join(homedir(), '.banjuan')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
  })

  ipcMain.handle('library:rename', async (event, name: string) => {
    const lib = getLib(event)
    await lib.setName(name)
    recordLibraryOpen(lib.rootPath, name)
    return { name }
  })

  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled) return null
    rememberPickedDir(result.filePaths[0])   // exports may write here
    return result.filePaths[0]
  })

  ipcMain.handle('documents:import', async (event, destDir?: string) => {
    const library = getLib(event)
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Supported', extensions: ['pdf', 'epub', 'txt', 'md', 'markdown', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'webm', 'html', 'htm', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'json', 'xml', 'csv', 'tsv', 'log', 'conf', 'cfg', 'ini', 'toml', 'env', 'py', 'js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'less', 'sql', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'swift', 'kt', 'r', 'tex', 'bib', 'rst'] },
      ],
    })
    if (result.canceled) return null
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const targetDir = destDir ? libraryPath(library.rootPath, destDir) : library.rootPath
    await fs.mkdir(targetDir, { recursive: true })
    const destPaths: string[] = []
    for (const srcPath of result.filePaths) {
      const destPath = path.join(targetDir, path.basename(srcPath))
      if (srcPath !== destPath) {
        await fs.copyFile(srcPath, destPath)
      }
      destPaths.push(destPath)
    }
    // One batch import (per-file import() re-read every document JSON: O(N²)).
    const imported = await library.documents.importMany(destPaths)
    const lastDoc = [...imported].reverse().find(r => r.doc)?.doc ?? null
    const firstError = imported.find(r => r.error)?.error
    if (!lastDoc && firstError) throw new Error(firstError)
    return lastDoc
  })

  ipcMain.handle('documents:list', async (event, options?: Record<string, unknown>) => {
    return getLib(event).documents.list(options as any)
  })

  ipcMain.handle('documents:get', async (event, id: string) => {
    return getLib(event).documents.get(id)
  })

  ipcMain.handle('documents:delete', async (event, id: string) => {
    return getLib(event).documents.delete(id)
  })

  ipcMain.handle('documents:getCover', async (event, id: string) => getCover(getLib(event), id))

  ipcMain.handle('documents:markRead', async (event, id: string) => {
    return getLib(event).documents.markRead(id)
  })

  ipcMain.handle('documents:refresh', async (event) => {
    return getLib(event).syncWithDisk()
  })

  ipcMain.handle('documents:createDir', async (event, dirPath: string) => {
    return getLib(event).documents.createDir(dirPath)
  })

  ipcMain.handle('documents:move', async (event, id: string, destDir: string) => {
    return getLib(event).documents.move(id, destDir)
  })

  ipcMain.handle('documents:listDirs', async (event) => {
    return getLib(event).documents.listDirs()
  })

  ipcMain.handle('documents:deleteDir', async (event, dirPath: string) => {
    return getLib(event).documents.deleteDir(dirPath)
  })

  ipcMain.handle('documents:renameDir', async (event, oldPath: string, newPath: string) => {
    return getLib(event).documents.renameDir(oldPath, newPath)
  })

  ipcMain.handle('trash:list', async (event) => getLib(event).trash.list())
  ipcMain.handle('trash:restore', async (event, entryId: string) => getLib(event).trash.restore(entryId))
  ipcMain.handle('trash:purge', async (event, entryId: string) => getLib(event).trash.purge(entryId))
  ipcMain.handle('trash:empty', async (event) => getLib(event).trash.empty())

  ipcMain.on('files:user-chosen', (_event, p: string) => rememberUserChosenPath(p))

  ipcMain.handle('documents:importFiles', async (event, filePaths: string[], destDir?: string) => {
    assertUserChosen(filePaths)
    const library = getLib(event)
    return importDocumentFiles(library, filePaths, destDir ?? null)
  })

  ipcMain.handle('documents:importFilesDialog', async (event, destDir?: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [
        { name: 'All Supported', extensions: ['pdf', 'epub', 'txt', 'md', 'markdown', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'webm', 'html', 'htm', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'json', 'xml', 'csv', 'tsv', 'log', 'conf', 'cfg', 'ini', 'toml', 'env', 'py', 'js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'less', 'sql', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'swift', 'kt', 'r', 'tex', 'bib', 'rst'] },
      ],
    })
    if (result.canceled) return null
    const library = getLib(event)
    return importDocumentFiles(library, result.filePaths, destDir ?? null)
  })

  ipcMain.handle('documents:update', async (event, id: string, updates: {
    title?: string; authors?: string[]; metadata?: Record<string, unknown>
  }) => {
    return getLib(event).documents.update(id, updates)
  })

  ipcMain.handle('documents:getFilePath', async (event, relativePath: string) => {
    return libraryPath(getLib(event).rootPath, relativePath)
  })

  ipcMain.handle('documents:readContent', async (event, relativePath: string) => {
    const fullPath = libraryPath(getLib(event).rootPath, relativePath)
    return readFileSync(fullPath, 'utf-8')
  })

  ipcMain.handle('documents:readFileBuffer', async (event, relativePath: string) => {
    const fullPath = libraryPath(getLib(event).rootPath, relativePath)
    return readFile(fullPath)
  })

  ipcMain.handle('documents:fileSize', async (event, relativePath: string) => {
    return (await stat(libraryPath(getLib(event).rootPath, relativePath))).size
  })

  // Bytes [start, end) of a document; one call reads at most 64 MB.
  ipcMain.handle('documents:readFileRange', async (event, relativePath: string, start: number, end: number) => {
    return readByteRange(libraryPath(getLib(event).rootPath, relativePath), start, end)
  })

  ipcMain.handle('documents:openInSystem', async (event, relativePath: string) => {
    const fullPath = libraryPath(getLib(event).rootPath, relativePath)
    return openPathSafely(fullPath)
  })

  ipcMain.handle('tags:list', async (event) => {
    return getLib(event).tags.list()
  })

  ipcMain.handle('tags:listWithCounts', async (event) => {
    return getLib(event).tags.listWithCounts()
  })

  ipcMain.handle('tags:create', async (event, input: { name: string; color?: string }) => {
    return getLib(event).tags.create(input)
  })

  ipcMain.handle('tags:forTarget', async (event, targetId: string, targetType: string) => {
    return getLib(event).tags.forTarget(targetId, targetType as any)
  })

  ipcMain.handle('tags:namesByTarget', async (event, targetType: string) => {
    return getLib(event).tags.namesByTarget(targetType as any)
  })

  ipcMain.handle('tags:assign', async (event, targetId: string, targetType: string, tagNames: string[]) => {
    return getLib(event).tags.assign(targetId, targetType as any, tagNames)
  })

  ipcMain.handle('tags:unassign', async (event, targetId: string, targetType: string, tagName: string) => {
    return getLib(event).tags.unassign(targetId, targetType as any, tagName)
  })

  ipcMain.handle('tags:delete', async (event, tagId: string) => {
    return getLib(event).tags.delete(tagId)
  })

  ipcMain.handle('tags:rename', async (event, tagId: string, newName: string) => {
    return getLib(event).tags.rename(tagId, newName)
  })

  ipcMain.handle('tags:updateColor', async (event, tagId: string, color: string) => {
    return getLib(event).tags.updateColor(tagId, color)
  })

  ipcMain.handle('annotations:create', async (event, input: {
    docId: string; type: string; page?: number;
    position: unknown; content?: string; selectedText?: string; color?: string
  }) => {
    return getLib(event).annotations.create(input as any)
  })

  ipcMain.handle('annotations:list', async (event, options: {
    docId: string; page?: number; type?: string; color?: string
  }) => {
    return getLib(event).annotations.list(options as any)
  })

  ipcMain.handle('annotations:get', async (event, id: string) => {
    return getLib(event).annotations.get(id)
  })

  ipcMain.handle('annotations:update', async (event, id: string, updates: {
    content?: string; color?: string; position?: unknown
  }) => {
    return getLib(event).annotations.update(id, updates)
  })

  ipcMain.handle('annotations:delete', async (event, id: string) => {
    return getLib(event).annotations.delete(id)
  })

  ipcMain.handle('annotations:listRecent', async (event, limit?: number) => {
    return getLib(event).annotations.listRecent(limit)
  })

  ipcMain.handle('notes:create', async (event, input: {
    title: string; type?: string; docId?: string; folderId?: string;
    folder?: string; annotationIds?: string[]; content?: string; templateId?: string;
    layout?: string; theme?: string
  }) => {
    return getLib(event).notes.create(input as any)
  })

  ipcMain.handle('notes:list', async (event, options?: {
    type?: string; docId?: string; folderId?: string; tag?: string; sort?: string; order?: string
  }) => {
    return getLib(event).notes.list(options as any)
  })

  ipcMain.handle('notes:get', async (event, id: string) => {
    return getLib(event).notes.get(id)
  })

  ipcMain.handle('notes:update', async (event, id: string, updates: {
    title?: string; content?: string; typeMeta?: Record<string, unknown>
  }) => {
    return getLib(event).notes.update(id, updates)
  })

  // Attachments go to the recycle bin with the note (TrashService.putNote).
  ipcMain.handle('notes:delete', async (event, id: string) => {
    return getLib(event).notes.delete(id)
  })

  ipcMain.handle('notes:getAnnotations', async (event, noteId: string) => {
    return getLib(event).notes.getAnnotations(noteId)
  })

  ipcMain.handle('notes:move', async (event, id: string, targetFolder: string | null) => {
    return getLib(event).notes.move(id, targetFolder)
  })

  ipcMain.handle('notes:refresh', async (event) => {
    await getLib(event).notes.syncDisk()
  })

  ipcMain.handle('notes:listDirs', async (event) => {
    return getLib(event).notes.listDirs()
  })

  ipcMain.handle('notes:createDir', async (event, dirPath: string) => {
    return getLib(event).notes.createDir(dirPath)
  })

  ipcMain.handle('notes:renameDir', async (event, oldPath: string, newPath: string) => {
    return getLib(event).notes.renameDir(oldPath, newPath)
  })

  ipcMain.handle('notes:deleteDir', async (event, dirPath: string) => {
    return getLib(event).notes.deleteDir(dirPath)
  })

  const importMarkdownFiles = async (lib: Library, filePaths: string[], targetFolder: string | null) => {
    const results: Array<{ title: string; success: boolean; error?: string }> = []

    const importFile = async (filePath: string, folder: string | null) => {
      const baseName = basename(filePath, '.md')
      const content = readFileSync(filePath, 'utf-8')
      let title = baseName
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          await lib.notes.create({ title, type: 'markdown', content, folder: folder ?? undefined, contentBaseDir: dirname(filePath) })
          results.push({ title, success: true })
          return
        } catch (err: any) {
          if (err?.message === 'DUPLICATE_TITLE') {
            title = `${baseName} (${attempt + 2})`
            continue
          }
          results.push({ title, success: false, error: err?.message })
          return
        }
      }
      results.push({ title, success: false, error: 'TOO_MANY_DUPLICATES' })
    }

    const importDir = async (dirPath: string, folder: string | null) => {
      const dirName = basename(dirPath)
      const subFolder = folder ? `${folder}/${dirName}` : dirName
      await lib.notes.createDir(subFolder)
      const entries = readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        if (entry.isDirectory()) {
          await importDir(fullPath, subFolder)
        } else if (entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
          await importFile(fullPath, subFolder)
        }
      }
    }

    for (const filePath of filePaths) {
      try {
        const stat = statSync(filePath)
        if (stat.isDirectory()) {
          await importDir(filePath, targetFolder)
        } else if (filePath.endsWith('.md')) {
          await importFile(filePath, targetFolder)
        } else {
          results.push({ title: basename(filePath), success: false, error: 'NOT_MARKDOWN' })
        }
      } catch (err: any) {
        results.push({ title: basename(filePath), success: false, error: err?.message })
      }
    }
    return results
  }

  ipcMain.handle('notes:importMarkdownDialog', async (event, targetFolder: string | null) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return importMarkdownFiles(getLib(event), result.filePaths, targetFolder)
  })

  ipcMain.handle('notes:importMarkdown', async (event, filePaths: string[], targetFolder: string | null) => {
    assertUserChosen(filePaths)
    return importMarkdownFiles(getLib(event), filePaths, targetFolder)
  })

  ipcMain.handle('folders:create', async (event, input: { name: string; parentId?: string }) => {
    return getLib(event).folders.create(input)
  })

  ipcMain.handle('folders:getTree', async (event) => {
    return getLib(event).folders.getTree()
  })

  ipcMain.handle('folders:update', async (event, id: string, updates: {
    name?: string; parentId?: string; sortOrder?: number
  }) => {
    return getLib(event).folders.update(id, updates)
  })

  ipcMain.handle('folders:delete', async (event, id: string) => {
    return getLib(event).folders.delete(id)
  })

  ipcMain.handle('noteLinks:getBacklinks', async (event, noteId: string) => {
    return getLib(event).noteLinks.getBacklinks(noteId)
  })

  ipcMain.handle('noteLinks:getForwardLinks', async (event, noteId: string) => {
    return getLib(event).noteLinks.getForwardLinks(noteId)
  })

  ipcMain.handle('noteLinks:sync', async (event, noteId: string, links: Array<{ targetId: string; context: string }>) => {
    return getLib(event).noteLinks.sync(noteId, links)
  })

  ipcMain.handle('docLinks:getBacklinks', async (event, docId: string) => {
    return getLib(event).docLinks.getBacklinks(docId)
  })

  ipcMain.handle('docLinks:getForwardLinks', async (event, noteId: string) => {
    return getLib(event).docLinks.getForwardLinks(noteId)
  })

  ipcMain.handle('docLinks:sync', async (event, noteId: string, links: Array<{ targetId: string; context: string }>) => {
    return getLib(event).docLinks.sync(noteId, links)
  })

  ipcMain.handle('attachments:save', async (event, noteId: string, fileName: string, data: ArrayBuffer) => {
    return getLib(event).attachments.save(noteId, fileName, Buffer.from(data))
  })

  ipcMain.handle('attachments:getPath', async (event, relativePath: string) => {
    return getLib(event).attachments.getFullPath(relativePath)
  })

  ipcMain.handle('attachments:delete', async (event, relativePath: string) => {
    return getLib(event).attachments.delete(relativePath)
  })

  ipcMain.handle('attachments:open', async (event, relativePath: string) => {
    const fullPath = getLib(event).attachments.getFullPath(relativePath)
    return openPathSafely(fullPath)
  })

  ipcMain.handle('attachments:readBuffer', async (event, relativePath: string) => {
    const fullPath = getLib(event).attachments.getFullPath(relativePath)
    if (!existsSync(fullPath)) return null
    return readFileSync(fullPath).buffer
  })

  ipcMain.handle('templates:list', async (event) => {
    return getLib(event).templates.list()
  })

  ipcMain.handle('templates:get', async (event, id: string) => {
    return getLib(event).templates.get(id)
  })

  ipcMain.handle('templates:create', async (event, input: { name: string; description?: string; content: string }) => {
    return getLib(event).templates.create(input)
  })

  ipcMain.handle('templates:update', async (event, id: string, updates: {
    name?: string; description?: string; content?: string; sortOrder?: number
  }) => {
    return getLib(event).templates.update(id, updates)
  })

  ipcMain.handle('templates:delete', async (event, id: string) => {
    return getLib(event).templates.delete(id)
  })

  ipcMain.handle('mindmaps:addNode', async (event, mindmapId: string, input: MindmapNodeCreateInput) => {
    return getLib(event).mindmaps.addNode(mindmapId, input)
  })

  ipcMain.handle('mindmaps:getNodes', async (event, mindmapId: string) => {
    return getLib(event).mindmaps.getNodes(mindmapId)
  })

  ipcMain.handle('mindmaps:findNodesByNoteId', async (event, noteId: string) => {
    return getLib(event).mindmaps.findNodesByNoteId(noteId)
  })

  ipcMain.handle('mindmaps:updateNode', async (event, id: string, updates: Partial<Pick<MindmapNode, 'title' | 'content' | 'color' | 'notes' | 'shape' | 'styleOverrides' | 'hyperlink' | 'imageUrl' | 'parentId' | 'positionX' | 'positionY' | 'collapsed' | 'sortOrder'>>) => {
    return getLib(event).mindmaps.updateNode(id, updates)
  })

  ipcMain.handle('mindmaps:removeNode', async (event, id: string) => {
    return getLib(event).mindmaps.removeNode(id)
  })

  ipcMain.handle('mindmaps:restore', async (event, noteId: string, snapshot: MindmapSnapshot) => {
    return getLib(event).mindmaps.restore(noteId, snapshot)
  })

  ipcMain.handle('mindmaps:addEdge', async (event, mindmapId: string, input: {
    sourceId: string; targetId: string; label?: string
  }) => {
    return getLib(event).mindmaps.addEdge(mindmapId, input)
  })

  ipcMain.handle('mindmaps:getEdges', async (event, mindmapId: string) => {
    return getLib(event).mindmaps.getEdges(mindmapId)
  })

  ipcMain.handle('mindmaps:updateEdge', async (event, id: string, updates: { label?: string; style?: string }) => {
    return getLib(event).mindmaps.updateEdge(id, updates)
  })

  ipcMain.handle('mindmaps:removeEdge', async (event, id: string) => {
    return getLib(event).mindmaps.removeEdge(id)
  })

  // Boundaries
  ipcMain.handle('mindmaps:addBoundary', async (event, mindmapId: string, input: { nodeIds: string[]; label?: string; color?: string }) => {
    return getLib(event).mindmaps.addBoundary(mindmapId, input)
  })
  ipcMain.handle('mindmaps:getBoundaries', async (event, mindmapId: string) => {
    return getLib(event).mindmaps.getBoundaries(mindmapId)
  })
  ipcMain.handle('mindmaps:updateBoundary', async (event, id: string, updates: { label?: string; color?: string; nodeIds?: string[] }) => {
    return getLib(event).mindmaps.updateBoundary(id, updates)
  })
  ipcMain.handle('mindmaps:removeBoundary', async (event, id: string) => {
    return getLib(event).mindmaps.removeBoundary(id)
  })

  // Summaries
  ipcMain.handle('mindmaps:addSummary', async (event, mindmapId: string, input: { nodeIds: string[]; summaryTitle?: string }) => {
    return getLib(event).mindmaps.addSummary(mindmapId, input)
  })
  ipcMain.handle('mindmaps:getSummaries', async (event, mindmapId: string) => {
    return getLib(event).mindmaps.getSummaries(mindmapId)
  })
  ipcMain.handle('mindmaps:removeSummary', async (event, id: string) => {
    return getLib(event).mindmaps.removeSummary(id)
  })

  ipcMain.handle('graph:getData', async (event) => {
    return getLib(event).graph.getData()
  })

  ipcMain.handle('plugins:list', async (event) => {
    return getLib(event).plugins.list()
  })

  ipcMain.handle('plugins:listAll', async (event) => {
    return getLib(event).plugins.listAll()
  })

  ipcMain.handle('plugins:loadAll', async (event) => {
    await getLib(event).plugins.loadAll()
  })

  ipcMain.handle('plugins:unload', async (event, pluginId: string) => {
    await getLib(event).plugins.unload(pluginId)
  })

  ipcMain.handle('plugins:enable', async (event, pluginId: string) => {
    await getLib(event).plugins.enable(pluginId)
  })

  ipcMain.handle('plugins:disable', async (event, pluginId: string) => {
    await getLib(event).plugins.disable(pluginId)
  })

  ipcMain.handle('plugins:getCommands', async (event) => {
    return getLib(event).plugins.getCommands().map(c => ({ id: c.id, name: c.name, pluginId: c.pluginId }))
  })

  ipcMain.handle('plugins:runCommand', async (event, commandId: string) => {
    await getLib(event).plugins.runCommand(commandId)
  })

  ipcMain.handle('plugins:getViews', async (event) => {
    return getLib(event).plugins.getViews()
  })

  ipcMain.handle('plugins:rpc', async (event, pluginId: string, method: string, args: any[]) => {
    return getLib(event).plugins.handleRpc(pluginId, method, args)
  })

  ipcMain.handle('plugins:getCssPath', async (event, pluginId: string) => {
    return getLib(event).plugins.getPluginCssPath(pluginId)
  })

  ipcMain.handle('plugins:getRendererPath', async (event, pluginId: string) => {
    return getLib(event).plugins.getPluginRendererPath(pluginId)
  })

  ipcMain.handle('plugins:getRendererSource', async (event, pluginId: string) => {
    const p = await getLib(event).plugins.getPluginRendererPath(pluginId)
    if (!p) return null
    return readFileSync(p, 'utf-8')
  })

  ipcMain.handle('plugins:getCssSource', async (event, pluginId: string) => {
    const p = await getLib(event).plugins.getPluginCssPath(pluginId)
    if (!p) return null
    return readFileSync(p, 'utf-8')
  })

  ipcMain.handle('sync:getConfig', async (event) => {
    return getLib(event).getSyncConfig()
  })

  ipcMain.handle('sync:saveConfig', async (event, config: {
    type: 'webdav'; url: string; username: string; password: string; remotePath: string
  }) => {
    await getLib(event).saveSyncConfig(config)
  })

  ipcMain.handle('sync:testConnection', async (_event, config: { url: string; username: string; password: string; remotePath: string }) => {
    try {
      const { WebDAVAdapter } = await import('@banjuan/core')
      const adapter = new WebDAVAdapter(deps.fs)
      await adapter.connect(config as any)
      const files = await adapter.list(config.remotePath || '/')
      await adapter.disconnect()
      return { ok: true, message: `Connected. Found ${files.length} items on server.` }
    } catch (err: any) {
      return { ok: false, message: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('sync:run', async (event) => {
    const library = getLib(event)
    const config = await library.getSyncConfig()
    if (!config) throw new Error('No sync configuration found')
    const { SyncService, WebDAVAdapter } = await import('@banjuan/core')
    const adapter = new WebDAVAdapter(deps.fs)
    await adapter.connect(config)
    // crypto enables content hashes (false-conflict check); the device name labels conflict copies — as on mobile.
    const svc = new SyncService(library.rootPath, adapter, library.events, deps.fs, config.remotePath, deps.crypto, getDeviceIdentity().deviceName, webdavTarget(config))
    try {
      const result = await svc.sync((p) => {
        event.sender.send('sync:progress', p)
      })
      // An upload-only / no-op sync leaves every local file as it was — skip the
      // full re-index (it re-read the whole library after every sync).
      if (result.localChanged) {
        event.sender.send('sync:progress', { phase: 'finalizing', current: 0, total: 0, currentFile: 'Rebuilding index...' })
        await library.createIndexService().rebuildFull()
      }
      return result
    } finally {
      await adapter.disconnect()
    }
  })

  ipcMain.handle('sync:stubList', async (event) => {
    return getLib(event).createStubService().listStubs()
  })

  ipcMain.handle('sync:stubDownload', async (event, docId: string) => {
    const library = getLib(event)
    const doc = await library.documents.get(docId)
    if (!doc) throw new Error('Document not found')
    const config = await library.getSyncConfig()
    if (!config) throw new Error('No sync configuration found')
    const svc = library.createStubService()
    const { WebDAVAdapter } = await import('@banjuan/core')
    const adapter = new WebDAVAdapter(deps.fs)
    await adapter.connect(config)
    try {
      const localPath = join(library.rootPath, doc.path)
      await svc.downloadFile(docId, localPath, (p) => {
        event.sender.send('sync:downloadProgress', p)
      })
    } finally {
      await adapter.disconnect()
    }
  })

  ipcMain.handle('sync:stubUpload', async (event, docId: string) => {
    const library = getLib(event)
    const doc = await library.documents.get(docId)
    if (!doc) throw new Error('Document not found')
    const config = await library.getSyncConfig()
    if (!config) throw new Error('No sync configuration found')
    const svc = library.createStubService()
    const { WebDAVAdapter } = await import('@banjuan/core')
    const adapter = new WebDAVAdapter(deps.fs)
    await adapter.connect(config)
    try {
      const localPath = join(library.rootPath, doc.path)
      await svc.uploadFile(localPath, doc.path)
    } finally {
      await adapter.disconnect()
    }
  })

  ipcMain.handle('sync:getDocStatus', async (event, docId: string) => {
    const library = getLib(event)
    const doc = await library.documents.get(docId)
    if (!doc) return 'local'
    const config = await library.getSyncConfig()
    if (!config) return 'local'
    const svc = library.createStubService()
    return svc.getStatus(docId, join(library.rootPath, doc.path))
  })

  ipcMain.handle('lan:startHost', async (event): Promise<HostStatus> => {
    const library = getLib(event)
    if (lanHost) { await lanHost.stop(); lanHost = null }
    // A peer syncing into this library changes files under the index: once it has
    // been quiet for a moment, re-index and let this window refresh (lists and
    // open editors without unsaved edits).
    let reindexTimer: ReturnType<typeof setTimeout> | null = null
    let reindexing: Promise<void> | null = null
    const sender = event.sender
    const reindexAfterPeerWrites = () => {
      if (reindexTimer) clearTimeout(reindexTimer)
      reindexTimer = setTimeout(() => {
        reindexTimer = null
        reindexing = (reindexing ?? Promise.resolve()).then(async () => {
          try {
            await library.createIndexService().rebuildFull()
            if (!sender.isDestroyed()) sender.send('library:external-change', 'all')
          } catch (e) {
            console.error('[lan-host] re-index after peer sync failed', e)
          }
        })
      }, 2000)
    }
    const host = new LanHostServer(library.rootPath, deps.fs, reindexAfterPeerWrites)
    const status = await host.start()   // assign only on success — a failed start leaves lanHost null
    lanHost = host
    lanHostOwner = event.sender.id
    if (status.port) {
      const me = getDeviceIdentity()
      discovery.advertise({
        port: status.port,
        deviceId: me.deviceId,
        deviceName: me.deviceName,
        libraryId: await library.getId(),
        libraryName: await library.getName(),
      })
    }
    return status
  })

  ipcMain.handle('lan:stopHost', async (event): Promise<void> => {
    if (lanHost && lanHostOwner === event.sender.id) {
      await lanHost.stop(); lanHost = null; lanHostOwner = null
      discovery.stopAdvertise()
    }
  })

  ipcMain.handle('lan:getHostStatus', async (event): Promise<HostStatus> => {
    // Report "running" only to the window that started the host; everyone else
    // sees offline and uses the client (connect) flow.
    if (lanHost && lanHostOwner === event.sender.id) return lanHost.status()
    return HOST_OFFLINE
  })

  ipcMain.handle('lan:scanNearby', async () => {
    return discovery.scan()
  })

  app.on('before-quit', () => {
    discovery.destroy()
    if (lanHost) { void lanHost.stop(); lanHost = null; lanHostOwner = null }
  })

  // 连接 = one-time pairing (no data movement): store a durable token for the peer.
  ipcMain.handle('lan:pairDevice', async (event, peerUrl: string, pin: string) => {
    if (!/^https?:\/\//i.test(peerUrl)) throw new Error('PAIR_FAILED:invalid-url')
    const library = getLib(event)
    const base = peerUrl.replace(/\/$/, '')
    const { PairingStore } = await import('@banjuan/core')
    const store = new PairingStore(library.rootPath, deps.fs)
    const me = getDeviceIdentity()
    const myLibraryId = await library.getId()

    const infoResp = await fetch(`${base}/.banjuan-info`)
    if (!infoResp.ok) throw new Error(`PAIR_FAILED:${infoResp.status}`)
    const info = await infoResp.json() as { deviceId?: string; deviceName?: string; libraryId?: string; libraryName?: string }
    const hostDeviceId = info.deviceId ?? ''
    if (!hostDeviceId) throw new Error('PAIR_FAILED:no-device-id')

    const q = new URLSearchParams({ pin, deviceId: me.deviceId, deviceName: me.deviceName, libraryId: myLibraryId })
    const pairResp = await fetch(`${base}/.banjuan-pair?${q.toString()}`)
    if (!pairResp.ok) throw new Error(`PAIR_FAILED:${pairResp.status}`)
    const paired = await pairResp.json() as { token?: string }
    if (!paired.token) throw new Error('PAIR_FAILED:no-token')

    await store.addOrUpdate({
      peerDeviceId: hostDeviceId,
      peerDeviceName: info.deviceName ?? '',
      peerLibraryId: info.libraryId ?? '',
      token: paired.token,
    })
    return { ok: true as const, deviceName: info.deviceName ?? '', libraryName: info.libraryName ?? '' }
  })

  // 同步 = data transfer for an already-paired peer. Guards against merging a
  // different book-room (the guard lives here, not at pair time).
  ipcMain.handle('lan:syncDevice', async (event, peerUrl: string, force?: boolean) => {
    if (!/^https?:\/\//i.test(peerUrl)) throw new Error('SYNC_FAILED:invalid-url')
    const library = getLib(event)
    const base = peerUrl.replace(/\/$/, '')
    const { PairingStore, SyncService, WebDAVAdapter } = await import('@banjuan/core')
    const store = new PairingStore(library.rootPath, deps.fs)
    const myLibraryId = await library.getId()

    const infoResp = await fetch(`${base}/.banjuan-info`)
    if (!infoResp.ok) throw new Error(`SYNC_FAILED:${infoResp.status}`)
    const info = await infoResp.json() as { deviceId?: string; libraryId?: string; libraryName?: string }
    const hostDeviceId = info.deviceId ?? ''
    const hostLibraryId = info.libraryId ?? ''
    const hostLibraryName = info.libraryName ?? ''

    const existing = hostDeviceId ? await store.findByDeviceId(hostDeviceId) : undefined
    if (!existing) return { needsPair: true as const }
    const token = existing.token

    if (hostLibraryId && hostLibraryId !== myLibraryId) {
      // Notes count too: a notes-only library used to be taken as empty and merged without asking.
      const isEmpty = (await library.documents.list()).length === 0 && (await library.notes.list({})).length === 0
      if (isEmpty || force) {
        await library.adoptLibraryId(hostLibraryId)
      } else {
        return { needsConfirm: true as const, peerName: hostLibraryName, localName: await library.getName() }
      }
    }

    const adapter = new WebDAVAdapter(deps.fs)
    await adapter.connect({ type: 'webdav', url: base, username: 'banjuan', password: token, remotePath: '/' })
    const svc = new SyncService(library.rootPath, adapter, library.events, deps.fs, '/', deps.crypto, getDeviceIdentity().deviceName, `lan:${hostDeviceId}`)
    try {
      const result = await svc.sync((p) => { event.sender.send('sync:progress', p) })
      if (result.localChanged) {   // nothing local changed → no re-index needed
        event.sender.send('sync:progress', { phase: 'finalizing', current: 0, total: 0, currentFile: 'Rebuilding index...' })
        await library.createIndexService().rebuildFull()
      }
      return result
    } finally {
      await adapter.disconnect()
    }
  })

  ipcMain.handle('lan:listPairedDevices', async (event) => {
    const library = getLib(event)
    const { PairingStore } = await import('@banjuan/core')
    const devices = await new PairingStore(library.rootPath, deps.fs).list()
    // Never expose the shared durable token to the renderer — the UI only needs identity.
    return devices.map(({ token: _token, ...rest }) => rest)
  })

  ipcMain.handle('lan:unpairDevice', async (event, peerDeviceId: string) => {
    const library = getLib(event)
    const { PairingStore } = await import('@banjuan/core')
    await new PairingStore(library.rootPath, deps.fs).removeByDeviceId(peerDeviceId)
  })

  ipcMain.handle('clipboard:readFiles', async () => {
    clipboardFiles.clear()
    if (process.platform === 'darwin') {
      const raw = clipboard.read('NSFilenamesPboardType')
      if (raw) {
        try {
          const plist = raw.match(/<string>(.*?)<\/string>/g)
          if (plist) {
            const files = plist
              .map(s => s.replace(/<\/?string>/g, ''))
              .filter(p => existsSync(p))
              .map(p => ({ path: p, name: basename(p) }))
            for (const f of files) clipboardFiles.add(f.path)
            return files
          }
        } catch { /* not file data */ }
      }
    }
    return []
  })

  // Only files the user actually copied (as listed by clipboard:readFiles) can be read here.
  ipcMain.handle('clipboard:readFileBuffer', async (_event, filePath: string) => {
    if (!clipboardFiles.has(filePath)) throw new Error('Not a file from the clipboard')
    return readFile(filePath)
  })

  ipcMain.handle('export:markdown', async (event, input: { title: string; markdown: string; attachments: string[]; outputPath?: string; files?: Array<{ name: string; dataUrl: string }> }) => {
    const lib = getLib(event)
    const safeTitle = input.title.replace(/[/\\:*?"<>|]/g, '_')

    if (input.outputPath) {
      input.outputPath = exportDir(input.outputPath)
      mkdirSync(input.outputPath, { recursive: true })
      const mdPath = uniquePath(join(input.outputPath, `${safeTitle}.md`))
      writeFileSync(mdPath, input.markdown, 'utf-8')
      if (input.attachments.length > 0) {
        const attDir = join(input.outputPath, 'attachments')
        mkdirSync(attDir, { recursive: true })
        for (const relPath of input.attachments) {
          const srcPath = attachmentSource(lib, relPath)
          if (srcPath) {
            const dest = uniquePath(join(attDir, basename(srcPath)))
            copyFileSync(srcPath, dest)
          }
        }
      }
      if (input.files && input.files.length > 0) {
        const imgDir = join(input.outputPath, 'images')
        mkdirSync(imgDir, { recursive: true })
        for (const f of input.files) {
          const match = f.dataUrl.match(/^data:[^;]+;base64,(.+)$/)
          if (match) writeFileSync(uniquePath(join(imgDir, f.name)), Buffer.from(match[1], 'base64'))
        }
      }
      return input.outputPath
    }

    if (input.attachments.length === 0) {
      const result = await dialog.showSaveDialog({
        defaultPath: `${safeTitle}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (result.canceled || !result.filePath) return null
      writeFileSync(result.filePath, input.markdown, 'utf-8')
      return result.filePath
    }

    const result = await dialog.showSaveDialog({
      defaultPath: `${safeTitle}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })
    if (result.canceled || !result.filePath) return null

    writeZip(result.filePath, {
      [`${safeTitle}/${safeTitle}.md`]: input.markdown,
      ...attachmentEntries(lib, input.attachments, `${safeTitle}/attachments`),
    })
    return result.filePath
  })

  // Write a single raw file (image / svg / json) directly into outputPath.
  // Used by the background export window for png/svg/json single-note exports.
  ipcMain.handle('export:writeFile', async (_event, input: { outputPath: string; fileName: string; dataUrl?: string; text?: string }) => {
    const safeName = input.fileName.replace(/[/\\:*?"<>|]/g, '_')
    const outDir = exportDir(input.outputPath)
    mkdirSync(outDir, { recursive: true })
    const target = uniquePath(join(outDir, safeName))
    if (input.text != null) {
      writeFileSync(target, input.text, 'utf-8')
    } else if (input.dataUrl) {
      const comma = input.dataUrl.indexOf(',')
      if (comma === -1) return null
      const meta = input.dataUrl.slice(5, comma) // strip leading 'data:'
      const payload = input.dataUrl.slice(comma + 1)
      if (meta.includes('base64')) {
        writeFileSync(target, Buffer.from(payload, 'base64'))
      } else {
        writeFileSync(target, decodeURIComponent(payload), 'utf-8')
      }
    } else {
      return null
    }
    return target
  })

  ipcMain.handle('export:pdf', async (event, input: { title: string; html: string; attachments: string[]; outputPath?: string }) => {
    const lib = getLib(event)
    const safeTitle = input.title.replace(/[/\\:*?"<>|]/g, '_')

    const rootPath = lib.rootPath   // this window's library (was: the first one opened)
    let contentHtml = input.html
    if (rootPath) {
      contentHtml = contentHtml.replace(/banjuan-attachment:\/\//g,
        `local-file://${encodeURIComponent(join(rootPath, '.banjuan'))}/`)
    }

    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page { margin: 2cm 1.5cm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; color: #333; line-height: 1.8; font-size: 14px; }
  h1 { font-size: 24px; margin: 24px 0 16px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
  h2 { font-size: 20px; margin: 20px 0 12px; }
  h3 { font-size: 16px; margin: 16px 0 8px; }
  p { margin: 8px 0; }
  img { max-width: 100%; border-radius: 4px; break-inside: avoid; }
  .mindmap-export, .handwriting-export { break-inside: avoid; }
  blockquote { break-inside: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  pre { background: #f6f8fa; padding: 12px 16px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
  code { background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-size: 13px; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #ddd; margin: 8px 0; padding: 4px 16px; color: #666; }
  ul, ol { padding-left: 24px; }
  a { color: #0969da; text-decoration: none; }
</style></head><body>
${contentHtml}
</body></html>`

    const tmpHtmlPath = join(tmpdir(), `banjuan-pdf-${Date.now()}.html`)
    writeFileSync(tmpHtmlPath, fullHtml, 'utf-8')

    const hiddenWin = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { offscreen: true } })
    try {
      await hiddenWin.loadFile(tmpHtmlPath)
      await new Promise(r => setTimeout(r, 800))
      const pdfBuffer = await hiddenWin.webContents.printToPDF({
        printBackground: true,
        margins: { marginType: 'default' },
        pageSize: 'A4',
      })

      if (input.outputPath) {
        const outDir = exportDir(input.outputPath)
        mkdirSync(outDir, { recursive: true })
        writeFileSync(uniquePath(join(outDir, `${safeTitle}.pdf`)), pdfBuffer)
        return outDir
      }

      const hasAttachments = input.attachments.length > 0
      if (!hasAttachments) {
        const result = await dialog.showSaveDialog({
          defaultPath: `${safeTitle}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
        if (result.canceled || !result.filePath) return null
        writeFileSync(result.filePath, pdfBuffer)
        return result.filePath
      } else {
        const result = await dialog.showSaveDialog({
          defaultPath: `${safeTitle}.zip`,
          filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        })
        if (result.canceled || !result.filePath) return null
        writeZip(result.filePath, {
          [`${safeTitle}/${safeTitle}.pdf`]: pdfBuffer,
          ...attachmentEntries(lib, input.attachments, `${safeTitle}/attachments`),
        })
        return result.filePath
      }
    } finally {
      hiddenWin.close()
      try { if (existsSync(tmpHtmlPath)) unlinkSync(tmpHtmlPath) } catch { /* ignore */ }
    }
  })

  ipcMain.handle('notes:exportDir', async (event, entries: Array<{ title: string; content: string; attachments: string[]; subPath: string }>, format: 'markdown' | 'pdf', folderName: string) => {
    const lib = getLib(event)
    if (entries.length === 0) return null

    const safeFolderName = folderName.replace(/[/\\:*?"<>|]/g, '_')

    const result = await dialog.showSaveDialog({
      defaultPath: `${safeFolderName}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })
    if (result.canceled || !result.filePath) return null

    const files: Record<string, Uint8Array | string> = {}
    for (const entry of entries) {
      const safeTitle = entry.title.replace(/[/\\:*?"<>|]/g, '_')
      // subPath mirrors the folder tree; drop '.'/'..' segments so entries stay inside the archive root.
      const sub = (entry.subPath || '').split('/').filter(seg => seg && seg !== '.' && seg !== '..').join('/')
      const outputDir = sub ? `${safeFolderName}/${sub}` : safeFolderName

      if (format === 'markdown') {
        files[`${outputDir}/${safeTitle}.md`] = entry.content
        Object.assign(files, attachmentEntries(lib, entry.attachments, `${outputDir}/attachments`))
      } else {
        const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
h1, h2, h3 { margin-top: 1.5em; } pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
code { background: #f0f0f0; padding: 2px 4px; border-radius: 3px; } blockquote { border-left: 3px solid #ddd; margin-left: 0; padding-left: 16px; color: #666; }
img { max-width: 100%; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
.mermaid-diagram svg { max-width: 100%; } .mindmap-export ul { margin: 0.3em 0; } .handwriting-export img { max-width: 100%; }
</style></head><body><h1>${entry.title.replace(/</g, '&lt;')}</h1>${entry.content}</body></html>`
        const hiddenWin = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { offscreen: true } })
        try {
          const tmpHtml = join(tmpdir(), `banjuan-pdf-${Date.now()}.html`)
          writeFileSync(tmpHtml, fullHtml, 'utf-8')
          await hiddenWin.loadFile(tmpHtml)
          await new Promise(r => setTimeout(r, 500))
          const pdfBuffer = await hiddenWin.webContents.printToPDF({ printBackground: true, margins: { marginType: 'default' }, pageSize: 'A4' })
          files[`${outputDir}/${safeTitle}.pdf`] = pdfBuffer
          try { unlinkSync(tmpHtml) } catch {}
        } finally { hiddenWin.close() }
      }
    }

    writeZip(result.filePath, files)
    return result.filePath
  })

  ipcMain.handle('search:query', async (event, query: string, options?: SearchOptions) => {
    return getLib(event).search.query(query, options)
  })

  ipcMain.handle('search:textIndexStatus', async (event) => docTextStatus(getLib(event)))

  ipcMain.handle('index:rebuild', async (event) => {
    const indexService = getLib(event).createIndexService()
    await indexService.rebuildFull()
  })

  // Documents whose backing file vanished from disk — feeds the rebuild dialog.
  ipcMain.handle('library:detectMissing', async (event) => {
    return getLib(event).detectMissingFiles()
  })

  // Full rebuild: permanently purge the chosen missing documents, then wipe and
  // rebuild the whole library from the on-disk source of truth (re-reads +
  // re-hashes every file, rebuilds all indexes). Bypasses any open-time caches.
  // On the open instance. It used to be closed and opened again: anything
  // running meanwhile (another window, the local API, a LAN peer's re-index)
  // hit a closed database, and a failed reopen left every window on it.
  ipcMain.handle('library:rebuild', async (event, purgeIds: string[] = []) => {
    const lib = getLib(event)
    const purged = await lib.purgeDocuments(purgeIds)
    await Library.migrateNotes(lib.rootPath, deps.fs)
    const sync = await lib.syncWithDisk()
    try { await lib.notes.syncDisk() } catch { /* non-critical */ }
    try { await lib.tags.syncFromFiles() } catch { /* non-critical */ }
    await lib.plugins.unloadAll().catch(() => {})
    lib.plugins.setWebContentsSender(sendToLibraryWindows(lib))
    await lib.plugins.loadAll()
    await lib.createIndexService().rebuildFull()
    return { reimported: sync.imported, purged, markedMissing: sync.missing }
  })

  ipcMain.handle('capture:area', async (event, rect: { x: number; y: number; width: number; height: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const image = await win.webContents.capturePage({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    })
    return image.toDataURL()
  })

  // Local API calls that don't name a library go to the one the user last
  // worked in, not to whichever was opened first.
  setLibraryGetter(() => {
    const win = getLastFocusedLibraryWindow()
    const focused = win && !win.isDestroyed() ? libraries.get(win.webContents.id) : undefined
    if (focused) return focused
    const first = libraries.values().next()
    return first.done ? null : first.value
  })
}
