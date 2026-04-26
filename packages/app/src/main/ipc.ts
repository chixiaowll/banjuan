import { ipcMain, dialog } from 'electron'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Library } from '@banjuan/core'
import { setLibraryGetter } from './api-server.js'
import { createWindow } from './windows.js'

const libraries = new Map<number, Library>()

function getLib(event: Electron.IpcMainInvokeEvent): Library {
  const lib = libraries.get(event.sender.id)
  if (!lib) throw new Error('No library open')
  return lib
}

export function registerIpcHandlers() {
  ipcMain.handle('library:check', (_event, path: string) => {
    return Library.isLibrary(path)
  })

  ipcMain.handle('library:init', async (event, path: string, name?: string) => {
    const lib = Library.init(path, name)
    libraries.set(event.sender.id, lib)
    const scanResult = await lib.scanAndImport()
    await lib.plugins.loadAll()
    const indexService = lib.createIndexService()
    await indexService.rebuildFull()
    return { rootPath: lib.rootPath, name: lib.name, imported: scanResult.imported, skipped: scanResult.skipped }
  })

  ipcMain.handle('library:open', async (event, path: string) => {
    const lib = Library.open(path)
    libraries.set(event.sender.id, lib)
    const syncResult = await lib.syncWithDisk()
    await lib.plugins.loadAll()
    const indexService = lib.createIndexService()
    await indexService.rebuildFull()
    return { rootPath: lib.rootPath, name: lib.name, imported: syncResult.imported, removed: syncResult.removed }
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

  ipcMain.handle('tags:create', async (event, input: { name: string; color?: string }) => {
    return getLib(event).tags.create(input)
  })

  ipcMain.handle('tags:forTarget', async (event, targetId: string, targetType: string) => {
    return getLib(event).tags.forTarget(targetId, targetType as any)
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
    title: string; docId?: string; folderId?: string; annotationIds?: string[]; content?: string; templateId?: string
  }) => {
    return getLib(event).notes.create(input)
  })

  ipcMain.handle('notes:list', async (event, options?: {
    docId?: string; tag?: string; sort?: string; order?: string
  }) => {
    return getLib(event).notes.list(options as any)
  })

  ipcMain.handle('notes:get', async (event, id: string) => {
    return getLib(event).notes.get(id)
  })

  ipcMain.handle('notes:update', async (event, id: string, updates: {
    title?: string; content?: string
  }) => {
    return getLib(event).notes.update(id, updates)
  })

  ipcMain.handle('notes:delete', async (event, id: string) => {
    return getLib(event).notes.delete(id)
  })

  ipcMain.handle('notes:getAnnotations', async (event, noteId: string) => {
    return getLib(event).notes.getAnnotations(noteId)
  })

  ipcMain.handle('notes:move', async (event, id: string, folderId: string | null) => {
    return getLib(event).notes.move(id, folderId)
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

  ipcMain.handle('noteLinks:sync', async (event, noteId: string, links: Array<{ targetId: string; context: string }>) => {
    return getLib(event).noteLinks.sync(noteId, links)
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

  ipcMain.handle('mindmaps:create', async (event, input: {
    title: string; docId?: string; layout?: string
  }) => {
    return getLib(event).mindmaps.create(input as any)
  })

  ipcMain.handle('mindmaps:list', async (event, options?: { docId?: string }) => {
    return getLib(event).mindmaps.list(options)
  })

  ipcMain.handle('mindmaps:get', async (event, id: string) => {
    return getLib(event).mindmaps.get(id)
  })

  ipcMain.handle('mindmaps:update', async (event, id: string, updates: {
    title?: string; layout?: string; docId?: string
  }) => {
    return getLib(event).mindmaps.update(id, updates as any)
  })

  ipcMain.handle('mindmaps:delete', async (event, id: string) => {
    return getLib(event).mindmaps.delete(id)
  })

  ipcMain.handle('mindmaps:addNode', async (event, mindmapId: string, input: {
    title: string; parentId?: string; annotationId?: string;
    content?: string; color?: string; positionX?: number; positionY?: number
  }) => {
    return getLib(event).mindmaps.addNode(mindmapId, input)
  })

  ipcMain.handle('mindmaps:getNodes', async (event, mindmapId: string) => {
    return getLib(event).mindmaps.getNodes(mindmapId)
  })

  ipcMain.handle('mindmaps:updateNode', async (event, id: string, updates: {
    title?: string; content?: string; color?: string;
    positionX?: number; positionY?: number; collapsed?: boolean; sortOrder?: number
  }) => {
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

  ipcMain.handle('mindmaps:removeEdge', async (event, id: string) => {
    return getLib(event).mindmaps.removeEdge(id)
  })

  ipcMain.handle('graph:getData', async (event) => {
    return getLib(event).graph.getData()
  })

  ipcMain.handle('plugins:list', async (event) => {
    return getLib(event).plugins.list()
  })

  ipcMain.handle('plugins:loadAll', async (event) => {
    await getLib(event).plugins.loadAll()
  })

  ipcMain.handle('plugins:unload', async (event, pluginId: string) => {
    await getLib(event).plugins.unload(pluginId)
  })

  ipcMain.handle('plugins:getCommands', async (event) => {
    return getLib(event).plugins.getCommands().map(c => ({ id: c.id, name: c.name, pluginId: c.pluginId }))
  })

  ipcMain.handle('plugins:runCommand', async (event, commandId: string) => {
    await getLib(event).plugins.runCommand(commandId)
  })

  ipcMain.handle('sync:getConfig', async (event) => {
    return getLib(event).getSyncConfig()
  })

  ipcMain.handle('sync:saveConfig', async (event, config: {
    type: 'webdav'; url: string; username: string; password: string; remotePath: string
  }) => {
    getLib(event).saveSyncConfig(config)
  })

  ipcMain.handle('sync:run', async (event) => {
    const library = getLib(event)
    const config = library.getSyncConfig()
    if (!config) throw new Error('No sync configuration found')
    const svc = library.createSyncService()
    const { WebDAVAdapter } = await import('@banjuan/core')
    const adapter = new WebDAVAdapter()
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
    const config = library.getSyncConfig()
    if (!config) throw new Error('No sync configuration found')
    const svc = library.createStubService()
    const { WebDAVAdapter } = await import('@banjuan/core')
    const adapter = new WebDAVAdapter()
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
    const config = library.getSyncConfig()
    if (!config) throw new Error('No sync configuration found')
    const svc = library.createStubService()
    const { WebDAVAdapter } = await import('@banjuan/core')
    const adapter = new WebDAVAdapter()
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
    const config = library.getSyncConfig()
    if (!config) return 'local'
    const svc = library.createStubService()
    return svc.getStatus(docId, join(library.rootPath, doc.path))
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
