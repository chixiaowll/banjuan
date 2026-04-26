import { contextBridge, ipcRenderer } from 'electron'

const api = {
  library: {
    check: (path: string) => ipcRenderer.invoke('library:check', path),
    init: (path: string, name?: string) => ipcRenderer.invoke('library:init', path, name),
    open: (path: string) => ipcRenderer.invoke('library:open', path),
    openNewWindow: () => ipcRenderer.invoke('library:openNewWindow'),
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
    update: (id: string, updates: { title?: string; authors?: string[]; metadata?: Record<string, unknown> }) =>
      ipcRenderer.invoke('documents:update', id, updates),
    getFilePath: (relativePath: string) => ipcRenderer.invoke('documents:getFilePath', relativePath),
    readContent: (relativePath: string) => ipcRenderer.invoke('documents:readContent', relativePath),
    readFileBuffer: (relativePath: string) => ipcRenderer.invoke('documents:readFileBuffer', relativePath),
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
    update: (id: string, updates: { content?: string; color?: string; position?: unknown }) =>
      ipcRenderer.invoke('annotations:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('annotations:delete', id),
  },
  notes: {
    create: (input: { title: string; docId?: string; folderId?: string; annotationIds?: string[]; content?: string; templateId?: string }) =>
      ipcRenderer.invoke('notes:create', input),
    list: (options?: { docId?: string; folderId?: string; tag?: string; sort?: string; order?: string }) =>
      ipcRenderer.invoke('notes:list', options),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    update: (id: string, updates: { title?: string; content?: string }) =>
      ipcRenderer.invoke('notes:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    getAnnotations: (noteId: string) => ipcRenderer.invoke('notes:getAnnotations', noteId),
    move: (id: string, folderId: string | null) => ipcRenderer.invoke('notes:move', id, folderId),
  },
  folders: {
    create: (input: { name: string; parentId?: string }) => ipcRenderer.invoke('folders:create', input),
    getTree: () => ipcRenderer.invoke('folders:getTree'),
    update: (id: string, updates: { name?: string; parentId?: string; sortOrder?: number }) =>
      ipcRenderer.invoke('folders:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('folders:delete', id),
  },
  noteLinks: {
    getBacklinks: (noteId: string) => ipcRenderer.invoke('noteLinks:getBacklinks', noteId),
    sync: (noteId: string, links: Array<{ targetId: string; context: string }>) =>
      ipcRenderer.invoke('noteLinks:sync', noteId, links),
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    get: (id: string) => ipcRenderer.invoke('templates:get', id),
    create: (input: { name: string; description?: string; content: string }) =>
      ipcRenderer.invoke('templates:create', input),
    update: (id: string, updates: { name?: string; description?: string; content?: string; sortOrder?: number }) =>
      ipcRenderer.invoke('templates:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('templates:delete', id),
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
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    loadAll: () => ipcRenderer.invoke('plugins:loadAll'),
    unload: (pluginId: string) => ipcRenderer.invoke('plugins:unload', pluginId),
    getCommands: () => ipcRenderer.invoke('plugins:getCommands'),
    runCommand: (commandId: string) => ipcRenderer.invoke('plugins:runCommand', commandId),
  },
  sync: {
    getConfig: () => ipcRenderer.invoke('sync:getConfig'),
    saveConfig: (config: {
      type: 'webdav'; url: string; username: string; password: string; remotePath: string
    }) => ipcRenderer.invoke('sync:saveConfig', config),
    run: () => ipcRenderer.invoke('sync:run'),
    stubList: () => ipcRenderer.invoke('sync:stubList'),
    stubDownload: (docId: string) => ipcRenderer.invoke('sync:stubDownload', docId),
    stubUpload: (docId: string) => ipcRenderer.invoke('sync:stubUpload', docId),
    getDocStatus: (docId: string) => ipcRenderer.invoke('sync:getDocStatus', docId),
  },
  index: {
    rebuild: () => ipcRenderer.invoke('index:rebuild'),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
