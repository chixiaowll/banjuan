# Phase 3: Annotation System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add annotation capabilities to the document viewers — text highlighting for PDF, annotation IPC bridge, annotation sidebar, and floating toolbar — so users can create, view, and manage highlights and notes on their documents.

**Architecture:** Annotations are created via `@banjuan/core` AnnotationService (already built). The app needs IPC handlers to expose annotation CRUD to the renderer, a floating selection toolbar that appears on text select, and an annotation sidebar panel. Phase 3 focuses on PDF text highlighting as the primary use case; other document types get annotation support in later phases.

**Tech Stack:** React, PDF.js text layer, Electron IPC, existing @banjuan/core AnnotationService

---

## File Structure

```
packages/app/src/
├── main/
│   └── ipc.ts                          # Add annotation IPC handlers
├── preload/
│   └── index.ts                        # Add annotations namespace
├── renderer/
│   ├── components/
│   │   ├── viewers/
│   │   │   ├── DocumentViewer.tsx       # Pass docId to viewers, add sidebar
│   │   │   └── PdfViewer.tsx           # Add text layer + highlight overlay
│   │   └── annotations/
│   │       ├── AnnotationSidebar.tsx   # Right sidebar listing annotations
│   │       ├── SelectionToolbar.tsx    # Floating toolbar on text select
│   │       └── HighlightLayer.tsx     # SVG overlay for rendering highlights
│   └── hooks/
│       └── useAnnotations.ts          # Shared annotation state hook
├── electron.d.ts                       # Add annotations types
```

---

## Task 1: Annotation IPC Bridge

**Files:**
- Modify: `packages/app/src/main/ipc.ts`
- Modify: `packages/app/src/preload/index.ts`
- Modify: `packages/app/electron.d.ts`

- [ ] **Step 1: Add annotation IPC handlers in ipc.ts**

Add these handlers after the existing tag handlers:

```typescript
ipcMain.handle('annotations:create', async (_event, input: {
  docId: string; type: string; page?: number;
  position: unknown; content?: string; selectedText?: string; color?: string
}) => {
  if (!library) throw new Error('No library open')
  return library.annotations.create(input as any)
})

ipcMain.handle('annotations:list', async (_event, options: {
  docId: string; page?: number; type?: string; color?: string
}) => {
  if (!library) throw new Error('No library open')
  return library.annotations.list(options as any)
})

ipcMain.handle('annotations:get', async (_event, id: string) => {
  if (!library) throw new Error('No library open')
  return library.annotations.get(id)
})

ipcMain.handle('annotations:update', async (_event, id: string, updates: {
  content?: string; color?: string
}) => {
  if (!library) throw new Error('No library open')
  return library.annotations.update(id, updates)
})

ipcMain.handle('annotations:delete', async (_event, id: string) => {
  if (!library) throw new Error('No library open')
  return library.annotations.delete(id)
})
```

- [ ] **Step 2: Add annotations to preload**

In `packages/app/src/preload/index.ts`, add to the api object:

```typescript
annotations: {
  create: (input: {
    docId: string; type: string; page?: number;
    position: unknown; content?: string; selectedText?: string; color?: string
  }) => ipcRenderer.invoke('annotations:create', input),
  list: (options: { docId: string; page?: number; type?: string; color?: string }) =>
    ipcRenderer.invoke('annotations:list', options),
  get: (id: string) => ipcRenderer.invoke('annotations:get', id),
  update: (id: string, updates: { content?: string; color?: string }) =>
    ipcRenderer.invoke('annotations:update', id, updates),
  delete: (id: string) => ipcRenderer.invoke('annotations:delete', id),
},
```

- [ ] **Step 3: Update electron.d.ts**

Add to the ElectronAPI interface:

```typescript
annotations: {
  create: (input: {
    docId: string; type: string; page?: number;
    position: unknown; content?: string; selectedText?: string; color?: string
  }) => Promise<any>
  list: (options: { docId: string; page?: number; type?: string; color?: string }) => Promise<any[]>
  get: (id: string) => Promise<any>
  update: (id: string, updates: { content?: string; color?: string }) => Promise<any>
  delete: (id: string) => Promise<void>
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(app): add annotation IPC handlers"
```

---

## Task 2: useAnnotations Hook

**Files:**
- Create: `packages/app/src/renderer/hooks/useAnnotations.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useState, useEffect, useCallback } from 'react'

interface Annotation {
  id: string
  docId: string
  type: string
  page: number | null
  position: any
  content: string | null
  selectedText: string | null
  color: string
  createdAt: string
  updatedAt: string
}

interface CreateInput {
  docId: string
  type: string
  page?: number
  position: unknown
  content?: string
  selectedText?: string
  color?: string
}

export function useAnnotations(docId: string) {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const list = await window.electronAPI.annotations.list({ docId })
    setAnnotations(list)
    setLoading(false)
  }, [docId])

  useEffect(() => { reload() }, [reload])

  const create = useCallback(async (input: Omit<CreateInput, 'docId'>) => {
    const ann = await window.electronAPI.annotations.create({ ...input, docId })
    await reload()
    return ann
  }, [docId, reload])

  const update = useCallback(async (id: string, updates: { content?: string; color?: string }) => {
    const ann = await window.electronAPI.annotations.update(id, updates)
    await reload()
    return ann
  }, [reload])

  const remove = useCallback(async (id: string) => {
    await window.electronAPI.annotations.delete(id)
    await reload()
  }, [reload])

  return { annotations, loading, create, update, remove, reload }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(app): useAnnotations hook for shared annotation state"
```

---

## Task 3: PDF Text Layer + Highlight Rendering

**Files:**
- Modify: `packages/app/src/renderer/components/viewers/PdfViewer.tsx`
- Create: `packages/app/src/renderer/components/annotations/HighlightLayer.tsx`

This is the most complex task. The PDF viewer needs:
1. A text layer over each page (for text selection)
2. A highlight overlay that renders existing annotations
3. The ability to detect text selection and report it back

- [ ] **Step 1: Create HighlightLayer component**

This component renders highlight rectangles over a PDF page using absolute positioning.

```typescript
// HighlightLayer.tsx
import React from 'react'

interface HighlightRect {
  x: number
  y: number
  w: number
  h: number
}

interface Highlight {
  id: string
  color: string
  rects: HighlightRect[]
}

interface Props {
  highlights: Highlight[]
  scale: number
  onHighlightClick?: (id: string) => void
}

export default function HighlightLayer({ highlights, scale, onHighlightClick }: Props) {
  return (
    <>
      {highlights.map((hl) =>
        hl.rects.map((rect, i) => (
          <div
            key={`${hl.id}-${i}`}
            onClick={(e) => {
              e.stopPropagation()
              onHighlightClick?.(hl.id)
            }}
            style={{
              position: 'absolute',
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.w * scale,
              height: rect.h * scale,
              backgroundColor: hl.color,
              opacity: 0.35,
              mixBlendMode: 'multiply',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          />
        )),
      )}
    </>
  )
}
```

- [ ] **Step 2: Refactor PdfViewer to use page-based rendering with text layer**

Replace the current PdfViewer that renders all pages into a single container using `container.innerHTML = ''` with a React-based approach where each page is a component with its own canvas, text layer, and highlight overlay.

The new PdfViewer structure:

```typescript
// PdfViewer.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import HighlightLayer from '../annotations/HighlightLayer.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

interface Props {
  filePath: string
  docId: string
  annotations: Array<{
    id: string
    page: number | null
    position: any
    color: string
  }>
  onTextSelect?: (info: {
    page: number
    rects: Array<{ x: number; y: number; w: number; h: number }>
    text: string
    clientRect: DOMRect
  }) => void
  onHighlightClick?: (id: string) => void
}

export default function PdfViewer({ filePath, docId, annotations, onTextSelect, onHighlightClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [renderedPages, setRenderedPages] = useState<Map<number, { canvas: HTMLCanvasElement; textContent: any; viewport: any }>>(new Map())

  useEffect(() => {
    let cancelled = false
    const loadPdf = async () => {
      const url = `file://${filePath}`
      const doc = await pdfjsLib.getDocument(url).promise
      if (!cancelled) {
        setPdfDoc(doc)
        setNumPages(doc.numPages)
      }
    }
    loadPdf()
    return () => { cancelled = true }
  }, [filePath])

  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false

    const renderAll = async () => {
      const pages = new Map()
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (cancelled) return
        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport, canvas }).promise
        const textContent = await page.getTextContent()
        pages.set(i, { canvas, textContent, viewport })
      }
      if (!cancelled) setRenderedPages(pages)
    }
    renderAll()
    return () => { cancelled = true }
  }, [pdfDoc, scale])

  const handleMouseUp = useCallback((pageNum: number, viewport: any) => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return

    const text = selection.toString()
    const range = selection.getRangeAt(0)
    const clientRects = range.getClientRects()

    // Find the page container to calculate relative positions
    const pageEl = containerRef.current?.querySelector(`[data-page="${pageNum}"]`)
    if (!pageEl) return
    const pageBounds = pageEl.getBoundingClientRect()

    const rects = Array.from(clientRects).map((r) => ({
      x: (r.left - pageBounds.left) / scale,
      y: (r.top - pageBounds.top) / scale,
      w: r.width / scale,
      h: r.height / scale,
    }))

    const selectionRect = range.getBoundingClientRect()
    onTextSelect?.({ page: pageNum, rects, text, clientRect: selectionRect })
  }, [scale, onTextSelect])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0,
      }}>
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))}>−</button>
        <span style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.25))}>+</button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{numPages} pages</span>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto', background: '#525659' }}>
        {Array.from(renderedPages.entries()).map(([pageNum, { canvas, textContent, viewport }]) => (
          <PdfPage
            key={pageNum}
            pageNum={pageNum}
            canvas={canvas}
            textContent={textContent}
            viewport={viewport}
            scale={scale}
            highlights={(annotations || [])
              .filter((a) => a.page === pageNum && a.position?.rects)
              .map((a) => ({ id: a.id, color: a.color, rects: a.position.rects }))
            }
            onMouseUp={() => handleMouseUp(pageNum, viewport)}
            onHighlightClick={onHighlightClick}
          />
        ))}
      </div>
    </div>
  )
}

interface PdfPageProps {
  pageNum: number
  canvas: HTMLCanvasElement
  textContent: any
  viewport: any
  scale: number
  highlights: Array<{ id: string; color: string; rects: Array<{ x: number; y: number; w: number; h: number }> }>
  onMouseUp: () => void
  onHighlightClick?: (id: string) => void
}

function PdfPage({ pageNum, canvas, textContent, viewport, scale, highlights, onMouseUp, onHighlightClick }: PdfPageProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!canvasContainerRef.current) return
    canvasContainerRef.current.innerHTML = ''
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvasContainerRef.current.appendChild(canvas)
  }, [canvas])

  useEffect(() => {
    if (!textLayerRef.current || !textContent) return
    const container = textLayerRef.current
    container.innerHTML = ''

    for (const item of textContent.items) {
      if (!('str' in item) || !item.str) continue
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
      const span = document.createElement('span')
      span.textContent = item.str
      span.style.position = 'absolute'
      span.style.left = `${tx[4]}px`
      span.style.top = `${tx[5] - item.height * scale}px`
      span.style.fontSize = `${item.height * scale}px`
      span.style.fontFamily = 'sans-serif'
      span.style.color = 'transparent'
      span.style.whiteSpace = 'pre'
      if (item.width) {
        span.style.width = `${item.width * scale}px`
        span.style.letterSpacing = '0'
        span.style.display = 'inline-block'
      }
      container.appendChild(span)
    }
  }, [textContent, viewport, scale])

  return (
    <div
      data-page={pageNum}
      style={{
        position: 'relative',
        width: viewport.width,
        height: viewport.height,
        margin: '8px auto',
      }}
      onMouseUp={onMouseUp}
    >
      <div ref={canvasContainerRef} style={{ position: 'absolute', inset: 0 }} />
      <div
        ref={textLayerRef}
        style={{ position: 'absolute', inset: 0, zIndex: 1, userSelect: 'text' }}
      />
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        <HighlightLayer highlights={highlights} scale={1} onHighlightClick={onHighlightClick} />
      </div>
    </div>
  )
}
```

Note: This is a significant refactor of PdfViewer. The key changes:
- Each page is now a `PdfPage` component with three layers: canvas, text, highlights
- Text layer enables text selection (transparent text over the canvas)
- HighlightLayer renders annotation rectangles over selected regions
- `onTextSelect` callback provides selection info for the toolbar
- `annotations` prop provides existing highlights to render
- `docId` prop used for context

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(app): PDF text layer and highlight rendering"
```

---

## Task 4: Selection Toolbar

**Files:**
- Create: `packages/app/src/renderer/components/annotations/SelectionToolbar.tsx`

- [ ] **Step 1: Create SelectionToolbar component**

A floating toolbar that appears near text selection, offering highlight colors and a note button.

```typescript
// SelectionToolbar.tsx
import React from 'react'

const COLORS = [
  { name: 'yellow', value: '#fde68a' },
  { name: 'green', value: '#86efac' },
  { name: 'blue', value: '#93c5fd' },
  { name: 'pink', value: '#f9a8d4' },
  { name: 'orange', value: '#fed7aa' },
]

interface Props {
  position: { x: number; y: number }
  onHighlight: (color: string) => void
  onNote: () => void
  onDismiss: () => void
}

export default function SelectionToolbar({ position, onHighlight, onNote, onDismiss }: Props) {
  return (
    <>
      {/* Invisible backdrop to dismiss on click outside */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
        onClick={onDismiss}
      />
      <div style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
        background: 'var(--surface, #1e1e2e)',
        border: '1px solid var(--border, #45475a)',
        borderRadius: 8,
        padding: '6px 8px',
        display: 'flex',
        gap: '6px',
        alignItems: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}>
        {COLORS.map((c) => (
          <button
            key={c.name}
            onClick={() => onHighlight(c.value)}
            title={c.name}
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: c.value,
              border: '2px solid transparent',
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <button
          onClick={onNote}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text, #cdd6f4)',
            cursor: 'pointer',
            fontSize: 13,
            padding: '2px 6px',
          }}
        >
          📝 批注
        </button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(app): floating selection toolbar for annotations"
```

---

## Task 5: Annotation Sidebar

**Files:**
- Create: `packages/app/src/renderer/components/annotations/AnnotationSidebar.tsx`

- [ ] **Step 1: Create AnnotationSidebar component**

Right sidebar panel that lists all annotations for the current document, grouped by page.

```typescript
// AnnotationSidebar.tsx
import React, { useState } from 'react'

interface Annotation {
  id: string
  type: string
  page: number | null
  content: string | null
  selectedText: string | null
  color: string
  createdAt: string
}

interface Props {
  annotations: Annotation[]
  onAnnotationClick: (id: string) => void
  onAnnotationDelete: (id: string) => void
  onAnnotationUpdate: (id: string, updates: { content?: string; color?: string }) => void
}

export default function AnnotationSidebar({ annotations, onAnnotationClick, onAnnotationDelete, onAnnotationUpdate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const grouped = new Map<number | null, Annotation[]>()
  for (const ann of annotations) {
    const key = ann.page
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(ann)
  }

  const sortedKeys = Array.from(grouped.keys()).sort((a, b) => (a ?? 0) - (b ?? 0))

  const startEdit = (ann: Annotation) => {
    setEditingId(ann.id)
    setEditContent(ann.content ?? '')
  }

  const saveEdit = (id: string) => {
    onAnnotationUpdate(id, { content: editContent })
    setEditingId(null)
  }

  return (
    <div style={{
      width: 280,
      borderLeft: '1px solid var(--border)',
      overflow: 'auto',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        fontWeight: 600,
        fontSize: 14,
      }}>
        标注 ({annotations.length})
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {sortedKeys.map((pageKey) => (
          <div key={pageKey ?? 'none'}>
            {pageKey !== null && (
              <div style={{
                padding: '8px 16px 4px',
                fontSize: 11,
                color: 'var(--text-muted)',
                fontWeight: 600,
              }}>
                第 {pageKey} 页
              </div>
            )}
            {grouped.get(pageKey)!.map((ann) => (
              <div
                key={ann.id}
                style={{
                  padding: '8px 16px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
                onClick={() => onAnnotationClick(ann.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 2,
                    background: ann.color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {ann.type === 'highlight' ? '高亮' : ann.type === 'note' ? '批注' : ann.type}
                  </span>
                </div>
                {ann.selectedText && (
                  <div style={{
                    fontSize: 12,
                    color: 'var(--text)',
                    borderLeft: `3px solid ${ann.color}`,
                    paddingLeft: 8,
                    marginBottom: 4,
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {ann.selectedText}
                  </div>
                )}
                {editingId === ann.id ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      style={{
                        width: '100%', fontSize: 12, padding: 4,
                        background: 'var(--surface)', color: 'var(--text)',
                        border: '1px solid var(--border)', borderRadius: 4,
                        resize: 'vertical', minHeight: 50,
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button style={{ fontSize: 11 }} onClick={() => saveEdit(ann.id)}>保存</button>
                      <button style={{ fontSize: 11 }} onClick={() => setEditingId(null)}>取消</button>
                    </div>
                  </div>
                ) : ann.content ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {ann.content}
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(ann) }}
                    style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    编辑
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAnnotationDelete(ann.id) }}
                    style={{ fontSize: 11, color: '#f38ba8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
        {annotations.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
            选中文本后即可创建标注
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(app): annotation sidebar with grouped display and edit"
```

---

## Task 6: Wire Everything Together in DocumentViewer

**Files:**
- Modify: `packages/app/src/renderer/components/viewers/DocumentViewer.tsx`

This task integrates all annotation components into the DocumentViewer. The viewer now:
1. Loads annotations via useAnnotations hook
2. Shows a toggle for the annotation sidebar
3. Passes annotations + callbacks to PdfViewer
4. Shows SelectionToolbar on text selection
5. Creates highlights when a color is picked

- [ ] **Step 1: Update DocumentViewer to integrate annotations**

```typescript
// DocumentViewer.tsx — full replacement
import React, { useEffect, useState, useCallback } from 'react'
import PdfViewer from './PdfViewer.js'
import TextViewer from './TextViewer.js'
import MarkdownViewer from './MarkdownViewer.js'
import ImageViewer from './ImageViewer.js'
import VideoViewer from './VideoViewer.js'
import EpubViewer from './EpubViewer.js'
import AnnotationSidebar from '../annotations/AnnotationSidebar.js'
import SelectionToolbar from '../annotations/SelectionToolbar.js'
import { useAnnotations } from '../../hooks/useAnnotations.js'

interface DocInfo {
  id: string
  title: string
  type: string
  path: string
}

interface Props {
  doc: DocInfo
  onBack: () => void
}

interface SelectionInfo {
  page: number
  rects: Array<{ x: number; y: number; w: number; h: number }>
  text: string
  clientRect: DOMRect
}

export default function DocumentViewer({ doc, onBack }: Props) {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const { annotations, create, update, remove } = useAnnotations(doc.id)

  useEffect(() => {
    window.electronAPI.documents.getFilePath(doc.path).then(setFilePath)
  }, [doc.path])

  const handleTextSelect = useCallback((info: SelectionInfo) => {
    setSelection(info)
  }, [])

  const handleHighlight = useCallback(async (color: string) => {
    if (!selection) return
    await create({
      type: 'highlight',
      page: selection.page,
      position: { type: 'pdf', page: selection.page, rects: selection.rects, text: selection.text },
      selectedText: selection.text,
      color,
    })
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [selection, create])

  const handleNote = useCallback(async () => {
    if (!selection) return
    const content = prompt('输入批注内容：')
    if (content === null) return
    await create({
      type: 'note',
      page: selection.page,
      position: { type: 'pdf', page: selection.page, rects: selection.rects, text: selection.text },
      selectedText: selection.text,
      content,
      color: '#fde68a',
    })
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [selection, create])

  if (!filePath) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      Loading...
    </div>
  }

  const renderViewer = () => {
    switch (doc.type) {
      case 'pdf':
        return (
          <PdfViewer
            filePath={filePath}
            docId={doc.id}
            annotations={annotations}
            onTextSelect={handleTextSelect}
            onHighlightClick={(id) => {
              setShowSidebar(true)
            }}
          />
        )
      case 'txt':
        return <TextViewer docPath={doc.path} />
      case 'md':
        return <MarkdownViewer docPath={doc.path} />
      case 'html':
        return <TextViewer docPath={doc.path} />
      case 'image':
        return <ImageViewer filePath={filePath} />
      case 'video':
        return <VideoViewer filePath={filePath} />
      case 'epub':
        return <EpubViewer filePath={filePath} />
      default:
        return <div style={{ padding: 24 }}>Unsupported document type: {doc.type}</div>
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        <button onClick={onBack}>← 返回</button>
        <span style={{ fontWeight: 500 }}>{doc.title}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{doc.type.toUpperCase()}</span>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => setShowSidebar(s => !s)}>
            {showSidebar ? '隐藏标注' : '标注'}
            {annotations.length > 0 && ` (${annotations.length})`}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {renderViewer()}
        </div>
        {showSidebar && (
          <AnnotationSidebar
            annotations={annotations}
            onAnnotationClick={() => {}}
            onAnnotationDelete={remove}
            onAnnotationUpdate={update}
          />
        )}
      </div>

      {selection && (
        <SelectionToolbar
          position={{
            x: selection.clientRect.left + selection.clientRect.width / 2 - 100,
            y: selection.clientRect.top - 50,
          }}
          onHighlight={handleHighlight}
          onNote={handleNote}
          onDismiss={() => setSelection(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(app): integrate annotations into DocumentViewer"
```

---

## Task 7: Final Integration + Verification

- [ ] **Step 1: Run core tests**

```bash
pnpm --filter @banjuan/core test
```

Expected: All 42 tests pass.

- [ ] **Step 2: Verify TypeScript compiles for both packages**

```bash
pnpm --filter @banjuan/core exec tsc --noEmit
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 3: Manual verification checklist**

Start the app (`pnpm --filter @banjuan/core build && pnpm --filter @banjuan/app dev`):
- Open a PDF document
- Select text → floating toolbar appears with color circles and note button
- Click a color → text gets highlighted, highlight persists on re-render
- Click "批注" → enter note text → annotation with note created
- Click "标注" button in header → sidebar opens showing all annotations
- Annotations grouped by page with selected text preview
- Edit annotation content via sidebar
- Delete annotation via sidebar
- Zoom in/out → highlights scale correctly with the PDF

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: Phase 3 complete — PDF annotation system"
```
