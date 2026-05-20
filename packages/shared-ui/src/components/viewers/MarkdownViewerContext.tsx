import React, { createContext, useContext, useState, useMemo } from 'react'

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

  const value = useMemo<MarkdownViewerContextValue>(() => ({
    leftSidebarOpen, setLeftSidebarOpen,
    leftSidebarTab, setLeftSidebarTab,
    rightSidebarOpen, setRightSidebarOpen,
    fontSize, setFontSize,
    activeColor, setActiveColor,
    activeTool, setActiveTool,
    inkColor, setInkColor,
    inkWidth, setInkWidth,
  }), [leftSidebarOpen, leftSidebarTab, rightSidebarOpen, fontSize, activeColor, activeTool, inkColor, inkWidth])

  return (
    <MarkdownViewerContext.Provider value={value}>
      {children}
    </MarkdownViewerContext.Provider>
  )
}
