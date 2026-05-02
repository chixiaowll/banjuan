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
    create: (input: {
      title: string; type?: string; docId?: string; folder?: string;
      annotationIds?: string[]; content?: string; templateId?: string;
      layout?: string; theme?: string
    }) => ipcRenderer.invoke('notes:create', input),
    list: (options?: {
      type?: string; docId?: string; folderId?: string; tag?: string; sort?: string; order?: string
    }) => ipcRenderer.invoke('notes:list', options),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    update: (id: string, updates: { title?: string; content?: string; typeMeta?: Record<string, unknown> }) =>
      ipcRenderer.invoke('notes:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    getAnnotations: (noteId: string) => ipcRenderer.invoke('notes:getAnnotations', noteId),
    move: (id: string, targetFolder: string | null) => ipcRenderer.invoke('notes:move', id, targetFolder),
    listDirs: () => ipcRenderer.invoke('notes:listDirs'),
    createDir: (dirPath: string) => ipcRenderer.invoke('notes:createDir', dirPath),
    renameDir: (oldPath: string, newPath: string) => ipcRenderer.invoke('notes:renameDir', oldPath, newPath),
    onNavigateLink: (callback: (noteId: string) => void) => {
      const handler = (_event: any, noteId: string) => callback(noteId)
      ipcRenderer.on('navigate-note-link', handler)
      return () => { ipcRenderer.removeListener('navigate-note-link', handler) }
    },
  },
  folders: {
    create: (input: { name: string; parentId?: string }) => ipcRenderer.invoke('folders:create', input),
    getTree: () => ipcRenderer.invoke('folders:getTree'),
    update: (id: string, updates: { name?: string; parentId?: string; sortOrder?: number }) =>
      ipcRenderer.invoke('folders:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('folders:delete', id),
  },
  attachments: {
    save: (noteId: string, fileName: string, data: ArrayBuffer) =>
      ipcRenderer.invoke('attachments:save', noteId, fileName, data),
    getPath: (relativePath: string) => ipcRenderer.invoke('attachments:getPath', relativePath),
    delete: (relativePath: string) => ipcRenderer.invoke('attachments:delete', relativePath),
    open: (relativePath: string) => ipcRenderer.invoke('attachments:open', relativePath),
  },
  noteLinks: {
    getBacklinks: (noteId: string) => ipcRenderer.invoke('noteLinks:getBacklinks', noteId),
    getForwardLinks: (noteId: string) => ipcRenderer.invoke('noteLinks:getForwardLinks', noteId),
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
    addNode: (noteId: string, input: {
      title: string; parentId?: string; nodeType?: string; annotationId?: string;
      noteId?: string; docId?: string; hyperlink?: string; imageUrl?: string;
      tagId?: string; content?: string; color?: string; notes?: string;
      shape?: string; styleOverrides?: string; positionX?: number; positionY?: number
    }) => ipcRenderer.invoke('mindmaps:addNode', noteId, input),
    getNodes: (noteId: string) => ipcRenderer.invoke('mindmaps:getNodes', noteId),
    findNodesByNoteId: (noteId: string) => ipcRenderer.invoke('mindmaps:findNodesByNoteId', noteId),
    updateNode: (id: string, updates: {
      title?: string; content?: string; color?: string; notes?: string;
      shape?: string; styleOverrides?: string; nodeType?: string;
      noteId?: string; docId?: string; hyperlink?: string; imageUrl?: string;
      tagId?: string; parentId?: string; positionX?: number; positionY?: number;
      collapsed?: boolean; sortOrder?: number
    }) => ipcRenderer.invoke('mindmaps:updateNode', id, updates),
    removeNode: (id: string) => ipcRenderer.invoke('mindmaps:removeNode', id),
    addEdge: (noteId: string, input: { sourceId: string; targetId: string; label?: string }) =>
      ipcRenderer.invoke('mindmaps:addEdge', noteId, input),
    getEdges: (noteId: string) => ipcRenderer.invoke('mindmaps:getEdges', noteId),
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
  export: {
    markdown: (input: { title: string; markdown: string; attachments: string[] }) =>
      ipcRenderer.invoke('export:markdown', input) as Promise<string | null>,
    pdf: (input: { title: string; html: string; attachments: string[] }) =>
      ipcRenderer.invoke('export:pdf', input) as Promise<string | null>,
  },
  clipboard: {
    readFiles: () => ipcRenderer.invoke('clipboard:readFiles') as Promise<Array<{ path: string; name: string }>>,
    readFileBuffer: (filePath: string) => ipcRenderer.invoke('clipboard:readFileBuffer', filePath) as Promise<ArrayBuffer>,
  },
  index: {
    rebuild: () => ipcRenderer.invoke('index:rebuild'),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
