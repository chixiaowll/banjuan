import React, { createContext, useContext, useState, useRef, useCallback, useMemo } from 'react'
import type * as pdfjsLib from '@banjuan/zotero-pdfjs-dist'
import type { PageInfo } from './PdfPage.js'

export type LeftSidebarTab = 'thumbnails' | 'outline' | 'annotations' | 'notes'
export type AnnotationTool = 'none' | 'highlight' | 'text' | 'area' | 'ink' | 'eraser'

export interface SearchMatch {
  page: number
  charStart: number
  charEnd: number
  rects: Array<{ x: number; y: number; w: number; h: number }>
}

export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
}

export const ANNOTATION_COLORS = [
  { name: 'yellow', value: '#fde68a' },
  { name: 'red', value: '#fca5a5' },
  { name: 'green', value: '#86efac' },
  { name: 'blue', value: '#93c5fd' },
  { name: 'purple', value: '#c4b5fd' },
]

interface PdfViewerContextValue {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null
  numPages: number
  pageSizes: Array<{ w: number; h: number }>
  setPageSizes: React.Dispatch<React.SetStateAction<Array<{ w: number; h: number }>>>
  pageInfoMap: Map<number, PageInfo>

  currentPage: number
  setCurrentPage: (page: number) => void
  scrollToPage: (page: number) => void

  zoom: number
  setZoom: (z: number | ((prev: number) => number)) => void
  resetZoom: () => void

  leftSidebarOpen: boolean
  leftSidebarTab: LeftSidebarTab
  setLeftSidebarOpen: (open: boolean) => void
  setLeftSidebarTab: (tab: LeftSidebarTab) => void
  rightSidebarOpen: boolean
  setRightSidebarOpen: (open: boolean) => void

  activeTool: AnnotationTool
  setActiveTool: (tool: AnnotationTool) => void
  activeColor: string
  setActiveColor: (color: string) => void

  searchOpen: boolean
  searchQuery: string
  searchOptions: SearchOptions
  searchMatches: SearchMatch[]
  currentMatchIndex: number
  setSearchOpen: (open: boolean) => void
  setSearchQuery: (query: string) => void
  setSearchOptions: (opts: Partial<SearchOptions>) => void
  setSearchMatches: (matches: SearchMatch[]) => void
  setCurrentMatchIndex: (idx: number) => void
  nextMatch: () => void
  prevMatch: () => void

  scrollRef: React.RefObject<HTMLDivElement | null>
}

const PdfViewerContext = createContext<PdfViewerContextValue | null>(null)

export function usePdfViewer(): PdfViewerContextValue {
  const ctx = useContext(PdfViewerContext)
  if (!ctx) throw new Error('usePdfViewer must be used within PdfViewerProvider')
  return ctx
}

interface ProviderProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null
  numPages: number
  initialPageSizes: Array<{ w: number; h: number }>
  children: React.ReactNode
}

export function PdfViewerProvider({ pdfDoc, numPages, initialPageSizes, children }: ProviderProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [pageSizes, setPageSizes] = useState(initialPageSizes)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(1.5)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [leftSidebarTab, setLeftSidebarTab] = useState<LeftSidebarTab>('outline')
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<AnnotationTool>('none')
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0].value)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOptionsState, setSearchOptionsState] = useState<SearchOptions>({ caseSensitive: false, wholeWord: false })
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [pageInfoMap] = useState(() => new Map<number, PageInfo>())

  const scrollToPage = useCallback((page: number) => {
    const el = scrollRef.current
    if (!el) return
    const pageEl = el.querySelector(`[data-page="${page}"]`) as HTMLElement | null
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const resetZoom = useCallback(() => {
    setZoom(1.5)
  }, [])

  const setSearchOptions = useCallback((opts: Partial<SearchOptions>) => {
    setSearchOptionsState(prev => ({ ...prev, ...opts }))
  }, [])

  const nextMatch = useCallback(() => {
    setCurrentMatchIndex(prev => {
      const next = prev + 1
      return next >= searchMatches.length ? 0 : next
    })
  }, [searchMatches.length])

  const prevMatch = useCallback(() => {
    setCurrentMatchIndex(prev => {
      const next = prev - 1
      return next < 0 ? Math.max(0, searchMatches.length - 1) : next
    })
  }, [searchMatches.length])

  const value = useMemo<PdfViewerContextValue>(() => ({
    pdfDoc, numPages, pageSizes, setPageSizes, pageInfoMap,
    currentPage, setCurrentPage, scrollToPage,
    zoom, setZoom, resetZoom,
    leftSidebarOpen, leftSidebarTab, setLeftSidebarOpen, setLeftSidebarTab,
    rightSidebarOpen, setRightSidebarOpen,
    activeTool, setActiveTool, activeColor, setActiveColor,
    searchOpen, searchQuery, searchOptions: searchOptionsState, searchMatches, currentMatchIndex,
    setSearchOpen, setSearchQuery, setSearchOptions, setSearchMatches, setCurrentMatchIndex,
    nextMatch, prevMatch,
    scrollRef,
  }), [
    pdfDoc, numPages, pageSizes, pageInfoMap,
    currentPage, scrollToPage,
    zoom, resetZoom,
    leftSidebarOpen, leftSidebarTab,
    rightSidebarOpen,
    activeTool, activeColor,
    searchOpen, searchQuery, searchOptionsState, searchMatches, currentMatchIndex,
    nextMatch, prevMatch,
  ])

  return (
    <PdfViewerContext.Provider value={value}>
      {children}
    </PdfViewerContext.Provider>
  )
}
