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

export interface Note {
  id: string
  title: string
  path: string
  docId: string | null
  content: string
  createdAt: string
  updatedAt: string
}

export interface NoteCreateInput {
  title: string
  docId?: string
  annotationIds?: string[]
  content?: string
}

export interface NoteListOptions {
  docId?: string
  tag?: string
  sort?: 'created_at' | 'title' | 'updated_at'
  order?: 'asc' | 'desc'
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

export type MindmapLayout = 'tree' | 'radial' | 'free'

export interface Mindmap {
  id: string
  title: string
  docId: string | null
  layout: MindmapLayout
  createdAt: string
  updatedAt: string
}

export interface MindmapCreateInput {
  title: string
  docId?: string
  layout?: MindmapLayout
}

export interface MindmapNode {
  id: string
  mindmapId: string
  parentId: string | null
  annotationId: string | null
  title: string
  content: string | null
  color: string | null
  positionX: number | null
  positionY: number | null
  sortOrder: number
  collapsed: boolean
  createdAt: string
}

export interface MindmapNodeCreateInput {
  title: string
  parentId?: string
  annotationId?: string
  content?: string
  color?: string
  positionX?: number
  positionY?: number
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

export interface GraphNode {
  id: string
  label: string
  type: 'document' | 'note' | 'mindmap'
  docType?: DocumentType
}

export interface GraphEdge {
  source: string
  target: string
  type: 'note-doc' | 'annotation-link' | 'mindmap-doc'
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
  docId: string | null
  annotationIds: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface MindmapFileData {
  id: string
  title: string
  docId: string | null
  layout: MindmapLayout
  tags: string[]
  nodes: Array<{
    id: string
    parentId: string | null
    annotationId: string | null
    title: string
    content: string | null
    color: string | null
    positionX: number | null
    positionY: number | null
    sortOrder: number
    collapsed: boolean
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
}

export type BanjuanEvent = keyof BanjuanEventMap
