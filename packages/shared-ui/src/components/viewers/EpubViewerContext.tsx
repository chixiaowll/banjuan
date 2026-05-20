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
    try {
      await rendition.display(href)
    } catch {}
    // Workaround for scrolled-doc + continuous: rendition.display() doesn't
    // always scroll reliably (especially for not-yet-loaded sections). After
    // display resolves, manually find the section's view in the DOM and
    // scroll the epub-container to its offsetTop.
    const cleanHref = href.split('#')[0]
    const matchTarget = cleanHref.split('/').pop() || cleanHref
    const tryScroll = (attempt: number) => {
      const sc = document.querySelector('[data-epub-container] .epub-container') as HTMLElement | null
      if (!sc) return
      const views = sc.querySelectorAll('.epub-view') as NodeListOf<HTMLElement>
      for (const view of views) {
        const iframe = view.querySelector('iframe')
        const src = iframe?.getAttribute('src') || ''
        if (src.includes(matchTarget)) {
          sc.scrollTo({ top: view.offsetTop, behavior: 'smooth' })
          return
        }
      }
      // View not in DOM yet (still loading) — retry up to ~1s
      if (attempt < 10) setTimeout(() => tryScroll(attempt + 1), 100)
    }
    tryScroll(0)
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
