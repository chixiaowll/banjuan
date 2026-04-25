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
    getFilePath: (relativePath: string) => Promise<string>
    readContent: (relativePath: string) => Promise<string>
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
