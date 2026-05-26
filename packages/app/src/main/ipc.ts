import { ipcMain, dialog, clipboard, shell, BrowserWindow, app } from 'electron'
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync, unlinkSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, basename, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { tmpdir, homedir } from 'node:os'
import { Library, type MindmapNodeCreateInput, type MindmapNode, type PlatformDeps } from '@banjuan/core'
import { NodeFS, NodeDatabaseFactory, NodeCrypto } from '@banjuan/platform-node'
import { setLibraryGetter } from './api-server.js'
import { createWindow } from './windows.js'

const deps: PlatformDeps = {
  fs: new NodeFS(),
  dbFactory: new NodeDatabaseFactory(),
  crypto: new NodeCrypto(),
}

function installBundledPlugins(libraryRoot: string): void {
  const bundledDir = app.isPackaged
    ? join(process.resourcesPath, 'plugins')
    : join(dirname(dirname(dirname(dirname(__dirname)))), 'plugins')
  if (!existsSync(bundledDir)) return
  const targetDir = join(libraryRoot, '.banjuan', 'plugins')
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

  for (const entry of readdirSync(bundledDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const srcDir = join(bundledDir, entry.name)
    const destDir = join(targetDir, entry.name)
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
    for (const file of readdirSync(srcDir)) {
      if (file === 'config.json') continue
      copyFileSync(join(srcDir, file), join(destDir, file))
    }
  }
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
let nextApiKey = -1

function getLib(event: Electron.IpcMainInvokeEvent): Library {
  const lib = libraries.get(event.sender.id)
  if (!lib) throw new Error('No library open')
  return lib
}

export function getLibraryRootPath(): string | null {
  const first = libraries.values().next()
  return first.done ? null : first.value.rootPath
}

export async function initLibraryForApi(path: string, name?: string): Promise<Library> {
  const existing = [...libraries.values()].find(l => l.rootPath === path)
  if (existing) return existing
  const isExisting = await Library.isLibrary(path, deps)
  const lib = isExisting ? await Library.open(path, deps) : await Library.init(path, deps, name)
  if (isExisting) {
    await Library.migrateNotes(path, deps.fs)
    await lib.syncWithDisk()
    try { await lib.notes.syncDisk() } catch {}
    try { await lib.tags.syncFromFiles() } catch {}
  } else {
    await lib.scanAndImport()
  }
  installBundledPlugins(lib.rootPath)
  await lib.plugins.loadAll()
  const indexService = lib.createIndexService()
  await indexService.rebuildFull()
  libraries.set(nextApiKey--, lib)
  const libName = await lib.getName()
  recordLibraryOpen(lib.rootPath, libName)
  return lib
}

export async function openLibraryForApi(path: string): Promise<Library> {
  const existing = [...libraries.values()].find(l => l.rootPath === path)
  if (existing) return existing
  const lib = await Library.open(path, deps)
  await Library.migrateNotes(path, deps.fs)
  await lib.syncWithDisk()
  try { await lib.notes.syncDisk() } catch {}
  try { await lib.tags.syncFromFiles() } catch {}
  installBundledPlugins(lib.rootPath)
  await lib.plugins.loadAll()
  const indexService = lib.createIndexService()
  await indexService.rebuildFull()
  libraries.set(nextApiKey--, lib)
  const libName = await lib.getName()
  recordLibraryOpen(lib.rootPath, libName)
  return lib
}

export function registerIpcHandlers() {
  ipcMain.handle('library:check', async (_event, path: string) => {
    return Library.isLibrary(path, deps)
  })

  ipcMain.handle('library:init', async (event, path: string, name?: string) => {
    const lib = await Library.init(path, deps, name)
    libraries.set(event.sender.id, lib)
    const scanResult = await lib.scanAndImport()
    lib.plugins.setWebContentsSender((channel, data) => event.sender.send(channel, data))
    installBundledPlugins(lib.rootPath)
    await lib.plugins.loadAll()
    const indexService = lib.createIndexService()
    await indexService.rebuildFull()
    const libName = await lib.getName()
    recordLibraryOpen(lib.rootPath, libName)
    return { rootPath: lib.rootPath, name: libName, imported: scanResult.imported, skipped: scanResult.skipped }
  })

  ipcMain.handle('library:open', async (event, path: string) => {
    const lib = await Library.open(path, deps)
    libraries.set(event.sender.id, lib)
    await Library.migrateNotes(path, deps.fs)
    const syncResult = await lib.syncWithDisk()
    try { await lib.notes.syncDisk() } catch { /* non-critical */ }
    try { await lib.tags.syncFromFiles() } catch {}
    lib.plugins.setWebContentsSender((channel, data) => event.sender.send(channel, data))
    installBundledPlugins(lib.rootPath)
    await lib.plugins.loadAll()
    const indexService = lib.createIndexService()
    await indexService.rebuildFull()
    const libName = await lib.getName()
    recordLibraryOpen(lib.rootPath, libName)
    return { rootPath: lib.rootPath, name: libName, imported: syncResult.imported, removed: syncResult.removed }
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
    const targetDir = destDir ? path.join(library.rootPath, destDir) : library.rootPath
    await fs.mkdir(targetDir, { recursive: true })
    let lastDoc = null
    for (const srcPath of result.filePaths) {
      const fileName = path.basename(srcPath)
      const destPath = path.join(targetDir, fileName)
      if (srcPath !== destPath) {
        await fs.copyFile(srcPath, destPath)
      }
      lastDoc = await library.documents.import(destPath)
    }
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

  ipcMain.handle('documents:importFiles', async (event, filePaths: string[], destDir?: string) => {
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
    return join(getLib(event).rootPath, relativePath)
  })

  ipcMain.handle('documents:readContent', async (event, relativePath: string) => {
    const fullPath = join(getLib(event).rootPath, relativePath)
    return readFileSync(fullPath, 'utf-8')
  })

  ipcMain.handle('documents:readFileBuffer', async (event, relativePath: string) => {
    const fullPath = join(getLib(event).rootPath, relativePath)
    return readFile(fullPath)
  })

  ipcMain.handle('documents:openInSystem', async (event, relativePath: string) => {
    const fullPath = join(getLib(event).rootPath, relativePath)
    return shell.openPath(fullPath)
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

  ipcMain.handle('notes:delete', async (event, id: string) => {
    const lib = getLib(event)
    await lib.attachments.deleteAllForNote(id)
    return lib.notes.delete(id)
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
          await lib.notes.create({ title, type: 'markdown', content, folder: folder ?? undefined })
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

  const importDocumentFiles = async (lib: Library, filePaths: string[], destDir: string | null) => {
    const results: Array<{ title: string; success: boolean; error?: string }> = []
    const targetDir = destDir ? join(lib.rootPath, destDir) : lib.rootPath
    mkdirSync(targetDir, { recursive: true })

    const importFile = async (srcPath: string, dir: string) => {
      const fileName = basename(srcPath)
      let destName = fileName
      const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : ''
      const stem = ext ? fileName.slice(0, -ext.length) : fileName
      let destPath = join(dir, destName)
      let counter = 2
      while (existsSync(destPath)) {
        destName = `${stem} (${counter})${ext}`
        destPath = join(dir, destName)
        counter++
      }
      try {
        if (srcPath !== destPath) copyFileSync(srcPath, destPath)
        await lib.documents.import(destPath)
        results.push({ title: destName, success: true })
      } catch (err: any) {
        results.push({ title: destName, success: false, error: err?.message })
      }
    }

    const importDir = async (dirPath: string, parentDir: string) => {
      const dirName = basename(dirPath)
      const subDir = join(parentDir, dirName)
      mkdirSync(subDir, { recursive: true })
      const entries = readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await importDir(fullPath, subDir)
        } else if (entry.isFile() && !entry.name.startsWith('.')) {
          await importFile(fullPath, subDir)
        }
      }
    }

    for (const filePath of filePaths) {
      try {
        const stat = statSync(filePath)
        if (stat.isDirectory()) {
          await importDir(filePath, targetDir)
        } else {
          await importFile(filePath, targetDir)
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
    return shell.openPath(fullPath)
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
    const svc = new SyncService(library.rootPath, adapter, library.events, deps.fs, config.remotePath)
    try {
      const result = await svc.sync((p) => {
        event.sender.send('sync:progress', p)
      })
      event.sender.send('sync:progress', { phase: 'finalizing', current: 0, total: 0, currentFile: 'Rebuilding index...' })
      const indexService = library.createIndexService()
      await indexService.rebuildFull()
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

  ipcMain.handle('clipboard:readFiles', async () => {
    if (process.platform === 'darwin') {
      const raw = clipboard.read('NSFilenamesPboardType')
      if (raw) {
        try {
          const plist = raw.match(/<string>(.*?)<\/string>/g)
          if (plist) {
            return plist
              .map(s => s.replace(/<\/?string>/g, ''))
              .filter(p => existsSync(p))
              .map(p => ({ path: p, name: basename(p) }))
          }
        } catch { /* not file data */ }
      }
    }
    return []
  })

  ipcMain.handle('clipboard:readFileBuffer', async (_event, filePath: string) => {
    return readFile(filePath)
  })

  ipcMain.handle('export:markdown', async (event, input: { title: string; markdown: string; attachments: string[] }) => {
    const lib = getLib(event)
    const safeTitle = input.title.replace(/[/\\:*?"<>|]/g, '_')

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

    const tmpDir = join(tmpdir(), `banjuan-export-${Date.now()}`)
    const contentDir = join(tmpDir, safeTitle)
    const attDir = join(contentDir, 'attachments')
    mkdirSync(attDir, { recursive: true })
    writeFileSync(join(contentDir, `${safeTitle}.md`), input.markdown, 'utf-8')

    for (const relPath of input.attachments) {
      const srcPath = lib.attachments.getFullPath(relPath)
      if (existsSync(srcPath)) {
        copyFileSync(srcPath, join(attDir, basename(srcPath)))
      }
    }

    execSync(`cd "${tmpDir}" && zip -r "${result.filePath}" "${safeTitle}"`)
    execSync(`rm -rf "${tmpDir}"`)
    return result.filePath
  })

  ipcMain.handle('export:pdf', async (event, input: { title: string; html: string; attachments: string[] }) => {
    const lib = getLib(event)
    const safeTitle = input.title.replace(/[/\\:*?"<>|]/g, '_')
    const hasAttachments = input.attachments.length > 0

    const result = await dialog.showSaveDialog({
      defaultPath: hasAttachments ? `${safeTitle}.zip` : `${safeTitle}.pdf`,
      filters: hasAttachments
        ? [{ name: 'ZIP Archive', extensions: ['zip'] }]
        : [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (result.canceled || !result.filePath) return null

    const rootPath = getLibraryRootPath()
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

      if (!hasAttachments) {
        writeFileSync(result.filePath, pdfBuffer)
      } else {
        const tmpDir = join(tmpdir(), `banjuan-export-${Date.now()}`)
        const contentDir = join(tmpDir, safeTitle)
        const attDir = join(contentDir, 'attachments')
        mkdirSync(attDir, { recursive: true })
        writeFileSync(join(contentDir, `${safeTitle}.pdf`), pdfBuffer)
        for (const relPath of input.attachments) {
          const srcPath = lib.attachments.getFullPath(relPath)
          if (existsSync(srcPath)) {
            copyFileSync(srcPath, join(attDir, basename(srcPath)))
          }
        }
        execSync(`cd "${tmpDir}" && zip -r "${result.filePath}" "${safeTitle}"`)
        execSync(`rm -rf "${tmpDir}"`)
      }
      return result.filePath
    } finally {
      hiddenWin.close()
      try { if (existsSync(tmpHtmlPath)) unlinkSync(tmpHtmlPath) } catch { /* ignore */ }
    }
  })

  ipcMain.handle('search:query', async (event, query: string, options?: { type?: string; limit?: number }) => {
    return getLib(event).search.query(query, options)
  })

  ipcMain.handle('index:rebuild', async (event) => {
    const indexService = getLib(event).createIndexService()
    await indexService.rebuildFull()
  })

  setLibraryGetter(() => {
    const first = libraries.values().next()
    return first.done ? null : first.value
  })
}
