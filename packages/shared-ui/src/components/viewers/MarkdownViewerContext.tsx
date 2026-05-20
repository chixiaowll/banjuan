import React, { createContext, useContext, useState, useMemo, useCallback } from 'react'

export type MdLeftSidebarTab = 'outline' | 'annotations' | 'notes'
export type MdActiveTool = 'none' | 'ink' | 'eraser' | 'lasso'

export const ANNOTATION_COLORS = [
  { name: 'yellow', value: '#ffe066' },
  { name: 'orange', value: '#ffb347' },
  { name: 'pink', value: '#ff9f9f' },
  { name: 'green', value: '#77dd77' },
  { name: 'blue', value: '#7ec8e3' },
  { name: 'purple', value: '#b19cd9' },
]

export { INK_COLORS, INK_WIDTHS } from './inkConfig.js'

interface MarkdownViewerContextValue {
  leftSidebarOpen: boolean
  setLeftSidebarOpen: (open: boolean) => void
  leftSidebarTab: MdLeftSidebarTab
  setLeftSidebarTab: (tab: MdLeftSidebarTab) => void
  rightSidebarOpen: boolean
  setRightSidebarOpen: (open: boolean) => void
  fontSize: number
  setFontSize: (size: number | ((prev: number) => number)) => void
  activeColor: string
  setActiveColor: (color: string) => void
  activeTool: MdActiveTool
  setActiveTool: (tool: MdActiveTool) => void
  inkColor: string
  setInkColor: (color: string) => void
  inkWidth: number
  setInkWidth: (width: number) => void
  inkUndoStack: Array<{ annotationId: string; strokes: any[] }>
  inkRedoStack: Array<{ annotationId: string; strokes: any[] }>
  pushInkUndo: (entry: { annotationId: string; strokes: any[] }) => void
  popInkUndo: () => { annotationId: string; strokes: any[] } | undefined
  pushInkRedo: (entry: { annotationId: string; strokes: any[] }) => void
  popInkRedo: () => { annotationId: string; strokes: any[] } | undefined
  clearInkRedo: () => void
}

const MarkdownViewerContext = createContext<MarkdownViewerContextValue | null>(null)

export function useMarkdownViewer(): MarkdownViewerContextValue {
  const ctx = useContext(MarkdownViewerContext)
  if (!ctx) throw new Error('useMarkdownViewer must be used within MarkdownViewerProvider')
  return ctx
}

export function MarkdownViewerProvider({ children }: { children: React.ReactNode }) {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [leftSidebarTab, setLeftSidebarTab] = useState<MdLeftSidebarTab>('outline')
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [fontSize, setFontSize] = useState(100)
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0].value)
  const [activeTool, setActiveTool] = useState<MdActiveTool>('none')
  const [inkColor, setInkColor] = useState('#1a1a1a')
  const [inkWidth, setInkWidth] = useState(4)
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

  const value = useMemo<MarkdownViewerContextValue>(() => ({
    leftSidebarOpen, setLeftSidebarOpen,
    leftSidebarTab, setLeftSidebarTab,
    rightSidebarOpen, setRightSidebarOpen,
    fontSize, setFontSize,
    activeColor, setActiveColor,
    activeTool, setActiveTool,
    inkColor, setInkColor,
    inkWidth, setInkWidth,
    inkUndoStack, inkRedoStack,
    pushInkUndo, popInkUndo, pushInkRedo, popInkRedo, clearInkRedo,
  }), [leftSidebarOpen, leftSidebarTab, rightSidebarOpen, fontSize, activeColor, activeTool, inkColor, inkWidth, inkUndoStack, inkRedoStack, pushInkUndo, popInkUndo, pushInkRedo, popInkRedo, clearInkRedo])

  return (
    <MarkdownViewerContext.Provider value={value}>
      {children}
    </MarkdownViewerContext.Provider>
  )
}
