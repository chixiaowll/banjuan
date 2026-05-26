import { createContext, useContext } from 'react'
import type {
  Document,
  DocumentListOptions,
  DocumentUpdateInput,
  Annotation,
  AnnotationCreateInput,
  AnnotationListOptions,
  Note,
  NoteCreateInput,
  NoteListOptions,
  Folder,
  FolderCreateInput,
  NoteLink,
  NoteTemplate,
  NoteTemplateCreateInput,
  Tag,
  MindmapNode,
  MindmapNodeCreateInput,
  MindmapEdge,
  MindmapEdgeCreateInput,
  MindmapBoundary,
  MindmapSummary,
  GraphData,
  PluginInfo,
  PluginCommand,
  PluginViewInfo,
  SyncConfig,
  StubData,
  DocumentSyncStatus,
  LibraryConfig,
  SearchResult,
  SearchOptions,
} from '@banjuan/core'

// ---------------------------------------------------------------------------
// BanjuanAPI – platform-agnostic interface mirroring the Electron preload API
// ---------------------------------------------------------------------------

export interface BanjuanAPI {
  library: {
    check(path: string): Promise<LibraryConfig | null>
    init(path: string, name?: string): Promise<void>
    open(path: string): Promise<void>
    openNewWindow(): Promise<void>
    isOpen(): Promise<boolean>
    getHistory?(): Promise<Array<{ path: string; name: string; lastOpened: string }>>
    removeHistory?(path: string): Promise<void>
    rename?(name: string): Promise<{ name: string }>
  }

  dialog: {
    openDirectory(): Promise<string | null>
  }

  documents: {
    import(destDir?: string): Promise<Document | null>
    markRead(id: string): Promise<void>
    refresh(): Promise<{ imported: number; removed: number }>
    list(options?: DocumentListOptions): Promise<Document[]>
    get(id: string): Promise<Document | null>
    delete(id: string): Promise<void>
    createDir(dirPath: string): Promise<void>
    move(id: string, destDir: string): Promise<Document | null>
    listDirs(): Promise<string[]>
    deleteDir?(dirPath: string): Promise<void>
    importFiles?(filePaths: string[], destDir?: string): Promise<Array<{ title: string; success: boolean; error?: string }>>
    importFilesDialog?(destDir?: string): Promise<Array<{ title: string; success: boolean; error?: string }> | null>
    update(id: string, updates: DocumentUpdateInput): Promise<Document>
    getFilePath(relativePath: string): Promise<string>
    readContent(relativePath: string): Promise<string>
    readFileBuffer(relativePath: string): Promise<ArrayBuffer>
    openInSystem(relativePath: string): Promise<string>
  }

  tags: {
    list(): Promise<Tag[]>
    listWithCounts(): Promise<Array<Tag & { count: number }>>
    create(input: { name: string; color?: string }): Promise<Tag>
    forTarget(id: string, type: string): Promise<Tag[]>
    assign(targetId: string, targetType: string, tagNames: string[]): Promise<void>
    unassign(targetId: string, targetType: string, tagName: string): Promise<void>
    delete(tagId: string): Promise<void>
    rename(tagId: string, newName: string): Promise<void>
    updateColor(tagId: string, color: string): Promise<void>
  }

  annotations: {
    create(input: AnnotationCreateInput): Promise<Annotation>
    list(options: AnnotationListOptions): Promise<Annotation[]>
    get(id: string): Promise<Annotation | null>
    update(id: string, updates: { content?: string; color?: string; position?: unknown }): Promise<Annotation>
    delete(id: string): Promise<void>
    listRecent?(limit?: number): Promise<Array<Annotation & { docTitle?: string }>>
  }

  notes: {
    create(input: NoteCreateInput): Promise<Note>
    list(options?: NoteListOptions): Promise<Note[]>
    get(id: string): Promise<Note | null>
    update(id: string, updates: { title?: string; content?: string; typeMeta?: Record<string, unknown> }): Promise<Note>
    delete(id: string): Promise<void>
    getAnnotations(noteId: string): Promise<Annotation[]>
    move(id: string, targetFolder: string | null): Promise<void>
    refresh(): Promise<void>
    listDirs(): Promise<string[]>
    createDir(dirPath: string): Promise<void>
    renameDir(oldPath: string, newPath: string): Promise<void>
    deleteDir?(dirPath: string): Promise<void>
    importMarkdown?(filePaths: string[], targetFolder: string | null): Promise<Array<{ title: string; success: boolean; error?: string }>>
    importMarkdownDialog?(targetFolder: string | null): Promise<Array<{ title: string; success: boolean; error?: string }> | null>
    onNavigateLink(callback: (noteId: string) => void): () => void
  }

  folders: {
    create(input: FolderCreateInput): Promise<Folder>
    getTree(): Promise<Folder[]>
    update(id: string, updates: { name?: string; parentId?: string; sortOrder?: number }): Promise<Folder>
    delete(id: string): Promise<void>
  }

  attachments: {
    save(noteId: string, fileName: string, data: ArrayBuffer): Promise<string>
    getPath(relativePath: string): Promise<string>
    delete(relativePath: string): Promise<void>
    open(relativePath: string): Promise<void>
  }

  noteLinks: {
    getBacklinks(noteId: string): Promise<NoteLink[]>
    getForwardLinks(noteId: string): Promise<NoteLink[]>
    sync(noteId: string, links: Array<{ targetId: string; context: string }>): Promise<void>
  }

  docLinks: {
    getBacklinks(docId: string): Promise<NoteLink[]>
    getForwardLinks(noteId: string): Promise<NoteLink[]>
    sync(noteId: string, links: Array<{ targetId: string; context: string }>): Promise<void>
  }

  templates: {
    list(): Promise<NoteTemplate[]>
    get(id: string): Promise<NoteTemplate | null>
    create(input: NoteTemplateCreateInput): Promise<NoteTemplate>
    update(id: string, updates: { name?: string; description?: string; content?: string; sortOrder?: number }): Promise<NoteTemplate>
    delete(id: string): Promise<void>
  }

  mindmaps: {
    addNode(noteId: string, input: MindmapNodeCreateInput): Promise<MindmapNode>
    getNodes(noteId: string): Promise<MindmapNode[]>
    findNodesByNoteId(noteId: string): Promise<MindmapNode[]>
    updateNode(id: string, updates: Partial<Omit<MindmapNode, 'id' | 'mindmapId' | 'createdAt'>>): Promise<MindmapNode>
    removeNode(id: string): Promise<void>
    addEdge(noteId: string, input: MindmapEdgeCreateInput): Promise<MindmapEdge>
    getEdges(noteId: string): Promise<MindmapEdge[]>
    updateEdge(id: string, updates: { label?: string }): Promise<MindmapEdge>
    removeEdge(id: string): Promise<void>
    addBoundary(mindmapId: string, input: { nodeIds: string[]; label?: string; color?: string }): Promise<MindmapBoundary>
    getBoundaries(mindmapId: string): Promise<MindmapBoundary[]>
    updateBoundary(id: string, updates: { label?: string; color?: string; nodeIds?: string[] }): Promise<MindmapBoundary>
    removeBoundary(id: string): Promise<void>
    addSummary(mindmapId: string, input: { nodeIds: string[]; summaryTitle?: string }): Promise<MindmapSummary>
    getSummaries(mindmapId: string): Promise<MindmapSummary[]>
    removeSummary(id: string): Promise<void>
  }

  graph: {
    getData(): Promise<GraphData>
  }

  /** Optional -- not available on all platforms (e.g. iPad) */
  plugins?: {
    list(): Promise<PluginInfo[]>
    listAll(): Promise<PluginInfo[]>
    loadAll(): Promise<void>
    unload(pluginId: string): Promise<void>
    enable(pluginId: string): Promise<void>
    disable(pluginId: string): Promise<void>
    getCommands(): Promise<PluginCommand[]>
    runCommand(commandId: string): Promise<void>
    getViews(): Promise<PluginViewInfo[]>
    rpc(pluginId: string, method: string, args: unknown[]): Promise<unknown>
    getCssPath(pluginId: string): Promise<string | null>
    getRendererPath(pluginId: string): Promise<string | null>
    getRendererSource(pluginId: string): Promise<string | null>
    getCssSource(pluginId: string): Promise<string | null>
    onMessage(channel: string, handler: (data: unknown) => void): () => void
  }

  sync: {
    getConfig(): Promise<SyncConfig | null>
    saveConfig(config: SyncConfig): Promise<void>
    testConnection(config: SyncConfig): Promise<{ ok: boolean; message: string }>
    run(onProgress?: (progress: { phase: string; current: number; total: number; currentFile: string }) => void): Promise<{ uploaded: number; downloaded: number; deletedLocal: number; deletedRemote: number } | void>
    stubList(): Promise<StubData[]>
    stubDownload(docId: string, onProgress?: (p: { loaded: number; total: number }) => void): Promise<void>
    stubUpload(docId: string): Promise<void>
    getDocStatus(docId: string): Promise<DocumentSyncStatus>
  }

  /** Optional -- not available on all platforms */
  export?: {
    markdown(input: { title: string; markdown: string; attachments: string[] }): Promise<string | null>
    pdf(input: { title: string; html: string; attachments: string[] }): Promise<string | null>
  }

  /** Optional -- not available on all platforms */
  getPathForFile?(file: File): string
  clipboard?: {
    readFiles(): Promise<Array<{ path: string; name: string }>>
    readFileBuffer(filePath: string): Promise<ArrayBuffer>
  }

  search?: {
    query(query: string, options?: SearchOptions): Promise<SearchResult[]>
  }

  index: {
    rebuild(): Promise<void>
  }

  /** Optional -- not available on all platforms */
  noteRender?: {
    onRequest(handler: (noteId: string, requestId: string) => void): () => void
    sendResult(requestId: string, dataUrl: string | null): void
  }
}

// ---------------------------------------------------------------------------
// React Context + hook
// ---------------------------------------------------------------------------

const BanjuanAPIContext = createContext<BanjuanAPI | null>(null)

export const BanjuanAPIProvider = BanjuanAPIContext.Provider

export function useBanjuanAPI(): BanjuanAPI {
  const api = useContext(BanjuanAPIContext)
  if (!api) throw new Error('useBanjuanAPI must be used within BanjuanAPIProvider')
  return api
}
