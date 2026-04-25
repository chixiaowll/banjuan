# Phase 2: Readers/Viewers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add document viewing capabilities — PDF, EPUB, text/markdown, image, and video viewers — with navigation from the document library to the appropriate viewer.

**Architecture:** Each viewer is a React component. A `DocumentViewer` container routes to the correct viewer based on document type. The app reads files directly from the library's `documents/` directory via IPC.

**Tech Stack:** PDF.js, epub.js, React, Electron IPC

---

## File Structure

```
packages/app/src/renderer/
├── components/
│   ├── Sidebar.tsx              # Left nav (library, back button)
│   ├── DocumentList.tsx         # Document grid (extracted from LibraryView)
│   ├── DocumentCard.tsx         # Single document card
│   └── viewers/
│       ├── DocumentViewer.tsx   # Router: picks viewer by doc type
│       ├── PdfViewer.tsx        # PDF.js based
│       ├── EpubViewer.tsx       # epub.js based
│       ├── TextViewer.tsx       # Plain text + syntax highlight
│       ├── MarkdownViewer.tsx   # Rendered markdown (read-only)
│       ├── ImageViewer.tsx      # Image with zoom/rotate
│       └── VideoViewer.tsx      # HTML5 video player
├── views/
│   ├── WelcomeView.tsx          # (existing)
│   └── LibraryView.tsx          # (refactored: add viewer navigation)
└── hooks/
    └── useIpc.ts                # Typed IPC hooks
```

---

## Task 1: IPC for File Access + Navigation State

**Files:**
- Modify: `packages/app/src/main/ipc.ts`
- Modify: `packages/app/src/preload/index.ts`
- Modify: `packages/app/electron.d.ts`
- Modify: `packages/app/src/renderer/App.tsx`
- Modify: `packages/app/src/renderer/views/LibraryView.tsx`

- [ ] **Step 1: Add file path IPC handler**

In `packages/app/src/main/ipc.ts`, add handler to resolve document file paths:

```typescript
ipcMain.handle('documents:getFilePath', async (_event, relativePath: string) => {
  if (!library) throw new Error('No library open')
  return join(library.rootPath, 'documents', relativePath)
})
```

- [ ] **Step 2: Update preload and types**

In preload, add:
```typescript
getFilePath: (relativePath: string) => ipcRenderer.invoke('documents:getFilePath', relativePath),
```

In `electron.d.ts`, add to documents interface:
```typescript
getFilePath: (relativePath: string) => Promise<string>
```

- [ ] **Step 3: Add navigation state to App.tsx**

Refactor App to support viewing a document:

```typescript
// App.tsx — add viewingDoc state
const [viewingDoc, setViewingDoc] = useState<any>(null)

if (!libraryPath) return <WelcomeView onOpen={setLibraryPath} />
if (viewingDoc) return <DocumentViewer doc={viewingDoc} onBack={() => setViewingDoc(null)} />
return <LibraryView rootPath={libraryPath} onOpenDoc={setViewingDoc} />
```

- [ ] **Step 4: Add click handler to LibraryView**

Document cards should call `onOpenDoc(doc)` on click.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(app): add file path IPC and document navigation state"
```

---

## Task 2: DocumentViewer Router + PdfViewer

**Files:**
- Create: `packages/app/src/renderer/components/viewers/DocumentViewer.tsx`
- Create: `packages/app/src/renderer/components/viewers/PdfViewer.tsx`

- [ ] **Step 1: Install pdfjs-dist**

```bash
pnpm --filter @banjuan/app add pdfjs-dist
```

- [ ] **Step 2: Create DocumentViewer router**

```typescript
// DocumentViewer.tsx
import React, { useEffect, useState } from 'react'
import PdfViewer from './PdfViewer.js'
// other viewers imported later

interface Props {
  doc: { id: string; title: string; type: string; path: string }
  onBack: () => void
}

export default function DocumentViewer({ doc, onBack }: Props) {
  const [filePath, setFilePath] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.documents.getFilePath(doc.path).then(setFilePath)
  }, [doc.path])

  if (!filePath) return <div>Loading...</div>

  const viewer = (() => {
    switch (doc.type) {
      case 'pdf': return <PdfViewer filePath={filePath} />
      case 'txt': return <div style={{ padding: 24, whiteSpace: 'pre-wrap' }}>Loading text viewer...</div>
      default: return <div style={{ padding: 24 }}>Unsupported type: {doc.type}</div>
    }
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <button onClick={onBack}>← 返回</button>
        <span style={{ fontWeight: 500 }}>{doc.title}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{doc.type.toUpperCase()}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {viewer}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create PdfViewer**

```typescript
// PdfViewer.tsx — uses pdfjs-dist to render PDF pages into canvas elements
import React, { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

interface Props {
  filePath: string
}

export default function PdfViewer({ filePath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadPdf = async () => {
      // Load from file:// URL for Electron
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
    if (!pdfDoc || !containerRef.current) return
    const container = containerRef.current
    container.innerHTML = ''

    const renderPages = async () => {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.display = 'block'
        canvas.style.margin = '8px auto'
        container.appendChild(canvas)

        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport }).promise
      }
    }
    renderPages()
  }, [pdfDoc, scale])

  return (
    <div>
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: '8px', alignItems: 'center',
      }}>
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))}>−</button>
        <span style={{ fontSize: 12 }}>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.25))}>+</button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
          {numPages} pages
        </span>
      </div>
      <div ref={containerRef} style={{ background: '#525659', minHeight: '100%' }} />
    </div>
  )
}
```

- [ ] **Step 4: Verify — open a PDF in the app**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(app): DocumentViewer router and PDF.js viewer"
```

---

## Task 3: Text and Markdown Viewers

**Files:**
- Create: `packages/app/src/renderer/components/viewers/TextViewer.tsx`
- Create: `packages/app/src/renderer/components/viewers/MarkdownViewer.tsx`
- Modify: `packages/app/src/renderer/components/viewers/DocumentViewer.tsx`

- [ ] **Step 1: Add IPC to read file content**

In `ipc.ts`:
```typescript
ipcMain.handle('documents:readContent', async (_event, relativePath: string) => {
  if (!library) throw new Error('No library open')
  const fullPath = join(library.rootPath, 'documents', relativePath)
  return readFileSync(fullPath, 'utf-8')
})
```

Update preload and types accordingly.

- [ ] **Step 2: Create TextViewer**

Simple component that reads text content and renders with line numbers. Monospace font, dark background.

- [ ] **Step 3: Install and create MarkdownViewer**

```bash
pnpm --filter @banjuan/app add react-markdown remark-gfm
```

Use `react-markdown` with `remark-gfm` for rendered markdown display. Read-only mode.

- [ ] **Step 4: Wire into DocumentViewer**

Add cases for 'txt', 'md', 'html' in the switch statement.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(app): text and markdown viewers"
```

---

## Task 4: Image Viewer

**Files:**
- Create: `packages/app/src/renderer/components/viewers/ImageViewer.tsx`
- Modify: `packages/app/src/renderer/components/viewers/DocumentViewer.tsx`

- [ ] **Step 1: Create ImageViewer**

Component with:
- Image rendered via `<img>` tag with `file://` src
- Zoom controls (fit, 100%, +/-)
- Rotate button (90° increments)
- Pan via click-drag when zoomed in

Use CSS transforms for zoom and rotate.

- [ ] **Step 2: Wire into DocumentViewer**

Add case for 'image' type.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(app): image viewer with zoom and rotate"
```

---

## Task 5: Video Player

**Files:**
- Create: `packages/app/src/renderer/components/viewers/VideoViewer.tsx`
- Modify: `packages/app/src/renderer/components/viewers/DocumentViewer.tsx`

- [ ] **Step 1: Create VideoViewer**

Component using HTML5 `<video>` element:
- Play/pause, progress bar, volume
- Playback speed selector (0.5x, 1x, 1.5x, 2x)
- Current time display
- Fullscreen toggle
- Uses `file://` protocol for source

- [ ] **Step 2: Wire into DocumentViewer**

Add case for 'video' type.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(app): video player with speed control"
```

---

## Task 6: EPUB Viewer

**Files:**
- Create: `packages/app/src/renderer/components/viewers/EpubViewer.tsx`
- Modify: `packages/app/src/renderer/components/viewers/DocumentViewer.tsx`

- [ ] **Step 1: Install epub.js**

```bash
pnpm --filter @banjuan/app add epubjs
```

- [ ] **Step 2: Create EpubViewer**

Component that:
- Loads EPUB via epub.js `ePub()` constructor
- Renders into a container div with `book.renderTo()`
- Previous/next chapter navigation buttons
- Table of contents sidebar (from `book.loaded.navigation`)
- Font size controls

- [ ] **Step 3: Wire into DocumentViewer**

Add case for 'epub' type.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(app): EPUB viewer with chapter navigation"
```

---

## Task 7: Final Integration

- [ ] **Step 1: Test all viewers**

Import one file of each supported type and verify each viewer works:
- PDF → scrollable pages with zoom
- TXT → monospace text
- MD → rendered markdown
- Image (JPG/PNG) → zoomable image
- Video (MP4) → playable video
- EPUB → readable chapters

- [ ] **Step 2: Verify core tests still pass**

```bash
pnpm --filter @banjuan/core test
```

- [ ] **Step 3: Final commit**

```bash
git commit -m "feat: Phase 2 complete — all document viewers"
```
