# PDF Viewer Zotero-Style Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the PDF viewer to match Zotero's reader layout with title bar tabs, three-panel layout, full annotation toolset, and full-text search.

**Architecture:** TabManager replaces App.tsx routing for multi-tab support. PdfViewer becomes a layout orchestrator with PdfViewerContext for shared state. Components split by responsibility: toolbar, left sidebar (4 tabs), content area, right sidebar, annotation tools, search popup. Each document tab maintains independent state via separate context instances.

**Tech Stack:** React 18, pdf.js (@banjuan/zotero-pdfjs-dist), Electron (custom titlebar), CSS-in-JS (inline styles matching existing patterns)

**Spec:** `docs/superpowers/specs/2026-04-26-pdf-viewer-zotero-layout-design.md`

---

## File Structure

### New Files
```
packages/app/src/renderer/
├── components/
│   ├── TabManager.tsx              # Top-level tab manager + title bar
│   ├── TitleBar.tsx                # Custom title bar with embedded tabs
│   └── viewers/
│       ├── PdfViewerContext.tsx     # React context for shared PDF state
│       ├── PdfToolbar.tsx          # Unified single-row toolbar
│       ├── PdfLeftSidebar.tsx      # Left sidebar container (4 tabs)
│       ├── PdfInfoSidebar.tsx      # Right sidebar (doc info + metadata)
│       ├── PdfContentArea.tsx      # Center content with scroll container
│       ├── PdfPage.tsx             # Extracted single-page component
│       ├── ThumbnailPanel.tsx      # Lazy-loaded page thumbnails
│       ├── OutlinePanel.tsx        # PDF outline tree
│       ├── AnnotationPanel.tsx     # Annotations list (refactored)
│       ├── NotesPanel.tsx          # Document-linked notes
│       ├── SearchPopup.tsx         # Floating search with options
│       ├── SearchHighlightLayer.tsx # Per-page search match rendering
│       ├── HighlightTool.tsx       # Text highlight tool interaction
│       ├── TextNoteTool.tsx        # Point-click text annotation
│       ├── AreaSelectTool.tsx      # Rectangle area selection
│       ├── InkTool.tsx             # Freehand drawing overlay
│       └── EraserTool.tsx          # Click-to-delete annotation
```

### Modified Files
```
packages/core/src/types.ts                    # Add PointPosition, AreaPosition
packages/core/src/documents/service.ts        # Add update() method
packages/app/src/main/index.ts                # titleBarStyle: 'hidden'
packages/app/src/main/ipc.ts                  # Add documents:update handler
packages/app/src/preload/index.ts             # Add documents.update bridge
packages/app/src/renderer/App.tsx             # Replace routing with TabManager
packages/app/src/renderer/global.css          # Title bar + sidebar styles
packages/app/src/renderer/components/viewers/PdfViewer.tsx      # Refactor to orchestrator
packages/app/src/renderer/components/viewers/DocumentViewer.tsx # Simplify
packages/app/src/renderer/components/annotations/HighlightLayer.tsx # Add search highlights
```

---

## Task 1: Extend Core Types

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Add PointPosition and AreaPosition types**

In `packages/core/src/types.ts`, after the `InkPosition` interface (line 72), add:

```typescript
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
```

Update the `AnnotationPosition` union (line 74) to include the new types:

```typescript
export type AnnotationPosition =
  | PdfPosition
  | EpubPosition
  | TextPosition
  | ImagePosition
  | VideoPosition
  | InkPosition
  | PointPosition
  | AreaPosition
```

Update `AnnotationType` (line 28) to include 'area':

```typescript
export type AnnotationType = 'highlight' | 'note' | 'bookmark' | 'ink' | 'area'
```

- [ ] **Step 2: Add DocumentUpdateInput interface**

After `DocumentListOptions` (line 26), add:

```typescript
export interface DocumentUpdateInput {
  title?: string
  authors?: string[]
  metadata?: Record<string, unknown>
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add PointPosition, AreaPosition types and DocumentUpdateInput"
```

---

## Task 2: Add Document Update API

**Files:**
- Modify: `packages/core/src/documents/service.ts`
- Modify: `packages/app/src/main/ipc.ts`
- Modify: `packages/app/src/preload/index.ts`

- [ ] **Step 1: Add update method to DocumentService**

In `packages/core/src/documents/service.ts`, add this method to the `DocumentService` class, before the `delete` method:

```typescript
async update(id: string, updates: { title?: string; authors?: string[]; metadata?: Record<string, unknown> }): Promise<Document | null> {
  const existing = await this.get(id)
  if (!existing) return null

  const now = new Date().toISOString()
  const newTitle = updates.title ?? existing.title
  const newAuthors = updates.authors ?? existing.authors
  const newMetadata = updates.metadata ?? existing.metadata

  this.db.prepare(
    `UPDATE documents SET title = ?, authors = ?, metadata = ?, updated_at = ? WHERE id = ?`
  ).run(newTitle, JSON.stringify(newAuthors), JSON.stringify(newMetadata), now, id)

  const fileData = this.store.read(id)
  if (fileData) {
    fileData.title = newTitle
    fileData.authors = newAuthors
    fileData.metadata = newMetadata
    fileData.updatedAt = now
    this.store.write(fileData)
  }

  this.search.index({ id, title: newTitle, content: newTitle, type: 'document' })

  return { ...existing, title: newTitle, authors: newAuthors, metadata: newMetadata, updatedAt: now }
}
```

- [ ] **Step 2: Add IPC handler**

In `packages/app/src/main/ipc.ts`, after the `documents:delete` handler (line 60), add:

```typescript
ipcMain.handle('documents:update', async (_event, id: string, updates: {
  title?: string; authors?: string[]; metadata?: Record<string, unknown>
}) => {
  if (!library) throw new Error('No library open')
  return library.documents.update(id, updates)
})
```

- [ ] **Step 3: Add preload bridge**

In `packages/app/src/preload/index.ts`, inside the `documents` object (after the `delete` line), add:

```typescript
update: (id: string, updates: { title?: string; authors?: string[]; metadata?: Record<string, unknown> }) =>
  ipcRenderer.invoke('documents:update', id, updates),
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/documents/service.ts packages/app/src/main/ipc.ts packages/app/src/preload/index.ts
git commit -m "feat(core): add document update API for title, authors, metadata"
```

---

## Task 3: Electron Custom Title Bar

**Files:**
- Modify: `packages/app/src/main/index.ts`

- [ ] **Step 1: Add titleBarStyle and trafficLightPosition**

In `packages/app/src/main/index.ts`, update the BrowserWindow creation (line 9-17) to:

```typescript
mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  titleBarStyle: 'hidden',
  trafficLightPosition: { x: 12, y: 10 },
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/main/index.ts
git commit -m "feat(app): enable hidden title bar for custom tab bar"
```

---

## Task 4: Extract PdfPage Component

Extract the existing `PdfPage` from `PdfViewer.tsx` into its own file. This is a prerequisite for the PdfViewer refactor.

**Files:**
- Create: `packages/app/src/renderer/components/viewers/PdfPage.tsx`

- [ ] **Step 1: Create PdfPage.tsx**

Create `packages/app/src/renderer/components/viewers/PdfPage.tsx` containing the `PdfPage` function component and the `findClosestCharIdx` helper, extracted from `PdfViewer.tsx` lines 15-361. Export the component as default and export the interfaces:

```typescript
import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from '@banjuan/zotero-pdfjs-dist'
import HighlightLayer from '../annotations/HighlightLayer.js'

export interface TextSelectInfo {
  page: number
  rects: Array<{ x: number; y: number; w: number; h: number }>
  text: string
  clientRect: DOMRect
}

export interface PdfChar {
  c: string
  u?: string
  rect: [number, number, number, number]
  fontName?: string
  fontSize?: number
  rotation?: number
}

export interface PageInfo {
  width: number
  height: number
  chars: PdfChar[]
}

interface HighlightData {
  id: string
  color: string
  rects: Array<{ x: number; y: number; w: number; h: number }>
}

interface Props {
  pdfDoc: pdfjsLib.PDFDocumentProxy
  pageNum: number
  scale: number
  baseSize: { w: number; h: number }
  highlights: HighlightData[]
  searchHighlights?: Array<{ rects: Array<{ x: number; y: number; w: number; h: number }>; active: boolean }>
  scrollRoot: HTMLElement | null
  onTextSelect?: (info: TextSelectInfo) => void
  onHighlightClick?: (id: string) => void
  onPageReady?: (pageNum: number, info: PageInfo) => void
}

// Copy findClosestCharIdx function from PdfViewer.tsx lines 64-80

// Copy PdfPage function component from PdfViewer.tsx lines 82-361
// Add onPageReady callback: after pageInfoRef.current is set (line 178), call:
//   onPageReady?.(pageNum, pageInfoRef.current)
// This allows the parent to collect chars[] data for search.

export default PdfPage
```

The component is identical to the existing one, with two additions:
1. `searchHighlights` prop for rendering search match rectangles (rendered after the HighlightLayer, same approach but with different colors)
2. `onPageReady` callback that fires after chars[] are extracted, providing PageInfo to the parent for search indexing

For `searchHighlights`, add after the existing HighlightLayer div (line 352-358):

```typescript
{searchHighlights && searchHighlights.length > 0 && (
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
    {searchHighlights.map((sh, i) =>
      sh.rects.map((r, j) => (
        <div key={`${i}-${j}`} style={{
          position: 'absolute',
          left: `${r.x * 100}%`,
          top: `${r.y * 100}%`,
          width: `${r.w * 100}%`,
          height: `${r.h * 100}%`,
          background: sh.active ? 'rgba(255, 140, 0, 0.4)' : 'rgba(255, 255, 0, 0.3)',
          mixBlendMode: 'multiply',
        }} />
      ))
    )}
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/PdfPage.tsx
git commit -m "feat(app): extract PdfPage component from PdfViewer"
```

---

## Task 5: Create PdfViewerContext

**Files:**
- Create: `packages/app/src/renderer/components/viewers/PdfViewerContext.tsx`

- [ ] **Step 1: Create the context file**

```typescript
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
  // Document
  pdfDoc: pdfjsLib.PDFDocumentProxy | null
  numPages: number
  pageSizes: Array<{ w: number; h: number }>
  pageInfoMap: Map<number, PageInfo>

  // Navigation
  currentPage: number
  setCurrentPage: (page: number) => void
  scrollToPage: (page: number) => void

  // Zoom
  zoom: number
  setZoom: (z: number | ((prev: number) => number)) => void
  resetZoom: () => void

  // Sidebars
  leftSidebarOpen: boolean
  leftSidebarTab: LeftSidebarTab
  setLeftSidebarOpen: (open: boolean) => void
  setLeftSidebarTab: (tab: LeftSidebarTab) => void
  rightSidebarOpen: boolean
  setRightSidebarOpen: (open: boolean) => void

  // Annotation tool
  activeTool: AnnotationTool
  setActiveTool: (tool: AnnotationTool) => void
  activeColor: string
  setActiveColor: (color: string) => void

  // Search
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

  // Refs
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
  pageSizes: Array<{ w: number; h: number }>
  children: React.ReactNode
}

export function PdfViewerProvider({ pdfDoc, numPages, pageSizes, children }: ProviderProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(1.5)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [leftSidebarTab, setLeftSidebarTab] = useState<LeftSidebarTab>('outline')
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<AnnotationTool>('none')
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0].value)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOptions, setSearchOptionsState] = useState<SearchOptions>({ caseSensitive: false, wholeWord: false })
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
    pdfDoc, numPages, pageSizes, pageInfoMap,
    currentPage, setCurrentPage, scrollToPage,
    zoom, setZoom, resetZoom,
    leftSidebarOpen, leftSidebarTab, setLeftSidebarOpen, setLeftSidebarTab,
    rightSidebarOpen, setRightSidebarOpen,
    activeTool, setActiveTool, activeColor, setActiveColor,
    searchOpen, searchQuery, searchOptions, searchMatches, currentMatchIndex,
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
    searchOpen, searchQuery, searchOptions, searchMatches, currentMatchIndex,
    nextMatch, prevMatch,
  ])

  return (
    <PdfViewerContext.Provider value={value}>
      {children}
    </PdfViewerContext.Provider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/PdfViewerContext.tsx
git commit -m "feat(app): create PdfViewerContext for shared PDF viewer state"
```

---

## Task 6: Create TitleBar Component

**Files:**
- Create: `packages/app/src/renderer/components/TitleBar.tsx`
- Modify: `packages/app/src/renderer/global.css`

- [ ] **Step 1: Create TitleBar.tsx**

```typescript
import React from 'react'

export interface Tab {
  id: string
  type: 'library' | 'document' | 'note'
  title: string
  closable: boolean
}

interface Props {
  tabs: Tab[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
}

export default function TitleBar({ tabs, activeTabId, onSelectTab, onCloseTab }: Props) {
  return (
    <div className="title-bar">
      <div className="title-bar-drag" />
      <div className="title-bar-tabs">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`title-bar-tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="title-bar-tab-icon">
              {tab.type === 'library' ? '📚' : tab.type === 'document' ? '📄' : '📝'}
            </span>
            <span className="title-bar-tab-title">{tab.title}</span>
            {tab.closable && (
              <button
                className="title-bar-tab-close"
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id) }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add TitleBar CSS to global.css**

Append to `packages/app/src/renderer/global.css`:

```css
/* Title bar */
.title-bar {
  position: relative;
  height: 38px;
  display: flex;
  align-items: stretch;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  user-select: none;
}

.title-bar-drag {
  position: absolute;
  inset: 0;
  -webkit-app-region: drag;
}

.title-bar-tabs {
  display: flex;
  align-items: stretch;
  padding-left: 78px; /* macOS traffic lights */
  overflow-x: auto;
  scrollbar-width: none;
  position: relative;
  z-index: 1;
}

.title-bar-tabs::-webkit-scrollbar {
  display: none;
}

.title-bar-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  min-width: 80px;
  max-width: 200px;
  font-size: 12px;
  color: var(--text-muted);
  border-right: 1px solid var(--border);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background 0.15s;
}

.title-bar-tab:hover {
  background: var(--hover);
}

.title-bar-tab.active {
  background: var(--bg);
  color: var(--text);
}

.title-bar-tab-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.title-bar-tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-bar-tab-close {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 16px;
  padding: 0;
  cursor: pointer;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.title-bar-tab-close:hover {
  background: var(--hover);
  color: var(--text);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/TitleBar.tsx packages/app/src/renderer/global.css
git commit -m "feat(app): create TitleBar component with tab support"
```

---

## Task 7: Create TabManager Component

**Files:**
- Create: `packages/app/src/renderer/components/TabManager.tsx`

- [ ] **Step 1: Create TabManager.tsx**

```typescript
import React, { useState, useCallback } from 'react'
import TitleBar, { type Tab } from './TitleBar.js'
import LibraryView from '../views/LibraryView.js'
import DocumentViewer from './viewers/DocumentViewer.js'
import NoteView from '../views/NoteView.js'

const LIBRARY_TAB_ID = 'library'

interface Props {
  libraryPath: string
}

export default function TabManager({ libraryPath }: Props) {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: LIBRARY_TAB_ID, type: 'library', title: '书库', closable: false },
  ])
  const [activeTabId, setActiveTabId] = useState(LIBRARY_TAB_ID)
  const [tabData, setTabData] = useState<Map<string, any>>(() => new Map())

  const openDocument = useCallback((doc: any) => {
    const existingTab = tabs.find(t => t.type === 'document' && tabData.get(t.id)?.id === doc.id)
    if (existingTab) {
      setActiveTabId(existingTab.id)
      return
    }
    const tabId = `doc-${doc.id}`
    const newTab: Tab = { id: tabId, type: 'document', title: doc.title, closable: true }
    setTabs(prev => [...prev, newTab])
    setTabData(prev => new Map(prev).set(tabId, doc))
    setActiveTabId(tabId)
  }, [tabs, tabData])

  const openNote = useCallback((note: any) => {
    const existingTab = tabs.find(t => t.type === 'note' && tabData.get(t.id)?.id === note.id)
    if (existingTab) {
      setActiveTabId(existingTab.id)
      return
    }
    const tabId = `note-${note.id}`
    const newTab: Tab = { id: tabId, type: 'note', title: note.title, closable: true }
    setTabs(prev => [...prev, newTab])
    setTabData(prev => new Map(prev).set(tabId, note))
    setActiveTabId(tabId)
  }, [tabs, tabData])

  const closeTab = useCallback((tabId: string) => {
    if (tabId === LIBRARY_TAB_ID) return
    setTabs(prev => prev.filter(t => t.id !== tabId))
    setTabData(prev => { const m = new Map(prev); m.delete(tabId); return m })
    if (activeTabId === tabId) {
      setActiveTabId(LIBRARY_TAB_ID)
    }
  }, [activeTabId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={closeTab}
      />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            style={{
              position: 'absolute',
              inset: 0,
              display: tab.id === activeTabId ? 'flex' : 'none',
              flexDirection: 'column',
            }}
          >
            {tab.type === 'library' && (
              <LibraryView
                rootPath={libraryPath}
                onOpenDoc={openDocument}
                onOpenNote={openNote}
                onOpenMindmap={() => {}}
                onOpenGraph={() => {}}
              />
            )}
            {tab.type === 'document' && tabData.get(tab.id) && (
              <DocumentViewer
                doc={tabData.get(tab.id)}
                onBack={() => closeTab(tab.id)}
                onOpenNote={openNote}
              />
            )}
            {tab.type === 'note' && tabData.get(tab.id) && (
              <NoteView
                note={tabData.get(tab.id)}
                onBack={() => closeTab(tab.id)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/TabManager.tsx
git commit -m "feat(app): create TabManager for multi-tab document/note opening"
```

---

## Task 8: Refactor App.tsx to Use TabManager

**Files:**
- Modify: `packages/app/src/renderer/App.tsx`

- [ ] **Step 1: Replace App.tsx routing with TabManager**

Replace the entire `App.tsx` content with:

```typescript
import React, { useState } from 'react'
import WelcomeView from './views/WelcomeView.js'
import TabManager from './components/TabManager.js'

export default function App() {
  const [libraryPath, setLibraryPath] = useState<string | null>(null)

  if (!libraryPath) return <WelcomeView onOpen={setLibraryPath} />
  return <TabManager libraryPath={libraryPath} />
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `cd packages/app && npx tsc --noEmit`
Expected: No type errors (or only pre-existing ones).

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/App.tsx
git commit -m "refactor(app): replace App routing with TabManager"
```

---

## Task 9: Create PdfToolbar

**Files:**
- Create: `packages/app/src/renderer/components/viewers/PdfToolbar.tsx`

- [ ] **Step 1: Create the toolbar component**

```typescript
import React, { useState, useRef, useEffect } from 'react'
import { usePdfViewer, ANNOTATION_COLORS, type AnnotationTool } from './PdfViewerContext.js'

const TOOLS: Array<{ id: AnnotationTool; label: string; icon: string }> = [
  { id: 'highlight', label: '高亮', icon: '🖍' },
  { id: 'text', label: '文本', icon: '📌' },
  { id: 'area', label: '区域', icon: '⬜' },
  { id: 'ink', label: '画笔', icon: '✏️' },
  { id: 'eraser', label: '擦除', icon: '🧹' },
]

export default function PdfToolbar() {
  const ctx = usePdfViewer()
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [pageInput, setPageInput] = useState('')
  const colorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPageInput(String(ctx.currentPage))
  }, [ctx.currentPage])

  useEffect(() => {
    if (!showColorPicker) return
    const handler = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setShowColorPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColorPicker])

  const handlePageSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const num = parseInt(pageInput, 10)
      if (num >= 1 && num <= ctx.numPages) {
        ctx.scrollToPage(num)
      } else {
        setPageInput(String(ctx.currentPage))
      }
    }
  }

  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: 36,
    padding: '0 8px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    flexShrink: 0,
    gap: 2,
    fontSize: 13,
  }

  const btnStyle: React.CSSProperties = {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: 4,
    fontSize: 14,
    color: 'var(--text)',
    lineHeight: 1,
  }

  const activeBtnStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'var(--selected)',
  }

  const sepStyle: React.CSSProperties = {
    width: 1,
    height: 20,
    background: 'var(--border)',
    margin: '0 4px',
  }

  return (
    <div style={toolbarStyle}>
      {/* Left section: sidebar toggle + zoom */}
      <button style={btnStyle} onClick={() => ctx.setLeftSidebarOpen(!ctx.leftSidebarOpen)} title="Toggle left sidebar">
        ☰
      </button>
      <div style={sepStyle} />
      <button style={btnStyle} onClick={() => ctx.setZoom(z => Math.max(0.5, z - 0.25))} title="Zoom out">
        −
      </button>
      <span style={{ fontSize: 11, minWidth: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
        {Math.round(ctx.zoom * 100)}%
      </span>
      <button style={btnStyle} onClick={() => ctx.setZoom(z => Math.min(3, z + 0.25))} title="Zoom in">
        +
      </button>
      <button style={btnStyle} onClick={ctx.resetZoom} title="Reset zoom">
        ↺
      </button>

      {/* Center section: page nav + annotation tools */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <button style={btnStyle} onClick={() => ctx.scrollToPage(Math.max(1, ctx.currentPage - 1))} title="Previous page">
          ◀
        </button>
        <input
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={handlePageSubmit}
          onBlur={() => setPageInput(String(ctx.currentPage))}
          style={{
            width: 40, textAlign: 'center', border: '1px solid var(--border)',
            borderRadius: 3, padding: '2px 4px', fontSize: 12,
            background: 'var(--bg)', color: 'var(--text)',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ {ctx.numPages}</span>
        <button style={btnStyle} onClick={() => ctx.scrollToPage(Math.min(ctx.numPages, ctx.currentPage + 1))} title="Next page">
          ▶
        </button>

        <div style={sepStyle} />

        {TOOLS.map(tool => (
          <button
            key={tool.id}
            style={ctx.activeTool === tool.id ? activeBtnStyle : btnStyle}
            onClick={() => ctx.setActiveTool(ctx.activeTool === tool.id ? 'none' : tool.id)}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}

        {/* Color picker */}
        <div ref={colorRef} style={{ position: 'relative' }}>
          <button
            style={{ ...btnStyle, display: 'flex', alignItems: 'center', gap: 3 }}
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="Color"
          >
            <span style={{
              width: 14, height: 14, borderRadius: '50%',
              background: ctx.activeColor, border: '1px solid var(--border)',
              display: 'inline-block',
            }} />
            <span style={{ fontSize: 10 }}>▾</span>
          </button>
          {showColorPicker && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 100,
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 6, padding: 6, display: 'flex', gap: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>
              {ANNOTATION_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => { ctx.setActiveColor(c.value); setShowColorPicker(false) }}
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: c.value, border: ctx.activeColor === c.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                    cursor: 'pointer', padding: 0,
                  }}
                  title={c.name}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right section: search + right sidebar toggle */}
      <button
        style={ctx.searchOpen ? activeBtnStyle : btnStyle}
        onClick={() => ctx.setSearchOpen(!ctx.searchOpen)}
        title="Search (Cmd+F)"
      >
        🔍
      </button>
      <button style={btnStyle} onClick={() => ctx.setRightSidebarOpen(!ctx.rightSidebarOpen)} title="Toggle right sidebar">
        ☰
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/PdfToolbar.tsx
git commit -m "feat(app): create PdfToolbar with zoom, page nav, annotation tools, color picker"
```

---

## Task 10: Create PdfLeftSidebar Container

**Files:**
- Create: `packages/app/src/renderer/components/viewers/PdfLeftSidebar.tsx`

- [ ] **Step 1: Create the sidebar container with tab switching**

```typescript
import React from 'react'
import { usePdfViewer, type LeftSidebarTab } from './PdfViewerContext.js'
import ThumbnailPanel from './ThumbnailPanel.js'
import OutlinePanel from './OutlinePanel.js'
import AnnotationPanel from './AnnotationPanel.js'
import NotesPanel from './NotesPanel.js'

const TABS: Array<{ id: LeftSidebarTab; icon: string; title: string }> = [
  { id: 'thumbnails', icon: '▦', title: '缩略图' },
  { id: 'outline', icon: '☰', title: '目录' },
  { id: 'annotations', icon: '🖍', title: '标注' },
  { id: 'notes', icon: '📝', title: '笔记' },
]

interface Props {
  docId: string
  annotations: any[]
  onAnnotationClick: (page: number) => void
  onAnnotationDelete: (id: string) => void
  onAnnotationUpdate: (id: string, updates: any) => void
  onOpenNote: (note: any) => void
  onCreateNote: () => void
}

export default function PdfLeftSidebar({
  docId, annotations, onAnnotationClick, onAnnotationDelete, onAnnotationUpdate,
  onOpenNote, onCreateNote,
}: Props) {
  const { leftSidebarTab, setLeftSidebarTab, leftSidebarOpen } = usePdfViewer()

  if (!leftSidebarOpen) return null

  return (
    <div style={{
      width: 240,
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      {/* Tab buttons */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setLeftSidebarTab(tab.id)}
            title={tab.title}
            style={{
              flex: 1,
              padding: '8px 0',
              border: 'none',
              background: leftSidebarTab === tab.id ? 'var(--bg)' : 'var(--surface)',
              borderBottom: leftSidebarTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 14,
              color: leftSidebarTab === tab.id ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {leftSidebarTab === 'thumbnails' && <ThumbnailPanel />}
        {leftSidebarTab === 'outline' && <OutlinePanel />}
        {leftSidebarTab === 'annotations' && (
          <AnnotationPanel
            annotations={annotations}
            onAnnotationClick={onAnnotationClick}
            onAnnotationDelete={onAnnotationDelete}
            onAnnotationUpdate={onAnnotationUpdate}
          />
        )}
        {leftSidebarTab === 'notes' && (
          <NotesPanel
            docId={docId}
            onOpenNote={onOpenNote}
            onCreateNote={onCreateNote}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/PdfLeftSidebar.tsx
git commit -m "feat(app): create PdfLeftSidebar with 4-tab switching"
```

---

## Task 11: Create ThumbnailPanel

**Files:**
- Create: `packages/app/src/renderer/components/viewers/ThumbnailPanel.tsx`

- [ ] **Step 1: Create ThumbnailPanel with lazy-loaded canvas thumbnails**

```typescript
import React, { useEffect, useRef, useState } from 'react'
import { usePdfViewer } from './PdfViewerContext.js'

interface ThumbProps {
  pageNum: number
  scrollRoot: HTMLElement | null
}

function Thumbnail({ pageNum, scrollRoot }: ThumbProps) {
  const { pdfDoc, currentPage, scrollToPage } = usePdfViewer()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !scrollRoot) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible(true)
      },
      { root: scrollRoot, rootMargin: '400px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [scrollRoot])

  useEffect(() => {
    if (!visible || rendered || !pdfDoc) return
    let cancelled = false
    const render = async () => {
      const page = await pdfDoc.getPage(pageNum)
      if (cancelled) return
      const vp = page.getViewport({ scale: 0.3 })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = vp.width
      canvas.height = vp.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport: vp }).promise.catch(() => {})
      if (!cancelled) setRendered(true)
    }
    render()
    return () => { cancelled = true }
  }, [visible, rendered, pdfDoc, pageNum])

  const isActive = currentPage === pageNum

  return (
    <div
      ref={containerRef}
      onClick={() => scrollToPage(pageNum)}
      style={{
        padding: 8,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <div style={{
        border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 2,
        overflow: 'hidden',
        background: '#fff',
        minHeight: 150,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: '100%',
            visibility: rendered ? 'visible' : 'hidden',
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
        {pageNum}
      </span>
    </div>
  )
}

export default function ThumbnailPanel() {
  const { numPages } = usePdfViewer()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setScrollEl(scrollRef.current)
  }, [])

  return (
    <div ref={scrollRef} style={{ height: '100%', overflow: 'auto' }}>
      {Array.from({ length: numPages }, (_, i) => (
        <Thumbnail key={i + 1} pageNum={i + 1} scrollRoot={scrollEl} />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/ThumbnailPanel.tsx
git commit -m "feat(app): create ThumbnailPanel with lazy-loaded page thumbnails"
```

---

## Task 12: Create OutlinePanel

**Files:**
- Create: `packages/app/src/renderer/components/viewers/OutlinePanel.tsx`

- [ ] **Step 1: Create OutlinePanel with tree navigation**

```typescript
import React, { useEffect, useState, useCallback } from 'react'
import { usePdfViewer } from './PdfViewerContext.js'

interface OutlineItem {
  title: string
  dest: any
  items?: OutlineItem[]
}

interface TreeNodeProps {
  item: OutlineItem
  depth: number
  onNavigate: (dest: any) => void
}

function TreeNode({ item, depth, onNavigate }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = item.items && item.items.length > 0

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          paddingLeft: 8 + depth * 16,
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--text)',
          gap: 4,
        }}
        onClick={() => onNavigate(item.dest)}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {hasChildren && (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            style={{ width: 12, flexShrink: 0, fontSize: 10, textAlign: 'center' }}
          >
            {expanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span style={{ width: 12, flexShrink: 0 }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </span>
      </div>
      {hasChildren && expanded && item.items!.map((child, i) => (
        <TreeNode key={i} item={child} depth={depth + 1} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

export default function OutlinePanel() {
  const { pdfDoc, scrollToPage } = usePdfViewer()
  const [outline, setOutline] = useState<OutlineItem[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    pdfDoc.getOutline().then((result: any) => {
      if (!cancelled) {
        setOutline(result)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [pdfDoc])

  const handleNavigate = useCallback(async (dest: any) => {
    if (!pdfDoc || !dest) return
    try {
      let resolvedDest = dest
      if (typeof dest === 'string') {
        resolvedDest = await pdfDoc.getDestination(dest)
      }
      if (!resolvedDest) return
      const ref = resolvedDest[0]
      const pageIndex = await pdfDoc.getPageIndex(ref)
      scrollToPage(pageIndex + 1)
    } catch (err) {
      console.error('[OutlinePanel] navigate error:', err)
    }
  }, [pdfDoc, scrollToPage])

  if (loading) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>Loading...</div>
  }

  if (!outline || outline.length === 0) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>此文档无目录</div>
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {outline.map((item, i) => (
        <TreeNode key={i} item={item} depth={0} onNavigate={handleNavigate} />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/OutlinePanel.tsx
git commit -m "feat(app): create OutlinePanel with PDF outline tree navigation"
```

---

## Task 13: Create AnnotationPanel

**Files:**
- Create: `packages/app/src/renderer/components/viewers/AnnotationPanel.tsx`

- [ ] **Step 1: Create AnnotationPanel**

Refactored version of existing `AnnotationSidebar`, adapted for the left sidebar:

```typescript
import React, { useState } from 'react'

interface AnnotationData {
  id: string
  page: number | null
  selectedText: string | null
  content: string | null
  color: string
  type: string
  createdAt: string
}

interface Props {
  annotations: AnnotationData[]
  onAnnotationClick: (page: number) => void
  onAnnotationDelete: (id: string) => void
  onAnnotationUpdate: (id: string, updates: any) => void
}

export default function AnnotationPanel({ annotations, onAnnotationClick, onAnnotationDelete, onAnnotationUpdate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const grouped = new Map<number, AnnotationData[]>()
  for (const ann of annotations) {
    const page = ann.page ?? 0
    if (!grouped.has(page)) grouped.set(page, [])
    grouped.get(page)!.push(ann)
  }
  const sortedPages = [...grouped.keys()].sort((a, b) => a - b)

  const startEdit = (ann: AnnotationData) => {
    setEditingId(ann.id)
    setEditContent(ann.content || '')
  }

  const saveEdit = (id: string) => {
    onAnnotationUpdate(id, { content: editContent })
    setEditingId(null)
  }

  if (annotations.length === 0) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>暂无标注</div>
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {sortedPages.map(page => (
        <div key={page}>
          <div style={{
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            background: 'var(--surface)',
          }}>
            Page {page}
          </div>
          {grouped.get(page)!.map(ann => (
            <div
              key={ann.id}
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                fontSize: 12,
              }}
              onClick={() => ann.page != null && onAnnotationClick(ann.page)}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                  background: ann.color,
                }} />
                {ann.selectedText && (
                  <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                    lineHeight: '1.4',
                  }}>
                    {ann.selectedText}
                  </span>
                )}
                {!ann.selectedText && (
                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {ann.type}
                  </span>
                )}
              </div>
              {editingId === ann.id ? (
                <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    style={{
                      width: '100%', minHeight: 50, fontSize: 11,
                      border: '1px solid var(--border)', borderRadius: 3,
                      padding: 4, resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <button onClick={() => saveEdit(ann.id)} style={{ fontSize: 11 }}>保存</button>
                    <button onClick={() => setEditingId(null)} style={{ fontSize: 11 }}>取消</button>
                  </div>
                </div>
              ) : ann.content ? (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                  {ann.content}
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => startEdit(ann)}
                  style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  编辑
                </button>
                <button
                  onClick={() => onAnnotationDelete(ann.id)}
                  style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/AnnotationPanel.tsx
git commit -m "feat(app): create AnnotationPanel for left sidebar annotation list"
```

---

## Task 14: Create NotesPanel

**Files:**
- Create: `packages/app/src/renderer/components/viewers/NotesPanel.tsx`

- [ ] **Step 1: Create NotesPanel**

```typescript
import React, { useEffect, useState } from 'react'

interface NoteInfo {
  id: string
  title: string
  createdAt: string
}

interface Props {
  docId: string
  onOpenNote: (note: NoteInfo) => void
  onCreateNote: () => void
}

export default function NotesPanel({ docId, onOpenNote, onCreateNote }: Props) {
  const [notes, setNotes] = useState<NoteInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    window.electronAPI.notes.list({ docId }).then((result: NoteInfo[]) => {
      if (!cancelled) {
        setNotes(result)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [docId])

  if (loading) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>Loading...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {notes.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>暂无笔记</div>
        )}
        {notes.map(note => (
          <div
            key={note.id}
            onClick={() => onOpenNote(note)}
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              fontSize: 12,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ fontWeight: 500 }}>{note.title}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {new Date(note.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          onClick={onCreateNote}
          style={{
            width: '100%', padding: '6px 0', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 4,
            background: 'var(--bg)', cursor: 'pointer', color: 'var(--text)',
          }}
        >
          + 新建笔记
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/NotesPanel.tsx
git commit -m "feat(app): create NotesPanel for document-linked notes"
```

---

## Task 15: Create PdfInfoSidebar

**Files:**
- Create: `packages/app/src/renderer/components/viewers/PdfInfoSidebar.tsx`

- [ ] **Step 1: Create the right sidebar with doc info + metadata editor**

```typescript
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { usePdfViewer } from './PdfViewerContext.js'

interface DocInfo {
  id: string
  title: string
  authors: string[]
  type: string
  path: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface Props {
  doc: DocInfo
  onDocUpdated: (doc: DocInfo) => void
}

function EditableField({ label, value, readOnly, onSave }: {
  label: string; value: string; readOnly?: boolean; onSave?: (val: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(value)

  useEffect(() => { setEditVal(value) }, [value])

  if (readOnly || !onSave) {
    return (
      <div style={{ display: 'flex', padding: '4px 12px', fontSize: 12, gap: 8 }}>
        <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
        <span style={{ color: 'var(--text)', wordBreak: 'break-all' }} title={value}>{value}</span>
      </div>
    )
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', padding: '4px 12px', fontSize: 12, gap: 8 }}>
        <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
        <input
          autoFocus
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => { onSave(editVal); setEditing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { onSave(editVal); setEditing(false) } }}
          style={{
            flex: 1, fontSize: 12, border: '1px solid var(--border)',
            borderRadius: 3, padding: '1px 4px', color: 'var(--text)',
          }}
        />
      </div>
    )
  }

  return (
    <div
      style={{ display: 'flex', padding: '4px 12px', fontSize: 12, gap: 8, cursor: 'pointer' }}
      onClick={() => setEditing(true)}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{value || '—'}</span>
    </div>
  )
}

export default function PdfInfoSidebar({ doc, onDocUpdated }: Props) {
  const { rightSidebarOpen } = usePdfViewer()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [metadata, setMetadata] = useState<Array<{ key: string; value: string }>>(
    Object.entries(doc.metadata).map(([k, v]) => ({ key: k, value: String(v) }))
  )

  useEffect(() => {
    setMetadata(Object.entries(doc.metadata).map(([k, v]) => ({ key: k, value: String(v) })))
  }, [doc.metadata])

  const saveDoc = useCallback((updates: { title?: string; authors?: string[]; metadata?: Record<string, unknown> }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const result = await window.electronAPI.documents.update(doc.id, updates)
      if (result) onDocUpdated(result)
    }, 500)
  }, [doc.id, onDocUpdated])

  const saveMetadata = useCallback((entries: Array<{ key: string; value: string }>) => {
    const obj: Record<string, unknown> = {}
    for (const { key, value } of entries) {
      if (key.trim()) obj[key.trim()] = value
    }
    saveDoc({ metadata: obj })
  }, [saveDoc])

  const updateMetaRow = (index: number, field: 'key' | 'value', val: string) => {
    const next = [...metadata]
    next[index] = { ...next[index], [field]: val }
    setMetadata(next)
    saveMetadata(next)
  }

  const removeMetaRow = (index: number) => {
    const next = metadata.filter((_, i) => i !== index)
    setMetadata(next)
    saveMetadata(next)
  }

  const addMetaRow = () => {
    setMetadata(prev => [...prev, { key: '', value: '' }])
  }

  if (!rightSidebarOpen) return null

  return (
    <div style={{
      width: 280,
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      background: 'var(--bg)',
      overflow: 'auto',
    }}>
      <div style={{
        padding: '10px 12px',
        fontWeight: 600,
        fontSize: 13,
        borderBottom: '1px solid var(--border)',
      }}>
        {doc.title}
      </div>

      <div style={{ padding: '8px 0' }}>
        <EditableField
          label="Title"
          value={doc.title}
          onSave={(val) => saveDoc({ title: val })}
        />
        <EditableField
          label="Authors"
          value={doc.authors.join(', ')}
          onSave={(val) => saveDoc({ authors: val.split(',').map(a => a.trim()).filter(Boolean) })}
        />
        <EditableField label="Type" value={doc.type.toUpperCase()} readOnly />
        <EditableField label="Path" value={doc.path} readOnly />
        <EditableField label="Created" value={new Date(doc.createdAt).toLocaleString()} readOnly />
        <EditableField label="Updated" value={new Date(doc.updatedAt).toLocaleString()} readOnly />
      </div>

      <div style={{
        borderTop: '1px solid var(--border)',
        padding: '8px 0',
      }}>
        <div style={{
          padding: '4px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          marginBottom: 4,
        }}>
          Metadata
        </div>
        {metadata.map((entry, i) => (
          <div
            key={i}
            style={{
              display: 'flex', padding: '2px 12px', fontSize: 12, gap: 4, alignItems: 'center',
            }}
          >
            <input
              value={entry.key}
              onChange={(e) => updateMetaRow(i, 'key', e.target.value)}
              placeholder="key"
              style={{
                width: 70, fontSize: 11, border: '1px solid var(--border)',
                borderRadius: 3, padding: '1px 4px', color: 'var(--text-muted)',
              }}
            />
            <input
              value={entry.value}
              onChange={(e) => updateMetaRow(i, 'value', e.target.value)}
              placeholder="value"
              style={{
                flex: 1, fontSize: 11, border: '1px solid var(--border)',
                borderRadius: 3, padding: '1px 4px', color: 'var(--text)',
              }}
            />
            <button
              onClick={() => removeMetaRow(i)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 14, padding: '0 2px',
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={addMetaRow}
          style={{
            margin: '6px 12px', fontSize: 11, color: 'var(--accent)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          + 添加字段
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/PdfInfoSidebar.tsx
git commit -m "feat(app): create PdfInfoSidebar with doc info and metadata editor"
```

---

## Task 16: Create PdfContentArea

**Files:**
- Create: `packages/app/src/renderer/components/viewers/PdfContentArea.tsx`

- [ ] **Step 1: Create PdfContentArea**

This wraps the page list with scroll tracking for current page detection:

```typescript
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import * as pdfjsLib from '@banjuan/zotero-pdfjs-dist'
import PdfPage, { type TextSelectInfo, type PageInfo } from './PdfPage.js'
import { usePdfViewer } from './PdfViewerContext.js'

interface AnnotationData {
  id: string
  page: number | null
  position: any
  color: string
}

interface Props {
  annotations: AnnotationData[]
  onTextSelect: (info: TextSelectInfo) => void
  onHighlightClick: (id: string) => void
}

export default function PdfContentArea({ annotations, onTextSelect, onHighlightClick }: Props) {
  const ctx = usePdfViewer()
  const { pdfDoc, pageSizes, zoom, scrollRef, setCurrentPage, searchMatches, currentMatchIndex, pageInfoMap } = ctx
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)

  const pdfScale = zoom * pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS

  useEffect(() => {
    setScrollEl(scrollRef.current as HTMLElement | null)
  }, [scrollRef])

  // Track current page by scroll position
  useEffect(() => {
    const el = scrollRef.current
    if (!el || pageSizes.length === 0) return
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const scrollTop = el.scrollTop
        const viewMid = scrollTop + el.clientHeight / 2
        let cumHeight = 0
        for (let i = 0; i < pageSizes.length; i++) {
          cumHeight += pageSizes[i].h + 16 // 8px margin top + 8px margin bottom
          if (cumHeight > viewMid) {
            setCurrentPage(i + 1)
            break
          }
        }
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef, pageSizes, setCurrentPage])

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Array<{ id: string; color: string; rects: Array<{ x: number; y: number; w: number; h: number }> }>>()
    for (const ann of annotations) {
      if (ann.page == null) continue
      const rects = ann.position?.rects
      if (!Array.isArray(rects) || rects.length === 0) continue
      if (!map.has(ann.page)) map.set(ann.page, [])
      map.get(ann.page)!.push({ id: ann.id, color: ann.color, rects })
    }
    return map
  }, [annotations])

  const searchHighlightsByPage = useMemo(() => {
    const map = new Map<number, Array<{ rects: Array<{ x: number; y: number; w: number; h: number }>; active: boolean }>>()
    searchMatches.forEach((match, idx) => {
      if (!map.has(match.page)) map.set(match.page, [])
      map.get(match.page)!.push({ rects: match.rects, active: idx === currentMatchIndex })
    })
    return map
  }, [searchMatches, currentMatchIndex])

  const handlePageReady = useCallback((pageNum: number, info: PageInfo) => {
    pageInfoMap.set(pageNum, info)
  }, [pageInfoMap])

  return (
    <div
      ref={scrollRef as React.RefObject<HTMLDivElement>}
      style={{ flex: 1, overflow: 'auto', background: '#525659' }}
    >
      {pdfDoc && pageSizes.map((sz, idx) => {
        const pageNum = idx + 1
        return (
          <PdfPage
            key={pageNum}
            pdfDoc={pdfDoc}
            pageNum={pageNum}
            scale={pdfScale}
            baseSize={sz}
            scrollRoot={scrollEl}
            highlights={highlightsByPage.get(pageNum) || []}
            searchHighlights={searchHighlightsByPage.get(pageNum)}
            onTextSelect={onTextSelect}
            onHighlightClick={onHighlightClick}
            onPageReady={handlePageReady}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/PdfContentArea.tsx
git commit -m "feat(app): create PdfContentArea with scroll-based page tracking"
```

---

## Task 17: Create SearchPopup

**Files:**
- Create: `packages/app/src/renderer/components/viewers/SearchPopup.tsx`

- [ ] **Step 1: Create SearchPopup with options**

```typescript
import React, { useEffect, useRef, useCallback } from 'react'
import { usePdfViewer, type SearchMatch } from './PdfViewerContext.js'

export default function SearchPopup() {
  const ctx = usePdfViewer()
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (ctx.searchOpen) inputRef.current?.focus()
  }, [ctx.searchOpen])

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        ctx.setSearchOpen(true)
      }
      if (e.key === 'Escape' && ctx.searchOpen) {
        ctx.setSearchOpen(false)
        ctx.setSearchQuery('')
        ctx.setSearchMatches([])
        ctx.setCurrentMatchIndex(0)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ctx.searchOpen])

  const performSearch = useCallback((query: string) => {
    if (!query.trim()) {
      ctx.setSearchMatches([])
      ctx.setCurrentMatchIndex(0)
      return
    }

    const matches: SearchMatch[] = []
    const { pageInfoMap, searchOptions } = ctx

    for (const [pageNum, info] of pageInfoMap.entries()) {
      const pageText = info.chars.map(c => c.c).join('')
      let searchText = pageText
      let searchQuery = query
      if (!searchOptions.caseSensitive) {
        searchText = searchText.toLowerCase()
        searchQuery = searchQuery.toLowerCase()
      }

      let pos = 0
      while (true) {
        const idx = searchText.indexOf(searchQuery, pos)
        if (idx < 0) break

        if (searchOptions.wholeWord) {
          const before = idx > 0 ? searchText[idx - 1] : ' '
          const after = idx + searchQuery.length < searchText.length ? searchText[idx + searchQuery.length] : ' '
          if (/\w/.test(before) || /\w/.test(after)) {
            pos = idx + 1
            continue
          }
        }

        const charSlice = info.chars.slice(idx, idx + query.length)
        const pageW = info.width
        const pageH = info.height

        // Group chars into line-based rects
        const rects: Array<{ x: number; y: number; w: number; h: number }> = []
        for (const ch of charSlice) {
          const [x1, y1, x2, y2] = ch.rect
          // PDF coords to fractional — the chars are in PDF user space
          // We need viewport-relative fractions, but since PdfPage renders
          // at scale, we'll convert similarly to how HighlightLayer works.
          // For now store as fractions of page dimensions.
          const rx = Math.min(x1, x2) / pageW
          const ry = 1 - (Math.max(y1, y2) / pageH)
          const rw = Math.abs(x2 - x1) / pageW
          const rh = Math.abs(y2 - y1) / pageH
          // Try merging with last rect if on same line
          const last = rects[rects.length - 1]
          if (last && Math.abs(last.y - ry) < rh * 0.5) {
            const newRight = Math.max(last.x + last.w, rx + rw)
            last.w = newRight - last.x
          } else {
            rects.push({ x: rx, y: ry, w: rw, h: rh })
          }
        }

        matches.push({ page: pageNum, charStart: idx, charEnd: idx + query.length - 1, rects })
        pos = idx + 1
      }
    }

    matches.sort((a, b) => a.page - b.page || a.charStart - b.charStart)
    ctx.setSearchMatches(matches)
    ctx.setCurrentMatchIndex(matches.length > 0 ? 0 : -1)

    if (matches.length > 0) {
      ctx.scrollToPage(matches[0].page)
    }
  }, [ctx])

  const handleQueryChange = (query: string) => {
    ctx.setSearchQuery(query)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => performSearch(query), 300)
  }

  const handleNext = () => {
    ctx.nextMatch()
    const match = ctx.searchMatches[ctx.currentMatchIndex + 1 >= ctx.searchMatches.length ? 0 : ctx.currentMatchIndex + 1]
    if (match) ctx.scrollToPage(match.page)
  }

  const handlePrev = () => {
    ctx.prevMatch()
    const idx = ctx.currentMatchIndex - 1 < 0 ? ctx.searchMatches.length - 1 : ctx.currentMatchIndex - 1
    const match = ctx.searchMatches[idx]
    if (match) ctx.scrollToPage(match.page)
  }

  const handleClose = () => {
    ctx.setSearchOpen(false)
    ctx.setSearchQuery('')
    ctx.setSearchMatches([])
    ctx.setCurrentMatchIndex(0)
  }

  if (!ctx.searchOpen) return null

  return (
    <div style={{
      position: 'absolute',
      top: 8,
      right: 8,
      zIndex: 200,
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 10,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      minWidth: 280,
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          ref={inputRef}
          value={ctx.searchQuery}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.shiftKey ? handlePrev() : handleNext()
          }}
          placeholder="搜索..."
          style={{
            flex: 1, padding: '4px 8px', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 4,
            color: 'var(--text)',
          }}
        />
        <button onClick={handlePrev} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>▲</button>
        <button onClick={handleNext} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>▼</button>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={ctx.searchOptions.caseSensitive}
            onChange={(e) => {
              ctx.setSearchOptions({ caseSensitive: e.target.checked })
              performSearch(ctx.searchQuery)
            }}
          />
          大小写
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={ctx.searchOptions.wholeWord}
            onChange={(e) => {
              ctx.setSearchOptions({ wholeWord: e.target.checked })
              performSearch(ctx.searchQuery)
            }}
          />
          全词
        </label>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
          {ctx.searchMatches.length > 0
            ? `${ctx.currentMatchIndex + 1}/${ctx.searchMatches.length}`
            : ctx.searchQuery ? '0/0' : ''}
        </span>
        <button onClick={handleClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, padding: '0 2px', color: 'var(--text-muted)' }}>
          ×
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/SearchPopup.tsx
git commit -m "feat(app): create SearchPopup with case-sensitive and whole-word options"
```

---

## Task 18: Create Annotation Tools

### 18a: HighlightTool

**Files:**
- Create: `packages/app/src/renderer/components/viewers/HighlightTool.tsx`

- [ ] **Step 1: Create HighlightTool**

This tool auto-creates highlights on text selection when highlight mode is active:

```typescript
import React, { useEffect } from 'react'
import { usePdfViewer } from './PdfViewerContext.js'
import type { TextSelectInfo } from './PdfPage.js'

interface Props {
  docId: string
  onHighlightCreated: () => void
}

export default function HighlightTool({ docId, onHighlightCreated }: Props) {
  const { activeTool, activeColor } = usePdfViewer()

  useEffect(() => {
    if (activeTool !== 'highlight') return

    const handler = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) return
      // Let PdfPage handle the actual selection detection via onTextSelect
    }
    document.addEventListener('mouseup', handler)
    return () => document.removeEventListener('mouseup', handler)
  }, [activeTool])

  return null
}

// Helper: called from PdfViewer when activeTool === 'highlight' and text is selected
export async function createHighlightFromSelection(
  docId: string,
  info: TextSelectInfo,
  color: string,
): Promise<void> {
  await window.electronAPI.annotations.create({
    docId,
    type: 'highlight',
    page: info.page,
    position: { type: 'pdf', page: info.page, rects: info.rects, text: info.text },
    selectedText: info.text,
    color,
  })
  window.getSelection()?.removeAllRanges()
}
```

### 18b: TextNoteTool

**Files:**
- Create: `packages/app/src/renderer/components/viewers/TextNoteTool.tsx`

- [ ] **Step 2: Create TextNoteTool**

Renders a click overlay on each page when tool is active, and note icons for existing point annotations:

```typescript
import React, { useState, useCallback } from 'react'
import { usePdfViewer } from './PdfViewerContext.js'

interface Props {
  docId: string
  annotations: Array<{ id: string; page: number | null; position: any; content: string | null; color: string }>
  onAnnotationCreated: () => void
  onAnnotationUpdated: (id: string, updates: { content?: string }) => void
}

export default function TextNoteTool({ docId, annotations, onAnnotationCreated, onAnnotationUpdated }: Props) {
  const { activeTool, activeColor, pdfDoc } = usePdfViewer()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [newNote, setNewNote] = useState<{ page: number; x: number; y: number } | null>(null)
  const [newContent, setNewContent] = useState('')

  const pointAnnotations = annotations.filter(a => a.position?.type === 'point')

  const handlePageClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>, pageNum: number) => {
    if (activeTool !== 'text') return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setNewNote({ page: pageNum, x, y })
    setNewContent('')
  }, [activeTool])

  const saveNewNote = async () => {
    if (!newNote) return
    await window.electronAPI.annotations.create({
      docId,
      type: 'note',
      page: newNote.page,
      position: { type: 'point', page: newNote.page, x: newNote.x, y: newNote.y },
      content: newContent,
      color: activeColor,
    })
    setNewNote(null)
    setNewContent('')
    onAnnotationCreated()
  }

  const saveEdit = async () => {
    if (!editingId) return
    onAnnotationUpdated(editingId, { content: editContent })
    setEditingId(null)
  }

  if (activeTool !== 'text' && pointAnnotations.length === 0) return null

  return { handlePageClick, pointAnnotations, editingId, editContent, setEditingId, setEditContent, saveEdit, newNote, newContent, setNewContent, saveNewNote, setNewNote }
}
```

Note: TextNoteTool will be integrated as an overlay in PdfPage. The exact rendering integration happens in Task 20 (PdfViewer refactor). The key logic is:
- When `activeTool === 'text'`, clicking on a page creates a point annotation
- Existing point annotations render as 📌 icons at their coordinates
- Clicking a 📌 opens an inline editor popup

### 18c: AreaSelectTool

**Files:**
- Create: `packages/app/src/renderer/components/viewers/AreaSelectTool.tsx`

- [ ] **Step 3: Create AreaSelectTool**

```typescript
import React, { useState, useCallback, useRef } from 'react'

interface Props {
  active: boolean
  color: string
  pageNum: number
  docId: string
  onCreated: () => void
}

export default function AreaSelectTool({ active, color, pageNum, docId, onCreated }: Props) {
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const getRelativePos = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!active) return
    e.preventDefault()
    setStart(getRelativePos(e))
    setDragging(true)
  }, [active])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    setCurrent(getRelativePos(e))
  }, [dragging])

  const handleMouseUp = useCallback(async () => {
    if (!dragging || !start || !current) {
      setDragging(false)
      return
    }
    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const w = Math.abs(current.x - start.x)
    const h = Math.abs(current.y - start.y)

    if (w > 0.01 && h > 0.01) {
      await window.electronAPI.annotations.create({
        docId,
        type: 'area',
        page: pageNum,
        position: { type: 'area', page: pageNum, rect: { x, y, w, h } },
        color,
      })
      onCreated()
    }
    setDragging(false)
    setStart(null)
    setCurrent(null)
  }, [dragging, start, current, docId, pageNum, color, onCreated])

  const rectStyle = start && current ? {
    position: 'absolute' as const,
    left: `${Math.min(start.x, current.x) * 100}%`,
    top: `${Math.min(start.y, current.y) * 100}%`,
    width: `${Math.abs(current.x - start.x) * 100}%`,
    height: `${Math.abs(current.y - start.y) * 100}%`,
    border: `2px dashed ${color}`,
    background: `${color}33`,
    pointerEvents: 'none' as const,
  } : null

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: active ? 'crosshair' : 'default',
        pointerEvents: active ? 'auto' : 'none',
        zIndex: active ? 10 : -1,
      }}
    >
      {rectStyle && <div style={rectStyle} />}
    </div>
  )
}
```

### 18d: InkTool

**Files:**
- Create: `packages/app/src/renderer/components/viewers/InkTool.tsx`

- [ ] **Step 4: Create InkTool**

```typescript
import React, { useRef, useEffect, useState, useCallback } from 'react'

interface Stroke {
  points: Array<{ x: number; y: number }>
  color: string
  width: number
}

interface Props {
  active: boolean
  color: string
  lineWidth: number
  pageNum: number
  docId: string
  existingStrokes: Stroke[]
  onCreated: () => void
}

export default function InkTool({ active, color, lineWidth, pageNum, docId, existingStrokes, onCreated }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [drawing, setDrawing] = useState(false)
  const currentStroke = useRef<Array<{ x: number; y: number }>>([])

  const getRelativePos = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
  }

  // Render existing strokes
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const stroke of existingStrokes) {
      if (stroke.points.length < 2) continue
      ctx.beginPath()
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height)
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height)
      }
      ctx.stroke()
    }
  }, [existingStrokes])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!active) return
    e.preventDefault()
    setDrawing(true)
    currentStroke.current = [getRelativePos(e)]
  }, [active])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing) return
    const pos = getRelativePos(e)
    currentStroke.current.push(pos)

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const pts = currentStroke.current
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    const prev = pts[pts.length - 2]
    const cur = pts[pts.length - 1]
    ctx.moveTo(prev.x * canvas.width, prev.y * canvas.height)
    ctx.lineTo(cur.x * canvas.width, cur.y * canvas.height)
    ctx.stroke()
  }, [drawing, color, lineWidth])

  const handleMouseUp = useCallback(async () => {
    if (!drawing) return
    setDrawing(false)
    const points = currentStroke.current
    if (points.length < 2) return

    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const bounds = {
      x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    }

    await window.electronAPI.annotations.create({
      docId,
      type: 'ink',
      page: pageNum,
      position: {
        type: 'ink', page: pageNum,
        strokes: [{ points, color, width: lineWidth }],
        bounds,
      },
      color,
    })
    currentStroke.current = []
    onCreated()
  }, [drawing, docId, pageNum, color, lineWidth, onCreated])

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: active ? 'crosshair' : 'default',
        pointerEvents: active ? 'auto' : 'none',
        zIndex: active ? 10 : -1,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      />
    </div>
  )
}
```

### 18e: EraserTool

**Files:**
- Create: `packages/app/src/renderer/components/viewers/EraserTool.tsx`

- [ ] **Step 5: Create EraserTool**

```typescript
import React, { useState } from 'react'

interface AnnotationData {
  id: string
  page: number | null
  position: any
  color: string
  type: string
}

interface Props {
  active: boolean
  annotations: AnnotationData[]
  pageNum: number
  onDelete: (id: string) => void
}

export default function EraserTool({ active, annotations, pageNum, onDelete }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  if (!active) return null

  const pageAnnotations = annotations.filter(a => a.page === pageNum)

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      cursor: 'pointer',
      zIndex: 10,
    }}>
      {pageAnnotations.map(ann => {
        const pos = ann.position
        if (!pos) return null

        let overlayStyle: React.CSSProperties = {}
        if (pos.type === 'pdf' && pos.rects) {
          const r = pos.rects[0]
          if (!r) return null
          overlayStyle = {
            position: 'absolute',
            left: `${r.x * 100}%`, top: `${r.y * 100}%`,
            width: `${r.w * 100}%`, height: `${r.h * 100}%`,
          }
        } else if (pos.type === 'point') {
          overlayStyle = {
            position: 'absolute',
            left: `${pos.x * 100}%`, top: `${pos.y * 100}%`,
            width: 24, height: 24, transform: 'translate(-50%, -50%)',
          }
        } else if (pos.type === 'area' && pos.rect) {
          overlayStyle = {
            position: 'absolute',
            left: `${pos.rect.x * 100}%`, top: `${pos.rect.y * 100}%`,
            width: `${pos.rect.w * 100}%`, height: `${pos.rect.h * 100}%`,
          }
        } else if (pos.type === 'ink' && pos.bounds) {
          overlayStyle = {
            position: 'absolute',
            left: `${pos.bounds.x * 100}%`, top: `${pos.bounds.y * 100}%`,
            width: `${pos.bounds.w * 100}%`, height: `${pos.bounds.h * 100}%`,
          }
        } else {
          return null
        }

        return (
          <div
            key={ann.id}
            style={{
              ...overlayStyle,
              background: hoverId === ann.id ? 'rgba(255, 0, 0, 0.25)' : 'transparent',
              border: hoverId === ann.id ? '2px solid rgba(255, 0, 0, 0.5)' : 'none',
              borderRadius: 2,
              cursor: 'pointer',
            }}
            onMouseEnter={() => setHoverId(ann.id)}
            onMouseLeave={() => setHoverId(null)}
            onClick={(e) => { e.stopPropagation(); onDelete(ann.id) }}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: Commit all annotation tools**

```bash
git add packages/app/src/renderer/components/viewers/HighlightTool.tsx \
       packages/app/src/renderer/components/viewers/TextNoteTool.tsx \
       packages/app/src/renderer/components/viewers/AreaSelectTool.tsx \
       packages/app/src/renderer/components/viewers/InkTool.tsx \
       packages/app/src/renderer/components/viewers/EraserTool.tsx
git commit -m "feat(app): create annotation tools (highlight, text, area, ink, eraser)"
```

---

## Task 19: Refactor PdfViewer as Layout Orchestrator

This is the core integration task. PdfViewer.tsx becomes the layout shell that composes all sub-components.

**Files:**
- Modify: `packages/app/src/renderer/components/viewers/PdfViewer.tsx`

- [ ] **Step 1: Rewrite PdfViewer.tsx**

Replace the entire file with the orchestrator version:

```typescript
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import * as pdfjsLib from '@banjuan/zotero-pdfjs-dist'
import { PdfViewerProvider, usePdfViewer } from './PdfViewerContext.js'
import PdfToolbar from './PdfToolbar.js'
import PdfLeftSidebar from './PdfLeftSidebar.js'
import PdfInfoSidebar from './PdfInfoSidebar.js'
import PdfContentArea from './PdfContentArea.js'
import SearchPopup from './SearchPopup.js'
import { createHighlightFromSelection } from './HighlightTool.js'
import { useAnnotations } from '../../hooks/useAnnotations.js'
import type { TextSelectInfo } from './PdfPage.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '@banjuan/zotero-pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

;(globalThis as any).FontInspector = {
  enabled: true,
  fontAdded: () => {},
}

interface DocInfo {
  id: string
  title: string
  authors: string[]
  type: string
  path: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface Props {
  filePath: string
  fileData: ArrayBuffer
  doc: DocInfo
  onOpenNote?: (note: any) => void
}

function PdfViewerInner({ filePath, fileData, doc: initialDoc, onOpenNote }: Props) {
  const ctx = usePdfViewer()
  const { annotations, create, update, remove, reload } = useAnnotations(initialDoc.id)
  const [doc, setDoc] = useState<DocInfo>(initialDoc)

  const handleTextSelect = useCallback(async (info: TextSelectInfo) => {
    if (ctx.activeTool === 'highlight') {
      await createHighlightFromSelection(doc.id, info, ctx.activeColor)
      reload()
    }
    // For 'none' tool mode, could show SelectionToolbar (optional, keep existing behavior)
  }, [ctx.activeTool, ctx.activeColor, doc.id, reload])

  const handleAnnotationClick = useCallback((page: number) => {
    ctx.scrollToPage(page)
  }, [ctx])

  const handleAnnotationDelete = useCallback(async (id: string) => {
    await remove(id)
  }, [remove])

  const handleAnnotationUpdate = useCallback(async (id: string, updates: any) => {
    await update(id, updates)
  }, [update])

  const handleCreateNote = useCallback(async () => {
    const note = await window.electronAPI.notes.create({
      title: `${doc.title} — 笔记`,
      docId: doc.id,
      content: '',
    })
    onOpenNote?.(note)
  }, [doc, onOpenNote])

  const handleOpenNote = useCallback((note: any) => {
    onOpenNote?.(note)
  }, [onOpenNote])

  const handleDocUpdated = useCallback((updated: DocInfo) => {
    setDoc(updated)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PdfToolbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <PdfLeftSidebar
          docId={doc.id}
          annotations={annotations}
          onAnnotationClick={handleAnnotationClick}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationUpdate={handleAnnotationUpdate}
          onOpenNote={handleOpenNote}
          onCreateNote={handleCreateNote}
        />
        <PdfContentArea
          annotations={annotations}
          onTextSelect={handleTextSelect}
          onHighlightClick={() => ctx.setLeftSidebarOpen(true)}
        />
        <PdfInfoSidebar
          doc={doc}
          onDocUpdated={handleDocUpdated}
        />
        <SearchPopup />
      </div>
    </div>
  )
}

export default function PdfViewer(props: Props) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [pageSizes, setPageSizes] = useState<Array<{ w: number; h: number }>>([])
  const [zoom] = useState(1.5)

  const pdfScale = zoom * pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = new Uint8Array(props.fileData)
        const doc = await pdfjsLib.getDocument({ data }).promise
        if (cancelled) return
        setPdfDoc(doc)
        const sizes: Array<{ w: number; h: number }> = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          if (cancelled) return
          const vp = page.getViewport({ scale: pdfScale })
          sizes.push({ w: vp.width, h: vp.height })
        }
        if (!cancelled) setPageSizes(sizes)
      } catch (err) {
        console.error('[PdfViewer] failed to load PDF:', err)
      }
    }
    load()
    return () => { cancelled = true }
  }, [props.fileData])

  if (!pdfDoc) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>Loading PDF...</div>
  }

  return (
    <PdfViewerProvider pdfDoc={pdfDoc} numPages={pdfDoc.numPages} pageSizes={pageSizes}>
      <PdfViewerInner {...props} />
    </PdfViewerProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/PdfViewer.tsx
git commit -m "refactor(app): rewrite PdfViewer as layout orchestrator with context"
```

---

## Task 20: Refactor DocumentViewer

**Files:**
- Modify: `packages/app/src/renderer/components/viewers/DocumentViewer.tsx`

- [ ] **Step 1: Simplify DocumentViewer**

Remove the toolbar, sidebar toggle, and SelectionToolbar. Pass full doc object to PdfViewer:

```typescript
import React, { useEffect, useState } from 'react'
import PdfViewer from './PdfViewer.js'
import TextViewer from './TextViewer.js'
import MarkdownViewer from './MarkdownViewer.js'
import ImageViewer from './ImageViewer.js'
import VideoViewer from './VideoViewer.js'
import EpubViewer from './EpubViewer.js'

interface DocInfo {
  id: string
  title: string
  authors: string[]
  type: string
  path: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface Props {
  doc: DocInfo
  onBack: () => void
  onOpenNote?: (note: any) => void
}

export default function DocumentViewer({ doc, onBack, onOpenNote }: Props) {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null)

  useEffect(() => {
    window.electronAPI.documents.getFilePath(doc.path).then(setFilePath)
    if (doc.type === 'pdf' || doc.type === 'epub') {
      window.electronAPI.documents.readFileBuffer(doc.path).then((buf: ArrayBuffer) => {
        setFileData(buf)
      }).catch((err: any) => console.error('[DocViewer] readFileBuffer error:', err))
    }
  }, [doc.path, doc.type])

  const isLoading = !filePath || ((doc.type === 'pdf' || doc.type === 'epub') && !fileData)
  if (isLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      Loading...
    </div>
  }

  switch (doc.type) {
    case 'pdf':
      return (
        <PdfViewer
          filePath={filePath!}
          fileData={fileData!}
          doc={doc}
          onOpenNote={onOpenNote}
        />
      )
    case 'epub':
      return <EpubViewer filePath={filePath} />
    case 'txt':
    case 'html':
      return <TextViewer docPath={doc.path} />
    case 'md':
      return <MarkdownViewer docPath={doc.path} />
    case 'image':
      return <ImageViewer filePath={filePath} />
    case 'video':
      return <VideoViewer filePath={filePath} />
    default:
      return <div style={{ padding: 24 }}>Unsupported document type: {doc.type}</div>
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/viewers/DocumentViewer.tsx
git commit -m "refactor(app): simplify DocumentViewer, move PDF layout to PdfViewer"
```

---

## Task 21: Update LibraryView Doc Opening

The LibraryView currently passes a minimal doc object. We need to ensure it passes all fields needed by PdfInfoSidebar.

**Files:**
- Modify: `packages/app/src/renderer/views/LibraryView.tsx`

- [ ] **Step 1: Ensure full doc object is passed to onOpenDoc**

In LibraryView, find where `onOpenDoc` is called and ensure the full document object (including `authors`, `metadata`, `createdAt`, `updatedAt`) is passed. Check the current code — the documents are fetched via `window.electronAPI.documents.list()` which returns full Document objects. Verify the handler passes the full object, not a subset.

If the handler currently builds a partial object like `{ id, title, type, path }`, change it to pass the full document object from the list.

- [ ] **Step 2: Commit if changes were needed**

```bash
git add packages/app/src/renderer/views/LibraryView.tsx
git commit -m "fix(app): pass full document object when opening from library"
```

---

## Task 22: Integration Testing & Cleanup

- [ ] **Step 1: Verify the app compiles**

```bash
cd packages/app && npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Remove unused imports from old AnnotationSidebar and SelectionToolbar**

These files are no longer imported from DocumentViewer. If nothing else imports them, they can be left in place (they may be useful for non-PDF viewers later) but verify no import errors.

- [ ] **Step 3: Test in browser**

Run the dev server:
```bash
cd /Users/chixiao/Documents/work/research/newproject && pnpm dev
```

Test the following:
1. App opens with title bar tabs (library tab visible)
2. Open a PDF — new tab appears, three-panel layout renders
3. Left sidebar: thumbnails load lazily, outline tree navigates, annotations list works, notes panel shows
4. Right sidebar: doc info displays, metadata editing works
5. Toolbar: zoom in/out/reset, page nav, annotation tool selection, color picker
6. Search: Cmd+F opens popup, typing searches, results highlight, ▲▼ navigate
7. Highlight tool: select tool → select text → auto-creates highlight
8. Close document tab → returns to library
9. Multiple tabs: open two documents, switch between them, state preserved

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(app): integration fixes for PDF viewer Zotero layout"
```

---

## Task 23: Final Zoom Sync Fix

The zoom state needs to sync between PdfViewerContext and PdfContentArea's pdfScale calculation. Currently zoom is initialized in two places.

**Files:**
- Modify: `packages/app/src/renderer/components/viewers/PdfViewer.tsx`
- Modify: `packages/app/src/renderer/components/viewers/PdfContentArea.tsx`

- [ ] **Step 1: Fix zoom sync**

In PdfViewer.tsx outer component, remove the local `zoom` state. The zoom is managed by PdfViewerContext. Instead, use a fixed initial scale for the page size calculation (e.g., `1.5 * pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS`).

In PdfContentArea, the zoom-responsive page size recalculation should happen in a `useEffect` that watches `ctx.zoom`:

```typescript
// In PdfContentArea, add zoom-responsive size recalc
useEffect(() => {
  if (!ctx.pdfDoc) return
  let cancelled = false
  const recalc = async () => {
    const sizes: Array<{ w: number; h: number }> = []
    for (let i = 1; i <= ctx.numPages; i++) {
      const page = await ctx.pdfDoc!.getPage(i)
      if (cancelled) return
      const vp = page.getViewport({ scale: pdfScale })
      sizes.push({ w: vp.width, h: vp.height })
    }
    // Update pageSizes via a callback or by lifting this logic to PdfViewer
  }
  recalc()
  return () => { cancelled = true }
}, [ctx.pdfDoc, pdfScale])
```

The clean approach: add `setPageSizes` to PdfViewerContext so PdfContentArea can update sizes when zoom changes.

- [ ] **Step 2: Add setPageSizes to context**

In PdfViewerContext.tsx, add `setPageSizes` to the context value so it can be called from PdfContentArea or PdfViewer.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/viewers/PdfViewer.tsx \
       packages/app/src/renderer/components/viewers/PdfViewerContext.tsx \
       packages/app/src/renderer/components/viewers/PdfContentArea.tsx
git commit -m "fix(app): sync zoom state between context and page size calculation"
```
