# Handwriting Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add handwriting notes as a third note type in Banjuan, with multi-page tldraw canvas, templates, and PDF/PNG export.

**Architecture:** tldraw v4.x provides the core canvas engine (freehand drawing, shapes, lasso, undo/redo, serialization). We build pagination, template backgrounds, and toolbar customization on top. Handwriting notes follow the same three-column layout as markdown/mindmap notes, reusing FolderTree (left) and BacklinksPanel (right).

**Tech Stack:** tldraw v4.x, React 19, Zustand, better-sqlite3, jsPDF

**Spec:** `docs/superpowers/specs/2026-05-03-handwriting-notes-design.md`

---

## File Structure

```
packages/core/src/types.ts                              — Modify: add 'handwriting' to NoteType, add HandwritingNoteJsonFile
packages/core/src/notes/service.ts                      — Modify: add handwriting branches in create/get/update
packages/app/src/renderer/i18n/en.ts                    — Modify: add handwriting i18n keys
packages/app/src/renderer/i18n/zh.ts                    — Modify: add handwriting i18n keys
packages/app/src/renderer/components/handwriting/
  ├── TemplateRenderer.tsx                              — Create: SVG template backgrounds (blank/lined/grid/dotted/cornell)
  ├── useHandwritingStore.ts                            — Create: Zustand store for page state, current page, save
  ├── HandwritingEditor.tsx                             — Create: tldraw wrapper with template background + camera constraints
  ├── PageListPanel.tsx                                 — Create: left sidebar "Pages" tab with thumbnails
  ├── HandwritingToolbar.tsx                            — Create: drawing tools toolbar
  └── HandwritingCenterContent.tsx                      — Create: assembles toolbar + editor + coordinates page switching
packages/app/src/renderer/views/NoteView.tsx            — Modify: add isHandwriting routing for center + left sidebar tabs
packages/app/src/renderer/views/LibraryView.tsx         — Modify: add handwriting note creation button + handler
```

---

### Task 1: Install tldraw and extend core types

**Files:**
- Modify: `packages/app/package.json`
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Install tldraw**

```bash
cd packages/app && pnpm add tldraw
```

- [ ] **Step 2: Extend NoteType**

In `packages/core/src/types.ts`, find line 134:
```typescript
export type NoteType = 'markdown' | 'mindmap'
```
Change to:
```typescript
export type NoteType = 'markdown' | 'mindmap' | 'handwriting'
```

- [ ] **Step 3: Add HandwritingNoteJsonFile interface**

In `packages/core/src/types.ts`, after the existing `MindmapNoteJsonFile` interface, add:

```typescript
export type HandwritingTemplate = 'blank' | 'lined' | 'grid' | 'dotted' | 'cornell'

export interface HandwritingPage {
  id: string
  template: HandwritingTemplate
  tldrawSnapshot: unknown
}

export interface HandwritingNoteJsonFile {
  meta: NoteFileData
  pages: HandwritingPage[]
  currentPageIndex: number
}
```

- [ ] **Step 4: Verify build**

```bash
cd /Users/chixiao/Documents/work/research/newproject && pnpm -r build
```
Expected: Build passes with no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/app/package.json pnpm-lock.yaml packages/core/src/types.ts
git commit -m "feat(handwriting): install tldraw and extend NoteType with handwriting types"
```

---

### Task 2: Update NoteService for handwriting create/get/update

**Files:**
- Modify: `packages/core/src/notes/service.ts`

- [ ] **Step 1: Update create() method**

In `packages/core/src/notes/service.ts`, in the `create()` method (around line 140), find where `typeMeta` is set for mindmap:

```typescript
  if (noteType === 'mindmap') {
    typeMeta = { layout: input.layout ?? 'mindmap', theme: input.theme ?? 'classic' }
  }
```

Add after it:

```typescript
  if (noteType === 'handwriting') {
    typeMeta = {
      pageSize: { width: 1024, height: 768 },
      defaultTemplate: 'blank',
    }
  }
```

Then find the file-writing block where mindmap and markdown are handled. Add the handwriting case before the markdown fallback:

```typescript
  if (noteType === 'mindmap') {
    writeFileSync(fullPath, JSON.stringify({ meta, nodes: [], edges: [] }, null, 2))
    contentStr = JSON.stringify({ nodes: [], edges: [] })
  } else if (noteType === 'handwriting') {
    const { v4: uuidv4 } = await import('uuid')
    const initialPage = { id: uuidv4(), template: 'blank', tldrawSnapshot: null }
    const fileData = { meta, pages: [initialPage], currentPageIndex: 0 }
    writeFileSync(fullPath, JSON.stringify(fileData, null, 2))
    contentStr = JSON.stringify({ pages: [initialPage], currentPageIndex: 0 })
  } else {
```

Note: Check if uuid is already imported in the file. If it uses a different uuid generator (e.g., the `uuid()` call at the top of create), reuse that pattern instead of importing v4.

- [ ] **Step 2: Update get() method**

In the `get()` method (around line 210), find the type branching:

```typescript
    if (note.type === 'mindmap') {
      const parsed = JSON.parse(raw) as MindmapNoteJsonFile
      note.content = JSON.stringify({ nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] })
    } else if (note.contentFormat === 'json') {
```

Add the handwriting case:

```typescript
    if (note.type === 'mindmap') {
      const parsed = JSON.parse(raw) as MindmapNoteJsonFile
      note.content = JSON.stringify({ nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] })
    } else if (note.type === 'handwriting') {
      const parsed = JSON.parse(raw) as HandwritingNoteJsonFile
      note.content = JSON.stringify({ pages: parsed.pages ?? [], currentPageIndex: parsed.currentPageIndex ?? 0 })
    } else if (note.contentFormat === 'json') {
```

Add the import at the top of the file:
```typescript
import type { HandwritingNoteJsonFile } from '../types.js'
```

- [ ] **Step 3: Update update() method**

In the `update()` method (around line 240), find the file-writing logic that handles mindmap vs markdown. Add the handwriting case:

```typescript
    if ((row.type as string) === 'mindmap') {
      // existing mindmap code...
    } else if ((row.type as string) === 'handwriting') {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as HandwritingNoteJsonFile
      if (updates.title !== undefined) raw.meta.title = updates.title
      if (updates.typeMeta !== undefined) raw.meta.typeMeta = updates.typeMeta
      raw.meta.updatedAt = now
      if (updates.content !== undefined) {
        try {
          const parsed = JSON.parse(updates.content)
          raw.pages = parsed.pages ?? raw.pages
          raw.currentPageIndex = parsed.currentPageIndex ?? raw.currentPageIndex
        } catch { /* keep existing */ }
      }
      writeFileSync(filePath, JSON.stringify(raw, null, 2))
    } else {
```

- [ ] **Step 4: Verify build**

```bash
cd /Users/chixiao/Documents/work/research/newproject && pnpm -r build
```
Expected: Build passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/notes/service.ts
git commit -m "feat(handwriting): add handwriting note create/get/update in NoteService"
```

---

### Task 3: Add i18n strings

**Files:**
- Modify: `packages/app/src/renderer/i18n/en.ts`
- Modify: `packages/app/src/renderer/i18n/zh.ts`

- [ ] **Step 1: Add English strings**

In `packages/app/src/renderer/i18n/en.ts`, find the note/mindmap section and add nearby:

```typescript
'library.newHandwriting': 'New Handwriting',
'library.untitledHandwriting': 'Untitled Handwriting',
'handwriting.pages': 'Pages',
'handwriting.newPage': 'New Page',
'handwriting.deletePage': 'Delete Page',
'handwriting.changeTemplate': 'Change Template',
'handwriting.insertBefore': 'Insert Before',
'handwriting.insertAfter': 'Insert After',
'handwriting.duplicatePage': 'Duplicate Page',
'handwriting.template.blank': 'Blank',
'handwriting.template.lined': 'Lined',
'handwriting.template.grid': 'Grid',
'handwriting.template.dotted': 'Dotted',
'handwriting.template.cornell': 'Cornell',
'handwriting.tool.pen': 'Pen',
'handwriting.tool.highlighter': 'Highlighter',
'handwriting.tool.eraser': 'Eraser',
'handwriting.tool.shape': 'Shape',
'handwriting.tool.lasso': 'Lasso',
'handwriting.exportPdf': 'Export PDF',
'handwriting.exportPng': 'Export PNG',
'handwriting.exportAllPng': 'Export All Pages (ZIP)',
```

- [ ] **Step 2: Add Chinese strings**

In `packages/app/src/renderer/i18n/zh.ts`, add:

```typescript
'library.newHandwriting': '新建手写',
'library.untitledHandwriting': '未命名手写',
'handwriting.pages': '页面',
'handwriting.newPage': '新建页面',
'handwriting.deletePage': '删除页面',
'handwriting.changeTemplate': '更换模板',
'handwriting.insertBefore': '在前方插入',
'handwriting.insertAfter': '在后方插入',
'handwriting.duplicatePage': '复制页面',
'handwriting.template.blank': '空白',
'handwriting.template.lined': '横线',
'handwriting.template.grid': '网格',
'handwriting.template.dotted': '点阵',
'handwriting.template.cornell': '康奈尔',
'handwriting.tool.pen': '钢笔',
'handwriting.tool.highlighter': '荧光笔',
'handwriting.tool.eraser': '橡皮擦',
'handwriting.tool.shape': '形状',
'handwriting.tool.lasso': '套索',
'handwriting.exportPdf': '导出 PDF',
'handwriting.exportPng': '导出 PNG',
'handwriting.exportAllPng': '导出全部页面 (ZIP)',
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/i18n/en.ts packages/app/src/renderer/i18n/zh.ts
git commit -m "feat(handwriting): add i18n strings for handwriting notes"
```

---

### Task 4: Create TemplateRenderer

**Files:**
- Create: `packages/app/src/renderer/components/handwriting/TemplateRenderer.tsx`

- [ ] **Step 1: Create the TemplateRenderer component**

This component renders SVG template backgrounds for tldraw's Grid component override. Each template generates an SVG pattern that tiles across the page.

```tsx
import React from 'react'
import type { HandwritingTemplate } from '@banjuan/core'

interface Props {
  template: HandwritingTemplate
  pageWidth: number
  pageHeight: number
}

const LINE_COLOR = '#d0d0d0'
const SPACING = 32

function LinedTemplate({ pageWidth, pageHeight }: { pageWidth: number; pageHeight: number }) {
  const lines: React.ReactElement[] = []
  for (let y = SPACING; y < pageHeight; y += SPACING) {
    lines.push(<line key={y} x1={0} y1={y} x2={pageWidth} y2={y} stroke={LINE_COLOR} strokeWidth={0.5} />)
  }
  return <>{lines}</>
}

function GridTemplate({ pageWidth, pageHeight }: { pageWidth: number; pageHeight: number }) {
  const lines: React.ReactElement[] = []
  for (let y = SPACING; y < pageHeight; y += SPACING) {
    lines.push(<line key={`h${y}`} x1={0} y1={y} x2={pageWidth} y2={y} stroke={LINE_COLOR} strokeWidth={0.5} />)
  }
  for (let x = SPACING; x < pageWidth; x += SPACING) {
    lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={pageHeight} stroke={LINE_COLOR} strokeWidth={0.5} />)
  }
  return <>{lines}</>
}

function DottedTemplate({ pageWidth, pageHeight }: { pageWidth: number; pageHeight: number }) {
  const dots: React.ReactElement[] = []
  for (let y = SPACING; y < pageHeight; y += SPACING) {
    for (let x = SPACING; x < pageWidth; x += SPACING) {
      dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={1} fill={LINE_COLOR} />)
    }
  }
  return <>{dots}</>
}

function CornellTemplate({ pageWidth, pageHeight }: { pageWidth: number; pageHeight: number }) {
  const cueWidth = Math.round(pageWidth / 3)
  const summaryY = Math.round(pageHeight * 0.75)
  const lines: React.ReactElement[] = []
  lines.push(<line key="cue" x1={cueWidth} y1={0} x2={cueWidth} y2={summaryY} stroke={LINE_COLOR} strokeWidth={1} />)
  lines.push(<line key="summary" x1={0} y1={summaryY} x2={pageWidth} y2={summaryY} stroke={LINE_COLOR} strokeWidth={1} />)
  for (let y = SPACING; y < pageHeight; y += SPACING) {
    lines.push(<line key={`h${y}`} x1={0} y1={y} x2={pageWidth} y2={y} stroke={LINE_COLOR} strokeWidth={0.3} />)
  }
  return <>{lines}</>
}

export default function TemplateRenderer({ template, pageWidth, pageHeight }: Props) {
  if (template === 'blank') return null

  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
      width={pageWidth}
      height={pageHeight}
      viewBox={`0 0 ${pageWidth} ${pageHeight}`}
    >
      {template === 'lined' && <LinedTemplate pageWidth={pageWidth} pageHeight={pageHeight} />}
      {template === 'grid' && <GridTemplate pageWidth={pageWidth} pageHeight={pageHeight} />}
      {template === 'dotted' && <DottedTemplate pageWidth={pageWidth} pageHeight={pageHeight} />}
      {template === 'cornell' && <CornellTemplate pageWidth={pageWidth} pageHeight={pageHeight} />}
    </svg>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/chixiao/Documents/work/research/newproject && pnpm -r build
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/handwriting/TemplateRenderer.tsx
git commit -m "feat(handwriting): add SVG template renderer for page backgrounds"
```

---

### Task 5: Create useHandwritingStore

**Files:**
- Create: `packages/app/src/renderer/components/handwriting/useHandwritingStore.ts`

- [ ] **Step 1: Create the Zustand store**

This store manages page state, current page index, and auto-save logic. Follows the same context-based pattern as `useMindmapStore`.

```typescript
import { createContext, useContext } from 'react'
import { createStore, useStore, type StoreApi } from 'zustand'
import type { HandwritingPage, HandwritingTemplate } from '@banjuan/core'
import { getSnapshot, loadSnapshot, createTLStore, type TLStoreSnapshot } from 'tldraw'

export interface HandwritingState {
  noteId: string | null
  pages: HandwritingPage[]
  currentPageIndex: number
  pageSize: { width: number; height: number }
  defaultTemplate: HandwritingTemplate
  saving: boolean
  thumbnails: Map<string, string>

  init: (noteId: string) => Promise<void>
  setCurrentPage: (index: number) => void
  addPage: (afterIndex: number, template?: HandwritingTemplate) => void
  deletePage: (index: number) => void
  duplicatePage: (index: number) => void
  movePage: (fromIndex: number, toIndex: number) => void
  setPageTemplate: (index: number, template: HandwritingTemplate) => void
  saveCurrentPageSnapshot: (snapshot: unknown) => void
  save: () => Promise<void>
  updateThumbnail: (pageId: string, dataUrl: string) => void
}

type HandwritingStoreApi = StoreApi<HandwritingState>

export const HandwritingStoreContext = createContext<HandwritingStoreApi | null>(null)

function generatePageId(): string {
  return crypto.randomUUID()
}

export function createHandwritingStore(): HandwritingStoreApi {
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  return createStore<HandwritingState>((set, get) => ({
    noteId: null,
    pages: [],
    currentPageIndex: 0,
    pageSize: { width: 1024, height: 768 },
    defaultTemplate: 'blank',
    saving: false,
    thumbnails: new Map(),

    init: async (noteId: string) => {
      const note = await window.electronAPI.notes.get(noteId)
      if (!note) return
      const data = JSON.parse(note.content)
      const typeMeta = note.typeMeta ?? {}
      set({
        noteId,
        pages: data.pages ?? [],
        currentPageIndex: data.currentPageIndex ?? 0,
        pageSize: (typeMeta as any).pageSize ?? { width: 1024, height: 768 },
        defaultTemplate: (typeMeta as any).defaultTemplate ?? 'blank',
      })
    },

    setCurrentPage: (index: number) => {
      const { pages } = get()
      if (index >= 0 && index < pages.length) {
        set({ currentPageIndex: index })
      }
    },

    addPage: (afterIndex: number, template?: HandwritingTemplate) => {
      const { pages, defaultTemplate } = get()
      const newPage: HandwritingPage = {
        id: generatePageId(),
        template: template ?? defaultTemplate,
        tldrawSnapshot: null,
      }
      const newPages = [...pages]
      newPages.splice(afterIndex + 1, 0, newPage)
      set({ pages: newPages, currentPageIndex: afterIndex + 1 })
      get().save()
    },

    deletePage: (index: number) => {
      const { pages, currentPageIndex } = get()
      if (pages.length <= 1) return
      const newPages = pages.filter((_, i) => i !== index)
      const newIndex = currentPageIndex >= newPages.length ? newPages.length - 1 : currentPageIndex
      set({ pages: newPages, currentPageIndex: newIndex })
      get().save()
    },

    duplicatePage: (index: number) => {
      const { pages } = get()
      const source = pages[index]
      if (!source) return
      const newPage: HandwritingPage = {
        id: generatePageId(),
        template: source.template,
        tldrawSnapshot: source.tldrawSnapshot ? JSON.parse(JSON.stringify(source.tldrawSnapshot)) : null,
      }
      const newPages = [...pages]
      newPages.splice(index + 1, 0, newPage)
      set({ pages: newPages, currentPageIndex: index + 1 })
      get().save()
    },

    movePage: (fromIndex: number, toIndex: number) => {
      const { pages } = get()
      const newPages = [...pages]
      const [moved] = newPages.splice(fromIndex, 1)
      newPages.splice(toIndex, 0, moved)
      set({ pages: newPages, currentPageIndex: toIndex })
      get().save()
    },

    setPageTemplate: (index: number, template: HandwritingTemplate) => {
      const { pages } = get()
      const newPages = [...pages]
      newPages[index] = { ...newPages[index], template }
      set({ pages: newPages })
      get().save()
    },

    saveCurrentPageSnapshot: (snapshot: unknown) => {
      const { pages, currentPageIndex } = get()
      const newPages = [...pages]
      newPages[currentPageIndex] = { ...newPages[currentPageIndex], tldrawSnapshot: snapshot }
      set({ pages: newPages })

      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => get().save(), 500)
    },

    save: async () => {
      const { noteId, pages, currentPageIndex } = get()
      if (!noteId) return
      set({ saving: true })
      try {
        await window.electronAPI.notes.update(noteId, {
          content: JSON.stringify({ pages, currentPageIndex }),
        })
      } finally {
        set({ saving: false })
      }
    },

    updateThumbnail: (pageId: string, dataUrl: string) => {
      const { thumbnails } = get()
      const newThumbnails = new Map(thumbnails)
      newThumbnails.set(pageId, dataUrl)
      set({ thumbnails: newThumbnails })
    },
  }))
}

export function useHandwritingStore(): HandwritingState
export function useHandwritingStore<T>(selector: (state: HandwritingState) => T): T
export function useHandwritingStore<T>(selector?: (state: HandwritingState) => T): T | HandwritingState {
  const store = useContext(HandwritingStoreContext)
  if (!store) throw new Error('useHandwritingStore must be used within HandwritingStoreContext.Provider')
  return useStore(store, selector as (state: HandwritingState) => T)
}

export function useHandwritingStoreApi(): HandwritingStoreApi {
  const store = useContext(HandwritingStoreContext)
  if (!store) throw new Error('useHandwritingStoreApi must be used within HandwritingStoreContext.Provider')
  return store
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/chixiao/Documents/work/research/newproject && pnpm -r build
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/handwriting/useHandwritingStore.ts
git commit -m "feat(handwriting): add Zustand store for handwriting page state"
```

---

### Task 6: Create HandwritingEditor (tldraw wrapper)

**Files:**
- Create: `packages/app/src/renderer/components/handwriting/HandwritingEditor.tsx`

- [ ] **Step 1: Create the tldraw wrapper component**

This component wraps tldraw with camera constraints (fixed page bounds), template background, and snapshot load/save hooks.

```tsx
import React, { useEffect, useRef, useCallback } from 'react'
import { Tldraw, useEditor, getSnapshot, loadSnapshot, createTLStore, type Editor, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import TemplateRenderer from './TemplateRenderer.js'
import { useHandwritingStore } from './useHandwritingStore.js'
import type { HandwritingTemplate } from '@banjuan/core'

interface Props {
  pageId: string
  snapshot: unknown
  template: HandwritingTemplate
  pageWidth: number
  pageHeight: number
  onSnapshotChange: (snapshot: unknown) => void
  onThumbnailGenerated: (dataUrl: string) => void
}

function CameraSetup({ pageWidth, pageHeight }: { pageWidth: number; pageHeight: number }) {
  const editor = useEditor()

  useEffect(() => {
    editor.setCameraOptions({
      constraints: {
        bounds: { x: 0, y: 0, w: pageWidth, h: pageHeight },
        padding: { x: 16, y: 16 },
        origin: { x: 0.5, y: 0.5 },
        initialZoom: 'fit-min',
        baseZoom: 'fit-min',
        behavior: 'inside',
      },
    })
    editor.setCamera(editor.getCamera(), { reset: true })
  }, [editor, pageWidth, pageHeight])

  return null
}

function AutoSave({ onSnapshotChange, onThumbnailGenerated }: {
  onSnapshotChange: (snapshot: unknown) => void
  onThumbnailGenerated: (dataUrl: string) => void
}) {
  const editor = useEditor()

  useEffect(() => {
    const cleanup = editor.store.listen(
      () => {
        const { document } = getSnapshot(editor.store)
        onSnapshotChange(document)
      },
      { source: 'user', scope: 'document' }
    )
    return cleanup
  }, [editor, onSnapshotChange])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const cleanup = editor.store.listen(
      () => {
        clearTimeout(timer)
        timer = setTimeout(async () => {
          try {
            const shapeIds = editor.getCurrentPageShapeIds()
            if (shapeIds.size === 0) {
              onThumbnailGenerated('')
              return
            }
            const result = await editor.toImage(shapeIds, {
              format: 'png',
              pixelRatio: 0.25,
              background: false,
            })
            if (result) {
              const url = URL.createObjectURL(result.blob)
              onThumbnailGenerated(url)
            }
          } catch { /* ignore thumbnail errors */ }
        }, 1000)
      },
      { source: 'user', scope: 'document' }
    )
    return () => { cleanup(); clearTimeout(timer) }
  }, [editor, onThumbnailGenerated])

  return null
}

export default function HandwritingEditor({
  pageId, snapshot, template, pageWidth, pageHeight, onSnapshotChange, onThumbnailGenerated,
}: Props) {
  const storeRef = useRef<ReturnType<typeof createTLStore>>()

  if (!storeRef.current) {
    storeRef.current = createTLStore()
  }

  useEffect(() => {
    if (snapshot && storeRef.current) {
      loadSnapshot(storeRef.current, { document: snapshot as any })
    }
  }, [pageId])

  const components: TLComponents = {
    Background: () => (
      <TemplateRenderer template={template} pageWidth={pageWidth} pageHeight={pageHeight} />
    ),
    HelpMenu: null,
    DebugMenu: null,
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Tldraw
        key={pageId}
        store={storeRef.current}
        components={components}
        autoFocus
      >
        <CameraSetup pageWidth={pageWidth} pageHeight={pageHeight} />
        <AutoSave onSnapshotChange={onSnapshotChange} onThumbnailGenerated={onThumbnailGenerated} />
      </Tldraw>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/chixiao/Documents/work/research/newproject && pnpm -r build
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/handwriting/HandwritingEditor.tsx
git commit -m "feat(handwriting): add tldraw wrapper with camera constraints and template background"
```

---

### Task 7: Create PageListPanel

**Files:**
- Create: `packages/app/src/renderer/components/handwriting/PageListPanel.tsx`

- [ ] **Step 1: Create the page list panel**

This is the left sidebar "Pages" tab showing thumbnails with drag-to-reorder and right-click context menu.

```tsx
import React, { useState, useCallback, useRef } from 'react'
import { useHandwritingStore } from './useHandwritingStore.js'
import { useT } from '../../i18n/index.js'
import type { HandwritingTemplate } from '@banjuan/core'

const TEMPLATES: HandwritingTemplate[] = ['blank', 'lined', 'grid', 'dotted', 'cornell']

interface ContextMenuState {
  x: number
  y: number
  pageIndex: number
}

export default function PageListPanel() {
  const t = useT()
  const pages = useHandwritingStore(s => s.pages)
  const currentPageIndex = useHandwritingStore(s => s.currentPageIndex)
  const thumbnails = useHandwritingStore(s => s.thumbnails)
  const setCurrentPage = useHandwritingStore(s => s.setCurrentPage)
  const addPage = useHandwritingStore(s => s.addPage)
  const deletePage = useHandwritingStore(s => s.deletePage)
  const duplicatePage = useHandwritingStore(s => s.duplicatePage)
  const setPageTemplate = useHandwritingStore(s => s.setPageTemplate)
  const movePage = useHandwritingStore(s => s.movePage)

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [templatePicker, setTemplatePicker] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent, pageIndex: number) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, pageIndex })
  }, [])

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback((targetIndex: number) => {
    if (dragIndexRef.current !== null && dragIndexRef.current !== targetIndex) {
      movePage(dragIndexRef.current, targetIndex)
    }
    dragIndexRef.current = null
  }, [movePage])

  const ctxItemStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '6px 12px', border: 'none',
    background: 'none', textAlign: 'left', fontSize: 12, cursor: 'pointer',
    color: 'var(--text)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {pages.map((page, index) => (
          <div
            key={page.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(index)}
            onClick={() => setCurrentPage(index)}
            onContextMenu={(e) => handleContextMenu(e, index)}
            style={{
              padding: 6,
              marginBottom: 8,
              borderRadius: 6,
              border: index === currentPageIndex ? '2px solid var(--accent)' : '2px solid var(--border)',
              cursor: 'pointer',
              background: index === currentPageIndex ? 'var(--hover)' : 'transparent',
            }}
          >
            <div style={{
              width: '100%',
              aspectRatio: '4 / 3',
              background: 'white',
              borderRadius: 4,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {thumbnails.get(page.id) ? (
                <img src={thumbnails.get(page.id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t(`handwriting.template.${page.template}`)}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
              {index + 1}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
        <button
          onClick={() => addPage(pages.length - 1)}
          style={{
            width: '100%', padding: '6px 0', border: '1px dashed var(--border)',
            borderRadius: 6, background: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--text-muted)',
          }}
        >
          + {t('handwriting.newPage')}
        </button>
      </div>

      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setContextMenu(null)} />
          <div style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '4px 0', minWidth: 160,
          }}>
            <button style={ctxItemStyle} onClick={() => { addPage(contextMenu.pageIndex); setContextMenu(null) }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              {t('handwriting.insertAfter')}
            </button>
            <button style={ctxItemStyle} onClick={() => { duplicatePage(contextMenu.pageIndex); setContextMenu(null) }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              {t('handwriting.duplicatePage')}
            </button>
            <button style={ctxItemStyle} onClick={() => { setTemplatePicker(contextMenu.pageIndex); setContextMenu(null) }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              {t('handwriting.changeTemplate')}
            </button>
            {pages.length > 1 && (
              <button style={{ ...ctxItemStyle, color: '#e53e3e' }}
                onClick={() => { deletePage(contextMenu.pageIndex); setContextMenu(null) }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                {t('handwriting.deletePage')}
              </button>
            )}
          </div>
        </>
      )}

      {templatePicker !== null && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setTemplatePicker(null)} />
          <div style={{
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 1000, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: 16, minWidth: 240,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{t('handwriting.changeTemplate')}</div>
            {TEMPLATES.map(tmpl => (
              <button
                key={tmpl}
                onClick={() => { setPageTemplate(templatePicker, tmpl); setTemplatePicker(null) }}
                style={{
                  display: 'block', width: '100%', padding: '8px 12px', border: 'none',
                  background: pages[templatePicker]?.template === tmpl ? 'var(--hover)' : 'none',
                  textAlign: 'left', fontSize: 13, cursor: 'pointer', borderRadius: 4,
                  color: 'var(--text)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => {
                  if (pages[templatePicker]?.template !== tmpl) e.currentTarget.style.background = 'none'
                }}
              >
                {t(`handwriting.template.${tmpl}`)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/chixiao/Documents/work/research/newproject && pnpm -r build
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/handwriting/PageListPanel.tsx
git commit -m "feat(handwriting): add page list panel with thumbnails, drag reorder, and context menu"
```

---

### Task 8: Create HandwritingToolbar

**Files:**
- Create: `packages/app/src/renderer/components/handwriting/HandwritingToolbar.tsx`

- [ ] **Step 1: Create the toolbar component**

Second row of the toolbar with drawing tools and page navigation. The first row (back/title/export/sidebar toggles) is handled by HandwritingCenterContent.

```tsx
import React, { useState } from 'react'
import { useEditor } from 'tldraw'
import { useHandwritingStore } from './useHandwritingStore.js'
import { useT } from '../../i18n/index.js'

const COLORS = ['#1a1a1a', '#e53e3e', '#dd6b20', '#d69e2e', '#38a169', '#3182ce', '#805ad5', '#d53f8c']
const WIDTHS = [2, 4, 8]

export default function HandwritingToolbar() {
  const t = useT()
  const editor = useEditor()
  const pages = useHandwritingStore(s => s.pages)
  const currentPageIndex = useHandwritingStore(s => s.currentPageIndex)
  const setCurrentPage = useHandwritingStore(s => s.setCurrentPage)

  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showWidthPicker, setShowWidthPicker] = useState(false)
  const [currentColor, setCurrentColor] = useState(COLORS[0])
  const [currentWidth, setCurrentWidth] = useState(WIDTHS[1])

  const activeTool = editor.getCurrentToolId()

  const selectTool = (toolId: string) => {
    editor.setCurrentTool(toolId)
  }

  const toolBtn = (toolId: string, label: string, icon: string, active?: boolean) => (
    <button
      key={toolId}
      onClick={() => selectTool(toolId)}
      title={label}
      style={{
        background: (active ?? activeTool === toolId) ? 'var(--accent)' : 'none',
        color: (active ?? activeTool === toolId) ? 'white' : 'var(--text-muted)',
        border: 'none', borderRadius: 4, padding: '4px 8px',
        cursor: 'pointer', fontSize: 14, lineHeight: 1,
      }}
    >
      {icon}
    </button>
  )

  return (
    <div style={{
      height: 36, padding: '0 12px', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
      background: 'var(--surface)',
    }}>
      {toolBtn('draw', t('handwriting.tool.pen'), '✏️')}
      {toolBtn('highlight', t('handwriting.tool.highlighter'), '🖍️')}
      {toolBtn('eraser', t('handwriting.tool.eraser'), '⬭')}
      {toolBtn('geo', t('handwriting.tool.shape'), '▭')}
      {toolBtn('select', t('handwriting.tool.lasso'), '◎')}

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

      {/* Color picker */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowColorPicker(v => !v); setShowWidthPicker(false) }}
          style={{
            width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--border)',
            background: currentColor, cursor: 'pointer',
          }}
        />
        {showColorPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowColorPicker(false)} />
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 8, display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}>
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => {
                    setCurrentColor(c)
                    editor.setStyleForNextShapes(editor.getStyleForNextShape('color' as any) as any, c)
                    setShowColorPicker(false)
                  }}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', border: c === currentColor ? '2px solid var(--accent)' : '2px solid transparent',
                    background: c, cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Width picker */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowWidthPicker(v => !v); setShowColorPicker(false) }}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 4,
            padding: '2px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)',
          }}
        >
          ━ {currentWidth}
        </button>
        {showWidthPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowWidthPicker(false)} />
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}>
              {WIDTHS.map(w => (
                <button
                  key={w}
                  onClick={() => {
                    setCurrentWidth(w)
                    editor.setStyleForNextShapes(editor.getStyleForNextShape('size' as any) as any, w)
                    setShowWidthPicker(false)
                  }}
                  style={{
                    display: 'block', width: '100%', padding: '4px 12px', border: 'none',
                    background: w === currentWidth ? 'var(--hover)' : 'none',
                    textAlign: 'left', fontSize: 12, cursor: 'pointer', borderRadius: 4,
                    color: 'var(--text)',
                  }}
                >
                  <span style={{ display: 'inline-block', width: 40, height: w, background: currentColor, borderRadius: w / 2, verticalAlign: 'middle' }} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

      {/* Undo / Redo */}
      <button onClick={() => editor.undo()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', padding: '4px' }} title="Undo">↩</button>
      <button onClick={() => editor.redo()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', padding: '4px' }} title="Redo">↪</button>

      <div style={{ flex: 1 }} />

      {/* Page indicator */}
      <button
        onClick={() => setCurrentPage(currentPageIndex - 1)}
        disabled={currentPageIndex === 0}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: currentPageIndex === 0 ? 'var(--border)' : 'var(--text-muted)', padding: '4px' }}
      >
        ◀
      </button>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {currentPageIndex + 1} / {pages.length}
      </span>
      <button
        onClick={() => setCurrentPage(currentPageIndex + 1)}
        disabled={currentPageIndex === pages.length - 1}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: currentPageIndex === pages.length - 1 ? 'var(--border)' : 'var(--text-muted)', padding: '4px' }}
      >
        ▶
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/chixiao/Documents/work/research/newproject && pnpm -r build
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/handwriting/HandwritingToolbar.tsx
git commit -m "feat(handwriting): add drawing tools toolbar with color, width, and page navigation"
```

---

### Task 9: Create HandwritingCenterContent

**Files:**
- Create: `packages/app/src/renderer/components/handwriting/HandwritingCenterContent.tsx`

- [ ] **Step 1: Create the center content component**

Assembles the first toolbar row (nav/title/export), the HandwritingToolbar, and the HandwritingEditor. Manages page switching by saving snapshot before switch.

```tsx
import React, { useState, useEffect, useCallback } from 'react'
import { getSnapshot } from 'tldraw'
import HandwritingEditor from './HandwritingEditor.js'
import HandwritingToolbar from './HandwritingToolbar.js'
import { useHandwritingStore } from './useHandwritingStore.js'
import { useT } from '../../i18n/index.js'

interface Props {
  noteId: string
  title: string
  onBack: () => void
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
}

export default function HandwritingCenterContent({ noteId, title, onBack, onToggleLeftSidebar, onToggleRightSidebar }: Props) {
  const t = useT()
  const pages = useHandwritingStore(s => s.pages)
  const currentPageIndex = useHandwritingStore(s => s.currentPageIndex)
  const pageSize = useHandwritingStore(s => s.pageSize)
  const saving = useHandwritingStore(s => s.saving)
  const init = useHandwritingStore(s => s.init)
  const saveCurrentPageSnapshot = useHandwritingStore(s => s.saveCurrentPageSnapshot)
  const updateThumbnail = useHandwritingStore(s => s.updateThumbnail)

  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  useEffect(() => {
    init(noteId)
  }, [noteId, init])

  const currentPage = pages[currentPageIndex]

  const handleSnapshotChange = useCallback((snapshot: unknown) => {
    saveCurrentPageSnapshot(snapshot)
  }, [saveCurrentPageSnapshot])

  const handleThumbnailGenerated = useCallback((dataUrl: string) => {
    if (currentPage) {
      updateThumbnail(currentPage.id, dataUrl)
    }
  }, [currentPage, updateThumbnail])

  const handleExportPdf = useCallback(async () => {
    setExportMenuOpen(false)
    await window.electronAPI.export.pdf({ title, html: '', attachments: [] })
  }, [title])

  if (!currentPage) return null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Row 1: Nav toolbar */}
      <div style={{
        height: 40, padding: '0 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <button onClick={onToggleLeftSidebar}
          style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
          ☰
        </button>
        <button onClick={onBack}
          style={{ background: 'none', border: 'none', fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px' }}>
          {t('common.back')}
        </button>
        <span style={{
          flex: 1, fontWeight: 600, fontSize: 15, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {saving ? t('note.saving') : t('note.saved')}
        </span>
        <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setExportMenuOpen(v => !v)}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 4,
              fontSize: 12, cursor: 'pointer', padding: '3px 8px', color: 'var(--text-muted)',
            }}
          >
            {t('note.export')}
          </button>
          {exportMenuOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 100, minWidth: 160, padding: '4px 0',
            }}>
              <button
                onClick={handleExportPdf}
                style={{
                  display: 'block', width: '100%', padding: '8px 16px', border: 'none',
                  background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: 'var(--text)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {t('handwriting.exportPdf')}
              </button>
              <button
                onClick={() => setExportMenuOpen(false)}
                style={{
                  display: 'block', width: '100%', padding: '8px 16px', border: 'none',
                  background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: 'var(--text)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {t('handwriting.exportPng')}
              </button>
            </div>
          )}
        </div>
        <button onClick={onToggleRightSidebar}
          style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
          ≡
        </button>
      </div>

      {/* Row 2: Drawing toolbar (inside tldraw context — rendered by HandwritingEditor) */}
      {/* Row 2 is rendered inside tldraw context, see below */}

      {/* Canvas */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <HandwritingEditor
          pageId={currentPage.id}
          snapshot={currentPage.tldrawSnapshot}
          template={currentPage.template}
          pageWidth={pageSize.width}
          pageHeight={pageSize.height}
          onSnapshotChange={handleSnapshotChange}
          onThumbnailGenerated={handleThumbnailGenerated}
        />
      </div>
    </div>
  )
}
```

**Note:** HandwritingToolbar uses `useEditor()` which requires it to be rendered inside tldraw's React context tree. Since `HandwritingEditor` renders `<Tldraw>`, the toolbar must be rendered as a child of tldraw. Update `HandwritingEditor.tsx` to accept and render the toolbar inside its tldraw tree:

In `HandwritingEditor.tsx`, update the `<Tldraw>` block:

```tsx
<Tldraw
  key={pageId}
  store={storeRef.current}
  components={components}
  autoFocus
>
  <CameraSetup pageWidth={pageWidth} pageHeight={pageHeight} />
  <AutoSave onSnapshotChange={onSnapshotChange} onThumbnailGenerated={onThumbnailGenerated} />
  <InternalToolbar />
</Tldraw>
```

And add a new internal component that renders `HandwritingToolbar` as an overlay inside the tldraw context:

```tsx
function InternalToolbar() {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 300 }}>
      <HandwritingToolbar />
    </div>
  )
}
```

Then update the canvas area in `HandwritingCenterContent.tsx` to add top padding:

```tsx
<div style={{ flex: 1, overflow: 'hidden', position: 'relative', paddingTop: 36 }}>
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/chixiao/Documents/work/research/newproject && pnpm -r build
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/handwriting/HandwritingCenterContent.tsx packages/app/src/renderer/components/handwriting/HandwritingEditor.tsx
git commit -m "feat(handwriting): add center content component assembling toolbar and editor"
```

---

### Task 10: Integrate into NoteView

**Files:**
- Modify: `packages/app/src/renderer/views/NoteView.tsx`

- [ ] **Step 1: Add imports**

At the top of `NoteView.tsx`, add:

```typescript
import HandwritingCenterContent from '../components/handwriting/HandwritingCenterContent.js'
import PageListPanel from '../components/handwriting/PageListPanel.js'
import { createHandwritingStore, HandwritingStoreContext } from '../components/handwriting/useHandwritingStore.js'
```

- [ ] **Step 2: Add isHandwriting flag**

Find line 214 where `isMindmap` is defined:
```typescript
const isMindmap = (note.type ?? 'markdown') === 'mindmap'
```
Add after it:
```typescript
const isHandwriting = (note.type ?? 'markdown') === 'handwriting'
```

- [ ] **Step 3: Update left sidebar tabs**

Find the left sidebar tab rendering (around line 320). The current code builds tabs array as:
```typescript
{([['files', t('note.notes')], ...(!isMindmap ? [['outline', t('note.outline')]] : [])] as const).map(([id, label]) => (
```

Replace with:
```typescript
{([
  ['files', t('note.notes')],
  ...(!isMindmap && !isHandwriting ? [['outline', t('note.outline')]] : []),
  ...(isHandwriting ? [['pages', t('handwriting.pages')]] : []),
] as [string, string][]).map(([id, label]) => (
```

Then find the tab content rendering (around line 340-347) and add the pages panel:
```typescript
{leftTab === 'outline' && !isMindmap && !isHandwriting && <NoteOutlinePanel headings={headings} />}
{leftTab === 'pages' && isHandwriting && <PageListPanel />}
```

- [ ] **Step 4: Update center content routing**

Find the center content conditional (around line 355):
```typescript
{isMindmap ? (
  <MindmapCenterContent ... />
) : (
```

Change to:
```typescript
{isHandwriting ? (
  <HandwritingCenterContent
    noteId={note.id}
    title={title}
    onBack={onBack}
    onToggleLeftSidebar={() => setLeftSidebarOpen(v => !v)}
    onToggleRightSidebar={() => setRightSidebarOpen(v => !v)}
  />
) : isMindmap ? (
  <MindmapCenterContent ... />
) : (
```

- [ ] **Step 5: Update the provider wrapper in the exported component**

Find the `NoteView` export function (around line 498). Update it to also wrap handwriting notes with their store provider:

```typescript
export default function NoteView(props: Props) {
  const isMindmap = (props.note.type ?? 'markdown') === 'mindmap'
  const isHandwriting = (props.note.type ?? 'markdown') === 'handwriting'
  const store = useMemo(() => isMindmap ? createMindmapStore() : null, [props.note.id])
  const hwStore = useMemo(() => isHandwriting ? createHandwritingStore() : null, [props.note.id])

  if (isHandwriting && hwStore) {
    return (
      <HandwritingStoreContext.Provider value={hwStore}>
        <NoteViewInner {...props} />
      </HandwritingStoreContext.Provider>
    )
  }

  if (isMindmap && store) {
    return (
      <MindmapStoreContext.Provider value={store}>
        <ReactFlowProvider>
          <NoteViewInner {...props} />
        </ReactFlowProvider>
      </MindmapStoreContext.Provider>
    )
  }

  return <NoteViewInner {...props} />
}
```

- [ ] **Step 6: Verify build**

```bash
cd /Users/chixiao/Documents/work/research/newproject && pnpm -r build
```

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/renderer/views/NoteView.tsx
git commit -m "feat(handwriting): integrate handwriting view into NoteView with store provider"
```

---

### Task 11: Add handwriting note creation in LibraryView

**Files:**
- Modify: `packages/app/src/renderer/views/LibraryView.tsx`

- [ ] **Step 1: Add creation handler**

Find `handleCreateMindmapNote` (around line 338). Add a similar handler after it:

```typescript
const handleCreateHandwritingNote = async () => {
  const title = t('library.untitledHandwriting')
  const note = await window.electronAPI.notes.create({
    title,
    type: 'handwriting',
    folder: selectedNoteDir ?? undefined,
  })
  await loadNotes()
  await loadNoteDirs()
  onOpenNote(note)
}
```

Note: `onOpenNote` should work here since handwriting notes use the same `'note'` tab type. If the existing code uses `onOpenMindmap` for mindmap specifically, check if `onOpenNote` handles all note types via the tab system.

- [ ] **Step 2: Add creation button in toolbar**

Find the notes toolbar section (around line 667-671):
```typescript
{selectedSection === 'notes' && (
  <>
    <button onClick={handleCreateNote} ...>{t('library.newNote')}</button>
    <button onClick={handleCreateMindmapNote} ...>{t('library.newMindmap')}</button>
  </>
)}
```

Add the handwriting button:
```typescript
{selectedSection === 'notes' && (
  <>
    <button onClick={handleCreateNote} style={{ fontSize: 12, padding: '4px 10px' }}>{t('library.newNote')}</button>
    <button onClick={handleCreateMindmapNote} style={{ fontSize: 12, padding: '4px 10px' }}>{t('library.newMindmap')}</button>
    <button onClick={handleCreateHandwritingNote} style={{ fontSize: 12, padding: '4px 10px' }}>{t('library.newHandwriting')}</button>
  </>
)}
```

- [ ] **Step 3: Add context menu entry**

Find the context menu mindmap creation entry (around line 910-913). Add after it:
```typescript
<div onClick={() => { setContextMenu(null); handleCreateHandwritingNote() }} style={ctxItemStyle}
  onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
>{t('library.newHandwriting')}</div>
```

- [ ] **Step 4: Update note type icon**

Find the note type icon rendering (around line 729-734):
```typescript
<span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{item.type === 'mindmap' ? '🧠' : '📝'}</span>
```

Change to:
```typescript
<span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>
  {item.type === 'mindmap' ? '🧠' : item.type === 'handwriting' ? '✏️' : '📝'}
</span>
```

- [ ] **Step 5: Verify build**

```bash
cd /Users/chixiao/Documents/work/research/newproject && pnpm -r build
```

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/renderer/views/LibraryView.tsx
git commit -m "feat(handwriting): add handwriting note creation button and icon in library"
```

---

### Task 12: End-to-end smoke test

- [ ] **Step 1: Start dev server**

```bash
cd /Users/chixiao/Documents/work/research/newproject && pnpm dev
```

- [ ] **Step 2: Test creation flow**

1. Open a library
2. Click "New Handwriting" button
3. Verify a new handwriting note appears in the note list with ✏️ icon
4. Verify the note opens with tldraw canvas

- [ ] **Step 3: Test drawing**

1. Select pen tool, draw strokes on the canvas
2. Try different tools: highlighter, eraser, shapes, lasso
3. Verify undo/redo works

- [ ] **Step 4: Test page management**

1. Switch to "Pages" tab in left sidebar
2. Add a new page via the "+" button
3. Switch between pages — verify content is preserved
4. Right-click a page → change template → verify background changes
5. Drag to reorder pages

- [ ] **Step 5: Test save/reload**

1. Draw on a page, wait for "Saved" indicator
2. Close the note tab, reopen it
3. Verify all pages and content are preserved

- [ ] **Step 6: Fix any issues found, commit**

```bash
git add -A
git commit -m "fix(handwriting): address issues from smoke test"
```

---

### Task 13: Add PDF/PNG export

**Files:**
- Modify: `packages/app/package.json` (add jspdf)
- Modify: `packages/app/src/renderer/components/handwriting/HandwritingCenterContent.tsx`

- [ ] **Step 1: Install jspdf**

```bash
cd packages/app && pnpm add jspdf
```

- [ ] **Step 2: Implement export functions**

In `HandwritingCenterContent.tsx`, add the export logic. Replace the placeholder `handleExportPdf` and add `handleExportPng`:

```typescript
import jsPDF from 'jspdf'
import { createTLStore, loadSnapshot, Tldraw, getSnapshot } from 'tldraw'

// Add these as utility functions inside the component or as module-level helpers:

const exportPageAsBlob = async (
  page: HandwritingPage,
  pageWidth: number,
  pageHeight: number,
  format: 'png' | 'jpeg' = 'png',
): Promise<Blob | null> => {
  // Create an offscreen tldraw store, load snapshot, export
  // This is a simplified approach — may need to use the editor instance directly
  // For now, we'll use the current editor's export capability
  return null // Placeholder — see step 3 for the actual approach
}
```

The cleanest approach is to store an editor ref and use it for export. Update `HandwritingEditor.tsx` to expose the editor via a ref:

Add to `HandwritingEditor.tsx`:
```typescript
export interface HandwritingEditorHandle {
  getEditor: () => Editor | null
}
```

Use `useImperativeHandle` + `forwardRef` to expose the editor instance. Then in `HandwritingCenterContent`, use the ref to call `editor.toImage()` for each page.

Full export implementation in `HandwritingCenterContent.tsx`:

```typescript
const editorRef = useRef<HandwritingEditorHandle>(null)

const handleExportPdf = useCallback(async () => {
  setExportMenuOpen(false)
  const editor = editorRef.current?.getEditor()
  if (!editor) return

  const { default: jsPDF } = await import('jspdf')
  const pdf = new jsPDF({
    orientation: pageSize.width > pageSize.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [pageSize.width, pageSize.height],
  })

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage()

    // Switch to page, wait for render, export
    if (i !== currentPageIndex) {
      setCurrentPage(i)
      await new Promise(r => setTimeout(r, 200))
    }

    const shapeIds = editor.getCurrentPageShapeIds()
    if (shapeIds.size > 0) {
      const result = await editor.toImage(shapeIds, { format: 'png', pixelRatio: 2, background: true })
      if (result) {
        const url = URL.createObjectURL(result.blob)
        pdf.addImage(url, 'PNG', 0, 0, pageSize.width, pageSize.height)
        URL.revokeObjectURL(url)
      }
    }
  }

  const blob = pdf.output('blob')
  const buffer = await blob.arrayBuffer()
  await window.electronAPI.export.saveFile({
    data: Array.from(new Uint8Array(buffer)),
    filename: `${title}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
}, [pages, pageSize, title, currentPageIndex])

const handleExportPng = useCallback(async () => {
  setExportMenuOpen(false)
  const editor = editorRef.current?.getEditor()
  if (!editor) return

  const shapeIds = editor.getCurrentPageShapeIds()
  if (shapeIds.size === 0) return

  const result = await editor.toImage(shapeIds, { format: 'png', pixelRatio: 2, background: true })
  if (result) {
    const buffer = await result.blob.arrayBuffer()
    await window.electronAPI.export.saveFile({
      data: Array.from(new Uint8Array(buffer)),
      filename: `${title}-page${currentPageIndex + 1}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    })
  }
}, [title, currentPageIndex])
```

**Note:** The exact export API (`window.electronAPI.export.saveFile`) may differ from the existing codebase. Check the actual preload API for file saving. The existing code uses `window.electronAPI.export.markdown` and `window.electronAPI.export.pdf` — adapt to match those patterns.

- [ ] **Step 3: Verify export works**

1. Draw on multiple pages
2. Click Export → PDF, verify multi-page PDF is generated
3. Click Export → PNG, verify current page is exported

- [ ] **Step 4: Commit**

```bash
git add packages/app/package.json pnpm-lock.yaml packages/app/src/renderer/components/handwriting/HandwritingCenterContent.tsx packages/app/src/renderer/components/handwriting/HandwritingEditor.tsx
git commit -m "feat(handwriting): add PDF and PNG export via jspdf"
```
