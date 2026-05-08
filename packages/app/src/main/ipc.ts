import { ipcMain, dialog, clipboard, shell, BrowserWindow, app } from 'electron'
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync, unlinkSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, basename, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
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

const libraries = new Map<number, Library>()

function getLib(event: Electron.IpcMainInvokeEvent): Library {
  const lib = libraries.get(event.sender.id)
  if (!lib) throw new Error('No library open')
  return lib
}

export function getLibraryRootPath(): string | null {
  const first = libraries.values().next()
  return first.done ? null : first.value.rootPath
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
    return { rootPath: lib.rootPath, name: libName, imported: scanResult.imported, skipped: scanResult.skipped }
  })

  ipcMain.handle('library:open', async (event, path: string) => {
    const lib = await Library.open(path, deps)
    libraries.set(event.sender.id, lib)
    await Library.migrateNotes(path, deps.fs)
    const syncResult = await lib.syncWithDisk()
    try { await lib.notes.syncDisk() } catch { /* non-critical */ }
    lib.plugins.setWebContentsSender((channel, data) => event.sender.send(channel, data))
    installBundledPlugins(lib.rootPath)
    await lib.plugins.loadAll()
    const indexService = lib.createIndexService()
    await indexService.rebuildFull()
    const libName = await lib.getName()
    return { rootPath: lib.rootPath, name: libName, imported: syncResult.imported, removed: syncResult.removed }
  })

  ipcMain.handle('library:openNewWindow', () => {
    createWindow()
  })

  ipcMain.handle('library:isOpen', (event) => libraries.has(event.sender.id))

  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('documents:import', async (event) => {
    const library = getLib(event)
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'All Supported', extensions: ['pdf', 'epub', 'txt', 'md', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'webm', 'html'] },
      ],
    })
    if (result.canceled) return null
    return library.documents.import(result.filePaths[0])
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

  ipcMain.handle('notes:listDirs', async (event) => {
    return getLib(event).notes.listDirs()
  })

  ipcMain.handle('notes:createDir', async (event, dirPath: string) => {
    return getLib(event).notes.createDir(dirPath)
  })

  ipcMain.handle('notes:renameDir', async (event, oldPath: string, newPath: string) => {
    return getLib(event).notes.renameDir(oldPath, newPath)
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
    const p = getLib(event).plugins.getPluginRendererPath(pluginId)
    if (!p) return null
    return readFileSync(p, 'utf-8')
  })

  ipcMain.handle('plugins:getCssSource', async (event, pluginId: string) => {
    const p = getLib(event).plugins.getPluginCssPath(pluginId)
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

  ipcMain.handle('sync:run', async (event) => {
    const library = getLib(event)
    const config = await library.getSyncConfig()
    if (!config) throw new Error('No sync configuration found')
    const svc = library.createSyncService()
    const { WebDAVAdapter } = await import('@banjuan/core')
    const adapter = new WebDAVAdapter(deps.fs)
    await adapter.connect(config)
    try {
      const result = await svc.sync()
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
      await svc.downloadFile(docId, localPath)
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

  ipcMain.handle('index:rebuild', async (event) => {
    const indexService = getLib(event).createIndexService()
    await indexService.rebuildFull()
  })

  setLibraryGetter(() => {
    const first = libraries.values().next()
    return first.done ? null : first.value
  })
}
