# PDF Viewer Zotero-Style Layout Redesign

## Overview

Redesign the PDF viewer to match Zotero's reader layout: title bar tabs for multi-document/note opening, a unified toolbar, collapsible left sidebar (thumbnails/outline/annotations/notes), scrollable PDF content, and a collapsible right sidebar (document info + editable metadata). Includes full annotation toolset (highlight, text, area, ink, eraser) and full-text search with floating popup.

## Architecture

### Component Tree

```
App
└── TabManager (title bar + tab content)
    ├── TitleBar (custom, embedded tabs)
    │   └── TabBar (library tab fixed + document/note tabs closable)
    ├── LibraryView (when library tab active)
    ├── PdfViewer (when document tab active, one per tab, independent state)
    │   ├── PdfViewerContext.Provider
    │   ├── PdfToolbar (single row, full width)
    │   │   ├── Left: sidebar toggle, zoom controls, reset
    │   │   ├── Center: page nav, annotation tools, color picker
    │   │   └── Right: search button, right sidebar toggle
    │   ├── PdfLeftSidebar (collapsible, 240px)
    │   │   ├── ThumbnailPanel
    │   │   ├── OutlinePanel
    │   │   ├── AnnotationPanel
    │   │   └── NotesPanel
    │   ├── PdfContentArea
    │   │   ├── PdfPageList (scroll container with lazy-rendered PdfPage)
    │   │   ├── AnnotationOverlay (per-page, tool-specific interaction layers)
    │   │   └── SearchHighlightLayer (per-page, search match rendering)
    │   ├── PdfInfoSidebar (collapsible, 280px)
    │   └── SearchPopup (floating)
    └── NoteEditor (when note tab active)
```

### New Files

```
packages/app/src/renderer/
├── components/
│   ├── TabManager.tsx              # Top-level tab manager + title bar
│   ├── TitleBar.tsx                # Custom title bar with tabs
│   ├── viewers/
│   │   ├── PdfViewer.tsx           # Refactored: layout orchestrator
│   │   ├── PdfViewerContext.tsx     # React context for shared PDF state
│   │   ├── PdfToolbar.tsx          # Unified toolbar (single row)
│   │   ├── PdfLeftSidebar.tsx      # Left sidebar container with tab switching
│   │   ├── PdfInfoSidebar.tsx      # Right sidebar: doc info + metadata editor
│   │   ├── PdfContentArea.tsx      # Center: page list + overlays
│   │   ├── PdfPage.tsx             # Extracted from current PdfViewer
│   │   ├── ThumbnailPanel.tsx      # Lazy-loaded page thumbnails
│   │   ├── OutlinePanel.tsx        # PDF outline tree with navigation
│   │   ├── NotesPanel.tsx          # Document-linked notes list
│   │   ├── SearchPopup.tsx         # Floating search with options
│   │   ├── SearchHighlightLayer.tsx # Per-page search match rendering
│   │   └── annotations/
│   │       ├── AnnotationToolbar.tsx  # Tool buttons + color picker
│   │       ├── HighlightTool.tsx      # Text highlight interaction
│   │       ├── TextNoteTool.tsx       # Point-click text note
│   │       ├── AreaSelectTool.tsx     # Rectangle area selection
│   │       ├── InkTool.tsx            # Freehand drawing canvas
│   │       └── EraserTool.tsx         # Click-to-delete annotation
```

## Detailed Design

### 1. TabManager & Title Bar

**Electron config:**
- `titleBarStyle: 'hidden'` to hide native title bar
- macOS: traffic lights preserved, 70px left padding for tabs
- Title bar height: ~38px

**Tab state:**

```typescript
interface Tab {
  id: string
  type: 'library' | 'document' | 'note'
  title: string
  closable: boolean       // library tab: false, others: true
  docId?: string          // for document tabs
  noteId?: string         // for note tabs
}

interface TabManagerState {
  tabs: Tab[]
  activeTabId: string
  openDocument: (doc: Document) => void
  openNote: (note: Note) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
}
```

**Behavior:**
- Library tab is always first, not closable
- Opening a document/note that's already open switches to that tab
- Inactive tabs use `display: none` (not unmounted) to preserve scroll/zoom state
- Tab overflow: horizontal scroll with hidden scrollbar, mouse wheel scrolls horizontally
- Active tab: white background; inactive: gray; hover: slightly lighter

### 2. PdfViewerContext

Each document tab gets its own independent context:

```typescript
interface PdfViewerState {
  // Document
  pdfDoc: PDFDocumentProxy | null
  numPages: number
  pageSizes: Array<{ w: number; h: number }>

  // Navigation
  currentPage: number
  scrollToPage: (page: number) => void

  // Zoom
  zoom: number
  setZoom: (z: number | ((prev: number) => number)) => void
  resetZoom: () => void

  // Sidebars
  leftSidebarOpen: boolean
  leftSidebarTab: 'thumbnails' | 'outline' | 'annotations' | 'notes'
  setLeftSidebarOpen: (open: boolean) => void
  setLeftSidebarTab: (tab: string) => void
  rightSidebarOpen: boolean
  setRightSidebarOpen: (open: boolean) => void

  // Annotation tool
  activeTool: 'none' | 'highlight' | 'text' | 'area' | 'ink' | 'eraser'
  setActiveTool: (tool: string) => void
  activeColor: string
  setActiveColor: (color: string) => void

  // Search
  searchOpen: boolean
  searchQuery: string
  searchOptions: { caseSensitive: boolean; wholeWord: boolean }
  searchMatches: SearchMatch[]
  currentMatchIndex: number
  setSearchOpen: (open: boolean) => void
  search: (query: string) => void
  setSearchOptions: (opts: Partial<SearchOptions>) => void
  nextMatch: () => void
  prevMatch: () => void

  // Annotations data
  annotations: AnnotationData[]
  createAnnotation: (...) => Promise<void>
  updateAnnotation: (...) => Promise<void>
  deleteAnnotation: (id: string) => Promise<void>

  // Refs
  scrollRef: RefObject<HTMLDivElement>
}
```

`currentPage` computed by monitoring scroll position against cumulative page heights.

### 3. PdfToolbar (Single Row)

Full-width toolbar, three sections:

```
[≡左栏][🔍+][🔍-][Reset]  [◀][▶] 33/866 [高亮][文本][区域][画笔][擦除] [🔴▾]  [搜索🔎][右栏≡]
 \___ left section ___/    \________________ center section _______________/  \___ right ___/
```

- Left section: left sidebar toggle, zoom out, zoom in, reset zoom (fit width)
- Center section: previous page, next page, page number input (editable), annotation tools, color picker
- Right section: search toggle, right sidebar toggle
- Page number input: type a number and press Enter to jump

### 4. Left Sidebar

Width: 240px, collapsible to 0 with CSS transition.

Four tabs shown as icon buttons at the top:
- Grid icon = Thumbnails
- List icon = Outline
- Highlight icon = Annotations
- Note icon = Notes

#### 4a. ThumbnailPanel
- Each page rendered as small canvas (~150px wide, height proportional)
- Lazy loading: IntersectionObserver, render only visible ± 1 viewport
- Current page has highlighted border (blue)
- Page number label below each thumbnail
- Click to scroll main content to that page

#### 4b. OutlinePanel
- `pdfDoc.getOutline()` returns nested array of `{ title, dest, items }`
- Render as collapsible tree (▶/▼ toggle for items with children)
- Click navigates: `pdfDoc.getDestination(dest)` → `pdfDoc.getPageIndex()` → `scrollToPage()`
- If no outline: show "No table of contents"

#### 4c. AnnotationPanel
- Reuse/refactor existing `AnnotationSidebar` logic
- Group annotations by page number
- Each annotation shows: color indicator, selected text preview, page number
- Click scrolls to annotation page and flashes the highlight
- Delete button, edit note button

#### 4d. NotesPanel
- Fetch via `window.electronAPI.notes.list({ docId })`
- Each note shows: title, created date
- Click triggers `onOpenNote` → opens in new tab
- "New Note" button at bottom: creates empty note linked to current document

### 5. Right Sidebar (PdfInfoSidebar)

Width: 280px, collapsible to 0 with CSS transition.

#### Fixed Fields
Label right-aligned gray, value left-aligned black (Zotero style):

| Label | Value | Editable |
|-------|-------|----------|
| Title | doc.title | Yes (click to edit, blur to save) |
| Author | doc.authors.join(', ') | Yes (comma-separated) |
| Type | doc.type | No |
| Path | doc.path (truncated, hover full) | No |
| Created | doc.createdAt | No |
| Updated | doc.updatedAt | No |

#### Custom Metadata
Below fixed fields, render all entries from `doc.metadata`:

- Each row: editable key + editable value + delete button (hover to show)
- "Add Field" button at bottom: adds empty key-value row
- Auto-save on change (debounce 500ms, calls document update API)

### 6. Annotation Tools

#### Tool Modes
Active tool state in context. Only one tool active at a time. Click active tool again to deactivate (back to `none`).

#### Color Picker
Positioned to the right of the tool buttons. Shows current color as a small circle. Click expands a palette:
- Warm yellow `#fde68a`
- Soft red `#fca5a5`
- Mint green `#86efac`
- Sky blue `#93c5fd`
- Light purple `#c4b5fd`

Shared across all color-dependent tools (highlight, ink, text note border).

#### Highlight Tool
- Cursor: text selection
- Select text → auto-create highlight annotation with active color
- Uses existing `chars[]` + `onTextSelect` logic
- No popup confirmation (direct creation)

#### Text Note Tool
- Cursor: crosshair
- Click on PDF → place sticky note icon at that position
- Click icon → popup textarea for editing
- Storage position type:

```typescript
interface PointPosition {
  type: 'point'
  page: number
  x: number  // PDF coordinates
  y: number
}
```

#### Area Select Tool
- Cursor: crosshair
- Drag to draw rectangle on page
- On release: capture area as annotation, optionally extract image from canvas via `getImageData`
- Storage position type:

```typescript
interface AreaPosition {
  type: 'area'
  page: number
  rect: { x: number; y: number; w: number; h: number }
  imageData?: string  // base64 screenshot, optional
}
```

#### Ink Tool
- Transparent canvas overlay on each page
- Mouse down → start path, mouse move → record points, mouse up → end stroke
- Storage position type:

```typescript
interface InkPosition {
  type: 'ink'
  page: number
  paths: Array<{
    points: Array<{ x: number; y: number }>
    color: string
    width: number
  }>
}
```

- Pen width: configurable (thin 1px, medium 2px, thick 4px) — small selector near color picker or in a sub-menu

#### Eraser Tool
- Cursor: eraser icon
- Hover over any annotation → red highlight preview
- Click → delete that annotation
- Works on all annotation types (highlights, text notes, areas, ink strokes)

### 7. Full-Text Search

#### Search Popup
Floating popup, appears at top-right of content area:

```
┌─────────────────────────────────┐
│ [搜索词_______________] [▲][▼] │
│ ☐ Case Sensitive  ☐ Whole Word │
│                      3/15  [×] │
└─────────────────────────────────┘
```

- Triggered by toolbar search button or Cmd/Ctrl+F
- Draggable position
- Esc or × to close, clears highlights

#### Search Implementation
- Build text index from `chars[]` per page (concatenate char.c)
- Match against query string with options (case sensitive, whole word)
- Results: `Array<{ page: number; charStart: number; charEnd: number }>`
- Debounce 300ms on input

#### Search Highlight Rendering
- All matches: semi-transparent yellow rectangles (using char rects)
- Current match: orange/deeper color
- ▲/▼ buttons cycle through matches, auto-scroll to current match page

### 8. Annotation Storage Extensions

Extend the existing annotation types to support new position types:

```typescript
type AnnotationPosition =
  | PdfPosition      // existing: highlight rects + text
  | PointPosition    // new: text note at a point
  | AreaPosition     // new: rectangle area selection
  | InkPosition      // new: freehand ink strokes
```

The `type` field on each position discriminates the union. Existing highlight annotations continue to work unchanged.

### 9. DocumentViewer Refactor

`DocumentViewer.tsx` simplifies significantly:
- Removes its own toolbar (back button, title, sidebar toggle)
- Removes `AnnotationSidebar` wrapper (moved into PdfLeftSidebar)
- Removes `SelectionToolbar` (replaced by annotation tool modes)
- Becomes a thin wrapper that loads file data and passes to the appropriate viewer
- The "back" navigation is now handled by closing the tab

For non-PDF document types (txt, md, image, video, epub), they render in their tab without the PDF-specific toolbar/sidebars.

### 10. Electron Main Process Changes

- Set `titleBarStyle: 'hidden'` in BrowserWindow options
- macOS traffic light buttons remain, positioned at default location
- No other main process changes needed for the layout
