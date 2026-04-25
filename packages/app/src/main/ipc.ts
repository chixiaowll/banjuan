import { ipcMain, dialog } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Library } from '@banjuan/core'

let library: Library | null = null

export function registerIpcHandlers() {
  ipcMain.handle('library:init', async (_event, path: string) => {
    library = Library.init(path)
    return { rootPath: library.rootPath }
  })

  ipcMain.handle('library:open', async (_event, path: string) => {
    library = Library.open(path)
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

  ipcMain.handle('documents:getFilePath', async (_event, relativePath: string) => {
    if (!library) throw new Error('No library open')
    return join(library.rootPath, 'documents', relativePath)
  })

  ipcMain.handle('documents:readContent', async (_event, relativePath: string) => {
    if (!library) throw new Error('No library open')
    const fullPath = join(library.rootPath, 'documents', relativePath)
    return readFileSync(fullPath, 'utf-8')
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
}
