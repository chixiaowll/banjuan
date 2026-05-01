# Mindmap Redesign: React Flow + elkjs

## Overview

Redesign the existing D3-based mindmap into a full-featured mind mapping tool using React Flow + elkjs, with XMind-level functionality and visual quality. Nodes support multiple types including notes, documents, annotations, images, links, and tags.

## Decision Record

- **Rendering**: React Flow (nodes are React components, best for rich node types)
- **Layout**: elkjs (mrtree for tree/logical/org layouts, custom engine for fishbone/timeline in Phase 2)
- **Animation**: framer-motion for node position transitions
- **State**: Zustand store with undo/redo history
- **Approach chosen over**: SimpleMindMap (node customization friction), D3 self-built (too much wheel reinvention)

## Data Model

### Node Type System

| nodeType | Description | Display | Key Field |
|----------|-------------|---------|-----------|
| `text` | Plain text (default, XMind standard) | Title + optional notes | — |
| `note` | Note reference | Note title + content preview | `noteId` |
| `document` | Document reference | Doc title + type icon + author | `docId` |
| `annotation` | Annotation reference | Highlighted text + color marker | `annotationId` |
| `image` | Image | Thumbnail + optional title | `imageUrl` |
| `link` | External link | Link title + URL preview | `hyperlink` |
| `tag` | Tag/category | Tag name + color | `tagId` |

### MindmapNode Schema Extension

New fields added to existing `mindmap_nodes` table:

```
nodeType:       TEXT DEFAULT 'text'    — text|note|document|annotation|image|link|tag
noteId:         TEXT                   — references notes.id
docId:          TEXT                   — references documents.id (node-level)
hyperlink:      TEXT                   — external URL
imageUrl:       TEXT                   — image path (banjuan-attachment://)
tagId:          TEXT                   — references tags.id
notes:          TEXT                   — node remarks (XMind's "notes" feature)
shape:          TEXT                   — per-node shape override
styleOverrides: TEXT                   — JSON, per-node style overrides
```

Existing fields retained: `id`, `mindmapId`, `parentId`, `annotationId`, `title`, `content`, `color`, `positionX`, `positionY`, `sortOrder`, `collapsed`, `createdAt`.

### Storage (mirrors notes pattern)

Dual-write: SQLite for queries, JSON files as source of truth.

| Layer | What | Location |
|-------|------|----------|
| SQLite | Metadata (title, layout, docId, timestamps) | `mindmaps` table (existing) |
| JSON | Full data (node tree + edges + theme + styles) | `.banjuan/mindmaps/{uuid}.json` |

JSON file format:
```json
{
  "meta": {
    "id": "uuid",
    "title": "My Mindmap",
    "docId": null,
    "layout": "mindmap",
    "theme": "classic",
    "createdAt": "2026-05-01T00:00:00Z",
    "updatedAt": "2026-05-01T00:00:00Z"
  },
  "nodes": [
    {
      "id": "uuid",
      "parentId": null,
      "nodeType": "text",
      "title": "Central Topic",
      "color": "#4A90D9",
      "shape": "roundedRect",
      "sortOrder": 0,
      "collapsed": false,
      "noteId": null,
      "docId": null,
      "annotationId": null,
      "hyperlink": null,
      "imageUrl": null,
      "tagId": null,
      "notes": null,
      "content": null,
      "styleOverrides": null
    }
  ],
  "edges": [
    { "id": "uuid", "sourceId": "...", "targetId": "...", "label": null, "style": null }
  ]
}
```

SQLite `mindmap_nodes` and `mindmap_edges` tables are kept in sync for querying (list by docId, search by title, etc.). On startup, `syncDisk()` scans `.banjuan/mindmaps/` and registers unknown JSON files in the database — same mechanism as notes.

### Note Node Behavior

- Linked via `noteId`, displays note title and content summary
- Side panel editing loads full note content, reuses BlockEditor
- Bidirectional title sync (note title change updates node display)
- Deleting a note node does NOT delete the note itself

## Architecture

### Component Tree

```
MindmapView (page container)
├── MindmapToolbar
│   ├── Title editor
│   ├── Layout switcher (mindmap/logical/org)
│   ├── Theme switcher
│   ├── Undo/Redo
│   ├── Import/Export
│   └── Zoom controls
├── MindmapCanvas (React Flow)
│   ├── Custom Node Components
│   │   ├── TextNode
│   │   ├── NoteNode
│   │   ├── DocumentNode
│   │   ├── AnnotationNode
│   │   ├── ImageNode
│   │   ├── LinkNode
│   │   └── TagNode
│   ├── Custom Edge Components
│   │   ├── TreeEdge (parent-child, bezier/straight/step)
│   │   └── RelationEdge (cross-link, dashed + label)
│   ├── MindmapMinimap
│   └── MindmapControls
└── SidePanel (on-demand)
    ├── NodePropertyPanel
    ├── NoteEditorPanel (reuses BlockEditor)
    └── ThemePanel
```

### Core Modules

**`useMindmapStore` (Zustand)**
- Nodes/edges state (React Flow format)
- Selected node, layout type, active theme
- Undo/redo history stack
- All mutation methods (addNode, removeNode, moveNode, reparent, etc.)
- Debounced IPC persistence

**`useLayoutEngine`**
- Wraps elkjs, converts tree data to React Flow x/y coordinates
- Configures elk parameters per layout type (mindmap/logical/org)
- Handles dynamic node sizing (two-pass: measure → layout)
- Phase 2: extensible for custom layouts (fishbone/timeline)

**`useKeyboardShortcuts`**
- XMind-style shortcuts (Tab/Enter/Delete/Space/arrows)
- Copy/paste subtree (Cmd+C/V/X)
- Search (Cmd+F), zoom (Cmd++/-/0)

**`useDragReparent`**
- Drag detection (200ms hold)
- Target resolution: hover on node = reparent, hover between nodes = reorder
- Circular reference prevention
- Visual feedback: highlight, insertion indicator, forbidden marker
- Drop → update tree → re-layout → animate

### Data Flow

```
User action → useMindmapStore (update state + record history)
           → useLayoutEngine (recompute layout)
           → React Flow (render + framer-motion transition)
           → IPC persist (debounced save to SQLite + JSON)
```

## Visual System

### Theme Structure

```typescript
interface MindmapTheme {
  name: string
  canvas: { background: string; gridColor?: string; gridStyle?: 'dots' | 'lines' | 'none' }

  levels: {
    root:   NodeStyle
    level1: NodeStyle
    level2: NodeStyle
    leaf:   NodeStyle
  }

  edges: {
    type: 'bezier' | 'straight' | 'step'
    root:   { color: string; width: number; animated?: boolean }
    level1: { color: string; width: number }
    level2: { color: string; width: number }
    leaf:   { color: string; width: number }
  }

  relation: { color: string; width: number; dasharray: string; labelFont: string }

  nodeTypeStyles: {
    note:       { icon: string; accentColor: string }
    document:   { icon: string; accentColor: string }
    annotation: { icon: string; accentColor: string }
    image:      { borderRadius: number; maxWidth: number }
    link:       { icon: string; accentColor: string }
    tag:        { shape: 'capsule' }
  }
}

interface NodeStyle {
  shape: 'rectangle' | 'roundedRect' | 'capsule' | 'diamond' | 'ellipse' | 'underline'
  fill: string
  stroke: string
  fontSize: number
  fontWeight: number
  color: string
  shadow?: string
  borderRadius?: number
  padding: { x: number; y: number }
}
```

### Built-in Themes (6)

| Theme | Style | Key Visual |
|-------|-------|-----------|
| Classic | XMind classic | Blue root, gradient blue→gray levels, bezier edges |
| Business | Corporate minimal | Dark gray root, black/white/gray, straight edges, no shadow |
| Colorful | Rainbow | Each primary branch a different color (red/orange/yellow/green/blue/purple), children inherit |
| Dark | Dark mode | Dark background, bright text, neon edges |
| Minimal | Clean lines | White background, no fill, underline nodes, thin edges |
| Organic | Hand-drawn feel | Warm tones, soft rounded corners, thick bezier edges |

### Node Shapes (6)

Rectangle, Rounded Rectangle, Capsule, Diamond, Ellipse, Underline (bottom border + text only).

Per-node `shape` field overrides theme default.

### Edge Styles

- **Bezier**: Classic XMind curved lines, cubic bezier
- **Straight**: Direct lines
- **Step**: Right-angle step lines (common in org charts)
- Line width decreases root→leaf (e.g., 3px → 2px → 1.5px)
- Optional flow animation (CSS stroke-dashoffset)

### Animations (framer-motion)

- Position change: 300ms ease-out transition
- Collapse/expand: children fade + position shrink/expand
- Add node: slide in from parent direction + fade in
- Remove node: scale down + fade out
- Layout switch: all nodes animate simultaneously to new positions

## Interaction System

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Tab | Add child node |
| Enter | Add sibling node |
| Delete/Backspace | Delete node + subtree (confirm) |
| Space / F2 | Edit title inline |
| Arrow keys | Navigate between nodes |
| Cmd+Z | Undo |
| Cmd+Shift+Z | Redo |
| Cmd+C/V/X | Copy/Paste/Cut subtree |
| Cmd+A | Select all |
| Cmd+F | Search nodes |
| / | Toggle collapse/expand |
| Cmd+Shift+I | Insert image |
| Cmd++/- | Zoom in/out |
| Cmd+0 | Fit to view |

### Drag Reparent

- **Start**: 200ms mouse hold to enter drag mode
- **During drag**:
  - Dragged node follows cursor at 50% opacity
  - Original position shows dashed placeholder
  - Hover on node → blue border highlight (becomes child)
  - Hover between nodes → horizontal insertion line (reorder sibling)
  - Hover on descendant → red forbidden indicator
- **Drop**: Update tree structure → re-layout → animate transition

### Context Menu (right-click)

- Add child / Add sibling
- Edit title
- ---
- Convert type → submenu (text/note/document/annotation/image/link/tag)
- Node style → submenu (shape/color/font)
- ---
- Add relation line (enter drawing mode, click target node)
- Add notes/remarks
- ---
- Cut / Copy / Paste
- Delete

### Inline Editing

- Space or double-click enters edit mode
- Text input replaces title display
- Enter confirms, Escape cancels
- Auto-select all text
- Node width expands dynamically
- Re-layout on size change after edit

### Multi-select

- Cmd+Click to toggle selection
- Lasso select (drag on empty canvas)
- Batch operations: delete, change color/shape, group drag

### Search

- Cmd+F opens search overlay
- Real-time highlight matching nodes
- Up/Down arrows jump between matches, canvas pans to target
- Non-matching nodes reduce opacity

## Import/Export

### Export Formats

| Format | Method | Notes |
|--------|--------|-------|
| PNG | html-to-image | Transparent/white background option, 2x resolution |
| SVG | Serialize React Flow SVG container | Vector, lossless |
| XMind | Generate .xmind ZIP (JSON + manifest) | Opens in XMind |
| JSON | Native internal format | Backup and migration |
| Markdown | Tree → indented list | Plain text scenarios |

### XMind Export Mapping

```
MindmapNode.title        → topic.title
MindmapNode.notes        → topic.notes.plain.content
MindmapNode.hyperlink    → topic.href
MindmapNode.color        → topic.style.properties.fill
children                 → topic.children.attached[]
MindmapEdge              → sheet.relationships[]
layout type              → sheet.rootTopic.structureClass
```

Special node types (note/document/annotation/image/tag) export as plain text topics with source info in notes.

### XMind Import

Parse .xmind ZIP → read content.json → convert to MindmapNode tree:
- topic.title → node title
- topic.notes → node notes
- topic.href → hyperlink (or match noteId if internal)
- topic.style → color/shape mapping
- sheet.relationships → MindmapEdge
- structureClass → layout type

Silently ignored XMind features: multiple sheets (import first only), audio, task info (priority/progress), callouts.

## Implementation Phases

### Phase 1 — MVP (~5 weeks)

| Week | Content |
|------|---------|
| W1 | Infrastructure: install deps, schema extension, Zustand store, layout engine |
| W2 | Node rendering: 7 custom node components + 6 shapes + 2 edge components, theme framework + Classic theme |
| W3 | Core interaction: keyboard shortcuts, inline editing, collapse/expand, undo/redo, context menu |
| W4 | Drag reparent + sibling reorder, animation transitions, multi-select, search |
| W5 | Side panel (node properties + note editor with BlockEditor), 3 layouts, remaining 5 themes, export PNG/SVG/JSON |

### Layout Types

| Layout | elkjs Config | Description |
|--------|-------------|-------------|
| **Mindmap** (balanced) | Two `mrtree` passes: children split into left (direction=LEFT) and right (direction=RIGHT) groups | Classic XMind bilateral layout, root centered |
| **Logical Structure** | Single `mrtree`, direction=RIGHT | One-directional tree, left to right |
| **Organization** | Single `mrtree`, direction=DOWN | Top-down org chart with step edges |

### Phase 2 — Advanced (~4 weeks)

| Week | Content |
|------|---------|
| W6 | XMind import/export (.xmind ZIP parse and generate) |
| W7 | Markdown export, custom layout engine framework |
| W8 | Fishbone layout |
| W9 | Timeline layout, edge flow animation, polish |

## Code Changes

| Action | Files |
|--------|-------|
| **Rewrite** | MindmapCanvas.tsx, MindmapNode.tsx, MindmapToolbar.tsx, MindmapView.tsx |
| **New** | useMindmapStore.ts, useLayoutEngine.ts, useKeyboardShortcuts.ts, useDragReparent.ts, 7 node components, 2 edge components, theme definitions, XMind import/export utils, side panel components |
| **Extend** | schema.ts (node table fields), types.ts (new types), MindmapService (new fields), IPC handlers |
| **Keep** | All core layer logic, IPC channels, preload API structure |
| **Remove** | d3 dependency (replaced by React Flow + elkjs) |

## New Dependencies

```
@xyflow/react        — React Flow core
elkjs                — Layout engine
framer-motion        — Animations
html-to-image        — PNG/SVG export
jszip                — XMind file parse/generate
zustand              — State management (if not already installed)
```
