# Mindmap Phase 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing D3-based mindmap with a React Flow + elkjs implementation featuring 7 node types, XMind-level visuals, keyboard shortcuts, drag reparent, undo/redo, themes, and export.

**Architecture:** React Flow renders custom React node/edge components. elkjs computes tree layout positions. Zustand manages state with undo/redo history. framer-motion animates position transitions. Existing MindmapService (core layer) is extended with new node fields but keeps dual-write (SQLite + JSON) storage.

**Tech Stack:** React 19, @xyflow/react, elkjs, zustand, framer-motion, html-to-image, TypeScript

---

## File Map

### Core Layer (`packages/core/src/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `types.ts` | Modify | Add `MindmapNodeType`, extend `MindmapNode`/`MindmapNodeCreateInput`/`MindmapFileData` with new fields |
| `db/schema.ts` | Modify | Add columns to `mindmap_nodes` table |
| `mindmaps/service.ts` | Modify | Handle new node fields in CRUD + addNode/updateNode |

### App Main Process (`packages/app/src/main/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `ipc.ts` | Modify | Pass new node fields through IPC handlers |

### App Preload (`packages/app/src/preload/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `index.ts` | Modify | Update mindmaps IPC bridge with new fields |

### App Type Defs (`packages/app/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `electron.d.ts` | Modify | Update mindmaps type definitions |

### App Renderer — Mindmap (`packages/app/src/renderer/components/mindmap/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `themes.ts` | Create | Theme type definitions + 6 built-in themes |
| `shapes.ts` | Create | 6 SVG shape renderers (rect, roundedRect, capsule, diamond, ellipse, underline) |
| `useMindmapStore.ts` | Create | Zustand store: nodes/edges state, mutations, undo/redo, IPC persistence |
| `useLayoutEngine.ts` | Create | elkjs wrapper: tree→positions, 3 layout types, dynamic sizing |
| `useKeyboardShortcuts.ts` | Create | XMind keyboard shortcuts |
| `useDragReparent.ts` | Create | Drag-to-reparent + sibling reorder logic |
| `MindmapCanvas.tsx` | Rewrite | React Flow canvas with custom nodes/edges, minimap, controls |
| `MindmapToolbar.tsx` | Rewrite | Toolbar with layout/theme switcher, undo/redo, export, zoom |
| `MindmapContextMenu.tsx` | Create | Right-click context menu |
| `MindmapSearch.tsx` | Create | Cmd+F search overlay |
| `nodes/TextNode.tsx` | Create | Plain text node component |
| `nodes/NoteNode.tsx` | Create | Note reference node component |
| `nodes/DocumentNode.tsx` | Create | Document reference node component |
| `nodes/AnnotationNode.tsx` | Create | Annotation reference node component |
| `nodes/ImageNode.tsx` | Create | Image node component |
| `nodes/LinkNode.tsx` | Create | External link node component |
| `nodes/TagNode.tsx` | Create | Tag node component |
| `nodes/NodeShell.tsx` | Create | Shared wrapper: shape rendering, selection, inline edit, animation |
| `nodes/index.ts` | Create | nodeTypes registry for React Flow |
| `edges/TreeEdge.tsx` | Create | Parent-child edge (bezier/straight/step) |
| `edges/RelationEdge.tsx` | Create | Cross-link dashed edge with label |
| `edges/index.ts` | Create | edgeTypes registry for React Flow |
| `MindmapCanvas.css` | Create | Canvas and node styles |

### App Renderer — Side Panel (`packages/app/src/renderer/components/mindmap/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `panels/NodePropertyPanel.tsx` | Create | Node property editor (type, color, shape, notes) |
| `panels/NoteEditorPanel.tsx` | Create | Note editing panel (reuses BlockEditor) |
| `panels/ThemePanel.tsx` | Create | Theme browser and customization |

### App Renderer — Views (`packages/app/src/renderer/views/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `MindmapView.tsx` | Rewrite | Page container with toolbar + canvas + side panel |

### App Renderer — Integration

| File | Action | Responsibility |
|------|--------|---------------|
| `components/TabManager.tsx` | Modify | Add mindmap tab type routing |
| `i18n/en.ts` | Modify | Add new i18n keys |
| `i18n/zh.ts` | Modify | Add new i18n keys |

---

## Task 1: Install Dependencies and Extend Data Model

**Files:**
- Modify: `packages/app/package.json`
- Modify: `packages/core/src/types.ts:229-284`
- Modify: `packages/core/src/db/schema.ts:115-128`
- Modify: `packages/core/src/mindmaps/service.ts`

- [ ] **Step 1: Install new dependencies**

```bash
cd packages/app
npm install @xyflow/react elkjs zustand framer-motion html-to-image
```

- [ ] **Step 2: Update MindmapLayout and add MindmapNodeType in types.ts**

In `packages/core/src/types.ts`, replace the existing `MindmapLayout` type (line 229) and add `MindmapNodeType`:

```typescript
export type MindmapLayout = 'mindmap' | 'logical' | 'organization'

export type MindmapNodeType = 'text' | 'note' | 'document' | 'annotation' | 'image' | 'link' | 'tag'
```

- [ ] **Step 3: Extend MindmapNode interface**

Replace the existing `MindmapNode` interface (lines 246-259) with:

```typescript
export interface MindmapNode {
  id: string
  mindmapId: string
  parentId: string | null
  nodeType: MindmapNodeType
  annotationId: string | null
  noteId: string | null
  docId: string | null
  hyperlink: string | null
  imageUrl: string | null
  tagId: string | null
  title: string
  content: string | null
  color: string | null
  notes: string | null
  shape: string | null
  styleOverrides: string | null
  positionX: number | null
  positionY: number | null
  sortOrder: number
  collapsed: boolean
  createdAt: string
}
```

- [ ] **Step 4: Extend MindmapNodeCreateInput**

Replace the existing `MindmapNodeCreateInput` (lines 261-269) with:

```typescript
export interface MindmapNodeCreateInput {
  title: string
  parentId?: string
  nodeType?: MindmapNodeType
  annotationId?: string
  noteId?: string
  docId?: string
  hyperlink?: string
  imageUrl?: string
  tagId?: string
  content?: string
  color?: string
  notes?: string
  shape?: string
  styleOverrides?: string
  positionX?: number
  positionY?: number
}
```

- [ ] **Step 5: Extend Mindmap interface**

Add `theme` field to the `Mindmap` interface (lines 231-238):

```typescript
export interface Mindmap {
  id: string
  title: string
  docId: string | null
  layout: MindmapLayout
  theme: string
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 6: Extend MindmapCreateInput**

```typescript
export interface MindmapCreateInput {
  title: string
  docId?: string
  layout?: MindmapLayout
  theme?: string
}
```

- [ ] **Step 7: Extend MindmapFileData**

Replace the existing `MindmapFileData` (lines 369-396) with:

```typescript
export interface MindmapFileData {
  id: string
  title: string
  docId: string | null
  layout: MindmapLayout
  theme: string
  tags: string[]
  nodes: Array<{
    id: string
    parentId: string | null
    nodeType: MindmapNodeType
    annotationId: string | null
    noteId: string | null
    docId: string | null
    hyperlink: string | null
    imageUrl: string | null
    tagId: string | null
    title: string
    content: string | null
    color: string | null
    notes: string | null
    shape: string | null
    styleOverrides: string | null
    positionX: number | null
    positionY: number | null
    sortOrder: number
    collapsed: boolean
  }>
  edges: Array<{
    id: string
    sourceId: string
    targetId: string
    label: string | null
    style: string | null
  }>
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 8: Update database schema**

In `packages/core/src/db/schema.ts`, replace the `mindmap_nodes` table definition (lines 115-128) and add migration. Add these columns to the CREATE TABLE:

```sql
CREATE TABLE IF NOT EXISTS mindmap_nodes (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    parent_id TEXT,
    node_type TEXT DEFAULT 'text',
    annotation_id TEXT,
    note_id TEXT,
    doc_id TEXT,
    hyperlink TEXT,
    image_url TEXT,
    tag_id TEXT,
    title TEXT NOT NULL,
    content TEXT,
    color TEXT,
    notes TEXT,
    shape TEXT,
    style_overrides TEXT,
    position_x REAL,
    position_y REAL,
    sort_order INTEGER DEFAULT 0,
    collapsed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
```

Also add `theme` column to `mindmaps` table:

```sql
CREATE TABLE IF NOT EXISTS mindmaps (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    doc_id TEXT,
    layout TEXT DEFAULT 'mindmap',
    theme TEXT DEFAULT 'classic',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

Add a migration block at the end of `initSchema()` for existing databases:

```typescript
export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL)
  // Migrate mindmap_nodes: add new columns if missing
  const nodeColumns = db.pragma('table_info(mindmap_nodes)') as Array<{ name: string }>
  const nodeColNames = new Set(nodeColumns.map(c => c.name))
  const newNodeCols: Array<[string, string]> = [
    ['node_type', "TEXT DEFAULT 'text'"],
    ['note_id', 'TEXT'],
    ['doc_id', 'TEXT'],
    ['hyperlink', 'TEXT'],
    ['image_url', 'TEXT'],
    ['tag_id', 'TEXT'],
    ['notes', 'TEXT'],
    ['shape', 'TEXT'],
    ['style_overrides', 'TEXT'],
  ]
  for (const [name, type] of newNodeCols) {
    if (!nodeColNames.has(name)) {
      db.exec(`ALTER TABLE mindmap_nodes ADD COLUMN ${name} ${type}`)
    }
  }
  // Migrate mindmaps: add theme column if missing
  const mmColumns = db.pragma('table_info(mindmaps)') as Array<{ name: string }>
  const mmColNames = new Set(mmColumns.map(c => c.name))
  if (!mmColNames.has('theme')) {
    db.exec("ALTER TABLE mindmaps ADD COLUMN theme TEXT DEFAULT 'classic'")
  }
}
```

- [ ] **Step 9: Update MindmapService row mappers and CRUD**

In `packages/core/src/mindmaps/service.ts`:

Update `NodeRow` interface:

```typescript
interface NodeRow {
  id: string; mindmap_id: string; parent_id: string | null
  node_type: string; annotation_id: string | null
  note_id: string | null; doc_id: string | null
  hyperlink: string | null; image_url: string | null; tag_id: string | null
  title: string; content: string | null; color: string | null
  notes: string | null; shape: string | null; style_overrides: string | null
  position_x: number | null; position_y: number | null
  sort_order: number; collapsed: number; created_at: string
}
```

Update `MindmapRow` interface:

```typescript
interface MindmapRow {
  id: string; title: string; doc_id: string | null; layout: string
  theme: string | null; created_at: string; updated_at: string
}
```

Update `rowToMindmap`:

```typescript
function rowToMindmap(row: MindmapRow): Mindmap {
  return {
    id: row.id, title: row.title, docId: row.doc_id,
    layout: row.layout as MindmapLayout,
    theme: row.theme ?? 'classic',
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}
```

Update `rowToNode`:

```typescript
function rowToNode(row: NodeRow): MindmapNode {
  return {
    id: row.id, mindmapId: row.mindmap_id, parentId: row.parent_id,
    nodeType: (row.node_type ?? 'text') as MindmapNodeType,
    annotationId: row.annotation_id, noteId: row.note_id, docId: row.doc_id,
    hyperlink: row.hyperlink, imageUrl: row.image_url, tagId: row.tag_id,
    title: row.title, content: row.content, color: row.color,
    notes: row.notes, shape: row.shape, styleOverrides: row.style_overrides,
    positionX: row.position_x, positionY: row.position_y,
    sortOrder: row.sort_order, collapsed: row.collapsed === 1,
    createdAt: row.created_at,
  }
}
```

Update `create()` method to handle `theme`:

```typescript
async create(input: MindmapCreateInput): Promise<Mindmap> {
  const id = uuid()
  const now = new Date().toISOString()
  const layout = input.layout ?? 'mindmap'
  const theme = input.theme ?? 'classic'

  const fileData: MindmapFileData = {
    id, title: input.title, docId: input.docId ?? null, layout, theme,
    tags: [], nodes: [], edges: [], createdAt: now, updatedAt: now,
  }
  this.writeFileData(fileData)

  this.db.prepare('INSERT INTO mindmaps (id, title, doc_id, layout, theme, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, input.title, input.docId ?? null, layout, theme, now, now)

  const mindmap = { id, title: input.title, docId: input.docId ?? null, layout, theme, createdAt: now, updatedAt: now }
  this.events.emit('mindmap:created', { mindmap })
  return mindmap
}
```

Update `update()` to handle `theme`:

In the `update()` method, add theme to the fields handling:

```typescript
if (updates.theme !== undefined) { fields.push('theme = ?'); values.push(updates.theme) }
```

And in the fileData update block:

```typescript
if (updates.theme !== undefined) fileData.theme = updates.theme
```

Update `addNode()` to include new fields in INSERT:

```typescript
async addNode(mindmapId: string, input: MindmapNodeCreateInput): Promise<MindmapNode> {
  const id = uuid()
  const now = new Date().toISOString()
  const parentId = input.parentId ?? null

  const maxRow = this.db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM mindmap_nodes WHERE mindmap_id = ? AND parent_id IS ?')
    .get(mindmapId, parentId) as { max_sort: number }
  const sortOrder = maxRow.max_sort + 1

  const nodeData = {
    id, parentId, nodeType: input.nodeType ?? 'text' as MindmapNodeType,
    annotationId: input.annotationId ?? null,
    noteId: input.noteId ?? null, docId: input.docId ?? null,
    hyperlink: input.hyperlink ?? null, imageUrl: input.imageUrl ?? null,
    tagId: input.tagId ?? null,
    title: input.title, content: input.content ?? null, color: input.color ?? null,
    notes: input.notes ?? null, shape: input.shape ?? null,
    styleOverrides: input.styleOverrides ?? null,
    positionX: input.positionX ?? null, positionY: input.positionY ?? null,
    sortOrder, collapsed: false,
  }

  const fileData = this.readFileData(mindmapId)
  if (fileData) {
    fileData.nodes.push(nodeData)
    fileData.updatedAt = now
    this.writeFileData(fileData)
  }

  this.db.prepare(
    `INSERT INTO mindmap_nodes (id, mindmap_id, parent_id, node_type, annotation_id, note_id, doc_id, hyperlink, image_url, tag_id, title, content, color, notes, shape, style_overrides, position_x, position_y, sort_order, collapsed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, mindmapId, parentId, nodeData.nodeType, nodeData.annotationId, nodeData.noteId, nodeData.docId, nodeData.hyperlink, nodeData.imageUrl, nodeData.tagId, input.title, nodeData.content, nodeData.color, nodeData.notes, nodeData.shape, nodeData.styleOverrides, nodeData.positionX, nodeData.positionY, sortOrder, now)

  const node: MindmapNode = { ...nodeData, mindmapId, createdAt: now }
  this.events.emit('mindmap:node:added', { node })
  return node
}
```

Update `updateNode()` — add new fields to the updates handling:

```typescript
async updateNode(id: string, updates: Partial<Pick<MindmapNode, 'title' | 'content' | 'color' | 'notes' | 'shape' | 'styleOverrides' | 'nodeType' | 'noteId' | 'docId' | 'hyperlink' | 'imageUrl' | 'tagId' | 'parentId' | 'positionX' | 'positionY' | 'collapsed' | 'sortOrder'>>): Promise<MindmapNode> {
  const nodeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_nodes WHERE id = ?').get(id) as { mindmap_id: string } | undefined
  if (!nodeRow) throw new Error(`Node not found: ${id}`)

  const fileData = this.readFileData(nodeRow.mindmap_id)
  if (fileData) {
    const nodeInFile = fileData.nodes.find(n => n.id === id)
    if (nodeInFile) {
      if (updates.title !== undefined) nodeInFile.title = updates.title
      if (updates.content !== undefined) nodeInFile.content = updates.content
      if (updates.color !== undefined) nodeInFile.color = updates.color
      if (updates.notes !== undefined) nodeInFile.notes = updates.notes
      if (updates.shape !== undefined) nodeInFile.shape = updates.shape
      if (updates.styleOverrides !== undefined) nodeInFile.styleOverrides = updates.styleOverrides
      if (updates.nodeType !== undefined) nodeInFile.nodeType = updates.nodeType
      if (updates.noteId !== undefined) nodeInFile.noteId = updates.noteId
      if (updates.docId !== undefined) nodeInFile.docId = updates.docId
      if (updates.hyperlink !== undefined) nodeInFile.hyperlink = updates.hyperlink
      if (updates.imageUrl !== undefined) nodeInFile.imageUrl = updates.imageUrl
      if (updates.tagId !== undefined) nodeInFile.tagId = updates.tagId
      if (updates.parentId !== undefined) nodeInFile.parentId = updates.parentId
      if (updates.positionX !== undefined) nodeInFile.positionX = updates.positionX
      if (updates.positionY !== undefined) nodeInFile.positionY = updates.positionY
      if (updates.collapsed !== undefined) nodeInFile.collapsed = updates.collapsed
      if (updates.sortOrder !== undefined) nodeInFile.sortOrder = updates.sortOrder
    }
    fileData.updatedAt = new Date().toISOString()
    this.writeFileData(fileData)
  }

  const fields: string[] = []
  const values: unknown[] = []
  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
  if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content) }
  if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color) }
  if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes) }
  if (updates.shape !== undefined) { fields.push('shape = ?'); values.push(updates.shape) }
  if (updates.styleOverrides !== undefined) { fields.push('style_overrides = ?'); values.push(updates.styleOverrides) }
  if (updates.nodeType !== undefined) { fields.push('node_type = ?'); values.push(updates.nodeType) }
  if (updates.noteId !== undefined) { fields.push('note_id = ?'); values.push(updates.noteId) }
  if (updates.docId !== undefined) { fields.push('doc_id = ?'); values.push(updates.docId) }
  if (updates.hyperlink !== undefined) { fields.push('hyperlink = ?'); values.push(updates.hyperlink) }
  if (updates.imageUrl !== undefined) { fields.push('image_url = ?'); values.push(updates.imageUrl) }
  if (updates.tagId !== undefined) { fields.push('tag_id = ?'); values.push(updates.tagId) }
  if (updates.parentId !== undefined) { fields.push('parent_id = ?'); values.push(updates.parentId) }
  if (updates.positionX !== undefined) { fields.push('position_x = ?'); values.push(updates.positionX) }
  if (updates.positionY !== undefined) { fields.push('position_y = ?'); values.push(updates.positionY) }
  if (updates.collapsed !== undefined) { fields.push('collapsed = ?'); values.push(updates.collapsed ? 1 : 0) }
  if (updates.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(updates.sortOrder) }

  if (fields.length > 0) {
    values.push(id)
    this.db.prepare(`UPDATE mindmap_nodes SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  const row = this.db.prepare('SELECT * FROM mindmap_nodes WHERE id = ?').get(id) as NodeRow
  return rowToNode(row)
}
```

Also update the `Mindmap` `update()` method signature:

```typescript
async update(id: string, updates: Partial<Pick<Mindmap, 'title' | 'layout' | 'docId' | 'theme'>>): Promise<Mindmap> {
```

- [ ] **Step 10: Update IPC handlers**

In `packages/app/src/main/ipc.ts`, update the `mindmaps:addNode` handler to pass all new fields:

```typescript
ipcMain.handle('mindmaps:addNode', async (event, mindmapId: string, input: {
  title: string; parentId?: string; nodeType?: string; annotationId?: string;
  noteId?: string; docId?: string; hyperlink?: string; imageUrl?: string;
  tagId?: string; content?: string; color?: string; notes?: string;
  shape?: string; styleOverrides?: string; positionX?: number; positionY?: number
}) => {
  return getLib(event).mindmaps.addNode(mindmapId, input)
})
```

Update `mindmaps:updateNode` handler:

```typescript
ipcMain.handle('mindmaps:updateNode', async (event, id: string, updates: {
  title?: string; content?: string; color?: string; notes?: string;
  shape?: string; styleOverrides?: string; nodeType?: string;
  noteId?: string; docId?: string; hyperlink?: string; imageUrl?: string;
  tagId?: string; parentId?: string; positionX?: number; positionY?: number;
  collapsed?: boolean; sortOrder?: number
}) => {
  return getLib(event).mindmaps.updateNode(id, updates)
})
```

Update `mindmaps:update` handler to include theme:

```typescript
ipcMain.handle('mindmaps:update', async (event, id: string, updates: {
  title?: string; layout?: string; docId?: string; theme?: string
}) => {
  return getLib(event).mindmaps.update(id, updates)
})
```

- [ ] **Step 11: Update preload bridge**

In `packages/app/src/preload/index.ts`, update the mindmaps section to pass new fields through (the existing shape already invokes with spread args, so it should work — verify the `addNode` and `updateNode` calls pass through all fields).

- [ ] **Step 12: Update electron.d.ts**

Update the `mindmaps` section in `packages/app/electron.d.ts`:

```typescript
mindmaps: {
  create: (input: { title: string; docId?: string; layout?: string; theme?: string }) => Promise<any>
  list: (options?: { docId?: string }) => Promise<any[]>
  get: (id: string) => Promise<any>
  update: (id: string, updates: { title?: string; layout?: string; docId?: string; theme?: string }) => Promise<any>
  delete: (id: string) => Promise<void>
  addNode: (mindmapId: string, input: {
    title: string; parentId?: string; nodeType?: string; annotationId?: string;
    noteId?: string; docId?: string; hyperlink?: string; imageUrl?: string;
    tagId?: string; content?: string; color?: string; notes?: string;
    shape?: string; styleOverrides?: string; positionX?: number; positionY?: number
  }) => Promise<any>
  getNodes: (mindmapId: string) => Promise<any[]>
  updateNode: (id: string, updates: {
    title?: string; content?: string; color?: string; notes?: string;
    shape?: string; styleOverrides?: string; nodeType?: string;
    noteId?: string; docId?: string; hyperlink?: string; imageUrl?: string;
    tagId?: string; parentId?: string; positionX?: number; positionY?: number;
    collapsed?: boolean; sortOrder?: number
  }) => Promise<any>
  removeNode: (id: string) => Promise<void>
  addEdge: (mindmapId: string, input: { sourceId: string; targetId: string; label?: string }) => Promise<any>
  getEdges: (mindmapId: string) => Promise<any[]>
  removeEdge: (id: string) => Promise<void>
}
```

- [ ] **Step 13: Build and verify**

```bash
cd packages/core && npm run build
cd ../app && npm run build
```

Expected: No TypeScript errors. Core and app compile cleanly.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat(core): extend mindmap data model with node types, themes, and new fields"
```

---

## Task 2: Theme System and Shape Renderers

**Files:**
- Create: `packages/app/src/renderer/components/mindmap/themes.ts`
- Create: `packages/app/src/renderer/components/mindmap/shapes.ts`

- [ ] **Step 1: Create theme type definitions and 6 built-in themes**

Create `packages/app/src/renderer/components/mindmap/themes.ts`:

```typescript
export interface EdgeLevelStyle {
  color: string
  width: number
  animated?: boolean
}

export interface NodeStyle {
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

export interface NodeTypeStyle {
  icon: string
  accentColor: string
}

export interface MindmapTheme {
  name: string
  canvas: { background: string; gridColor?: string; gridStyle?: 'dots' | 'lines' | 'none' }
  levels: {
    root: NodeStyle
    level1: NodeStyle
    level2: NodeStyle
    leaf: NodeStyle
  }
  edges: {
    type: 'bezier' | 'straight' | 'step'
    root: EdgeLevelStyle
    level1: EdgeLevelStyle
    level2: EdgeLevelStyle
    leaf: EdgeLevelStyle
  }
  relation: { color: string; width: number; dasharray: string; labelFont: string }
  nodeTypeStyles: {
    note: NodeTypeStyle
    document: NodeTypeStyle
    annotation: NodeTypeStyle
    image: { borderRadius: number; maxWidth: number }
    link: NodeTypeStyle
    tag: { shape: 'capsule'; accentColor: string }
  }
}

export function getNodeStyleForLevel(theme: MindmapTheme, depth: number): NodeStyle {
  if (depth === 0) return theme.levels.root
  if (depth === 1) return theme.levels.level1
  if (depth === 2) return theme.levels.level2
  return theme.levels.leaf
}

export function getEdgeStyleForLevel(theme: MindmapTheme, depth: number): EdgeLevelStyle {
  if (depth === 0) return theme.edges.root
  if (depth === 1) return theme.edges.level1
  if (depth === 2) return theme.edges.level2
  return theme.edges.leaf
}

const classic: MindmapTheme = {
  name: 'Classic',
  canvas: { background: '#ffffff', gridStyle: 'none' },
  levels: {
    root: { shape: 'roundedRect', fill: '#4A90D9', stroke: '#3A7BC8', fontSize: 18, fontWeight: 700, color: '#ffffff', shadow: '0 2px 8px rgba(74,144,217,0.3)', borderRadius: 12, padding: { x: 24, y: 14 } },
    level1: { shape: 'roundedRect', fill: '#E8F0FE', stroke: '#B8D4F0', fontSize: 15, fontWeight: 600, color: '#2C3E50', borderRadius: 8, padding: { x: 18, y: 10 } },
    level2: { shape: 'roundedRect', fill: '#F5F7FA', stroke: '#D5DDE5', fontSize: 13, fontWeight: 400, color: '#34495E', borderRadius: 6, padding: { x: 14, y: 8 } },
    leaf: { shape: 'roundedRect', fill: '#FAFBFC', stroke: '#E1E5EA', fontSize: 13, fontWeight: 400, color: '#5A6B7B', borderRadius: 6, padding: { x: 14, y: 8 } },
  },
  edges: {
    type: 'bezier',
    root: { color: '#4A90D9', width: 3, animated: false },
    level1: { color: '#8BB8E8', width: 2 },
    level2: { color: '#B8D4F0', width: 1.5 },
    leaf: { color: '#D5DDE5', width: 1.5 },
  },
  relation: { color: '#E67E22', width: 1.5, dasharray: '6 4', labelFont: '12px sans-serif' },
  nodeTypeStyles: {
    note: { icon: '📝', accentColor: '#27AE60' },
    document: { icon: '📄', accentColor: '#3498DB' },
    annotation: { icon: '💬', accentColor: '#F39C12' },
    image: { borderRadius: 8, maxWidth: 200 },
    link: { icon: '🔗', accentColor: '#8E44AD' },
    tag: { shape: 'capsule', accentColor: '#1ABC9C' },
  },
}

const business: MindmapTheme = {
  name: 'Business',
  canvas: { background: '#FAFAFA', gridStyle: 'none' },
  levels: {
    root: { shape: 'rectangle', fill: '#2C3E50', stroke: '#1A252F', fontSize: 18, fontWeight: 700, color: '#FFFFFF', borderRadius: 4, padding: { x: 24, y: 14 } },
    level1: { shape: 'rectangle', fill: '#ECF0F1', stroke: '#BDC3C7', fontSize: 15, fontWeight: 600, color: '#2C3E50', borderRadius: 4, padding: { x: 18, y: 10 } },
    level2: { shape: 'rectangle', fill: '#F8F9FA', stroke: '#DEE2E6', fontSize: 13, fontWeight: 400, color: '#495057', borderRadius: 3, padding: { x: 14, y: 8 } },
    leaf: { shape: 'rectangle', fill: '#FFFFFF', stroke: '#E9ECEF', fontSize: 13, fontWeight: 400, color: '#6C757D', borderRadius: 3, padding: { x: 14, y: 8 } },
  },
  edges: {
    type: 'straight',
    root: { color: '#2C3E50', width: 2.5 },
    level1: { color: '#7F8C8D', width: 2 },
    level2: { color: '#BDC3C7', width: 1.5 },
    leaf: { color: '#DEE2E6', width: 1 },
  },
  relation: { color: '#E74C3C', width: 1.5, dasharray: '6 4', labelFont: '12px sans-serif' },
  nodeTypeStyles: {
    note: { icon: '📝', accentColor: '#27AE60' },
    document: { icon: '📄', accentColor: '#2980B9' },
    annotation: { icon: '💬', accentColor: '#F39C12' },
    image: { borderRadius: 4, maxWidth: 180 },
    link: { icon: '🔗', accentColor: '#8E44AD' },
    tag: { shape: 'capsule', accentColor: '#16A085' },
  },
}

const colorful: MindmapTheme = {
  name: 'Colorful',
  canvas: { background: '#FFFFFF', gridStyle: 'none' },
  levels: {
    root: { shape: 'roundedRect', fill: '#FF6B6B', stroke: '#EE5A5A', fontSize: 18, fontWeight: 700, color: '#FFFFFF', shadow: '0 3px 10px rgba(255,107,107,0.3)', borderRadius: 16, padding: { x: 28, y: 16 } },
    level1: { shape: 'roundedRect', fill: '#PLACEHOLDER', stroke: '#PLACEHOLDER', fontSize: 15, fontWeight: 600, color: '#FFFFFF', borderRadius: 10, padding: { x: 18, y: 10 } },
    level2: { shape: 'roundedRect', fill: '#PLACEHOLDER', stroke: '#PLACEHOLDER', fontSize: 13, fontWeight: 400, color: '#333333', borderRadius: 8, padding: { x: 14, y: 8 } },
    leaf: { shape: 'roundedRect', fill: '#FAFAFA', stroke: '#E0E0E0', fontSize: 13, fontWeight: 400, color: '#555555', borderRadius: 6, padding: { x: 14, y: 8 } },
  },
  edges: {
    type: 'bezier',
    root: { color: '#FF6B6B', width: 3, animated: true },
    level1: { color: '#PLACEHOLDER', width: 2.5 },
    level2: { color: '#PLACEHOLDER', width: 2 },
    leaf: { color: '#CCCCCC', width: 1.5 },
  },
  relation: { color: '#9B59B6', width: 1.5, dasharray: '6 4', labelFont: '12px sans-serif' },
  nodeTypeStyles: {
    note: { icon: '📝', accentColor: '#2ECC71' },
    document: { icon: '📄', accentColor: '#3498DB' },
    annotation: { icon: '💬', accentColor: '#F1C40F' },
    image: { borderRadius: 12, maxWidth: 200 },
    link: { icon: '🔗', accentColor: '#9B59B6' },
    tag: { shape: 'capsule', accentColor: '#1ABC9C' },
  },
}

// Colorful theme uses per-branch colors at runtime. The PLACEHOLDER values are
// replaced dynamically based on the branch index. See useMindmapStore.ts
// getBranchColor() for the actual palette.
export const BRANCH_COLORS = ['#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#4DABF7', '#9775FA']

const dark: MindmapTheme = {
  name: 'Dark',
  canvas: { background: '#1E1E2E', gridStyle: 'none' },
  levels: {
    root: { shape: 'roundedRect', fill: '#89B4FA', stroke: '#74A8F7', fontSize: 18, fontWeight: 700, color: '#1E1E2E', shadow: '0 2px 12px rgba(137,180,250,0.3)', borderRadius: 12, padding: { x: 24, y: 14 } },
    level1: { shape: 'roundedRect', fill: '#313244', stroke: '#45475A', fontSize: 15, fontWeight: 600, color: '#CDD6F4', borderRadius: 8, padding: { x: 18, y: 10 } },
    level2: { shape: 'roundedRect', fill: '#2A2A3C', stroke: '#3A3A4E', fontSize: 13, fontWeight: 400, color: '#BAC2DE', borderRadius: 6, padding: { x: 14, y: 8 } },
    leaf: { shape: 'roundedRect', fill: '#242436', stroke: '#333348', fontSize: 13, fontWeight: 400, color: '#A6ADC8', borderRadius: 6, padding: { x: 14, y: 8 } },
  },
  edges: {
    type: 'bezier',
    root: { color: '#89B4FA', width: 3, animated: true },
    level1: { color: '#585B70', width: 2 },
    level2: { color: '#45475A', width: 1.5 },
    leaf: { color: '#3A3A4E', width: 1.5 },
  },
  relation: { color: '#FAB387', width: 1.5, dasharray: '6 4', labelFont: '12px sans-serif' },
  nodeTypeStyles: {
    note: { icon: '📝', accentColor: '#A6E3A1' },
    document: { icon: '📄', accentColor: '#89B4FA' },
    annotation: { icon: '💬', accentColor: '#F9E2AF' },
    image: { borderRadius: 8, maxWidth: 200 },
    link: { icon: '🔗', accentColor: '#CBA6F7' },
    tag: { shape: 'capsule', accentColor: '#94E2D5' },
  },
}

const minimal: MindmapTheme = {
  name: 'Minimal',
  canvas: { background: '#FFFFFF', gridStyle: 'none' },
  levels: {
    root: { shape: 'underline', fill: 'transparent', stroke: '#333333', fontSize: 20, fontWeight: 700, color: '#111111', padding: { x: 8, y: 6 } },
    level1: { shape: 'underline', fill: 'transparent', stroke: '#666666', fontSize: 15, fontWeight: 500, color: '#333333', padding: { x: 6, y: 4 } },
    level2: { shape: 'underline', fill: 'transparent', stroke: '#999999', fontSize: 13, fontWeight: 400, color: '#555555', padding: { x: 6, y: 4 } },
    leaf: { shape: 'underline', fill: 'transparent', stroke: '#CCCCCC', fontSize: 13, fontWeight: 400, color: '#777777', padding: { x: 6, y: 4 } },
  },
  edges: {
    type: 'straight',
    root: { color: '#333333', width: 2 },
    level1: { color: '#888888', width: 1.5 },
    level2: { color: '#BBBBBB', width: 1 },
    leaf: { color: '#DDDDDD', width: 1 },
  },
  relation: { color: '#E74C3C', width: 1, dasharray: '4 3', labelFont: '11px sans-serif' },
  nodeTypeStyles: {
    note: { icon: '📝', accentColor: '#27AE60' },
    document: { icon: '📄', accentColor: '#3498DB' },
    annotation: { icon: '💬', accentColor: '#F39C12' },
    image: { borderRadius: 4, maxWidth: 160 },
    link: { icon: '🔗', accentColor: '#8E44AD' },
    tag: { shape: 'capsule', accentColor: '#16A085' },
  },
}

const organic: MindmapTheme = {
  name: 'Organic',
  canvas: { background: '#FFF8F0', gridStyle: 'none' },
  levels: {
    root: { shape: 'roundedRect', fill: '#D35400', stroke: '#BA4A00', fontSize: 18, fontWeight: 700, color: '#FFFFFF', shadow: '0 3px 10px rgba(211,84,0,0.25)', borderRadius: 20, padding: { x: 28, y: 16 } },
    level1: { shape: 'roundedRect', fill: '#FDEBD0', stroke: '#F5CBA7', fontSize: 15, fontWeight: 600, color: '#6E3B00', borderRadius: 14, padding: { x: 20, y: 12 } },
    level2: { shape: 'roundedRect', fill: '#FEF5E7', stroke: '#FAE5CD', fontSize: 13, fontWeight: 400, color: '#7B4F1E', borderRadius: 10, padding: { x: 16, y: 10 } },
    leaf: { shape: 'roundedRect', fill: '#FFFAF4', stroke: '#F5E6D3', fontSize: 13, fontWeight: 400, color: '#8B6F50', borderRadius: 10, padding: { x: 14, y: 8 } },
  },
  edges: {
    type: 'bezier',
    root: { color: '#D35400', width: 4 },
    level1: { color: '#E59866', width: 3 },
    level2: { color: '#F0B27A', width: 2 },
    leaf: { color: '#F5CBA7', width: 1.5 },
  },
  relation: { color: '#8E44AD', width: 2, dasharray: '8 5', labelFont: '12px serif' },
  nodeTypeStyles: {
    note: { icon: '📝', accentColor: '#27AE60' },
    document: { icon: '📄', accentColor: '#2E86C1' },
    annotation: { icon: '💬', accentColor: '#D4AC0D' },
    image: { borderRadius: 14, maxWidth: 200 },
    link: { icon: '🔗', accentColor: '#7D3C98' },
    tag: { shape: 'capsule', accentColor: '#1E8449' },
  },
}

export const THEMES: Record<string, MindmapTheme> = {
  classic,
  business,
  colorful,
  dark,
  minimal,
  organic,
}

export function getTheme(name: string): MindmapTheme {
  return THEMES[name] ?? classic
}
```

- [ ] **Step 2: Create shape renderers**

Create `packages/app/src/renderer/components/mindmap/shapes.ts`:

```typescript
export interface ShapeProps {
  width: number
  height: number
  fill: string
  stroke: string
  borderRadius?: number
  shadow?: string
  selected?: boolean
}

export type ShapeName = 'rectangle' | 'roundedRect' | 'capsule' | 'diamond' | 'ellipse' | 'underline'

export function getShapePath(shape: ShapeName, props: ShapeProps): { d: string; style: Record<string, unknown> } {
  const { width: w, height: h } = props
  const style: Record<string, unknown> = {
    fill: props.fill,
    stroke: props.selected ? '#4A90D9' : props.stroke,
    strokeWidth: props.selected ? 2 : 1,
    filter: props.shadow ? `drop-shadow(${props.shadow})` : undefined,
  }

  switch (shape) {
    case 'rectangle':
      return {
        d: `M0,0 H${w} V${h} H0 Z`,
        style,
      }
    case 'roundedRect': {
      const r = Math.min(props.borderRadius ?? 8, h / 2, w / 2)
      return {
        d: `M${r},0 H${w - r} Q${w},0 ${w},${r} V${h - r} Q${w},${h} ${w - r},${h} H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`,
        style,
      }
    }
    case 'capsule': {
      const r = h / 2
      return {
        d: `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 ${r},0 Z`,
        style,
      }
    }
    case 'diamond': {
      const mx = w / 2, my = h / 2
      return {
        d: `M${mx},0 L${w},${my} L${mx},${h} L0,${my} Z`,
        style,
      }
    }
    case 'ellipse': {
      const rx = w / 2, ry = h / 2
      return {
        d: `M${rx},0 A${rx},${ry} 0 1 1 ${rx},${h} A${rx},${ry} 0 1 1 ${rx},0 Z`,
        style,
      }
    }
    case 'underline':
      return {
        d: `M0,${h} H${w}`,
        style: { ...style, fill: 'none', strokeWidth: 2 },
      }
  }
}
```

- [ ] **Step 3: Verify imports compile**

```bash
cd packages/app && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: No errors in themes.ts and shapes.ts.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/renderer/components/mindmap/themes.ts packages/app/src/renderer/components/mindmap/shapes.ts
git commit -m "feat(app): add mindmap theme system with 6 themes and shape renderers"
```

---

## Task 3: Zustand Store with Undo/Redo

**Files:**
- Create: `packages/app/src/renderer/components/mindmap/useMindmapStore.ts`

- [ ] **Step 1: Create the Zustand store**

Create `packages/app/src/renderer/components/mindmap/useMindmapStore.ts`:

```typescript
import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'

export interface MindmapNodeData {
  id: string
  mindmapId: string
  parentId: string | null
  nodeType: string
  annotationId: string | null
  noteId: string | null
  docId: string | null
  hyperlink: string | null
  imageUrl: string | null
  tagId: string | null
  title: string
  content: string | null
  color: string | null
  notes: string | null
  shape: string | null
  styleOverrides: string | null
  sortOrder: number
  collapsed: boolean
  depth: number
}

interface HistoryEntry {
  rfNodes: Node<MindmapNodeData>[]
  rfEdges: Edge[]
}

interface MindmapState {
  mindmapId: string | null
  mindmapTitle: string
  layout: string
  theme: string

  rfNodes: Node<MindmapNodeData>[]
  rfEdges: Edge[]
  selectedNodeIds: string[]
  editingNodeId: string | null

  history: HistoryEntry[]
  historyIndex: number

  sidePanelType: 'none' | 'properties' | 'noteEditor' | 'theme'
  sidePanelNodeId: string | null

  // Actions
  init: (mindmapId: string) => Promise<void>
  setLayout: (layout: string) => void
  setTheme: (theme: string) => void
  setTitle: (title: string) => void
  setRfNodes: (nodes: Node<MindmapNodeData>[]) => void
  setRfEdges: (edges: Edge[]) => void
  selectNode: (id: string | null) => void
  selectNodes: (ids: string[]) => void
  toggleSelectNode: (id: string) => void
  setEditingNodeId: (id: string | null) => void

  addNode: (parentId: string | null, nodeType?: string) => Promise<string | null>
  addSiblingNode: (siblingId: string) => Promise<string | null>
  removeNode: (id: string) => Promise<void>
  updateNodeData: (id: string, updates: Record<string, unknown>) => Promise<void>
  reparentNode: (nodeId: string, newParentId: string | null, insertIndex?: number) => Promise<void>
  toggleCollapse: (id: string) => Promise<void>

  addRelationEdge: (sourceId: string, targetId: string, label?: string) => Promise<void>
  removeRelationEdge: (edgeId: string) => Promise<void>

  undo: () => void
  redo: () => void
  pushHistory: () => void

  openSidePanel: (type: 'properties' | 'noteEditor' | 'theme', nodeId?: string) => void
  closeSidePanel: () => void

  persist: () => Promise<void>
}

function buildTreeDepths(nodes: Node<MindmapNodeData>[]): Map<string, number> {
  const depths = new Map<string, number>()
  const childrenMap = new Map<string, string[]>()
  let rootId: string | null = null

  for (const n of nodes) {
    const parentId = n.data.parentId
    if (!parentId) {
      rootId = n.id
    } else {
      const siblings = childrenMap.get(parentId) ?? []
      siblings.push(n.id)
      childrenMap.set(parentId, siblings)
    }
  }

  function walk(id: string, depth: number) {
    depths.set(id, depth)
    for (const childId of childrenMap.get(id) ?? []) {
      walk(childId, depth + 1)
    }
  }
  if (rootId) walk(rootId, 0)
  return depths
}

function apiNodesToRfNodes(apiNodes: any[], mindmapId: string): Node<MindmapNodeData>[] {
  const depths = new Map<string, number>()
  const childrenMap = new Map<string, string[]>()
  let rootId: string | null = null

  for (const n of apiNodes) {
    if (!n.parentId) rootId = n.id
    else {
      const siblings = childrenMap.get(n.parentId) ?? []
      siblings.push(n.id)
      childrenMap.set(n.parentId, siblings)
    }
  }

  function walkDepth(id: string, d: number) {
    depths.set(id, d)
    for (const c of childrenMap.get(id) ?? []) walkDepth(c, d + 1)
  }
  if (rootId) walkDepth(rootId, 0)

  return apiNodes.map(n => ({
    id: n.id,
    type: n.nodeType ?? 'text',
    position: { x: n.positionX ?? 0, y: n.positionY ?? 0 },
    data: {
      id: n.id,
      mindmapId,
      parentId: n.parentId,
      nodeType: n.nodeType ?? 'text',
      annotationId: n.annotationId,
      noteId: n.noteId,
      docId: n.docId,
      hyperlink: n.hyperlink,
      imageUrl: n.imageUrl,
      tagId: n.tagId,
      title: n.title,
      content: n.content,
      color: n.color,
      notes: n.notes,
      shape: n.shape,
      styleOverrides: n.styleOverrides,
      sortOrder: n.sortOrder,
      collapsed: n.collapsed ?? false,
      depth: depths.get(n.id) ?? 0,
    },
  }))
}

function apiEdgesToRfEdges(treeNodes: Node<MindmapNodeData>[], apiEdges: any[]): Edge[] {
  const treeEdges: Edge[] = []
  for (const n of treeNodes) {
    if (n.data.parentId) {
      treeEdges.push({
        id: `tree-${n.data.parentId}-${n.id}`,
        source: n.data.parentId,
        target: n.id,
        type: 'treeEdge',
      })
    }
  }

  const relationEdges: Edge[] = apiEdges.map(e => ({
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    type: 'relationEdge',
    data: { label: e.label },
  }))

  return [...treeEdges, ...relationEdges]
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

export const useMindmapStore = create<MindmapState>((set, get) => ({
  mindmapId: null,
  mindmapTitle: '',
  layout: 'mindmap',
  theme: 'classic',

  rfNodes: [],
  rfEdges: [],
  selectedNodeIds: [],
  editingNodeId: null,

  history: [],
  historyIndex: -1,

  sidePanelType: 'none',
  sidePanelNodeId: null,

  init: async (mindmapId: string) => {
    const mm = await window.electronAPI.mindmaps.get(mindmapId)
    if (!mm) return
    const [apiNodes, apiEdges] = await Promise.all([
      window.electronAPI.mindmaps.getNodes(mindmapId),
      window.electronAPI.mindmaps.getEdges(mindmapId),
    ])
    const rfNodes = apiNodesToRfNodes(apiNodes, mindmapId)
    const rfEdges = apiEdgesToRfEdges(rfNodes, apiEdges)
    set({
      mindmapId,
      mindmapTitle: mm.title,
      layout: mm.layout ?? 'mindmap',
      theme: mm.theme ?? 'classic',
      rfNodes,
      rfEdges,
      selectedNodeIds: [],
      editingNodeId: null,
      history: [{ rfNodes, rfEdges }],
      historyIndex: 0,
    })
  },

  setLayout: (layout) => {
    set({ layout })
    get().persist()
  },
  setTheme: (theme) => {
    set({ theme })
    get().persist()
  },
  setTitle: (title) => {
    set({ mindmapTitle: title })
    get().persist()
  },

  setRfNodes: (nodes) => set({ rfNodes: nodes }),
  setRfEdges: (edges) => set({ rfEdges: edges }),

  selectNode: (id) => set({ selectedNodeIds: id ? [id] : [] }),
  selectNodes: (ids) => set({ selectedNodeIds: ids }),
  toggleSelectNode: (id) => {
    const { selectedNodeIds } = get()
    if (selectedNodeIds.includes(id)) {
      set({ selectedNodeIds: selectedNodeIds.filter(i => i !== id) })
    } else {
      set({ selectedNodeIds: [...selectedNodeIds, id] })
    }
  },
  setEditingNodeId: (id) => set({ editingNodeId: id }),

  addNode: async (parentId, nodeType = 'text') => {
    const { mindmapId, rfNodes } = get()
    if (!mindmapId) return null
    const node = await window.electronAPI.mindmaps.addNode(mindmapId, {
      title: 'New Topic',
      parentId: parentId ?? undefined,
      nodeType,
    })
    const depths = buildTreeDepths(rfNodes)
    const parentDepth = parentId ? (depths.get(parentId) ?? 0) : -1
    const newRfNode: Node<MindmapNodeData> = {
      id: node.id,
      type: nodeType,
      position: { x: 0, y: 0 },
      data: {
        id: node.id, mindmapId, parentId: node.parentId,
        nodeType: node.nodeType ?? nodeType,
        annotationId: null, noteId: null, docId: null,
        hyperlink: null, imageUrl: null, tagId: null,
        title: node.title, content: null, color: null,
        notes: null, shape: null, styleOverrides: null,
        sortOrder: node.sortOrder, collapsed: false,
        depth: parentDepth + 1,
      },
    }
    const updatedNodes = [...rfNodes, newRfNode]
    const treeEdges: Edge[] = []
    for (const n of updatedNodes) {
      if (n.data.parentId) {
        treeEdges.push({ id: `tree-${n.data.parentId}-${n.id}`, source: n.data.parentId, target: n.id, type: 'treeEdge' })
      }
    }
    const relationEdges = get().rfEdges.filter(e => e.type === 'relationEdge')
    set({ rfNodes: updatedNodes, rfEdges: [...treeEdges, ...relationEdges], editingNodeId: node.id })
    get().pushHistory()
    return node.id
  },

  addSiblingNode: async (siblingId) => {
    const sibling = get().rfNodes.find(n => n.id === siblingId)
    if (!sibling || !sibling.data.parentId) return null
    return get().addNode(sibling.data.parentId)
  },

  removeNode: async (id) => {
    const { rfNodes, rfEdges } = get()
    const descendantIds = new Set<string>()
    function collectDescendants(parentId: string) {
      for (const n of rfNodes) {
        if (n.data.parentId === parentId) {
          descendantIds.add(n.id)
          collectDescendants(n.id)
        }
      }
    }
    descendantIds.add(id)
    collectDescendants(id)
    await window.electronAPI.mindmaps.removeNode(id)
    set({
      rfNodes: rfNodes.filter(n => !descendantIds.has(n.id)),
      rfEdges: rfEdges.filter(e => !descendantIds.has(e.source) && !descendantIds.has(e.target)),
      selectedNodeIds: get().selectedNodeIds.filter(i => !descendantIds.has(i)),
    })
    get().pushHistory()
  },

  updateNodeData: async (id, updates) => {
    await window.electronAPI.mindmaps.updateNode(id, updates)
    set({
      rfNodes: get().rfNodes.map(n =>
        n.id === id ? { ...n, data: { ...n.data, ...updates } as MindmapNodeData } : n
      ),
    })
    get().pushHistory()
  },

  reparentNode: async (nodeId, newParentId, insertIndex) => {
    const { rfNodes } = get()
    const descendants = new Set<string>()
    function collect(pid: string) {
      for (const n of rfNodes) {
        if (n.data.parentId === pid) { descendants.add(n.id); collect(n.id) }
      }
    }
    collect(nodeId)
    if (newParentId && (descendants.has(newParentId) || nodeId === newParentId)) return

    await window.electronAPI.mindmaps.updateNode(nodeId, { parentId: newParentId })
    if (insertIndex !== undefined) {
      await window.electronAPI.mindmaps.updateNode(nodeId, { sortOrder: insertIndex })
    }

    const updatedNodes = rfNodes.map(n => {
      if (n.id === nodeId) {
        return { ...n, data: { ...n.data, parentId: newParentId, sortOrder: insertIndex ?? n.data.sortOrder } }
      }
      return n
    })

    const recalcDepths = buildTreeDepths(updatedNodes)
    const withDepths = updatedNodes.map(n => ({
      ...n, data: { ...n.data, depth: recalcDepths.get(n.id) ?? 0 },
    }))

    const treeEdges: Edge[] = []
    for (const n of withDepths) {
      if (n.data.parentId) {
        treeEdges.push({ id: `tree-${n.data.parentId}-${n.id}`, source: n.data.parentId, target: n.id, type: 'treeEdge' })
      }
    }
    const relationEdges = get().rfEdges.filter(e => e.type === 'relationEdge')
    set({ rfNodes: withDepths, rfEdges: [...treeEdges, ...relationEdges] })
    get().pushHistory()
  },

  toggleCollapse: async (id) => {
    const node = get().rfNodes.find(n => n.id === id)
    if (!node) return
    const newCollapsed = !node.data.collapsed
    await window.electronAPI.mindmaps.updateNode(id, { collapsed: newCollapsed })
    set({
      rfNodes: get().rfNodes.map(n =>
        n.id === id ? { ...n, data: { ...n.data, collapsed: newCollapsed } } : n
      ),
    })
  },

  addRelationEdge: async (sourceId, targetId, label) => {
    const { mindmapId } = get()
    if (!mindmapId) return
    const edge = await window.electronAPI.mindmaps.addEdge(mindmapId, { sourceId, targetId, label })
    set({
      rfEdges: [...get().rfEdges, { id: edge.id, source: sourceId, target: targetId, type: 'relationEdge', data: { label } }],
    })
    get().pushHistory()
  },

  removeRelationEdge: async (edgeId) => {
    await window.electronAPI.mindmaps.removeEdge(edgeId)
    set({ rfEdges: get().rfEdges.filter(e => e.id !== edgeId) })
    get().pushHistory()
  },

  pushHistory: () => {
    const { rfNodes, rfEdges, history, historyIndex } = get()
    const trimmed = history.slice(0, historyIndex + 1)
    const newHistory = [...trimmed, { rfNodes, rfEdges }]
    if (newHistory.length > 50) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  undo: () => {
    const { historyIndex, history } = get()
    if (historyIndex <= 0) return
    const prev = history[historyIndex - 1]
    set({ rfNodes: prev.rfNodes, rfEdges: prev.rfEdges, historyIndex: historyIndex - 1 })
  },

  redo: () => {
    const { historyIndex, history } = get()
    if (historyIndex >= history.length - 1) return
    const next = history[historyIndex + 1]
    set({ rfNodes: next.rfNodes, rfEdges: next.rfEdges, historyIndex: historyIndex + 1 })
  },

  openSidePanel: (type, nodeId) => set({ sidePanelType: type, sidePanelNodeId: nodeId ?? null }),
  closeSidePanel: () => set({ sidePanelType: 'none', sidePanelNodeId: null }),

  persist: async () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(async () => {
      const { mindmapId, mindmapTitle, layout, theme } = get()
      if (!mindmapId) return
      await window.electronAPI.mindmaps.update(mindmapId, { title: mindmapTitle, layout, theme })
    }, 500)
  },
}))
```

- [ ] **Step 2: Verify compilation**

```bash
cd packages/app && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/mindmap/useMindmapStore.ts
git commit -m "feat(app): add mindmap Zustand store with undo/redo and IPC persistence"
```

---

## Task 4: Layout Engine (elkjs)

**Files:**
- Create: `packages/app/src/renderer/components/mindmap/useLayoutEngine.ts`

- [ ] **Step 1: Create the layout engine hook**

Create `packages/app/src/renderer/components/mindmap/useLayoutEngine.ts`:

```typescript
import { useCallback, useRef } from 'react'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { Node, Edge } from '@xyflow/react'
import type { MindmapNodeData } from './useMindmapStore.js'

const elk = new ELK()

interface LayoutOptions {
  layout: string
  nodeSizes: Map<string, { width: number; height: number }>
}

function getElkOptions(layout: string): Record<string, string> {
  const common: Record<string, string> = {
    'elk.algorithm': 'mrtree',
    'elk.spacing.nodeNode': '40',
    'elk.mrtree.weighting': 'MODEL_ORDER',
  }

  switch (layout) {
    case 'mindmap':
      return { ...common, 'elk.direction': 'RIGHT' }
    case 'logical':
      return { ...common, 'elk.direction': 'RIGHT', 'elk.spacing.nodeNode': '30' }
    case 'organization':
      return { ...common, 'elk.direction': 'DOWN', 'elk.spacing.nodeNode': '50' }
    default:
      return { ...common, 'elk.direction': 'RIGHT' }
  }
}

function getVisibleNodes(nodes: Node<MindmapNodeData>[]): Set<string> {
  const collapsed = new Set<string>()
  for (const n of nodes) {
    if (n.data.collapsed) collapsed.add(n.id)
  }

  const visible = new Set<string>()
  const childrenMap = new Map<string, string[]>()
  let rootId: string | null = null

  for (const n of nodes) {
    if (!n.data.parentId) rootId = n.id
    else {
      const siblings = childrenMap.get(n.data.parentId) ?? []
      siblings.push(n.id)
      childrenMap.set(n.data.parentId, siblings)
    }
  }

  function walk(id: string) {
    visible.add(id)
    if (collapsed.has(id)) return
    for (const childId of childrenMap.get(id) ?? []) {
      walk(childId)
    }
  }
  if (rootId) walk(rootId)
  return visible
}

async function layoutMindmap(
  nodes: Node<MindmapNodeData>[],
  edges: Edge[],
  options: LayoutOptions,
): Promise<{ nodes: Node<MindmapNodeData>[]; edges: Edge[] }> {
  const visible = getVisibleNodes(nodes)
  const visibleNodes = nodes.filter(n => visible.has(n.id))

  const defaultSize = { width: 160, height: 44 }

  if (options.layout === 'mindmap') {
    return layoutBalancedMindmap(visibleNodes, edges, options, defaultSize)
  }

  const elkOptions = getElkOptions(options.layout)
  const elkNodes = visibleNodes.map(n => {
    const size = options.nodeSizes.get(n.id) ?? defaultSize
    return { id: n.id, width: size.width, height: size.height }
  })

  const treeEdges = edges.filter(e => e.type === 'treeEdge' && visible.has(e.source) && visible.has(e.target))
  const elkEdges = treeEdges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))

  const graph = await elk.layout({
    id: 'root',
    layoutOptions: elkOptions,
    children: elkNodes,
    edges: elkEdges,
  })

  const posMap = new Map<string, { x: number; y: number }>()
  for (const child of graph.children ?? []) {
    posMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
  }

  const layoutedNodes = nodes.map(n => {
    const pos = posMap.get(n.id)
    if (pos) return { ...n, position: pos, hidden: false }
    if (!visible.has(n.id)) return { ...n, hidden: true }
    return n
  })

  return { nodes: layoutedNodes, edges }
}

async function layoutBalancedMindmap(
  visibleNodes: Node<MindmapNodeData>[],
  edges: Edge[],
  options: LayoutOptions,
  defaultSize: { width: number; height: number },
): Promise<{ nodes: Node<MindmapNodeData>[]; edges: Edge[] }> {
  const root = visibleNodes.find(n => !n.data.parentId)
  if (!root) return { nodes: visibleNodes, edges }

  const directChildren = visibleNodes.filter(n => n.data.parentId === root.id)
  const midpoint = Math.ceil(directChildren.length / 2)
  const rightChildIds = new Set(directChildren.slice(0, midpoint).map(n => n.id))
  const leftChildIds = new Set(directChildren.slice(midpoint).map(n => n.id))

  function getSubtreeIds(parentId: string): Set<string> {
    const ids = new Set<string>([parentId])
    for (const n of visibleNodes) {
      if (n.data.parentId && ids.has(n.data.parentId)) ids.add(n.id)
    }
    // iterate until stable
    let changed = true
    while (changed) {
      changed = false
      for (const n of visibleNodes) {
        if (n.data.parentId && ids.has(n.data.parentId) && !ids.has(n.id)) {
          ids.add(n.id)
          changed = true
        }
      }
    }
    return ids
  }

  const rightSubtreeIds = new Set<string>()
  for (const id of rightChildIds) {
    for (const sid of getSubtreeIds(id)) rightSubtreeIds.add(sid)
  }
  const leftSubtreeIds = new Set<string>()
  for (const id of leftChildIds) {
    for (const sid of getSubtreeIds(id)) leftSubtreeIds.add(sid)
  }

  const rightNodes = visibleNodes.filter(n => rightSubtreeIds.has(n.id) || n.id === root.id)
  const leftNodes = visibleNodes.filter(n => leftSubtreeIds.has(n.id) || n.id === root.id)

  const treeEdges = edges.filter(e => e.type === 'treeEdge')

  async function layoutSide(sideNodes: Node<MindmapNodeData>[], direction: string) {
    const elkNodes = sideNodes.map(n => {
      const size = options.nodeSizes.get(n.id) ?? defaultSize
      return { id: n.id, width: size.width, height: size.height }
    })
    const sideIds = new Set(sideNodes.map(n => n.id))
    const sideEdges = treeEdges
      .filter(e => sideIds.has(e.source) && sideIds.has(e.target))
      .map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))

    return elk.layout({
      id: `side-${direction}`,
      layoutOptions: { ...getElkOptions('logical'), 'elk.direction': direction },
      children: elkNodes,
      edges: sideEdges,
    })
  }

  const [rightResult, leftResult] = await Promise.all([
    rightNodes.length > 1 ? layoutSide(rightNodes, 'RIGHT') : null,
    leftNodes.length > 1 ? layoutSide(leftNodes, 'LEFT') : null,
  ])

  const posMap = new Map<string, { x: number; y: number }>()
  const rootSize = options.nodeSizes.get(root.id) ?? defaultSize

  // place root at origin
  posMap.set(root.id, { x: 0, y: 0 })

  if (rightResult) {
    const rootInRight = rightResult.children?.find(c => c.id === root.id)
    const offsetX = rootSize.width + 80
    const offsetY = -(rootInRight?.y ?? 0)
    for (const child of rightResult.children ?? []) {
      if (child.id !== root.id) {
        posMap.set(child.id, { x: (child.x ?? 0) - (rootInRight?.x ?? 0) + offsetX, y: (child.y ?? 0) + offsetY })
      }
    }
  }

  if (leftResult) {
    const rootInLeft = leftResult.children?.find(c => c.id === root.id)
    const offsetY = -(rootInLeft?.y ?? 0)
    for (const child of leftResult.children ?? []) {
      if (child.id !== root.id) {
        const childWidth = options.nodeSizes.get(child.id)?.width ?? defaultSize.width
        posMap.set(child.id, { x: -((rootInLeft?.x ?? 0) - (child.x ?? 0)) - childWidth - 80, y: (child.y ?? 0) + offsetY })
      }
    }
  }

  const allNodes = visibleNodes.map(n => {
    const pos = posMap.get(n.id)
    return pos ? { ...n, position: pos, hidden: false } : n
  })

  // Also update hidden nodes
  const allWithHidden = edges.length > 0 ? allNodes : allNodes
  // nodes not in visibleNodes are already handled in the caller

  return { nodes: allWithHidden, edges }
}

export function useLayoutEngine() {
  const nodeSizesRef = useRef(new Map<string, { width: number; height: number }>())

  const setNodeSize = useCallback((nodeId: string, width: number, height: number) => {
    nodeSizesRef.current.set(nodeId, { width, height })
  }, [])

  const computeLayout = useCallback(async (
    nodes: Node<MindmapNodeData>[],
    edges: Edge[],
    layout: string,
  ): Promise<{ nodes: Node<MindmapNodeData>[]; edges: Edge[] }> => {
    if (nodes.length === 0) return { nodes, edges }
    return layoutMindmap(nodes, edges, { layout, nodeSizes: nodeSizesRef.current })
  }, [])

  return { computeLayout, setNodeSize, nodeSizesRef }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd packages/app && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/mindmap/useLayoutEngine.ts
git commit -m "feat(app): add elkjs layout engine with mindmap/logical/org layouts"
```

---

## Task 5: Node Components

**Files:**
- Create: `packages/app/src/renderer/components/mindmap/nodes/NodeShell.tsx`
- Create: `packages/app/src/renderer/components/mindmap/nodes/TextNode.tsx`
- Create: `packages/app/src/renderer/components/mindmap/nodes/NoteNode.tsx`
- Create: `packages/app/src/renderer/components/mindmap/nodes/DocumentNode.tsx`
- Create: `packages/app/src/renderer/components/mindmap/nodes/AnnotationNode.tsx`
- Create: `packages/app/src/renderer/components/mindmap/nodes/ImageNode.tsx`
- Create: `packages/app/src/renderer/components/mindmap/nodes/LinkNode.tsx`
- Create: `packages/app/src/renderer/components/mindmap/nodes/TagNode.tsx`
- Create: `packages/app/src/renderer/components/mindmap/nodes/index.ts`

- [ ] **Step 1: Create NodeShell (shared wrapper)**

Create `packages/app/src/renderer/components/mindmap/nodes/NodeShell.tsx`:

```tsx
import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import { motion } from 'framer-motion'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { useMindmapStore } from '../useMindmapStore.js'
import { useLayoutEngine } from '../useLayoutEngine.js'
import { getTheme, getNodeStyleForLevel } from '../themes.js'
import type { ShapeName } from '../shapes.js'

interface Props {
  id: string
  data: MindmapNodeData
  selected: boolean
  icon?: string
  accentColor?: string
  children: React.ReactNode
}

export default function NodeShell({ id, data, selected, icon, accentColor, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { editingNodeId, setEditingNodeId, updateNodeData, theme: themeName } = useMindmapStore()
  const { setNodeSize } = useLayoutEngine()
  const [editValue, setEditValue] = useState(data.title)
  const isEditing = editingNodeId === id

  const theme = getTheme(themeName)
  const levelStyle = getNodeStyleForLevel(theme, data.depth)
  const shape = (data.shape ?? levelStyle.shape) as ShapeName
  const fill = data.color ?? levelStyle.fill
  const isUnderline = shape === 'underline'

  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setNodeSize(id, rect.width, rect.height)
    }
  })

  useEffect(() => {
    setEditValue(data.title)
  }, [data.title])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingNodeId(id)
  }, [id, setEditingNodeId])

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      updateNodeData(id, { title: editValue })
      setEditingNodeId(null)
    } else if (e.key === 'Escape') {
      setEditValue(data.title)
      setEditingNodeId(null)
    }
  }, [id, editValue, data.title, updateNodeData, setEditingNodeId])

  const handleEditBlur = useCallback(() => {
    updateNodeData(id, { title: editValue })
    setEditingNodeId(null)
  }, [id, editValue, updateNodeData, setEditingNodeId])

  const borderColor = selected ? '#4A90D9' : (accentColor ?? levelStyle.stroke)
  const borderWidth = selected ? 2 : 1

  const containerStyle: React.CSSProperties = {
    background: isUnderline ? 'transparent' : fill,
    border: isUnderline ? 'none' : `${borderWidth}px solid ${borderColor}`,
    borderBottom: isUnderline ? `2px solid ${levelStyle.stroke}` : undefined,
    borderRadius: isUnderline ? 0 : (levelStyle.borderRadius ?? 8),
    padding: `${levelStyle.padding.y}px ${levelStyle.padding.x}px`,
    fontSize: levelStyle.fontSize,
    fontWeight: levelStyle.fontWeight,
    color: levelStyle.color,
    boxShadow: levelStyle.shadow,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    minWidth: 60,
    whiteSpace: 'nowrap',
  }

  return (
    <motion.div
      ref={containerRef}
      style={containerStyle}
      onDoubleClick={handleDoubleClick}
      layout
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1 }} />

      {icon && <span style={{ fontSize: levelStyle.fontSize + 2, lineHeight: 1 }}>{icon}</span>}

      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={handleEditBlur}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: levelStyle.fontSize, fontWeight: levelStyle.fontWeight,
            color: levelStyle.color, width: Math.max(60, editValue.length * 10),
            padding: 0, margin: 0,
          }}
        />
      ) : children}

      {data.collapsed && (
        <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 4 }}>...</span>
      )}

      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
    </motion.div>
  )
}
```

- [ ] **Step 2: Create TextNode**

Create `packages/app/src/renderer/components/mindmap/nodes/TextNode.tsx`:

```tsx
import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function TextNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  return (
    <NodeShell id={id} data={nodeData} selected={!!selected}>
      <span>{nodeData.title}</span>
    </NodeShell>
  )
}
```

- [ ] **Step 3: Create NoteNode**

Create `packages/app/src/renderer/components/mindmap/nodes/NoteNode.tsx`:

```tsx
import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function NoteNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  const theme = getTheme(useMindmapStore.getState().theme)
  const { icon, accentColor } = theme.nodeTypeStyles.note
  return (
    <NodeShell id={id} data={nodeData} selected={!!selected} icon={icon} accentColor={accentColor}>
      <div>
        <div style={{ fontWeight: 600 }}>{nodeData.title}</div>
        {nodeData.content && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nodeData.content}
          </div>
        )}
      </div>
    </NodeShell>
  )
}
```

- [ ] **Step 4: Create DocumentNode**

Create `packages/app/src/renderer/components/mindmap/nodes/DocumentNode.tsx`:

```tsx
import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function DocumentNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  const theme = getTheme(useMindmapStore.getState().theme)
  const { icon, accentColor } = theme.nodeTypeStyles.document
  return (
    <NodeShell id={id} data={nodeData} selected={!!selected} icon={icon} accentColor={accentColor}>
      <span>{nodeData.title}</span>
    </NodeShell>
  )
}
```

- [ ] **Step 5: Create AnnotationNode**

Create `packages/app/src/renderer/components/mindmap/nodes/AnnotationNode.tsx`:

```tsx
import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function AnnotationNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  const theme = getTheme(useMindmapStore.getState().theme)
  const { icon, accentColor } = theme.nodeTypeStyles.annotation
  return (
    <NodeShell id={id} data={nodeData} selected={!!selected} icon={icon} accentColor={accentColor}>
      <span style={{ fontStyle: 'italic' }}>{nodeData.title}</span>
    </NodeShell>
  )
}
```

- [ ] **Step 6: Create ImageNode**

Create `packages/app/src/renderer/components/mindmap/nodes/ImageNode.tsx`:

```tsx
import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function ImageNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  const theme = getTheme(useMindmapStore.getState().theme)
  const { borderRadius, maxWidth } = theme.nodeTypeStyles.image
  return (
    <NodeShell id={id} data={nodeData} selected={!!selected}>
      <div>
        {nodeData.imageUrl && (
          <img
            src={nodeData.imageUrl}
            alt={nodeData.title}
            style={{ maxWidth, borderRadius, display: 'block' }}
          />
        )}
        {nodeData.title && <div style={{ marginTop: 4, fontSize: 12 }}>{nodeData.title}</div>}
      </div>
    </NodeShell>
  )
}
```

- [ ] **Step 7: Create LinkNode**

Create `packages/app/src/renderer/components/mindmap/nodes/LinkNode.tsx`:

```tsx
import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function LinkNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  const theme = getTheme(useMindmapStore.getState().theme)
  const { icon, accentColor } = theme.nodeTypeStyles.link
  return (
    <NodeShell id={id} data={nodeData} selected={!!selected} icon={icon} accentColor={accentColor}>
      <div>
        <div>{nodeData.title}</div>
        {nodeData.hyperlink && (
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nodeData.hyperlink}
          </div>
        )}
      </div>
    </NodeShell>
  )
}
```

- [ ] **Step 8: Create TagNode**

Create `packages/app/src/renderer/components/mindmap/nodes/TagNode.tsx`:

```tsx
import React from 'react'
import type { NodeProps } from '@xyflow/react'
import type { MindmapNodeData } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'
import NodeShell from './NodeShell.js'

export default function TagNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapNodeData
  const theme = getTheme(useMindmapStore.getState().theme)
  const { accentColor } = theme.nodeTypeStyles.tag
  return (
    <NodeShell id={id} data={{ ...nodeData, shape: 'capsule' }} selected={!!selected} accentColor={accentColor}>
      <span>{nodeData.title}</span>
    </NodeShell>
  )
}
```

- [ ] **Step 9: Create node types index**

Create `packages/app/src/renderer/components/mindmap/nodes/index.ts`:

```typescript
import TextNode from './TextNode.js'
import NoteNode from './NoteNode.js'
import DocumentNode from './DocumentNode.js'
import AnnotationNode from './AnnotationNode.js'
import ImageNode from './ImageNode.js'
import LinkNode from './LinkNode.js'
import TagNode from './TagNode.js'

export const nodeTypes = {
  text: TextNode,
  note: NoteNode,
  document: DocumentNode,
  annotation: AnnotationNode,
  image: ImageNode,
  link: LinkNode,
  tag: TagNode,
}
```

- [ ] **Step 10: Verify compilation**

```bash
cd packages/app && npx tsc --noEmit --skipLibCheck 2>&1 | head -30
```

- [ ] **Step 11: Commit**

```bash
git add packages/app/src/renderer/components/mindmap/nodes/
git commit -m "feat(app): add 7 mindmap node components with NodeShell wrapper"
```

---

## Task 6: Edge Components

**Files:**
- Create: `packages/app/src/renderer/components/mindmap/edges/TreeEdge.tsx`
- Create: `packages/app/src/renderer/components/mindmap/edges/RelationEdge.tsx`
- Create: `packages/app/src/renderer/components/mindmap/edges/index.ts`

- [ ] **Step 1: Create TreeEdge**

Create `packages/app/src/renderer/components/mindmap/edges/TreeEdge.tsx`:

```tsx
import React from 'react'
import { BaseEdge, getBezierPath, getStraightPath, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { useMindmapStore } from '../useMindmapStore.js'
import { getTheme, getEdgeStyleForLevel } from '../themes.js'

export default function TreeEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source } = props
  const { theme: themeName, rfNodes } = useMindmapStore()
  const theme = getTheme(themeName)

  const sourceNode = rfNodes.find(n => n.id === source)
  const depth = sourceNode?.data?.depth ?? 0
  const edgeStyle = getEdgeStyleForLevel(theme, depth)

  let path: string
  switch (theme.edges.type) {
    case 'straight': {
      const [p] = getStraightPath({ sourceX, sourceY, targetX, targetY })
      path = p
      break
    }
    case 'step': {
      const [p] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 })
      path = p
      break
    }
    default: {
      const [p] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
      path = p
    }
  }

  return (
    <BaseEdge
      path={path}
      style={{
        stroke: edgeStyle.color,
        strokeWidth: edgeStyle.width,
        fill: 'none',
        ...(edgeStyle.animated ? {
          strokeDasharray: '8 4',
          animation: 'mindmap-edge-flow 1s linear infinite',
        } : {}),
      }}
    />
  )
}
```

- [ ] **Step 2: Create RelationEdge**

Create `packages/app/src/renderer/components/mindmap/edges/RelationEdge.tsx`:

```tsx
import React from 'react'
import { BaseEdge, getBezierPath, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'
import { useMindmapStore } from '../useMindmapStore.js'
import { getTheme } from '../themes.js'

export default function RelationEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props
  const { theme: themeName } = useMindmapStore()
  const theme = getTheme(themeName)

  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const label = (data as any)?.label

  return (
    <>
      <BaseEdge
        path={path}
        style={{
          stroke: theme.relation.color,
          strokeWidth: theme.relation.width,
          strokeDasharray: theme.relation.dasharray,
          fill: 'none',
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              font: theme.relation.labelFont,
              color: theme.relation.color,
              background: 'white',
              padding: '2px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
```

- [ ] **Step 3: Create edge types index**

Create `packages/app/src/renderer/components/mindmap/edges/index.ts`:

```typescript
import TreeEdge from './TreeEdge.js'
import RelationEdge from './RelationEdge.js'

export const edgeTypes = {
  treeEdge: TreeEdge,
  relationEdge: RelationEdge,
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/renderer/components/mindmap/edges/
git commit -m "feat(app): add TreeEdge and RelationEdge components"
```

---

## Task 7: MindmapCanvas (React Flow)

**Files:**
- Rewrite: `packages/app/src/renderer/components/mindmap/MindmapCanvas.tsx`
- Create: `packages/app/src/renderer/components/mindmap/MindmapCanvas.css`

- [ ] **Step 1: Rewrite MindmapCanvas**

Replace `packages/app/src/renderer/components/mindmap/MindmapCanvas.tsx` with:

```tsx
import React, { useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow, MiniMap, Controls, Background,
  useReactFlow, type OnNodesChange, type OnEdgesChange,
  applyNodeChanges, applyEdgeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './nodes/index.js'
import { edgeTypes } from './edges/index.js'
import { useMindmapStore } from './useMindmapStore.js'
import { useLayoutEngine } from './useLayoutEngine.js'
import { getTheme } from './themes.js'
import './MindmapCanvas.css'

export default function MindmapCanvas() {
  const {
    rfNodes, rfEdges, layout, theme: themeName,
    setRfNodes, setRfEdges, selectNode, toggleSelectNode,
    setEditingNodeId, toggleCollapse,
  } = useMindmapStore()

  const { computeLayout } = useLayoutEngine()
  const { fitView } = useReactFlow()
  const theme = getTheme(themeName)
  const layoutRunRef = useRef(0)

  // Run layout when nodes/edges or layout type change
  useEffect(() => {
    const run = ++layoutRunRef.current
    const doLayout = async () => {
      if (rfNodes.length === 0) return
      const result = await computeLayout(rfNodes, rfEdges, layout)
      if (run !== layoutRunRef.current) return
      setRfNodes(result.nodes)
      setRfEdges(result.edges)
      setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 50)
    }
    doLayout()
  }, [rfNodes.length, layout, rfNodes.map(n => `${n.id}-${n.data.collapsed}-${n.data.parentId}-${n.data.sortOrder}`).join(',')])

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setRfNodes(applyNodeChanges(changes, rfNodes) as typeof rfNodes)
  }, [rfNodes, setRfNodes])

  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    setRfEdges(applyEdgeChanges(changes, rfEdges))
  }, [rfEdges, setRfEdges])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    if (_.metaKey || _.ctrlKey) {
      toggleSelectNode(node.id)
    } else {
      selectNode(node.id)
    }
  }, [selectNode, toggleSelectNode])

  const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: any) => {
    setEditingNodeId(node.id)
  }, [setEditingNodeId])

  const handlePaneClick = useCallback(() => {
    selectNode(null)
    setEditingNodeId(null)
  }, [selectNode, setEditingNodeId])

  return (
    <div className="mindmap-canvas" style={{ width: '100%', height: '100%', background: theme.canvas.background }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={handlePaneClick}
        fitView
        minZoom={0.1}
        maxZoom={3}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          style={{ background: theme.canvas.background }}
          maskColor="rgba(0,0,0,0.1)"
        />
        <Controls />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 2: Create CSS**

Create `packages/app/src/renderer/components/mindmap/MindmapCanvas.css`:

```css
.mindmap-canvas .react-flow__node {
  padding: 0;
  border: none;
  background: none;
  border-radius: 0;
  box-shadow: none;
}

.mindmap-canvas .react-flow__handle {
  border: none;
  background: transparent;
}

@keyframes mindmap-edge-flow {
  to {
    stroke-dashoffset: -12;
  }
}

.mindmap-canvas .react-flow__minimap {
  border-radius: 8px;
  border: 1px solid var(--border, #e0e0e0);
}

.mindmap-canvas .react-flow__controls {
  border-radius: 8px;
  border: 1px solid var(--border, #e0e0e0);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/mindmap/MindmapCanvas.tsx packages/app/src/renderer/components/mindmap/MindmapCanvas.css
git commit -m "feat(app): rewrite MindmapCanvas with React Flow"
```

---

## Task 8: Keyboard Shortcuts

**Files:**
- Create: `packages/app/src/renderer/components/mindmap/useKeyboardShortcuts.ts`

- [ ] **Step 1: Create keyboard shortcuts hook**

Create `packages/app/src/renderer/components/mindmap/useKeyboardShortcuts.ts`:

```typescript
import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useMindmapStore } from './useMindmapStore.js'

export function useKeyboardShortcuts() {
  const {
    rfNodes, selectedNodeIds, editingNodeId,
    addNode, addSiblingNode, removeNode, selectNode,
    setEditingNodeId, toggleCollapse, undo, redo,
  } = useMindmapStore()
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingNodeId) return

      const selected = selectedNodeIds[0]
      const meta = e.metaKey || e.ctrlKey

      // Tab → add child
      if (e.key === 'Tab' && selected) {
        e.preventDefault()
        addNode(selected)
        return
      }

      // Enter → add sibling
      if (e.key === 'Enter' && selected) {
        e.preventDefault()
        addSiblingNode(selected)
        return
      }

      // Delete/Backspace → remove
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault()
        const node = rfNodes.find(n => n.id === selected)
        if (node?.data.parentId) removeNode(selected)
        return
      }

      // Space or F2 → inline edit
      if ((e.key === ' ' || e.key === 'F2') && selected) {
        e.preventDefault()
        setEditingNodeId(selected)
        return
      }

      // / → toggle collapse
      if (e.key === '/' && selected) {
        e.preventDefault()
        toggleCollapse(selected)
        return
      }

      // Cmd+Z → undo
      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }

      // Cmd+Shift+Z → redo
      if (meta && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
        return
      }

      // Cmd+0 → fit view
      if (meta && e.key === '0') {
        e.preventDefault()
        fitView({ duration: 300, padding: 0.2 })
        return
      }

      // Cmd+= → zoom in
      if (meta && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        zoomIn({ duration: 200 })
        return
      }

      // Cmd+- → zoom out
      if (meta && e.key === '-') {
        e.preventDefault()
        zoomOut({ duration: 200 })
        return
      }

      // Arrow keys → navigate
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selected) {
        e.preventDefault()
        navigateNode(e.key, selected)
        return
      }
    }

    function navigateNode(key: string, currentId: string) {
      const current = rfNodes.find(n => n.id === currentId)
      if (!current) return

      const siblings = rfNodes
        .filter(n => n.data.parentId === current.data.parentId)
        .sort((a, b) => a.data.sortOrder - b.data.sortOrder)

      const currentIndex = siblings.findIndex(n => n.id === currentId)

      let targetId: string | null = null

      switch (key) {
        case 'ArrowUp':
          if (currentIndex > 0) targetId = siblings[currentIndex - 1].id
          break
        case 'ArrowDown':
          if (currentIndex < siblings.length - 1) targetId = siblings[currentIndex + 1].id
          break
        case 'ArrowLeft':
          if (current.data.parentId) targetId = current.data.parentId
          break
        case 'ArrowRight': {
          const children = rfNodes
            .filter(n => n.data.parentId === currentId)
            .sort((a, b) => a.data.sortOrder - b.data.sortOrder)
          if (children.length > 0) targetId = children[0].id
          break
        }
      }

      if (targetId) selectNode(targetId)
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [rfNodes, selectedNodeIds, editingNodeId, addNode, addSiblingNode, removeNode, selectNode, setEditingNodeId, toggleCollapse, undo, redo, fitView, zoomIn, zoomOut])
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/mindmap/useKeyboardShortcuts.ts
git commit -m "feat(app): add XMind-style keyboard shortcuts"
```

---

## Task 9: Drag Reparent

**Files:**
- Create: `packages/app/src/renderer/components/mindmap/useDragReparent.ts`

- [ ] **Step 1: Create drag reparent hook**

Create `packages/app/src/renderer/components/mindmap/useDragReparent.ts`:

```typescript
import { useCallback, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useMindmapStore } from './useMindmapStore.js'

interface DragState {
  nodeId: string
  startX: number
  startY: number
  isDragging: boolean
}

export interface DropTarget {
  type: 'reparent' | 'reorder'
  targetId: string
  insertIndex?: number
}

export function useDragReparent() {
  const { rfNodes, reparentNode } = useMindmapStore()
  const { screenToFlowPosition } = useReactFlow()
  const dragRef = useRef<DragState | null>(null)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)

  const isDescendant = useCallback((nodeId: string, potentialAncestorId: string): boolean => {
    const node = rfNodes.find(n => n.id === nodeId)
    if (!node) return false
    if (node.data.parentId === potentialAncestorId) return true
    if (node.data.parentId) return isDescendant(node.data.parentId, potentialAncestorId)
    return false
  }, [rfNodes])

  const onNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    const node = rfNodes.find(n => n.id === nodeId)
    if (!node || !node.data.parentId) return // can't drag root

    dragRef.current = { nodeId, startX: e.clientX, startY: e.clientY, isDragging: false }
    holdTimerRef.current = setTimeout(() => {
      if (dragRef.current) {
        dragRef.current.isDragging = true
        setDraggingNodeId(nodeId)
      }
    }, 200)
  }, [rfNodes])

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current?.isDragging) return

    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    let closestNode: string | null = null
    let closestDist = Infinity

    for (const n of rfNodes) {
      if (n.id === dragRef.current.nodeId) continue
      if (isDescendant(n.id, dragRef.current.nodeId)) continue
      const dx = (n.position.x + 80) - pos.x
      const dy = (n.position.y + 22) - pos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < closestDist && dist < 100) {
        closestDist = dist
        closestNode = n.id
      }
    }

    if (closestNode) {
      setDropTarget({ type: 'reparent', targetId: closestNode })
    } else {
      setDropTarget(null)
    }
  }, [rfNodes, screenToFlowPosition, isDescendant])

  const onMouseUp = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)

    if (dragRef.current?.isDragging && dropTarget) {
      reparentNode(dragRef.current.nodeId, dropTarget.targetId, dropTarget.insertIndex)
    }

    dragRef.current = null
    setDraggingNodeId(null)
    setDropTarget(null)
  }, [dropTarget, reparentNode])

  return {
    draggingNodeId,
    dropTarget,
    onNodeMouseDown,
    onMouseMove,
    onMouseUp,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/mindmap/useDragReparent.ts
git commit -m "feat(app): add drag-to-reparent hook for mindmap nodes"
```

---

## Task 10: Context Menu and Search

**Files:**
- Create: `packages/app/src/renderer/components/mindmap/MindmapContextMenu.tsx`
- Create: `packages/app/src/renderer/components/mindmap/MindmapSearch.tsx`

- [ ] **Step 1: Create context menu**

Create `packages/app/src/renderer/components/mindmap/MindmapContextMenu.tsx`:

```tsx
import React from 'react'
import { useMindmapStore } from './useMindmapStore.js'
import type { MindmapNodeType } from '@banjuan/core'

interface Props {
  x: number
  y: number
  nodeId: string
  onClose: () => void
}

const NODE_TYPES: Array<{ type: MindmapNodeType; label: string }> = [
  { type: 'text', label: 'Text' },
  { type: 'note', label: 'Note' },
  { type: 'document', label: 'Document' },
  { type: 'annotation', label: 'Annotation' },
  { type: 'image', label: 'Image' },
  { type: 'link', label: 'Link' },
  { type: 'tag', label: 'Tag' },
]

export default function MindmapContextMenu({ x, y, nodeId, onClose }: Props) {
  const { addNode, addSiblingNode, removeNode, updateNodeData, setEditingNodeId, openSidePanel, rfNodes } = useMindmapStore()
  const node = rfNodes.find(n => n.id === nodeId)
  const isRoot = !node?.data.parentId

  const menuStyle: React.CSSProperties = {
    position: 'fixed', left: x, top: y, zIndex: 1000,
    background: 'var(--surface, #fff)', border: '1px solid var(--border, #e0e0e0)',
    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    padding: '4px 0', minWidth: 180, fontSize: 13,
  }

  const itemStyle: React.CSSProperties = {
    padding: '8px 16px', cursor: 'pointer', display: 'block', width: '100%',
    border: 'none', background: 'none', textAlign: 'left', fontSize: 13,
    color: 'var(--text, #333)',
  }

  const divider = <div style={{ height: 1, background: 'var(--border, #e0e0e0)', margin: '4px 0' }} />

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={onClose} />
      <div style={menuStyle}>
        <button style={itemStyle} onClick={() => { addNode(nodeId); onClose() }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          Add Child
        </button>
        {!isRoot && (
          <button style={itemStyle} onClick={() => { addSiblingNode(nodeId); onClose() }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            Add Sibling
          </button>
        )}
        <button style={itemStyle} onClick={() => { setEditingNodeId(nodeId); onClose() }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          Edit Title
        </button>
        {divider}
        <div style={{ padding: '4px 16px', fontSize: 11, color: 'var(--text-muted, #999)', fontWeight: 600 }}>
          Convert to...
        </div>
        {NODE_TYPES.map(({ type, label }) => (
          <button key={type} style={{ ...itemStyle, paddingLeft: 24 }}
            onClick={() => { updateNodeData(nodeId, { nodeType: type }); onClose() }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            {label}
          </button>
        ))}
        {divider}
        <button style={itemStyle} onClick={() => { openSidePanel('properties', nodeId); onClose() }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          Properties
        </button>
        {node?.data.nodeType === 'note' && node?.data.noteId && (
          <button style={itemStyle} onClick={() => { openSidePanel('noteEditor', nodeId); onClose() }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            Edit Note
          </button>
        )}
        {divider}
        {!isRoot && (
          <button style={{ ...itemStyle, color: '#e74c3c' }}
            onClick={() => { removeNode(nodeId); onClose() }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            Delete
          </button>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Create search overlay**

Create `packages/app/src/renderer/components/mindmap/MindmapSearch.tsx`:

```tsx
import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useMindmapStore } from './useMindmapStore.js'

interface Props {
  onClose: () => void
}

export default function MindmapSearch({ onClose }: Props) {
  const { rfNodes, selectNode } = useMindmapStore()
  const { setCenter } = useReactFlow()
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = rfNodes.filter(n =>
    query && n.data.title.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setMatchIndex(0)
  }, [query])

  const goToMatch = useCallback((index: number) => {
    if (matches.length === 0) return
    const idx = ((index % matches.length) + matches.length) % matches.length
    setMatchIndex(idx)
    const node = matches[idx]
    selectNode(node.id)
    setCenter(node.position.x + 80, node.position.y + 22, { duration: 300, zoom: 1 })
  }, [matches, selectNode, setCenter])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); goToMatch(matchIndex + 1); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); goToMatch(matchIndex - 1); return }
  }, [matchIndex, goToMatch, onClose])

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 100,
      background: 'var(--surface, #fff)', border: '1px solid var(--border, #e0e0e0)',
      borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search nodes..."
        style={{
          border: 'none', outline: 'none', fontSize: 14, width: 200,
          background: 'transparent', color: 'var(--text, #333)',
        }}
      />
      <span style={{ fontSize: 12, color: 'var(--text-muted, #999)', whiteSpace: 'nowrap' }}>
        {matches.length > 0 ? `${matchIndex + 1}/${matches.length}` : query ? 'No matches' : ''}
      </span>
      <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted, #999)' }}>
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/renderer/components/mindmap/MindmapContextMenu.tsx packages/app/src/renderer/components/mindmap/MindmapSearch.tsx
git commit -m "feat(app): add context menu and search overlay for mindmap"
```

---

## Task 11: MindmapToolbar

**Files:**
- Rewrite: `packages/app/src/renderer/components/mindmap/MindmapToolbar.tsx`

- [ ] **Step 1: Rewrite toolbar**

Replace `packages/app/src/renderer/components/mindmap/MindmapToolbar.tsx` with:

```tsx
import React, { useState, useCallback } from 'react'
import { useMindmapStore } from './useMindmapStore.js'
import { THEMES } from './themes.js'
import { toPng, toSvg } from 'html-to-image'
import { useT } from '../../i18n/index.js'

interface Props {
  onBack: () => void
}

export default function MindmapToolbar({ onBack }: Props) {
  const t = useT()
  const {
    mindmapId, mindmapTitle, layout, theme, selectedNodeIds,
    setTitle, setLayout, setTheme, addNode, removeNode, undo, redo,
    historyIndex, history, rfNodes,
  } = useMindmapStore()

  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const selected = selectedNodeIds[0]
  const hasSelection = !!selected
  const selectedNode = rfNodes.find(n => n.id === selected)
  const canDelete = hasSelection && selectedNode?.data.parentId

  const handleExport = useCallback(async (format: 'png' | 'svg' | 'json') => {
    setExportMenuOpen(false)
    const el = document.querySelector('.react-flow__viewport') as HTMLElement
    if (!el && format !== 'json') return

    if (format === 'json') {
      const data = JSON.stringify({ nodes: rfNodes.map(n => n.data), edges: useMindmapStore.getState().rfEdges }, null, 2)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${mindmapTitle || 'mindmap'}.json`
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    const exporter = format === 'png' ? toPng : toSvg
    const dataUrl = await exporter(el, {
      backgroundColor: format === 'png' ? '#ffffff' : undefined,
      pixelRatio: 2,
    })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${mindmapTitle || 'mindmap'}.${format}`
    a.click()
  }, [rfNodes, mindmapTitle])

  const toolbarStyle: React.CSSProperties = {
    height: 44, padding: '0 12px', borderBottom: '1px solid var(--border, #e0e0e0)',
    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
    background: 'var(--surface, #fff)',
  }

  const btnStyle: React.CSSProperties = {
    border: '1px solid var(--border, #e0e0e0)', background: 'none', borderRadius: 4,
    fontSize: 12, cursor: 'pointer', padding: '4px 10px', color: 'var(--text, #333)',
  }

  const selectStyle: React.CSSProperties = {
    border: '1px solid var(--border, #e0e0e0)', background: 'none', borderRadius: 4,
    fontSize: 12, padding: '4px 6px', color: 'var(--text, #333)',
  }

  return (
    <div style={toolbarStyle}>
      <button onClick={onBack} style={{ ...btnStyle, border: 'none' }}>{t('common.back')}</button>

      <input
        value={mindmapTitle}
        onChange={e => setTitle(e.target.value)}
        style={{ border: 'none', fontSize: 15, fontWeight: 600, width: 200, outline: 'none', background: 'transparent', color: 'var(--text, #333)' }}
      />

      <div style={{ width: 1, height: 20, background: 'var(--border, #e0e0e0)' }} />

      <select value={layout} onChange={e => setLayout(e.target.value)} style={selectStyle}>
        <option value="mindmap">Mindmap</option>
        <option value="logical">Logical</option>
        <option value="organization">Organization</option>
      </select>

      <select value={theme} onChange={e => setTheme(e.target.value)} style={selectStyle}>
        {Object.entries(THEMES).map(([key, t]) => (
          <option key={key} value={key}>{t.name}</option>
        ))}
      </select>

      <div style={{ width: 1, height: 20, background: 'var(--border, #e0e0e0)' }} />

      <button onClick={() => undo()} disabled={historyIndex <= 0} style={{ ...btnStyle, opacity: historyIndex <= 0 ? 0.3 : 1 }}>Undo</button>
      <button onClick={() => redo()} disabled={historyIndex >= history.length - 1} style={{ ...btnStyle, opacity: historyIndex >= history.length - 1 ? 0.3 : 1 }}>Redo</button>

      <div style={{ width: 1, height: 20, background: 'var(--border, #e0e0e0)' }} />

      <button onClick={() => addNode(selected ?? null)} style={btnStyle}>+ Child</button>
      <button onClick={() => removeNode(selected!)} disabled={!canDelete} style={{ ...btnStyle, color: canDelete ? '#e74c3c' : undefined, opacity: canDelete ? 1 : 0.3 }}>Delete</button>

      <div style={{ flex: 1 }} />

      <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button onClick={() => setExportMenuOpen(v => !v)} style={btnStyle}>Export</button>
        {exportMenuOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #e0e0e0)',
            borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 100, minWidth: 120, padding: '4px 0',
          }}>
            {(['png', 'svg', 'json'] as const).map(fmt => (
              <button key={fmt} onClick={() => handleExport(fmt)}
                style={{ display: 'block', width: '100%', padding: '8px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: 'var(--text, #333)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f5f5f5)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/renderer/components/mindmap/MindmapToolbar.tsx
git commit -m "feat(app): rewrite MindmapToolbar with layout/theme switcher and export"
```

---

## Task 12: Side Panels

**Files:**
- Create: `packages/app/src/renderer/components/mindmap/panels/NodePropertyPanel.tsx`
- Create: `packages/app/src/renderer/components/mindmap/panels/NoteEditorPanel.tsx`
- Create: `packages/app/src/renderer/components/mindmap/panels/ThemePanel.tsx`

- [ ] **Step 1: Create NodePropertyPanel**

Create `packages/app/src/renderer/components/mindmap/panels/NodePropertyPanel.tsx`:

```tsx
import React, { useState, useEffect } from 'react'
import { useMindmapStore } from '../useMindmapStore.js'
import type { ShapeName } from '../shapes.js'

const SHAPES: Array<{ value: ShapeName; label: string }> = [
  { value: 'roundedRect', label: 'Rounded' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'underline', label: 'Underline' },
]

const COLORS = ['#4A90D9', '#27AE60', '#E74C3C', '#F39C12', '#8E44AD', '#1ABC9C', '#2C3E50', '#E67E22']

interface Props {
  nodeId: string
  onClose: () => void
}

export default function NodePropertyPanel({ nodeId, onClose }: Props) {
  const { rfNodes, updateNodeData } = useMindmapStore()
  const node = rfNodes.find(n => n.id === nodeId)
  const [notes, setNotes] = useState(node?.data.notes ?? '')

  useEffect(() => {
    setNotes(node?.data.notes ?? '')
  }, [nodeId, node?.data.notes])

  if (!node) return null

  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Properties</h3>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted, #999)', display: 'block', marginBottom: 4 }}>Shape</label>
        <select
          value={node.data.shape ?? ''}
          onChange={e => updateNodeData(nodeId, { shape: e.target.value || null })}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border, #e0e0e0)', fontSize: 13 }}
        >
          <option value="">Theme default</option>
          {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted, #999)', display: 'block', marginBottom: 4 }}>Color</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => updateNodeData(nodeId, { color: null })}
            style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: 10 }}
          >×</button>
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => updateNodeData(nodeId, { color: c })}
              style={{
                width: 24, height: 24, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                outline: node.data.color === c ? '2px solid var(--text)' : 'none', outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted, #999)', display: 'block', marginBottom: 4 }}>Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => updateNodeData(nodeId, { notes: notes || null })}
          rows={4}
          style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border, #e0e0e0)', fontSize: 13, resize: 'vertical' }}
          placeholder="Add remarks..."
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted, #999)', display: 'block', marginBottom: 4 }}>Hyperlink</label>
        <input
          value={node.data.hyperlink ?? ''}
          onChange={e => updateNodeData(nodeId, { hyperlink: e.target.value || null })}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border, #e0e0e0)', fontSize: 13 }}
          placeholder="https://..."
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create NoteEditorPanel**

Create `packages/app/src/renderer/components/mindmap/panels/NoteEditorPanel.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react'
import BlockEditor from '../../notes/BlockEditor.js'

interface Props {
  noteId: string
  onClose: () => void
}

export default function NoteEditorPanel({ noteId, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  useEffect(() => {
    window.electronAPI.notes.get(noteId).then((note: any) => {
      if (note) {
        setTitle(note.title)
        setContent(note.content ?? '')
      }
    })
  }, [noteId])

  const handleChange = useCallback((json: string) => {
    window.electronAPI.notes.update(noteId, { content: json })
  }, [noteId])

  if (content === null) {
    return <div style={{ padding: 16 }}>Loading...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border, #e0e0e0)' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>{title}</h3>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <BlockEditor
          noteId={noteId}
          initialContent={content}
          onChange={handleChange}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create ThemePanel**

Create `packages/app/src/renderer/components/mindmap/panels/ThemePanel.tsx`:

```tsx
import React from 'react'
import { THEMES } from '../themes.js'
import { useMindmapStore } from '../useMindmapStore.js'

interface Props {
  onClose: () => void
}

export default function ThemePanel({ onClose }: Props) {
  const { theme: currentTheme, setTheme } = useMindmapStore()

  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Themes</h3>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(THEMES).map(([key, t]) => (
          <button
            key={key}
            onClick={() => setTheme(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderRadius: 8, cursor: 'pointer',
              border: currentTheme === key ? '2px solid var(--accent, #4A90D9)' : '1px solid var(--border, #e0e0e0)',
              background: 'none',
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 8, background: t.levels.root.fill,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: t.levels.root.color, fontSize: 11, fontWeight: 700,
            }}>
              Aa
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #999)' }}>
                {t.canvas.background === '#1E1E2E' ? 'Dark' : 'Light'} · {t.edges.type}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/renderer/components/mindmap/panels/
git commit -m "feat(app): add mindmap side panels (properties, note editor, themes)"
```

---

## Task 13: MindmapView and Tab Integration

**Files:**
- Rewrite: `packages/app/src/renderer/views/MindmapView.tsx`
- Modify: `packages/app/src/renderer/components/TabManager.tsx`
- Modify: `packages/app/src/renderer/i18n/en.ts`
- Modify: `packages/app/src/renderer/i18n/zh.ts`

- [ ] **Step 1: Rewrite MindmapView**

Replace `packages/app/src/renderer/views/MindmapView.tsx` with:

```tsx
import React, { useEffect, useState, useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import MindmapCanvas from '../components/mindmap/MindmapCanvas.js'
import MindmapToolbar from '../components/mindmap/MindmapToolbar.js'
import MindmapContextMenu from '../components/mindmap/MindmapContextMenu.js'
import MindmapSearch from '../components/mindmap/MindmapSearch.js'
import NodePropertyPanel from '../components/mindmap/panels/NodePropertyPanel.js'
import NoteEditorPanel from '../components/mindmap/panels/NoteEditorPanel.js'
import ThemePanel from '../components/mindmap/panels/ThemePanel.js'
import { useMindmapStore } from '../components/mindmap/useMindmapStore.js'
import { useKeyboardShortcuts } from '../components/mindmap/useKeyboardShortcuts.js'

interface Props {
  mindmap: { id: string; title: string }
  onBack: () => void
}

function MindmapViewInner({ mindmap, onBack }: Props) {
  const { init, sidePanelType, sidePanelNodeId, closeSidePanel, rfNodes } = useMindmapStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  useKeyboardShortcuts()

  useEffect(() => {
    init(mindmap.id)
  }, [mindmap.id, init])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const target = (e.target as HTMLElement).closest('.react-flow__node')
    if (!target) return
    const nodeId = target.getAttribute('data-id')
    if (nodeId) setContextMenu({ x: e.clientX, y: e.clientY, nodeId })
  }, [])

  const selectedNoteId = sidePanelNodeId
    ? rfNodes.find(n => n.id === sidePanelNodeId)?.data.noteId
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} onContextMenu={handleContextMenu}>
      <MindmapToolbar onBack={onBack} />
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <MindmapCanvas />
          {searchOpen && <MindmapSearch onClose={() => setSearchOpen(false)} />}
        </div>

        {sidePanelType !== 'none' && (
          <>
            <div style={{ width: 4, flexShrink: 0, background: 'var(--border, #e0e0e0)' }} />
            <div style={{ width: 300, flexShrink: 0, overflow: 'hidden', background: 'var(--surface, #fff)' }}>
              {sidePanelType === 'properties' && sidePanelNodeId && (
                <NodePropertyPanel nodeId={sidePanelNodeId} onClose={closeSidePanel} />
              )}
              {sidePanelType === 'noteEditor' && selectedNoteId && (
                <NoteEditorPanel noteId={selectedNoteId} onClose={closeSidePanel} />
              )}
              {sidePanelType === 'theme' && (
                <ThemePanel onClose={closeSidePanel} />
              )}
            </div>
          </>
        )}
      </div>

      {contextMenu && (
        <MindmapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

export default function MindmapView(props: Props) {
  return (
    <ReactFlowProvider>
      <MindmapViewInner {...props} />
    </ReactFlowProvider>
  )
}
```

- [ ] **Step 2: Update TabManager to support mindmap tabs**

In `packages/app/src/renderer/components/TabManager.tsx`, add mindmap import and openMindmap callback:

Add import at top:
```typescript
import MindmapView from '../views/MindmapView.js'
```

Add `openMindmap` callback after `openNote`:
```typescript
const openMindmap = useCallback((mindmap: any) => {
  const existingTab = tabs.find(t => t.type === 'mindmap' && tabData.get(t.id)?.id === mindmap.id)
  if (existingTab) {
    setActiveTabId(existingTab.id)
    return
  }
  const tabId = `mindmap-${mindmap.id}`
  const newTab: Tab = { id: tabId, type: 'mindmap', title: mindmap.title, closable: true }
  setTabs(prev => [...prev, newTab])
  setTabData(prev => new Map(prev).set(tabId, mindmap))
  setActiveTabId(tabId)
}, [tabs, tabData])
```

Pass `openMindmap` to `LibraryView`:
```typescript
onOpenMindmap={openMindmap}
```

Add mindmap rendering after the note tab rendering block:
```tsx
{tab.type === 'mindmap' && tabData.get(tab.id) && (
  <MindmapView
    mindmap={tabData.get(tab.id)}
    onBack={() => closeTab(tab.id)}
  />
)}
```

- [ ] **Step 3: Add i18n keys**

In `packages/app/src/renderer/i18n/en.ts`, update the mindmap section:
```typescript
'mindmap.label': 'Mindmap',
'mindmap.addRoot': '+ Root',
'mindmap.addChild': '+ Child',
'mindmap.delete': 'Delete',
'mindmap.edit': 'Edit',
'mindmap.undo': 'Undo',
'mindmap.redo': 'Redo',
'mindmap.export': 'Export',
'mindmap.search': 'Search nodes...',
'mindmap.properties': 'Properties',
'mindmap.themes': 'Themes',
```

In `packages/app/src/renderer/i18n/zh.ts`:
```typescript
'mindmap.label': '脑图',
'mindmap.addRoot': '+ 根节点',
'mindmap.addChild': '+ 子节点',
'mindmap.delete': '删除',
'mindmap.edit': '编辑',
'mindmap.undo': '撤销',
'mindmap.redo': '重做',
'mindmap.export': '导出',
'mindmap.search': '搜索节点...',
'mindmap.properties': '属性',
'mindmap.themes': '主题',
```

- [ ] **Step 4: Delete old MindmapNode.tsx**

Remove the old D3-based `packages/app/src/renderer/components/mindmap/MindmapNode.tsx` file (replaced by nodes/ directory).

```bash
rm packages/app/src/renderer/components/mindmap/MindmapNode.tsx
```

- [ ] **Step 5: Build and test**

```bash
cd packages/core && npm run build && cd ../app && npm run build
```

Expected: Clean compilation, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(app): rewrite MindmapView with React Flow, integrate into TabManager"
```

---

## Task 14: Integration Testing and Polish

- [ ] **Step 1: Start dev server**

```bash
cd packages/app && npm run dev
```

- [ ] **Step 2: Manual verification checklist**

Open the app and verify:

1. Create a new mindmap from the library view
2. Root node appears centered with Classic theme
3. Tab → adds child node, enters inline edit mode
4. Enter → adds sibling node
5. Space → enters edit mode, Enter to confirm, Escape to cancel
6. Arrow keys navigate between nodes
7. Delete removes selected node (not root)
8. Right-click context menu appears with correct options
9. Switch layout: Mindmap (bilateral) / Logical (right) / Organization (down)
10. Switch theme through dropdown — all 6 themes change appearance
11. Undo/Redo buttons work
12. Export PNG/SVG/JSON — files download correctly
13. Cmd+F opens search, typing highlights matching nodes
14. Collapse/expand works (/ key or click)
15. Side panel opens for node properties
16. Minimap and zoom controls visible

- [ ] **Step 3: Fix any issues found during testing**

Address any compilation errors, rendering issues, or interaction bugs.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix(app): polish mindmap integration and fix issues from testing"
```
