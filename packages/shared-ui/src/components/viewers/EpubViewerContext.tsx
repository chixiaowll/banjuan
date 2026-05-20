import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import type { Book, Rendition, NavItem } from 'epubjs'

export type EpubLeftSidebarTab = 'outline' | 'annotations' | 'notes'
export type EpubAnnotationTool = 'none' | 'highlight' | 'note' | 'ink' | 'eraser' | 'lasso'

export const ANNOTATION_COLORS = [
  { name: 'yellow', value: '#fde68a' },
  { name: 'red', value: '#fca5a5' },
  { name: 'green', value: '#86efac' },
  { name: 'blue', value: '#93c5fd' },
  { name: 'purple', value: '#c4b5fd' },
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

  searchOpen: boolean
  setSearchOpen: (open: boolean) => void

  navigateTo: (href: string) => void
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

  const [searchOpen, setSearchOpen] = useState(false)

  const navigateTo = useCallback(async (href: string) => {
    if (!rendition) return
    const cleanHref = href.split('#')[0]
    const r = rendition as any

    try {
      await rendition.display(cleanHref)
    } catch {}

    // In scrolled-doc + continuous, display() clears views and adds the target
    // section, then fill() prepends earlier sections asynchronously — shifting
    // the target view's offsetTop downward. epub.js never re-scrolls after
    // this, so we poll for the target view to be "displayed" and scroll to it.
    const targetSection = r.book?.spine?.get?.(cleanHref)
    if (!targetSection) return

    const tryScroll = (attempt: number) => {
      const manager = r.manager
      const viewsList: any[] = manager?.views?._views ?? []
      const view = viewsList.find(v => v?.section?.index === targetSection.index)
      const el = view?.element
      const sc = manager?.container as HTMLElement | undefined
      if (view?.displayed && el && sc) {
        sc.scrollTo({ top: el.offsetTop, behavior: 'smooth' })
        return
      }
      if (attempt < 30) setTimeout(() => tryScroll(attempt + 1), 100)
    }
    setTimeout(() => tryScroll(0), 100)
  }, [rendition])

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
    searchOpen, setSearchOpen,
    navigateTo,
  }), [
    book, rendition, toc, currentHref,
    percentage,
    fontSize,
    leftSidebarOpen, leftSidebarTab,
    rightSidebarOpen,
    activeTool, activeColor,
    inkColor, inkWidth, inkEraserActive, inkUndoStack, inkRedoStack,
    pushInkUndo, popInkUndo, pushInkRedo, popInkRedo, clearInkRedo,
    searchOpen,
    navigateTo,
  ])

  return (
    <EpubViewerContext.Provider value={value}>
      {children}
    </EpubViewerContext.Provider>
  )
}
