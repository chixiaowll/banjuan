export type DocumentType = 'pdf' | 'epub' | 'txt' | 'md' | 'image' | 'video' | 'html' | 'other'

export interface Document {
  id: string
  title: string
  authors: string[]
  path: string
  type: DocumentType
  hash: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface DocumentCreateInput {
  filePath: string
  title?: string
  tags?: string[]
}

export interface DocumentListOptions {
  tag?: string
  type?: DocumentType
  sort?: 'created_at' | 'title' | 'updated_at'
  order?: 'asc' | 'desc'
}

export interface DocumentUpdateInput {
  title?: string
  authors?: string[]
  metadata?: Record<string, unknown>
}

export type AnnotationType = 'highlight' | 'note' | 'bookmark' | 'ink' | 'area'

export interface PdfPosition {
  type: 'pdf'
  page: number
  rects: Array<{ x: number; y: number; w: number; h: number }>
  text: string
}

export interface EpubPosition {
  type: 'epub'
  cfi: string
  text: string
}

export interface TextPosition {
  type: 'text'
  startOffset: number
  endOffset: number
  text: string
}

export interface ImagePosition {
  type: 'image'
  rect: { x: number; y: number; w: number; h: number }
  path?: Array<{ x: number; y: number }>
}

export interface VideoPosition {
  type: 'video'
  timestamp: number
  duration?: number
  thumbnail?: string
}

export interface InkPosition {
  type: 'ink'
  page?: number
  strokes: Array<{
    points: Array<{ x: number; y: number; pressure?: number; timestamp?: number }>
    color: string
    width: number
  }>
  bounds: { x: number; y: number; w: number; h: number }
}

export interface PointPosition {
  type: 'point'
  page: number
  x: number
  y: number
}

export interface AreaPosition {
  type: 'area'
  page: number
  rect: { x: number; y: number; w: number; h: number }
  imageData?: string
}

export type AnnotationPosition =
  | PdfPosition
  | EpubPosition
  | TextPosition
  | ImagePosition
  | VideoPosition
  | InkPosition
  | PointPosition
  | AreaPosition

export interface Annotation {
  id: string
  docId: string
  type: AnnotationType
  page: number | null
  position: AnnotationPosition
  content: string | null
  selectedText: string | null
  color: string
  createdAt: string
  updatedAt: string
}

export interface AnnotationCreateInput {
  docId: string
  type: AnnotationType
  page?: number
  position: AnnotationPosition
  content?: string
  selectedText?: string
  color?: string
}

export interface AnnotationListOptions {
  docId: string
  page?: number
  type?: AnnotationType
  color?: string
}

export type NoteType = 'markdown' | 'mindmap' | 'handwriting'

export interface Note {
  id: string
  title: string
  type: NoteType
  path: string
  docId: string | null
  folderId: string | null
  content: string
  contentFormat: 'json' | 'markdown'
  typeMeta: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface NoteCreateInput {
  title: string
  type?: NoteType
  docId?: string
  folderId?: string
  folder?: string
  annotationIds?: string[]
  content?: string
  templateId?: string
  layout?: string
  theme?: string
}

export interface NoteListOptions {
  type?: NoteType
  docId?: string
  folderId?: string
  tag?: string
  sort?: 'created_at' | 'title' | 'updated_at'
  order?: 'asc' | 'desc'
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  children?: Folder[]
}

export interface FolderCreateInput {
  name: string
  parentId?: string
}

export interface NoteLink {
  sourceId: string
  targetId: string
  context: string
}

export interface NoteTemplate {
  id: string
  name: string
  description: string
  content: string
  isBuiltin: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface NoteTemplateCreateInput {
  name: string
  description?: string
  content: string
}

export interface Tag {
  id: string
  name: string
  color: string | null
}

export type TagTarget = 'document' | 'note' | 'mindmap'

export interface SearchResult {
  type: 'document' | 'note' | 'annotation'
  id: string
  title: string
  snippet: string
  score: number
}

export interface SearchOptions {
  type?: 'document' | 'note' | 'annotation'
  limit?: number
}

export interface LibraryConfig {
  name: string
  version: string
  createdAt: string
}

export type MindmapLayout = 'mindmap' | 'logical' | 'organization'

export interface Mindmap {
  id: string
  title: string
  path: string
  docId: string | null
  layout: MindmapLayout
  theme: string
  createdAt: string
  updatedAt: string
}

export interface MindmapCreateInput {
  title: string
  docId?: string
  folder?: string
  layout?: MindmapLayout
  theme?: string
}

export interface MindmapNode {
  id: string
  mindmapId: string
  parentId: string | null
  title: string
  content: string | null
  hyperlink: string | null
  imageUrl: string | null
  color: string | null
  notes: string | null
  shape: string | null
  styleOverrides: string | null
  positionX: number | null
  positionY: number | null
  sortOrder: number
  collapsed: boolean
  floating: boolean
  createdAt: string
}

export interface MindmapNodeCreateInput {
  title: string
  parentId?: string
  content?: string
  hyperlink?: string
  imageUrl?: string
  color?: string
  notes?: string
  shape?: string
  styleOverrides?: string
  positionX?: number
  positionY?: number
  floating?: boolean
}

export interface MindmapEdge {
  id: string
  mindmapId: string
  sourceId: string
  targetId: string
  label: string | null
  style: string | null
}

export interface MindmapEdgeCreateInput {
  sourceId: string
  targetId: string
  label?: string
}

export interface MindmapBoundary {
  id: string
  mindmapId: string
  nodeIds: string[]
  label: string
  color: string | null
}

export interface MindmapSummary {
  id: string
  mindmapId: string
  nodeIds: string[]
  summaryNodeId: string
}

export interface GraphNode {
  id: string
  label: string
  type: 'document' | 'note'
  noteType?: NoteType
  docType?: DocumentType
}

export interface GraphEdge {
  source: string
  target: string
  type: 'note-doc' | 'note-note' | 'annotation-link'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  apiVersion: string
  permissions?: string[]
}

export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
  path: string
}

export interface PluginCommand {
  id: string
  name: string
  pluginId: string
  callback: () => Promise<void>
}

export interface PluginViewInfo {
  viewType: string
  pluginId: string
  displayText: string
  icon?: string
  singleton?: boolean
}

export interface PluginRpcHandler {
  method: string
  pluginId: string
  handler: (...args: any[]) => Promise<any>
}

// --- File data interfaces (source-of-truth file formats) ---

export interface DocumentFileData {
  id: string
  title: string
  authors: string[]
  path: string
  type: DocumentType
  hash: string
  tags: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AnnotationFileData {
  id: string
  docId: string
  type: AnnotationType
  page: number | null
  position: AnnotationPosition
  content: string | null
  selectedText: string | null
  color: string
  createdAt: string
  updatedAt: string
}

export interface NoteFileData {
  id: string
  title: string
  type: NoteType
  docId: string | null
  folderId: string | null
  annotationIds: string[]
  tags: string[]
  contentFormat: 'json' | 'markdown'
  typeMeta: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface MindmapFileData {
  id: string
  title: string
  docId: string | null
  layout: MindmapLayout
  theme: string
  tags: string[]
  nodes: Array<{
    id: string
    parentId: string | null
    title: string
    content: string | null
    hyperlink: string | null
    imageUrl: string | null
    color: string | null
    notes: string | null
    shape: string | null
    styleOverrides: string | null
    positionX: number | null
    positionY: number | null
    sortOrder: number
    collapsed: boolean
    floating?: boolean
  }>
  edges: Array<{
    id: string
    sourceId: string
    targetId: string
    label: string | null
    style: string | null
  }>
  createdAt: string
  updatedAt: string
}

export type HandwritingTemplate = 'blank' | 'lined' | 'grid' | 'dotted' | 'cornell'

export interface StrokePoint {
  x: number
  y: number
  pressure?: number
}

export interface Stroke {
  id: string
  points: StrokePoint[]
  color: string
  width: number
  opacity: number
}

export interface CanvasSnapshot {
  strokes: Stroke[]
}

export interface HandwritingPage {
  id: string
  template: HandwritingTemplate
  snapshot: CanvasSnapshot
}

export interface HandwritingNoteJsonFile {
  meta: NoteFileData
  pages: HandwritingPage[]
  currentPageIndex: number
}

export interface SyncConfig {
  type: 'webdav'
  url: string
  username: string
  password: string
  remotePath: string
}

export interface RemoteFile {
  path: string
  mtime: number
  size: number
  isDirectory: boolean
}

export interface SyncSnapshot {
  timestamp: number
  files: string[]
}

export interface StubData {
  id: string
  hash: string
  size: number
  remotePath: string
  createdAt: string
}

export type DocumentSyncStatus = 'local' | 'cloud' | 'synced'

export type BanjuanEventMap = {
  'document:imported': { document: Document }
  'document:deleted': { id: string }
  'annotation:created': { annotation: Annotation }
  'annotation:updated': { annotation: Annotation }
  'annotation:deleted': { id: string; docId: string }
  'note:created': { note: Note }
  'note:updated': { note: Note }
  'note:deleted': { id: string }
  'folder:created': { folder: Folder }
  'folder:updated': { folder: Folder }
  'folder:deleted': { id: string }
  'mindmap:created': { mindmap: Mindmap }
  'mindmap:updated': { mindmap: Mindmap }
  'mindmap:deleted': { id: string }
  'mindmap:node:added': { node: MindmapNode }
  'mindmap:node:removed': { id: string; mindmapId: string }
  'mindmap:edge:added': { edge: MindmapEdge }
  'tag:assigned': { targetId: string; targetType: TagTarget; tagName: string }
  'tag:removed': { targetId: string; targetType: TagTarget; tagName: string }
  'library:opened': { path: string }
  'library:closed': { path: string }
  'sync:started': { timestamp: number }
  'sync:completed': { result: { uploaded: number; downloaded: number; deletedLocal: number; deletedRemote: number; errors: string[] } }
  'sync:error': { error: string }
  'sync:file:uploaded': { path: string }
  'sync:file:downloaded': { path: string }
  'ui:selection:text': { text: string; docId?: string; noteId?: string }
}

export type BanjuanEvent = keyof BanjuanEventMap
