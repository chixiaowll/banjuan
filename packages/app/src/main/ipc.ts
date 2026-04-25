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
}
