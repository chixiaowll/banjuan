interface ElectronAPI {
  library: {
    init: (path: string) => Promise<{ rootPath: string }>
    open: (path: string) => Promise<{ rootPath: string }>
    isOpen: () => Promise<boolean>
  }
  dialog: {
    openDirectory: () => Promise<string | null>
  }
  documents: {
    import: () => Promise<any>
    list: (options?: Record<string, unknown>) => Promise<any[]>
    get: (id: string) => Promise<any>
    delete: (id: string) => Promise<void>
    update: (id: string, updates: { title?: string; authors?: string[]; metadata?: Record<string, unknown> }) => Promise<any>
    getFilePath: (relativePath: string) => Promise<string>
    readContent: (relativePath: string) => Promise<string>
    readFileBuffer: (relativePath: string) => Promise<ArrayBuffer>
  }
  tags: {
    list: () => Promise<any[]>
    create: (input: { name: string; color?: string }) => Promise<any>
    forTarget: (id: string, type: string) => Promise<any[]>
  }
  annotations: {
    create: (input: {
      docId: string; type: string; page?: number;
      position: unknown; content?: string; selectedText?: string; color?: string
    }) => Promise<any>
    list: (options: { docId: string; page?: number; type?: string; color?: string }) => Promise<any[]>
    get: (id: string) => Promise<any>
    update: (id: string, updates: { content?: string; color?: string }) => Promise<any>
    delete: (id: string) => Promise<void>
  }
  notes: {
    create: (input: { title: string; docId?: string; annotationIds?: string[]; content?: string }) => Promise<any>
    list: (options?: { docId?: string; tag?: string; sort?: string; order?: string }) => Promise<any[]>
    get: (id: string) => Promise<any>
    update: (id: string, updates: { title?: string; content?: string }) => Promise<any>
    delete: (id: string) => Promise<void>
    getAnnotations: (noteId: string) => Promise<any[]>
  }
  mindmaps: {
    create: (input: { title: string; docId?: string; layout?: string }) => Promise<any>
    list: (options?: { docId?: string }) => Promise<any[]>
    get: (id: string) => Promise<any>
    update: (id: string, updates: { title?: string; layout?: string; docId?: string }) => Promise<any>
    delete: (id: string) => Promise<void>
    addNode: (mindmapId: string, input: {
      title: string; parentId?: string; annotationId?: string;
      content?: string; color?: string; positionX?: number; positionY?: number
    }) => Promise<any>
    getNodes: (mindmapId: string) => Promise<any[]>
    updateNode: (id: string, updates: {
      title?: string; content?: string; color?: string;
      positionX?: number; positionY?: number; collapsed?: boolean; sortOrder?: number
    }) => Promise<any>
    removeNode: (id: string) => Promise<void>
    addEdge: (mindmapId: string, input: { sourceId: string; targetId: string; label?: string }) => Promise<any>
    getEdges: (mindmapId: string) => Promise<any[]>
    removeEdge: (id: string) => Promise<void>
  }
  graph: {
    getData: () => Promise<{ nodes: any[]; edges: any[] }>
  }
  plugins: {
    list: () => Promise<Array<{ id: string; name: string; version: string; description: string; enabled: boolean; path: string }>>
    loadAll: () => Promise<void>
    unload: (pluginId: string) => Promise<void>
    getCommands: () => Promise<Array<{ id: string; name: string; pluginId: string }>>
    runCommand: (commandId: string) => Promise<void>
  }
  sync: {
    getConfig: () => Promise<{ type: 'webdav'; url: string; username: string; password: string; remotePath: string } | null>
    saveConfig: (config: { type: 'webdav'; url: string; username: string; password: string; remotePath: string }) => Promise<void>
    run: () => Promise<{ uploaded: number; downloaded: number; deletedLocal: number; deletedRemote: number; errors: string[] }>
    stubList: () => Promise<Array<{ id: string; hash: string; size: number; remotePath: string; createdAt: string }>>
    stubDownload: (docId: string) => Promise<void>
    stubUpload: (docId: string) => Promise<void>
    getDocStatus: (docId: string) => Promise<string>
  }
  index: {
    rebuild: () => Promise<void>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
