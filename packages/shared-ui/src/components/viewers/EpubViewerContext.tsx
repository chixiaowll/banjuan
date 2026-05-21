import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import type { Book, Rendition, NavItem } from 'epubjs'

export type EpubLeftSidebarTab = 'outline' | 'annotations' | 'notes'
export type EpubAnnotationTool = 'none' | 'highlight' | 'note' | 'ink' | 'eraser' | 'lasso' | 'area'

export const ANNOTATION_COLORS = [
  { name: 'blue', value: '#3182ce' },
  { name: 'purple', value: '#805ad5' },
  { name: 'red', value: '#e53e3e' },
  { name: 'orange', value: '#dd6b20' },
  { name: 'yellow', value: '#d69e2e' },
  { name: 'green', value: '#38a169' },
  { name: 'pink', value: '#d53f8c' },
]

interface EpubViewerContextValue {
  book: Book | null
  setBook: (book: Book | null) => void
  rendition: Rendition | null
  setRendition: (rendition: Rendition | null) => void
  toc: NavItem[]
  setToc: (toc: NavItem[]) => void
  currentHref: string
  setCurrentHref: (href: string) => void

  percentage: number
  setPercentage: (pct: number) => void

  fontSize: number
  setFontSize: (size: number | ((prev: number) => number)) => void

  leftSidebarOpen: boolean
  leftSidebarTab: EpubLeftSidebarTab
  setLeftSidebarOpen: (open: boolean) => void
  setLeftSidebarTab: (tab: EpubLeftSidebarTab) => void
  rightSidebarOpen: boolean
  setRightSidebarOpen: (open: boolean) => void

  activeTool: EpubAnnotationTool
  setActiveTool: (tool: EpubAnnotationTool) => void
  activeColor: string
  setActiveColor: (color: string) => void
  inkColor: string
  setInkColor: (color: string) => void
  inkWidth: number
  setInkWidth: (w: number) => void
  inkEraserActive: boolean
  setInkEraserActive: (active: boolean) => void
  inkUndoStack: Array<{ annotationId: string; strokes: any[] }>
  inkRedoStack: Array<{ annotationId: string; strokes: any[] }>
  pushInkUndo: (entry: { annotationId: string; strokes: any[] }) => void
  popInkUndo: () => { annotationId: string; strokes: any[] } | undefined
  pushInkRedo: (entry: { annotationId: string; strokes: any[] }) => void
  popInkRedo: () => { annotationId: string; strokes: any[] } | undefined
  clearInkRedo: () => void

  annotationsVisible: boolean
  setAnnotationsVisible: (visible: boolean) => void

  searchOpen: boolean
  setSearchOpen: (open: boolean) => void

  baseWidth: number
  setBaseWidth: (w: number) => void

  navigateTo: (href: string) => void
  goNext: () => void
  goPrev: () => void
}

const EpubViewerContext = createContext<EpubViewerContextValue | null>(null)

export function useEpubViewer(): EpubViewerContextValue {
  const ctx = useContext(EpubViewerContext)
  if (!ctx) throw new Error('useEpubViewer must be used within EpubViewerProvider')
  return ctx
}

export function EpubViewerProvider({ children }: { children: React.ReactNode }) {
  const [book, setBook] = useState<Book | null>(null)
  const [rendition, setRendition] = useState<Rendition | null>(null)
  const [toc, setToc] = useState<NavItem[]>([])
  const [currentHref, setCurrentHref] = useState('')
  const [percentage, setPercentage] = useState(0)

  const [fontSize, setFontSize] = useState(100)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [leftSidebarTab, setLeftSidebarTab] = useState<EpubLeftSidebarTab>('outline')
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<EpubAnnotationTool>('none')
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0].value)
  const [inkColor, setInkColor] = useState('#1a1a1a')
  const [inkWidth, setInkWidth] = useState(2)
  const [inkEraserActive, setInkEraserActive] = useState(false)
  const [inkUndoStack, setInkUndoStack] = useState<Array<{ annotationId: string; strokes: any[] }>>([])
  const [inkRedoStack, setInkRedoStack] = useState<Array<{ annotationId: string; strokes: any[] }>>([])

  const pushInkUndo = useCallback((entry: { annotationId: string; strokes: any[] }) => {
    setInkUndoStack(prev => [...prev, entry])
  }, [])
  const popInkUndo = useCallback(() => {
    let popped: { annotationId: string; strokes: any[] } | undefined
    setInkUndoStack(prev => {
      if (prev.length === 0) return prev
      popped = prev[prev.length - 1]
      return prev.slice(0, -1)
    })
    return popped
  }, [])
  const pushInkRedo = useCallback((entry: { annotationId: string; strokes: any[] }) => {
    setInkRedoStack(prev => [...prev, entry])
  }, [])
  const popInkRedo = useCallback(() => {
    let popped: { annotationId: string; strokes: any[] } | undefined
    setInkRedoStack(prev => {
      if (prev.length === 0) return prev
      popped = prev[prev.length - 1]
      return prev.slice(0, -1)
    })
    return popped
  }, [])
  const clearInkRedo = useCallback(() => setInkRedoStack([]), [])

  const [annotationsVisible, setAnnotationsVisible] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [baseWidth, setBaseWidth] = useState(0)

  const navigateTo = useCallback((href: string) => {
    rendition?.display(href)
  }, [rendition])

  const goNext = useCallback(() => {
    if (!book || !rendition) return
    const spine = (book as any).spine
    if (!spine) { rendition.next(); return }
    const loc = rendition.location
    const currentHref = loc?.start?.href
    if (!currentHref) { rendition.next(); return }
    const currentIndex = spine.items.findIndex((s: any) => s.href === currentHref)
    if (currentIndex >= 0 && currentIndex < spine.items.length - 1) {
      rendition.display(spine.items[currentIndex + 1].href)
    }
  }, [book, rendition])

  const goPrev = useCallback(() => {
    if (!book || !rendition) return
    const spine = (book as any).spine
    if (!spine) { rendition.prev(); return }
    const loc = rendition.location
    const currentHref = loc?.start?.href
    if (!currentHref) { rendition.prev(); return }
    const currentIndex = spine.items.findIndex((s: any) => s.href === currentHref)
    if (currentIndex > 0) {
      rendition.display(spine.items[currentIndex - 1].href)
    }
  }, [book, rendition])

  const value = useMemo<EpubViewerContextValue>(() => ({
    book, setBook, rendition, setRendition, toc, setToc,
    currentHref, setCurrentHref,
    percentage, setPercentage,
    fontSize, setFontSize,
    leftSidebarOpen, leftSidebarTab, setLeftSidebarOpen, setLeftSidebarTab,
    rightSidebarOpen, setRightSidebarOpen,
    activeTool, setActiveTool, activeColor, setActiveColor,
    inkColor, setInkColor, inkWidth, setInkWidth,
    inkEraserActive, setInkEraserActive,
    inkUndoStack, inkRedoStack,
    pushInkUndo, popInkUndo, pushInkRedo, popInkRedo, clearInkRedo,
    annotationsVisible, setAnnotationsVisible,
    searchOpen, setSearchOpen,
    baseWidth, setBaseWidth,
    navigateTo, goNext, goPrev,
  }), [
    book, rendition, toc, currentHref,
    percentage,
    fontSize,
    leftSidebarOpen, leftSidebarTab,
    rightSidebarOpen,
    activeTool, activeColor,
    inkColor, inkWidth, inkEraserActive, inkUndoStack, inkRedoStack,
    pushInkUndo, popInkUndo, pushInkRedo, popInkRedo, clearInkRedo,
    annotationsVisible,
    searchOpen, baseWidth, goNext, goPrev,
    navigateTo,
  ])

  return (
    <EpubViewerContext.Provider value={value}>
      {children}
    </EpubViewerContext.Provider>
  )
}
