import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { chmodSync, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { NodeFS } from '@banjuan/platform-node'
import type { SingleFileInfo } from '@banjuan/shared-ui'
import { createWindow } from './windows.js'
import { FileWindowRegistry, fileTypeOf, libraryContaining, type OpenedFile } from './file-windows.js'
import { FileViewStateStore } from './file-view-state.js'
import { watchFile, stampOf } from './file-watch.js'
import { readByteRange } from './read-range.js'
import { openPathSafely } from './path-guard.js'
import { getLibraryHistory, openPathInLibraryWindow } from './ipc.js'

/** Extensions offered in File › Open File… (the same as the Finder associations). */
export const OPENABLE_EXTENSIONS = ['pdf', 'epub', 'md', 'markdown', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'html', 'htm']

const fs = new NodeFS()
const watches = new Map<number, ReturnType<typeof watchFile>>()
let viewState: FileViewStateStore | null = null
const viewStateStore = () => (viewState ??= new FileViewStateStore(join(app.getPath('userData'), 'file-view-state.json')))

export const fileWindows = new FileWindowRegistry<BrowserWindow>({
  create: (path) => {
    const win = createWindow({ kind: 'file', hash: 'file' })
    const id = win.webContents.id
    win.setTitle(basename(path))
    const type = fileTypeOf(path)
    if (type === 'markdown' || type === 'text') {
      watches.set(id, watchFile(path, e => { if (!win.isDestroyed()) win.webContents.send('file:changed', e) }))
    }
    return { win, id }
  },
  focus: (win) => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  },
  onClosed: (win, cb) => {
    const id = win.webContents.id
    win.on('closed', () => {
      watches.get(id)?.close()
      watches.delete(id)
      cb()
    })
  },
})

/** Open each file in its own window (or bring its window forward). */
export function openFiles(paths: string[]): void {
  for (const p of paths) {
    try {
      fileWindows.open(p)
    } catch (e) {
      console.warn('[file-window] cannot open', p, e)
    }
  }
}

/** File › Open File…: pick files to open on their own. */
export async function openFileDialog(): Promise<void> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Documents', extensions: OPENABLE_EXTENSIONS }],
  })
  if (!result.canceled) openFiles(result.filePaths)
}

export function flushFileViewState(): Promise<void> {
  return viewState?.flush() ?? Promise.resolve()
}

function fileFor(event: Electron.IpcMainInvokeEvent): OpenedFile {
  const file = fileWindows.fileOf(event.sender.id)
  if (!file) throw new Error('Not a single-file window')
  return file
}

/** Known libraries that still exist, most recently used first. */
function knownLibraries(): Array<{ path: string; name: string }> {
  return getLibraryHistory()
    .filter(h => { try { return statSync(h.path).isDirectory() } catch { return false } })
    .map(h => ({ path: h.path, name: h.name }))
}

/** Every handler serves only the file of the window asking. */
export function registerFileWindowHandlers(): void {
  ipcMain.handle('file:info', (event): SingleFileInfo => {
    const file = fileFor(event)
    let size = 0
    try { size = statSync(file.path).size } catch { /* gone: the window says so */ }
    return { path: file.path, name: basename(file.path), type: file.type, size, library: libraryContaining(file.path, knownLibraries()) }
  })

  ipcMain.handle('file:readBuffer', (event) => readFile(fileFor(event).path))

  ipcMain.handle('file:readRange', (event, start: number, end: number) => readByteRange(fileFor(event).path, start, end))

  ipcMain.handle('file:writeBytes', async (event, bytes: Uint8Array) => {
    const file = fileFor(event)
    if (file.type !== 'markdown' && file.type !== 'text') throw new Error('Only Markdown and text files are written')
    // Moved or deleted meanwhile: don't create a new file where it was.
    if (!existsSync(file.path)) throw new Error('FILE_GONE')
    // Written to a temporary file and renamed over (never half-written); the
    // new file gets the old one's permissions back.
    const mode = statSync(file.path).mode & 0o7777
    await fs.writeFile(file.path, new Uint8Array(bytes))
    try { chmodSync(file.path, mode) } catch { /* not ours to change: keep the default */ }
    const stamp = stampOf(statSync(file.path))
    watches.get(event.sender.id)?.markOwnWrite(stamp)
    return { stamp }
  })

  ipcMain.handle('file:getViewState', (event) => viewStateStore().get(fileFor(event).path))

  ipcMain.handle('file:setViewState', (event, state: Record<string, unknown>) => {
    viewStateStore().set(fileFor(event).path, state && typeof state === 'object' ? state : {})
  })

  ipcMain.handle('file:openInSystem', async (event) => { await openPathSafely(fileFor(event).path) })

  ipcMain.handle('file:libraries', (event) => { fileFor(event); return knownLibraries() })

  ipcMain.handle('file:addToLibrary', (event, libraryPath: string) => {
    const file = fileFor(event)
    const root = knownLibraries().find(l => resolve(l.path) === resolve(String(libraryPath)))
    if (!root) throw new Error('Not a known library')
    openPathInLibraryWindow(root.path, file.path)
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('file:openInLibrary', (event) => {
    const file = fileFor(event)
    const lib = libraryContaining(file.path, knownLibraries())
    if (!lib) throw new Error('The file is not in a known library')
    openPathInLibraryWindow(lib.root, file.path)
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}
