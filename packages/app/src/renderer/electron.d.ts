export {}

declare global {
  interface Window {
    electronAPI: {
      library: {
        init: (path: string) => Promise<unknown>
        open: (path: string) => Promise<unknown>
        isOpen: () => Promise<unknown>
      }
      dialog: {
        openDirectory: () => Promise<unknown>
      }
      documents: {
        import: () => Promise<unknown>
        list: (options?: Record<string, unknown>) => Promise<unknown>
        get: (id: string) => Promise<unknown>
        delete: (id: string) => Promise<unknown>
        getFilePath: (relativePath: string) => Promise<unknown>
        readContent: (relativePath: string) => Promise<unknown>
      }
      tags: {
        list: () => Promise<unknown>
        create: (input: { name: string; color?: string }) => Promise<unknown>
        forTarget: (id: string, type: string) => Promise<unknown>
      }
      annotations: {
        create: (input: {
          docId: string; type: string; page?: number;
          position: unknown; content?: string; selectedText?: string; color?: string
        }) => Promise<unknown>
        list: (options: { docId: string; page?: number; type?: string; color?: string }) => Promise<unknown>
        get: (id: string) => Promise<unknown>
        update: (id: string, updates: { content?: string; color?: string }) => Promise<unknown>
        delete: (id: string) => Promise<unknown>
      }
      notes: {
        create: (input: { title: string; docId?: string; annotationIds?: string[]; content?: string }) => Promise<unknown>
        list: (options?: { docId?: string; tag?: string; sort?: string; order?: string }) => Promise<unknown>
        get: (id: string) => Promise<unknown>
        update: (id: string, updates: { title?: string; content?: string }) => Promise<unknown>
        delete: (id: string) => Promise<unknown>
        getAnnotations: (noteId: string) => Promise<unknown>
      }
      mindmaps: {
        create: (input: { title: string; docId?: string; layout?: string }) => Promise<unknown>
        list: (options?: { docId?: string }) => Promise<unknown>
        get: (id: string) => Promise<unknown>
        update: (id: string, updates: { title?: string; layout?: string; docId?: string }) => Promise<unknown>
        delete: (id: string) => Promise<unknown>
        addNode: (mindmapId: string, input: {
          title: string; parentId?: string; annotationId?: string;
          content?: string; color?: string; positionX?: number; positionY?: number
        }) => Promise<unknown>
        getNodes: (mindmapId: string) => Promise<unknown>
        updateNode: (id: string, updates: {
          title?: string; content?: string; color?: string;
          positionX?: number; positionY?: number; collapsed?: boolean; sortOrder?: number
        }) => Promise<unknown>
        removeNode: (id: string) => Promise<unknown>
        addEdge: (mindmapId: string, input: { sourceId: string; targetId: string; label?: string }) => Promise<unknown>
        getEdges: (mindmapId: string) => Promise<unknown>
        removeEdge: (id: string) => Promise<unknown>
      }
      graph: {
        getData: () => Promise<unknown>
      }
      plugins: {
        list: () => Promise<unknown>
        loadAll: () => Promise<unknown>
        unload: (pluginId: string) => Promise<unknown>
        getCommands: () => Promise<unknown>
        runCommand: (commandId: string) => Promise<unknown>
      }
      sync: {
        getConfig: () => Promise<unknown>
        saveConfig: (config: {
          type: 'webdav'; url: string; username: string; password: string; remotePath: string
        }) => Promise<unknown>
        run: () => Promise<unknown>
        stubList: () => Promise<unknown>
        stubDownload: (docId: string) => Promise<unknown>
        stubUpload: (docId: string) => Promise<unknown>
        getDocStatus: (docId: string) => Promise<unknown>
      }
      index: {
        rebuild: () => Promise<unknown>
      }
    }
  }
}
