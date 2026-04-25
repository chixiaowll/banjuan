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
    getFilePath: (relativePath: string) => ipcRenderer.invoke('documents:getFilePath', relativePath),
    readContent: (relativePath: string) => ipcRenderer.invoke('documents:readContent', relativePath),
  },
  tags: {
    list: () => ipcRenderer.invoke('tags:list'),
    create: (input: { name: string; color?: string }) => ipcRenderer.invoke('tags:create', input),
    forTarget: (id: string, type: string) => ipcRenderer.invoke('tags:forTarget', id, type),
  },
  annotations: {
    create: (input: {
      docId: string; type: string; page?: number;
      position: unknown; content?: string; selectedText?: string; color?: string
    }) => ipcRenderer.invoke('annotations:create', input),
    list: (options: { docId: string; page?: number; type?: string; color?: string }) =>
      ipcRenderer.invoke('annotations:list', options),
    get: (id: string) => ipcRenderer.invoke('annotations:get', id),
    update: (id: string, updates: { content?: string; color?: string }) =>
      ipcRenderer.invoke('annotations:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('annotations:delete', id),
  },
  notes: {
    create: (input: { title: string; docId?: string; annotationIds?: string[]; content?: string }) =>
      ipcRenderer.invoke('notes:create', input),
    list: (options?: { docId?: string; tag?: string; sort?: string; order?: string }) =>
      ipcRenderer.invoke('notes:list', options),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    update: (id: string, updates: { title?: string; content?: string }) =>
      ipcRenderer.invoke('notes:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    getAnnotations: (noteId: string) => ipcRenderer.invoke('notes:getAnnotations', noteId),
  },
  mindmaps: {
    create: (input: { title: string; docId?: string; layout?: string }) =>
      ipcRenderer.invoke('mindmaps:create', input),
    list: (options?: { docId?: string }) => ipcRenderer.invoke('mindmaps:list', options),
    get: (id: string) => ipcRenderer.invoke('mindmaps:get', id),
    update: (id: string, updates: { title?: string; layout?: string; docId?: string }) =>
      ipcRenderer.invoke('mindmaps:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('mindmaps:delete', id),
    addNode: (mindmapId: string, input: {
      title: string; parentId?: string; annotationId?: string;
      content?: string; color?: string; positionX?: number; positionY?: number
    }) => ipcRenderer.invoke('mindmaps:addNode', mindmapId, input),
    getNodes: (mindmapId: string) => ipcRenderer.invoke('mindmaps:getNodes', mindmapId),
    updateNode: (id: string, updates: {
      title?: string; content?: string; color?: string;
      positionX?: number; positionY?: number; collapsed?: boolean; sortOrder?: number
    }) => ipcRenderer.invoke('mindmaps:updateNode', id, updates),
    removeNode: (id: string) => ipcRenderer.invoke('mindmaps:removeNode', id),
    addEdge: (mindmapId: string, input: { sourceId: string; targetId: string; label?: string }) =>
      ipcRenderer.invoke('mindmaps:addEdge', mindmapId, input),
    getEdges: (mindmapId: string) => ipcRenderer.invoke('mindmaps:getEdges', mindmapId),
    removeEdge: (id: string) => ipcRenderer.invoke('mindmaps:removeEdge', id),
  },
  graph: {
    getData: () => ipcRenderer.invoke('graph:getData'),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
