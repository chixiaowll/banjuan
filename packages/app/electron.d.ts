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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
