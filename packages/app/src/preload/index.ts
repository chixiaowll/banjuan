import { contextBridge, ipcRenderer } from 'electron'

const api = {
  library: {
    init: (path: string) => ipcRenderer.invoke('library:init', path),
    open: (path: string) => ipcRenderer.invoke('library:open', path),
    isOpen: () => ipcRenderer.invoke('library:isOpen'),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },
  documents: {
    import: () => ipcRenderer.invoke('documents:import'),
    list: (options?: Record<string, unknown>) => ipcRenderer.invoke('documents:list', options),
    get: (id: string) => ipcRenderer.invoke('documents:get', id),
    delete: (id: string) => ipcRenderer.invoke('documents:delete', id),
  },
  tags: {
    list: () => ipcRenderer.invoke('tags:list'),
    create: (input: { name: string; color?: string }) => ipcRenderer.invoke('tags:create', input),
    forTarget: (id: string, type: string) => ipcRenderer.invoke('tags:forTarget', id, type),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
