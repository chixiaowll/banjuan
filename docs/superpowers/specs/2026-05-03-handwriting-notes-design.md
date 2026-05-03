# Handwriting Notes Design Spec

## Overview

Add handwriting notes to Banjuan as a third note type alongside markdown and mindmap. The first phase delivers a standalone multi-page handwriting canvas (similar to GoodNotes). The second phase adds an embeddable handwriting block inside the BlockNote markdown editor.

## Technology Choice

**tldraw deep integration (Approach A)** — use `@tldraw/tldraw` as the core canvas engine, build pagination, templates, and toolbar customization on top.

Key libraries:
- `@tldraw/tldraw` — canvas editor with built-in freehand drawing (perfect-freehand), lasso selection, object transforms, undo/redo, serialization
- `jsPDF` or similar — PDF export assembly

Rationale: tldraw provides 80% of the needed canvas functionality out of the box (strokes, shapes, lasso, transforms, undo/redo, serialization). Building from scratch with Canvas 2D + perfect-freehand would require 8-12 weeks vs 3-4 weeks with tldraw. The library is React-based and fits the existing tech stack (React 19 + Zustand).

## Phase 1: Standalone Handwriting Notes

### Data Model

**NoteType extension:**
```typescript
type NoteType = 'markdown' | 'mindmap' | 'handwriting'
```

**JSON file format** (stored in `notes/` directory, same as other note types):
```typescript
interface HandwritingNoteJsonFile {
  meta: NoteFileData  // type: "handwriting"
  pages: Array<{
    id: string
    template: 'blank' | 'lined' | 'grid' | 'dotted' | 'cornell'
    tldrawSnapshot: TLStoreSnapshot  // tldraw native serialization
  }>
  currentPageIndex: number
}
```

**typeMeta:**
```typescript
{
  pageSize: { width: 1024, height: 768 },  // 4:3 iPad aspect ratio
  defaultTemplate: 'blank'
}
```

Design decisions:
- Each page uses tldraw's native snapshot format — no custom stroke serialization, avoids mapping costs
- Pagination is managed as an array by us; tldraw handles single-page content only
- Each page can have a different template
- tldraw's infinite canvas is constrained to page bounds by setting camera bounds lock to the page size (1024x768) and disabling pan/zoom beyond edges

### Architecture & Components

Three-column layout consistent with existing markdown/mindmap notes:

```
NoteView.tsx (unified entry)
├── Left Sidebar
│   ├── [Folder tab] → FolderTree (reused, unchanged)
│   └── [Pages tab] → PageListPanel (new, handwriting only)
│       ├── Draggable thumbnail list
│       ├── Current page highlight
│       ├── [+ New Page] button
│       └── Right-click: delete / change template / insert / duplicate
├── Center
│   ├── HandwritingToolbar (top, 40px height)
│   │   ├── Row 1: ☰ / Back / Title / Save status / Export / Sidebar toggles (reused layout)
│   │   └── Row 2: Drawing tools + page indicator (3/5 ◀ ▶)
│   └── TldrawEditor (tldraw instance, switches snapshot on page change)
└── Right Sidebar
    └── BacklinksPanel (reused, same as markdown notes)
```

**NoteView.tsx changes (minimal):**
```typescript
const isMindmap = note.type === 'mindmap'
const isHandwriting = note.type === 'handwriting'

// Center: add handwriting branch
{isHandwriting ? (
  <HandwritingCenterContent noteId={note.id} ... />
) : isMindmap ? (
  <MindmapCenterContent ... />
) : (
  <div>...<BlockEditor />...</div>
)}

// Left sidebar tabs: handwriting gets "Folders | Pages" instead of "Folders | Outline"

// Right sidebar: handwriting reuses BacklinksPanel (same as markdown)
{rightSidebarOpen && (
  isMindmap ? (
    <MindmapRightSidebar ... />
  ) : (
    <BacklinksPanel noteId={note.id} docId={docId} ... />
  )
)}
```

### Tools

| Tool | Description |
|------|-------------|
| Pen | Default tool. Pressure-sensitive stroke width. Configurable color and line width |
| Highlighter | Semi-transparent wide stroke, fixed ~30% opacity |
| Eraser | Two modes: stroke eraser (delete whole stroke) and area eraser (erase intersected parts) |
| Shapes | Dropdown: rectangle, circle/ellipse, line, arrow. Resizable after drawing |
| Lasso | Freeform selection. Selected content can be moved, scaled, copied, deleted |
| Color picker | 8 preset colors + custom color palette |
| Width selector | 3-5 presets (thin / medium / thick) |
| Undo / Redo | Reuse tldraw built-in history |

### Templates

Templates render as SVG in tldraw's background layer. Not editable, not selectable, but included in export.

| Template | Description |
|----------|-------------|
| Blank | No background |
| Lined | Horizontal lines, ~32px row height |
| Grid | 32x32px grid lines |
| Dotted | Dots at 32x32px intervals |
| Cornell | Left 1/3 vertical line + bottom 1/4 horizontal line |

### Page Management

- **Page switching:** Save current page tldraw snapshot → load target page snapshot into tldraw instance
- **New page:** Insert after current page, inherit defaultTemplate or user chooses
- **Page list** (left sidebar "Pages" tab): vertical thumbnail list, drag to reorder, right-click context menu
- **Quick navigation:** Page indicator in toolbar (e.g., `3/5 ◀ ▶`) for fast flipping

### Save & Export

**Auto-save:**
- Debounce 500ms on tldraw store changes → write JSON file
- Reuse existing note save status indicator ("Saved" / "Saving...")
- Immediately save current page snapshot before switching pages

**PDF export:**
- Render each page via tldraw's `exportToBlob` API
- Overlay template background
- Assemble pages into PDF at 4:3 page size using jsPDF or similar
- Export entry in toolbar export menu (same position as markdown notes)

**PNG/JPG export:**
- Single page: export current page as image
- All pages: export as zip, one image per page
- Template background included in export

**Thumbnail generation:**
- Generate low-resolution thumbnail on page save (canvas downscale)
- Cache in memory to avoid re-rendering in PageListPanel
- Update thumbnail on page switch or edit (debounced)

### Integration Points

| Component | Change |
|-----------|--------|
| `NoteType` in `types.ts` | Add `'handwriting'` to union |
| `NoteService.create()` | Add handwriting initialization (first blank page) |
| `NoteService.get()` | Parse handwriting JSON format |
| `NoteService.update()` | Handle handwriting content updates |
| `NoteView.tsx` | Add `isHandwriting` branch for center + left sidebar tabs |
| `NoteList.tsx` | Show different icon for handwriting notes |
| `LibraryView.tsx` | Add handwriting note creation entry |
| `TabManager.tsx` | No changes — reuses existing `'note'` tab type |
| `FolderTree.tsx` | No changes |
| `BacklinksPanel.tsx` | No changes — reused as-is |
| `i18n` | Add handwriting-related strings |

### Input Device Support

- Mouse/trackpad first (desktop primary use case)
- Architecture reserves pressure interface for future stylus support (tldraw already supports pressure via perfect-freehand)
- Palm rejection deferred to Phase 2 / iPad support

## Phase 2: Embeddable Handwriting Block (Future)

Direction established, not implemented in Phase 1.

**Approach:**
- New custom BlockNote block type: `handwriting-block`
- Fixed height (drag-resizable) inline tldraw editor
- Single page, no pagination, template optional
- Data stored in block JSON (tldraw snapshot)

**Interaction:**
- Click to enter edit mode (tldraw activates), click outside to exit (shows static image preview)
- Auto-generate preview image on exit to reduce performance overhead
- Floating toolbar above the handwriting block, no global toolbar takeover

**Shared modules with Phase 1:**
- `HandwritingEditor` — tldraw wrapper with common configuration
- `TemplateRenderer` — SVG template background rendering
- Toolbar components — same tool set, different layout (floating vs fixed)

## New Files (Phase 1)

```
packages/app/src/renderer/components/handwriting/
├── HandwritingCenterContent.tsx   # Center column: toolbar + tldraw + page state
├── HandwritingToolbar.tsx         # Drawing tools toolbar
├── HandwritingEditor.tsx          # tldraw wrapper with template background
├── PageListPanel.tsx              # Left sidebar "Pages" tab with thumbnails
├── TemplateRenderer.tsx           # SVG template background components
└── useHandwritingStore.ts         # Zustand store for page state, current tool, etc.
```

## Non-Goals (Phase 1)

- Handwriting recognition / text conversion
- Audio recording sync
- iPad / touch device optimization
- Palm rejection
- Ruler / protractor tools
- Real-time collaboration
