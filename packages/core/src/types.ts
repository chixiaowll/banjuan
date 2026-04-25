export type DocumentType = 'pdf' | 'epub' | 'txt' | 'md' | 'image' | 'video' | 'html'

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

export type AnnotationType = 'highlight' | 'note' | 'bookmark' | 'ink'

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

export type AnnotationPosition =
  | PdfPosition
  | EpubPosition
  | TextPosition
  | ImagePosition
  | VideoPosition
  | InkPosition

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

export type TagTarget = 'document' | 'note'

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
