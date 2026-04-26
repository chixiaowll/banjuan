import { ipcMain, dialog } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '@banjuan/core'
import { setLibraryGetter } from './api-server.js'

let library: Library | null = null

export function registerIpcHandlers() {
  ipcMain.handle('library:init', async (_event, path: string) => {
    library = Library.init(path)
    const scanResult = await library.scanAndImport()
    await library.plugins.loadAll()
    const indexService = library.createIndexService()
    await indexService.rebuildFull()
    return { rootPath: library.rootPath, imported: scanResult.imported, skipped: scanResult.skipped }
  })

  ipcMain.handle('library:open', async (_event, path: string) => {
    library = Library.open(path)
    await library.plugins.loadAll()
    const indexService = library.createIndexService()
    await indexService.rebuildFull()
    return { rootPath: library.rootPath }
  })

  ipcMain.handle('library:isOpen', () => library !== null)

  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('documents:import', async () => {
    if (!library) throw new Error('No library open')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'All Supported', extensions: ['pdf', 'epub', 'txt', 'md', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'webm', 'html'] },
      ],
    })
    if (result.canceled) return null
    return library.documents.import(result.filePaths[0])
  })

  ipcMain.handle('documents:list', async (_event, options?: Record<string, unknown>) => {
    if (!library) throw new Error('No library open')
    return library.documents.list(options as any)
  })

  ipcMain.handle('documents:get', async (_event, id: string) => {
    if (!library) throw new Error('No library open')
    return library.documents.get(id)
  })

  ipcMain.handle('documents:delete', async (_event, id: string) => {
    if (!library) throw new Error('No library open')
    return library.documents.delete(id)
  })

  ipcMain.handle('documents:update', async (_event, id: string, updates: {
    title?: string; authors?: string[]; metadata?: Record<string, unknown>
  }) => {
    if (!library) throw new Error('No library open')
    return library.documents.update(id, updates)
  })

  ipcMain.handle('documents:getFilePath', async (_event, relativePath: string) => {
    if (!library) throw new Error('No library open')
    return join(library.rootPath, relativePath)
  })

  ipcMain.handle('documents:readContent', async (_event, relativePath: string) => {
    if (!library) throw new Error('No library open')
    const fullPath = join(library.rootPath, relativePath)
    return readFileSync(fullPath, 'utf-8')
  })

  ipcMain.handle('documents:readFileBuffer', async (_event, relativePath: string) => {
    if (!library) throw new Error('No library open')
    const fullPath = join(library.rootPath, relativePath)
    return readFileSync(fullPath)
  })

  ipcMain.handle('tags:list', async () => {
    if (!library) throw new Error('No library open')
    return library.tags.list()
  })

  ipcMain.handle('tags:create', async (_event, input: { name: string; color?: string }) => {
    if (!library) throw new Error('No library open')
    return library.tags.create(input)
  })

  ipcMain.handle('tags:forTarget', async (_event, targetId: string, targetType: string) => {
    if (!library) throw new Error('No library open')
    return library.tags.forTarget(targetId, targetType as any)
  })

  ipcMain.handle('annotations:create', async (_event, input: {
    docId: string; type: string; page?: number;
    position: unknown; content?: string; selectedText?: string; color?: string
  }) => {
    if (!library) throw new Error('No library open')
    return library.annotations.create(input as any)
  })

  ipcMain.handle('annotations:list', async (_event, options: {
    docId: string; page?: number; type?: string; color?: string
  }) => {
    if (!library) throw new Error('No library open')
    return library.annotations.list(options as any)
  })

  ipcMain.handle('annotations:get', async (_event, id: string) => {
    if (!library) throw new Error('No library open')
    return library.annotations.get(id)
  })

  ipcMain.handle('annotations:update', async (_event, id: string, updates: {
    content?: string; color?: string
  }) => {
    if (!library) throw new Error('No library open')
    return library.annotations.update(id, updates)
  })

  ipcMain.handle('annotations:delete', async (_event, id: string) => {
    if (!library) throw new Error('No library open')
    return library.annotations.delete(id)
  })

  ipcMain.handle('notes:create', async (_event, input: {
    title: string; docId?: string; annotationIds?: string[]; content?: string
  }) => {
    if (!library) throw new Error('No library open')
    return library.notes.create(input)
  })

  ipcMain.handle('notes:list', async (_event, options?: {
    docId?: string; tag?: string; sort?: string; order?: string
  }) => {
    if (!library) throw new Error('No library open')
    return library.notes.list(options as any)
  })

  ipcMain.handle('notes:get', async (_event, id: string) => {
    if (!library) throw new Error('No library open')
    return library.notes.get(id)
  })

  ipcMain.handle('notes:update', async (_event, id: string, updates: {
    title?: string; content?: string
  }) => {
    if (!library) throw new Error('No library open')
    return library.notes.update(id, updates)
  })

  ipcMain.handle('notes:delete', async (_event, id: string) => {
    if (!library) throw new Error('No library open')
    return library.notes.delete(id)
  })

  ipcMain.handle('notes:getAnnotations', async (_event, noteId: string) => {
    if (!library) throw new Error('No library open')
    return library.notes.getAnnotations(noteId)
  })

  ipcMain.handle('mindmaps:create', async (_event, input: {
    title: string; docId?: string; layout?: string
  }) => {
    if (!library) throw new Error('No library open')
    return library.mindmaps.create(input as any)
  })

  ipcMain.handle('mindmaps:list', async (_event, options?: { docId?: string }) => {
    if (!library) throw new Error('No library open')
    return library.mindmaps.list(options)
  })

  ipcMain.handle('mindmaps:get', async (_event, id: string) => {
    if (!library) throw new Error('No library open')
    return library.mindmaps.get(id)
  })

  ipcMain.handle('mindmaps:update', async (_event, id: string, updates: {
    title?: string; layout?: string; docId?: string
  }) => {
    if (!library) throw new Error('No library open')
    return library.mindmaps.update(id, updates as any)
  })

  ipcMain.handle('mindmaps:delete', async (_event, id: string) => {
    if (!library) throw new Error('No library open')
    return library.mindmaps.delete(id)
  })

  ipcMain.handle('mindmaps:addNode', async (_event, mindmapId: string, input: {
    title: string; parentId?: string; annotationId?: string;
    content?: string; color?: string; positionX?: number; positionY?: number
  }) => {
    if (!library) throw new Error('No library open')
    return library.mindmaps.addNode(mindmapId, input)
  })

  ipcMain.handle('mindmaps:getNodes', async (_event, mindmapId: string) => {
    if (!library) throw new Error('No library open')
    return library.mindmaps.getNodes(mindmapId)
  })

  ipcMain.handle('mindmaps:updateNode', async (_event, id: string, updates: {
    title?: string; content?: string; color?: string;
    positionX?: number; positionY?: number; collapsed?: boolean; sortOrder?: number
  }) => {
    if (!library) throw new Error('No library open')
    return library.mindmaps.updateNode(id, updates)
  })

  ipcMain.handle('mindmaps:removeNode', async (_event, id: string) => {
    if (!library) throw new Error('No library open')
    return library.mindmaps.removeNode(id)
  })

  ipcMain.handle('mindmaps:addEdge', async (_event, mindmapId: string, input: {
    sourceId: string; targetId: string; label?: string
  }) => {
    if (!library) throw new Error('No library open')
    return library.mindmaps.addEdge(mindmapId, input)
  })

  ipcMain.handle('mindmaps:getEdges', async (_event, mindmapId: string) => {
    if (!library) throw new Error('No library open')
    return library.mindmaps.getEdges(mindmapId)
  })

  ipcMain.handle('mindmaps:removeEdge', async (_event, id: string) => {
    if (!library) throw new Error('No library open')
    return library.mindmaps.removeEdge(id)
  })

  ipcMain.handle('graph:getData', async () => {
    if (!library) throw new Error('No library open')
    return library.graph.getData()
  })

  ipcMain.handle('plugins:list', async () => {
    if (!library) throw new Error('No library open')
    return library.plugins.list()
  })

  ipcMain.handle('plugins:loadAll', async () => {
    if (!library) throw new Error('No library open')
    await library.plugins.loadAll()
  })

  ipcMain.handle('plugins:unload', async (_event, pluginId: string) => {
    if (!library) throw new Error('No library open')
    await library.plugins.unload(pluginId)
  })

  ipcMain.handle('plugins:getCommands', async () => {
    if (!library) throw new Error('No library open')
    return library.plugins.getCommands().map(c => ({ id: c.id, name: c.name, pluginId: c.pluginId }))
  })

  ipcMain.handle('plugins:runCommand', async (_event, commandId: string) => {
    if (!library) throw new Error('No library open')
    await library.plugins.runCommand(commandId)
  })

  ipcMain.handle('sync:getConfig', async () => {
    if (!library) throw new Error('No library open')
    return library.getSyncConfig()
  })

  ipcMain.handle('sync:saveConfig', async (_event, config: {
    type: 'webdav'; url: string; username: string; password: string; remotePath: string
  }) => {
    if (!library) throw new Error('No library open')
    library.saveSyncConfig(config)
  })

  ipcMain.handle('sync:run', async () => {
    if (!library) throw new Error('No library open')
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

  ipcMain.handle('sync:stubList', async () => {
    if (!library) throw new Error('No library open')
    const svc = library.createStubService()
    return svc.listStubs()
  })

  ipcMain.handle('sync:stubDownload', async (_event, docId: string) => {
    if (!library) throw new Error('No library open')
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

  ipcMain.handle('sync:stubUpload', async (_event, docId: string) => {
    if (!library) throw new Error('No library open')
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

  ipcMain.handle('sync:getDocStatus', async (_event, docId: string) => {
    if (!library) throw new Error('No library open')
    const doc = await library.documents.get(docId)
    if (!doc) return 'local'
    const config = library.getSyncConfig()
    if (!config) return 'local'
    const svc = library.createStubService()
    return svc.getStatus(docId, join(library.rootPath, doc.path))
  })

  ipcMain.handle('index:rebuild', async () => {
    if (!library) throw new Error('No library open')
    const indexService = library.createIndexService()
    await indexService.rebuildFull()
  })

  setLibraryGetter(() => library)
}
