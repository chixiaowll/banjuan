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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
