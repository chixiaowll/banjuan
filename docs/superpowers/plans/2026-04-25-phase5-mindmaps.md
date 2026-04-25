# Phase 5: Mind Map Notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MarginNote-style mind map notes — users can create mind maps linked to documents, add nodes (manually or from annotations), connect them with edges, and organize their understanding visually. Each document can have multiple mind maps.

**Architecture:** MindmapService in @banjuan/core handles CRUD for mindmaps, nodes, and edges (schema tables already exist). The app renders mind maps using D3.js tree layout in an SVG canvas with interactive node editing, drag-to-connect, and zoom/pan.

**Tech Stack:** D3.js (d3-hierarchy, d3-zoom, d3-selection), React, SVG, Electron IPC, existing SQLite schema

---

## File Structure

```
packages/core/src/
├── mindmaps/
│   └── service.ts              # MindmapService: CRUD for mindmaps, nodes, edges
├── types.ts                     # Add Mindmap, MindmapNode, MindmapEdge types
├── library.ts                   # Add mindmaps service

packages/core/test/
└── mindmaps.test.ts             # MindmapService tests

packages/app/src/
├── main/
│   └── ipc.ts                   # Add mindmap IPC handlers
├── preload/
│   └── index.ts                 # Add mindmaps namespace
├── renderer/
│   ├── App.tsx                  # Add mindmap viewing state
│   ├── components/
│   │   └── mindmap/
│   │       ├── MindmapCanvas.tsx    # D3.js SVG canvas with tree layout
│   │       ├── MindmapNode.tsx      # Single node component
│   │       └── MindmapToolbar.tsx   # Top toolbar (add node, layout, export)
│   └── views/
│       ├── MindmapView.tsx          # Full mindmap editing screen
│       └── LibraryView.tsx          # Add mindmap list to sidebar
├── electron.d.ts
```

---

## Task 1: Core Types + MindmapService

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/mindmaps/service.ts`
- Modify: `packages/core/src/library.ts`

- [ ] **Step 1: Add types to types.ts**

Add at the end of the file:

```typescript
export type MindmapLayout = 'tree' | 'radial' | 'free'

export interface Mindmap {
  id: string
  title: string
  docId: string | null
  layout: MindmapLayout
  createdAt: string
  updatedAt: string
}

export interface MindmapCreateInput {
  title: string
  docId?: string
  layout?: MindmapLayout
}

export interface MindmapNode {
  id: string
  mindmapId: string
  parentId: string | null
  annotationId: string | null
  title: string
  content: string | null
  color: string | null
  positionX: number | null
  positionY: number | null
  sortOrder: number
  collapsed: boolean
  createdAt: string
}

export interface MindmapNodeCreateInput {
  title: string
  parentId?: string
  annotationId?: string
  content?: string
  color?: string
  positionX?: number
  positionY?: number
}

export interface MindmapEdge {
  id: string
  mindmapId: string
  sourceId: string
  targetId: string
  label: string | null
  style: string | null
}

export interface MindmapEdgeCreateInput {
  sourceId: string
  targetId: string
  label?: string
}
```

- [ ] **Step 2: Create MindmapService**

Create `packages/core/src/mindmaps/service.ts`:

```typescript
import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import type {
  Mindmap, MindmapCreateInput, MindmapNode, MindmapNodeCreateInput,
  MindmapEdge, MindmapEdgeCreateInput,
} from '../types.js'

export class MindmapService {
  constructor(private db: Database.Database) {}

  async create(input: MindmapCreateInput): Promise<Mindmap> {
    const id = uuid()
    const now = new Date().toISOString()
    this.db.prepare(
      `INSERT INTO mindmaps (id, title, doc_id, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, input.title, input.docId ?? null, input.layout ?? 'tree', now, now)
    return { id, title: input.title, docId: input.docId ?? null, layout: input.layout ?? 'tree', createdAt: now, updatedAt: now }
  }

  async list(options?: { docId?: string }): Promise<Mindmap[]> {
    let sql = 'SELECT * FROM mindmaps'
    const params: unknown[] = []
    if (options?.docId) { sql += ' WHERE doc_id = ?'; params.push(options.docId) }
    sql += ' ORDER BY created_at DESC'
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>
    return rows.map(rowToMindmap)
  }

  async get(id: string): Promise<Mindmap | null> {
    const row = this.db.prepare('SELECT * FROM mindmaps WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? rowToMindmap(row) : null
  }

  async update(id: string, updates: { title?: string; layout?: string }): Promise<Mindmap> {
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const params: unknown[] = [now]
    if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
    if (updates.layout !== undefined) { sets.push('layout = ?'); params.push(updates.layout) }
    params.push(id)
    this.db.prepare(`UPDATE mindmaps SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    return (await this.get(id))!
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM mindmaps WHERE id = ?').run(id)
  }

  // --- Nodes ---

  async addNode(mindmapId: string, input: MindmapNodeCreateInput): Promise<MindmapNode> {
    const id = uuid()
    const now = new Date().toISOString()
    const maxSort = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM mindmap_nodes WHERE mindmap_id = ? AND parent_id IS ?'
    ).get(mindmapId, input.parentId ?? null) as { next: number }

    this.db.prepare(
      `INSERT INTO mindmap_nodes (id, mindmap_id, parent_id, annotation_id, title, content, color, position_x, position_y, sort_order, collapsed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(id, mindmapId, input.parentId ?? null, input.annotationId ?? null,
      input.title, input.content ?? null, input.color ?? null,
      input.positionX ?? null, input.positionY ?? null, maxSort.next, now)

    return {
      id, mindmapId, parentId: input.parentId ?? null, annotationId: input.annotationId ?? null,
      title: input.title, content: input.content ?? null, color: input.color ?? null,
      positionX: input.positionX ?? null, positionY: input.positionY ?? null,
      sortOrder: maxSort.next, collapsed: false, createdAt: now,
    }
  }

  async getNodes(mindmapId: string): Promise<MindmapNode[]> {
    const rows = this.db.prepare(
      'SELECT * FROM mindmap_nodes WHERE mindmap_id = ? ORDER BY sort_order ASC'
    ).all(mindmapId) as Array<Record<string, unknown>>
    return rows.map(rowToNode)
  }

  async updateNode(id: string, updates: {
    title?: string; content?: string; color?: string;
    positionX?: number; positionY?: number; collapsed?: boolean; parentId?: string | null
  }): Promise<MindmapNode> {
    const sets: string[] = []
    const params: unknown[] = []
    if (updates.title !== undefined) { sets.push('title = ?'); params.push(updates.title) }
    if (updates.content !== undefined) { sets.push('content = ?'); params.push(updates.content) }
    if (updates.color !== undefined) { sets.push('color = ?'); params.push(updates.color) }
    if (updates.positionX !== undefined) { sets.push('position_x = ?'); params.push(updates.positionX) }
    if (updates.positionY !== undefined) { sets.push('position_y = ?'); params.push(updates.positionY) }
    if (updates.collapsed !== undefined) { sets.push('collapsed = ?'); params.push(updates.collapsed ? 1 : 0) }
    if (updates.parentId !== undefined) { sets.push('parent_id = ?'); params.push(updates.parentId) }
    if (sets.length === 0) {
      const row = this.db.prepare('SELECT * FROM mindmap_nodes WHERE id = ?').get(id) as Record<string, unknown>
      return rowToNode(row)
    }
    params.push(id)
    this.db.prepare(`UPDATE mindmap_nodes SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    const row = this.db.prepare('SELECT * FROM mindmap_nodes WHERE id = ?').get(id) as Record<string, unknown>
    return rowToNode(row)
  }

  async removeNode(id: string): Promise<void> {
    this.db.prepare('DELETE FROM mindmap_nodes WHERE id = ?').run(id)
  }

  // --- Edges ---

  async addEdge(mindmapId: string, input: MindmapEdgeCreateInput): Promise<MindmapEdge> {
    const id = uuid()
    this.db.prepare(
      `INSERT INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, mindmapId, input.sourceId, input.targetId, input.label ?? null, null)
    return {
      id, mindmapId, sourceId: input.sourceId, targetId: input.targetId,
      label: input.label ?? null, style: null,
    }
  }

  async getEdges(mindmapId: string): Promise<MindmapEdge[]> {
    const rows = this.db.prepare(
      'SELECT * FROM mindmap_edges WHERE mindmap_id = ?'
    ).all(mindmapId) as Array<Record<string, unknown>>
    return rows.map(rowToEdge)
  }

  async removeEdge(id: string): Promise<void> {
    this.db.prepare('DELETE FROM mindmap_edges WHERE id = ?').run(id)
  }
}

function rowToMindmap(row: Record<string, unknown>): Mindmap {
  return {
    id: row.id as string, title: row.title as string,
    docId: row.doc_id as string | null, layout: (row.layout as Mindmap['layout']) ?? 'tree',
    createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  }
}

function rowToNode(row: Record<string, unknown>): MindmapNode {
  return {
    id: row.id as string, mindmapId: row.mindmap_id as string,
    parentId: row.parent_id as string | null, annotationId: row.annotation_id as string | null,
    title: row.title as string, content: row.content as string | null,
    color: row.color as string | null,
    positionX: row.position_x as number | null, positionY: row.position_y as number | null,
    sortOrder: row.sort_order as number, collapsed: (row.collapsed as number) === 1,
    createdAt: row.created_at as string,
  }
}

function rowToEdge(row: Record<string, unknown>): MindmapEdge {
  return {
    id: row.id as string, mindmapId: row.mindmap_id as string,
    sourceId: row.source_id as string, targetId: row.target_id as string,
    label: row.label as string | null, style: row.style as string | null,
  }
}
```

- [ ] **Step 3: Add MindmapService to Library**

In `packages/core/src/library.ts`, import MindmapService and add it:

```typescript
import { MindmapService } from './mindmaps/service.js'
```

Add to class fields:
```typescript
readonly mindmaps: MindmapService
```

Add to constructor:
```typescript
this.mindmaps = new MindmapService(db)
```

- [ ] **Step 4: Verify TypeScript compiles and core tests pass**

```bash
pnpm --filter @banjuan/core build
pnpm --filter @banjuan/core test
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(core): MindmapService with CRUD for mindmaps, nodes, and edges"
```

---

## Task 2: MindmapService Tests

**Files:**
- Create: `packages/core/test/mindmaps.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Library } from '../src/library.js'

describe('MindmapService', () => {
  let library: Library
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'banjuan-test-'))
    library = Library.init(tempDir)
  })

  afterEach(() => {
    library.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates a mindmap', async () => {
    const map = await library.mindmaps.create({ title: '概念图' })
    expect(map.title).toBe('概念图')
    expect(map.layout).toBe('tree')
    expect(map.docId).toBeNull()
  })

  it('creates a mindmap linked to a document', async () => {
    const doc = await library.documents.import(join(tempDir, 'test.txt'))
    // Need a real file — create one first
  })

  it('lists mindmaps', async () => {
    await library.mindmaps.create({ title: 'Map 1' })
    await library.mindmaps.create({ title: 'Map 2' })
    const maps = await library.mindmaps.list()
    expect(maps).toHaveLength(2)
  })

  it('adds and retrieves nodes', async () => {
    const map = await library.mindmaps.create({ title: 'Test' })
    const root = await library.mindmaps.addNode(map.id, { title: 'Root' })
    const child = await library.mindmaps.addNode(map.id, { title: 'Child', parentId: root.id })
    const nodes = await library.mindmaps.getNodes(map.id)
    expect(nodes).toHaveLength(2)
    expect(nodes[0].title).toBe('Root')
    expect(nodes[1].parentId).toBe(root.id)
  })

  it('updates a node', async () => {
    const map = await library.mindmaps.create({ title: 'Test' })
    const node = await library.mindmaps.addNode(map.id, { title: 'Node' })
    const updated = await library.mindmaps.updateNode(node.id, { title: 'Updated', color: '#ff0000' })
    expect(updated.title).toBe('Updated')
    expect(updated.color).toBe('#ff0000')
  })

  it('removes a node and its children (cascade)', async () => {
    const map = await library.mindmaps.create({ title: 'Test' })
    const root = await library.mindmaps.addNode(map.id, { title: 'Root' })
    await library.mindmaps.addNode(map.id, { title: 'Child', parentId: root.id })
    await library.mindmaps.removeNode(root.id)
    const nodes = await library.mindmaps.getNodes(map.id)
    expect(nodes).toHaveLength(0)
  })

  it('adds and retrieves edges', async () => {
    const map = await library.mindmaps.create({ title: 'Test' })
    const a = await library.mindmaps.addNode(map.id, { title: 'A' })
    const b = await library.mindmaps.addNode(map.id, { title: 'B' })
    const edge = await library.mindmaps.addEdge(map.id, { sourceId: a.id, targetId: b.id, label: '关联' })
    expect(edge.label).toBe('关联')
    const edges = await library.mindmaps.getEdges(map.id)
    expect(edges).toHaveLength(1)
  })

  it('deletes a mindmap and cascades', async () => {
    const map = await library.mindmaps.create({ title: 'Test' })
    await library.mindmaps.addNode(map.id, { title: 'Node' })
    await library.mindmaps.delete(map.id)
    const result = await library.mindmaps.get(map.id)
    expect(result).toBeNull()
    const nodes = await library.mindmaps.getNodes(map.id)
    expect(nodes).toHaveLength(0)
  })

  it('updates a mindmap', async () => {
    const map = await library.mindmaps.create({ title: 'Old' })
    const updated = await library.mindmaps.update(map.id, { title: 'New', layout: 'radial' })
    expect(updated.title).toBe('New')
    expect(updated.layout).toBe('radial')
  })
})
```

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @banjuan/core test
```

Expected: All tests pass (previous 42 + new mindmap tests).

- [ ] **Step 3: Commit**

```bash
git commit -m "test(core): MindmapService tests"
```

---

## Task 3: Mindmap IPC Bridge

**Files:**
- Modify: `packages/app/src/main/ipc.ts`
- Modify: `packages/app/src/preload/index.ts`
- Modify: `packages/app/electron.d.ts`

- [ ] **Step 1: Add mindmap IPC handlers in ipc.ts**

```typescript
ipcMain.handle('mindmaps:create', async (_event, input: { title: string; docId?: string; layout?: string }) => {
  if (!library) throw new Error('No library open')
  return library.mindmaps.create(input as any)
})

ipcMain.handle('mindmaps:list', async (_event, options?: { docId?: string }) => {
  if (!library) throw new Error('No library open')
  return library.mindmaps.list(options)
})

ipcMain.handle('mindmaps:get', async (_event, id: string) => {
  if (!library) throw new Error('No library open')
  return library.mindmaps.get(id)
})

ipcMain.handle('mindmaps:update', async (_event, id: string, updates: { title?: string; layout?: string }) => {
  if (!library) throw new Error('No library open')
  return library.mindmaps.update(id, updates)
})

ipcMain.handle('mindmaps:delete', async (_event, id: string) => {
  if (!library) throw new Error('No library open')
  return library.mindmaps.delete(id)
})

ipcMain.handle('mindmaps:addNode', async (_event, mindmapId: string, input: {
  title: string; parentId?: string; annotationId?: string; content?: string; color?: string
}) => {
  if (!library) throw new Error('No library open')
  return library.mindmaps.addNode(mindmapId, input)
})

ipcMain.handle('mindmaps:getNodes', async (_event, mindmapId: string) => {
  if (!library) throw new Error('No library open')
  return library.mindmaps.getNodes(mindmapId)
})

ipcMain.handle('mindmaps:updateNode', async (_event, id: string, updates: {
  title?: string; content?: string; color?: string;
  positionX?: number; positionY?: number; collapsed?: boolean; parentId?: string | null
}) => {
  if (!library) throw new Error('No library open')
  return library.mindmaps.updateNode(id, updates)
})

ipcMain.handle('mindmaps:removeNode', async (_event, id: string) => {
  if (!library) throw new Error('No library open')
  return library.mindmaps.removeNode(id)
})

ipcMain.handle('mindmaps:addEdge', async (_event, mindmapId: string, input: {
  sourceId: string; targetId: string; label?: string
}) => {
  if (!library) throw new Error('No library open')
  return library.mindmaps.addEdge(mindmapId, input)
})

ipcMain.handle('mindmaps:getEdges', async (_event, mindmapId: string) => {
  if (!library) throw new Error('No library open')
  return library.mindmaps.getEdges(mindmapId)
})

ipcMain.handle('mindmaps:removeEdge', async (_event, id: string) => {
  if (!library) throw new Error('No library open')
  return library.mindmaps.removeEdge(id)
})
```

- [ ] **Step 2: Add mindmaps to preload**

```typescript
mindmaps: {
  create: (input: { title: string; docId?: string; layout?: string }) =>
    ipcRenderer.invoke('mindmaps:create', input),
  list: (options?: { docId?: string }) => ipcRenderer.invoke('mindmaps:list', options),
  get: (id: string) => ipcRenderer.invoke('mindmaps:get', id),
  update: (id: string, updates: { title?: string; layout?: string }) =>
    ipcRenderer.invoke('mindmaps:update', id, updates),
  delete: (id: string) => ipcRenderer.invoke('mindmaps:delete', id),
  addNode: (mindmapId: string, input: { title: string; parentId?: string; annotationId?: string; content?: string; color?: string }) =>
    ipcRenderer.invoke('mindmaps:addNode', mindmapId, input),
  getNodes: (mindmapId: string) => ipcRenderer.invoke('mindmaps:getNodes', mindmapId),
  updateNode: (id: string, updates: any) => ipcRenderer.invoke('mindmaps:updateNode', id, updates),
  removeNode: (id: string) => ipcRenderer.invoke('mindmaps:removeNode', id),
  addEdge: (mindmapId: string, input: { sourceId: string; targetId: string; label?: string }) =>
    ipcRenderer.invoke('mindmaps:addEdge', mindmapId, input),
  getEdges: (mindmapId: string) => ipcRenderer.invoke('mindmaps:getEdges', mindmapId),
  removeEdge: (id: string) => ipcRenderer.invoke('mindmaps:removeEdge', id),
},
```

- [ ] **Step 3: Update electron.d.ts**

Add `mindmaps` to ElectronAPI with matching type signatures.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(app): add mindmap IPC handlers"
```

---

## Task 4: D3.js Mind Map Canvas

**Files:**
- Create: `packages/app/src/renderer/components/mindmap/MindmapCanvas.tsx`
- Create: `packages/app/src/renderer/components/mindmap/MindmapNode.tsx`

- [ ] **Step 1: Install D3.js**

```bash
pnpm --filter @banjuan/app add d3 @types/d3
```

- [ ] **Step 2: Create MindmapNode component**

A single node rendered as an SVG group (`<g>`):

```typescript
// MindmapNode.tsx
import React from 'react'

interface Props {
  id: string
  title: string
  color: string | null
  x: number
  y: number
  isSelected: boolean
  collapsed: boolean
  hasChildren: boolean
  onSelect: (id: string) => void
  onDoubleClick: (id: string) => void
  onToggleCollapse: (id: string) => void
}

export default function MindmapNode({
  id, title, color, x, y, isSelected, collapsed, hasChildren,
  onSelect, onDoubleClick, onToggleCollapse,
}: Props) {
  const width = Math.max(120, title.length * 10 + 32)
  const height = 36

  return (
    <g
      transform={`translate(${x - width / 2},${y - height / 2})`}
      onClick={(e) => { e.stopPropagation(); onSelect(id) }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(id) }}
      style={{ cursor: 'pointer' }}
    >
      <rect
        width={width}
        height={height}
        rx={8}
        ry={8}
        fill={color ?? 'var(--surface, #313244)'}
        stroke={isSelected ? '#89b4fa' : 'var(--border, #45475a)'}
        strokeWidth={isSelected ? 2 : 1}
      />
      <text
        x={width / 2}
        y={height / 2 + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text, #cdd6f4)"
        fontSize={13}
      >
        {title.length > 16 ? title.slice(0, 15) + '…' : title}
      </text>
      {hasChildren && (
        <g
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(id) }}
          style={{ cursor: 'pointer' }}
        >
          <circle cx={width / 2} cy={height + 8} r={8} fill="var(--surface, #313244)" stroke="var(--border, #45475a)" />
          <text x={width / 2} y={height + 9} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="var(--text-muted, #a6adc8)">
            {collapsed ? '+' : '−'}
          </text>
        </g>
      )}
    </g>
  )
}
```

- [ ] **Step 3: Create MindmapCanvas component**

The main canvas that uses D3 tree layout to position nodes and renders them in SVG with zoom/pan:

```typescript
// MindmapCanvas.tsx
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import MindmapNodeComponent from './MindmapNode.js'

interface NodeData {
  id: string
  parentId: string | null
  title: string
  content: string | null
  color: string | null
  collapsed: boolean
}

interface EdgeData {
  id: string
  sourceId: string
  targetId: string
  label: string | null
}

interface Props {
  nodes: NodeData[]
  edges: EdgeData[]
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onDoubleClickNode: (id: string) => void
  onToggleCollapse: (id: string) => void
}

interface LayoutNode {
  id: string
  title: string
  color: string | null
  collapsed: boolean
  x: number
  y: number
  hasChildren: boolean
}

interface LayoutLink {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}

export default function MindmapCanvas({
  nodes, edges, selectedNodeId, onSelectNode, onDoubleClickNode, onToggleCollapse,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })

  // D3 zoom
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return
    const svg = d3.select(svgRef.current)
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => {
        setTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k })
      })
    svg.call(zoom)
    // Center initially
    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, 60))
    return () => { svg.on('.zoom', null) }
  }, [])

  // Build tree layout
  const { layoutNodes, layoutLinks } = useMemo(() => {
    if (nodes.length === 0) return { layoutNodes: [] as LayoutNode[], layoutLinks: [] as LayoutLink[] }

    // Build hierarchy data
    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const roots = nodes.filter(n => n.parentId === null)
    if (roots.length === 0) return { layoutNodes: [] as LayoutNode[], layoutLinks: [] as LayoutLink[] }

    const buildChildren = (parentId: string): any[] => {
      const parent = nodeMap.get(parentId)
      if (parent?.collapsed) return []
      return nodes
        .filter(n => n.parentId === parentId)
        .map(n => ({ ...n, children: buildChildren(n.id) }))
    }

    const rootData = {
      ...roots[0],
      children: buildChildren(roots[0].id),
    }

    const hierarchy = d3.hierarchy(rootData)
    const treeLayout = d3.tree<any>().nodeSize([160, 80])
    treeLayout(hierarchy)

    const lNodes: LayoutNode[] = hierarchy.descendants().map((d: any) => ({
      id: d.data.id,
      title: d.data.title,
      color: d.data.color,
      collapsed: d.data.collapsed,
      x: d.x,
      y: d.y,
      hasChildren: nodes.some(n => n.parentId === d.data.id),
    }))

    const lLinks: LayoutLink[] = hierarchy.links().map((link: any) => ({
      sourceX: link.source.x,
      sourceY: link.source.y + 18,
      targetX: link.target.x,
      targetY: link.target.y - 18,
    }))

    return { layoutNodes: lNodes, layoutLinks: lLinks }
  }, [nodes])

  // Also render cross-edges (non-parent edges)
  const crossEdgeLines = useMemo(() => {
    const nodePositions = new Map(layoutNodes.map(n => [n.id, { x: n.x, y: n.y }]))
    return edges
      .filter(e => {
        const src = nodePositions.get(e.sourceId)
        const tgt = nodePositions.get(e.targetId)
        return src && tgt
      })
      .map(e => ({
        ...e,
        sourceX: nodePositions.get(e.sourceId)!.x,
        sourceY: nodePositions.get(e.sourceId)!.y,
        targetX: nodePositions.get(e.targetId)!.x,
        targetY: nodePositions.get(e.targetId)!.y,
      }))
  }, [edges, layoutNodes])

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: '100%', background: 'var(--bg, #1e1e2e)' }}
      onClick={() => onSelectNode(null)}
    >
      <g ref={gRef} transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
        {/* Tree links */}
        {layoutLinks.map((link, i) => (
          <path
            key={`link-${i}`}
            d={`M${link.sourceX},${link.sourceY} C${link.sourceX},${(link.sourceY + link.targetY) / 2} ${link.targetX},${(link.sourceY + link.targetY) / 2} ${link.targetX},${link.targetY}`}
            fill="none"
            stroke="var(--border, #45475a)"
            strokeWidth={1.5}
          />
        ))}
        {/* Cross edges */}
        {crossEdgeLines.map((e) => (
          <line
            key={`edge-${e.id}`}
            x1={e.sourceX} y1={e.sourceY}
            x2={e.targetX} y2={e.targetY}
            stroke="#89b4fa"
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.6}
          />
        ))}
        {/* Nodes */}
        {layoutNodes.map((node) => (
          <MindmapNodeComponent
            key={node.id}
            id={node.id}
            title={node.title}
            color={node.color}
            x={node.x}
            y={node.y}
            isSelected={node.id === selectedNodeId}
            collapsed={node.collapsed}
            hasChildren={node.hasChildren}
            onSelect={onSelectNode}
            onDoubleClick={onDoubleClickNode}
            onToggleCollapse={onToggleCollapse}
          />
        ))}
      </g>
    </svg>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(app): D3.js mind map canvas with tree layout"
```

---

## Task 5: MindmapView + Toolbar + Navigation

**Files:**
- Create: `packages/app/src/renderer/components/mindmap/MindmapToolbar.tsx`
- Create: `packages/app/src/renderer/views/MindmapView.tsx`
- Modify: `packages/app/src/renderer/App.tsx`
- Modify: `packages/app/src/renderer/views/LibraryView.tsx`

- [ ] **Step 1: Create MindmapToolbar**

A toolbar at the top of the mind map view with actions: add node, add child, delete node, edit node title.

```typescript
// MindmapToolbar.tsx
import React from 'react'

interface Props {
  title: string
  selectedNodeId: string | null
  onAddRoot: () => void
  onAddChild: () => void
  onDeleteNode: () => void
  onEditNode: () => void
  onTitleChange: (title: string) => void
}

export default function MindmapToolbar({
  title, selectedNodeId, onAddRoot, onAddChild, onDeleteNode, onEditNode, onTitleChange,
}: Props) {
  return (
    <div style={{
      padding: '8px 16px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexShrink: 0,
    }}>
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        style={{
          fontWeight: 600, fontSize: 14,
          background: 'transparent', border: 'none', color: 'var(--text)',
          outline: 'none', width: 200,
        }}
      />
      <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
      <button onClick={onAddRoot} style={{ fontSize: 12 }}>+ 根节点</button>
      <button onClick={onAddChild} disabled={!selectedNodeId} style={{ fontSize: 12 }}>+ 子节点</button>
      <button onClick={onEditNode} disabled={!selectedNodeId} style={{ fontSize: 12 }}>编辑</button>
      <button
        onClick={onDeleteNode}
        disabled={!selectedNodeId}
        style={{ fontSize: 12, color: '#f38ba8', borderColor: '#f38ba8' }}
      >
        删除
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create MindmapView**

Full screen view loading mindmap data and wiring canvas + toolbar:

```typescript
// MindmapView.tsx
import React, { useEffect, useState, useCallback } from 'react'
import MindmapCanvas from '../components/mindmap/MindmapCanvas.js'
import MindmapToolbar from '../components/mindmap/MindmapToolbar.js'

interface MindmapInfo {
  id: string
  title: string
}

interface Props {
  mindmap: MindmapInfo
  onBack: () => void
}

export default function MindmapView({ mindmap, onBack }: Props) {
  const [title, setTitle] = useState(mindmap.title)
  const [nodes, setNodes] = useState<any[]>([])
  const [edges, setEdges] = useState<any[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [n, e] = await Promise.all([
      window.electronAPI.mindmaps.getNodes(mindmap.id),
      window.electronAPI.mindmaps.getEdges(mindmap.id),
    ])
    setNodes(n)
    setEdges(e)
  }, [mindmap.id])

  useEffect(() => { reload() }, [reload])

  const handleTitleChange = useCallback(async (newTitle: string) => {
    setTitle(newTitle)
    await window.electronAPI.mindmaps.update(mindmap.id, { title: newTitle })
  }, [mindmap.id])

  const handleAddRoot = useCallback(async () => {
    const nodeTitle = prompt('节点标题：')
    if (!nodeTitle) return
    await window.electronAPI.mindmaps.addNode(mindmap.id, { title: nodeTitle })
    await reload()
  }, [mindmap.id, reload])

  const handleAddChild = useCallback(async () => {
    if (!selectedNodeId) return
    const nodeTitle = prompt('子节点标题：')
    if (!nodeTitle) return
    await window.electronAPI.mindmaps.addNode(mindmap.id, { title: nodeTitle, parentId: selectedNodeId })
    await reload()
  }, [mindmap.id, selectedNodeId, reload])

  const handleDeleteNode = useCallback(async () => {
    if (!selectedNodeId) return
    await window.electronAPI.mindmaps.removeNode(selectedNodeId)
    setSelectedNodeId(null)
    await reload()
  }, [selectedNodeId, reload])

  const handleEditNode = useCallback(async () => {
    if (!selectedNodeId) return
    const node = nodes.find(n => n.id === selectedNodeId)
    if (!node) return
    const newTitle = prompt('节点标题：', node.title)
    if (newTitle === null) return
    await window.electronAPI.mindmaps.updateNode(selectedNodeId, { title: newTitle })
    await reload()
  }, [selectedNodeId, nodes, reload])

  const handleToggleCollapse = useCallback(async (id: string) => {
    const node = nodes.find(n => n.id === id)
    if (!node) return
    await window.electronAPI.mindmaps.updateNode(id, { collapsed: !node.collapsed })
    await reload()
  }, [nodes, reload])

  const handleDoubleClickNode = useCallback(async (id: string) => {
    const node = nodes.find(n => n.id === id)
    if (!node) return
    const newTitle = prompt('节点标题：', node.title)
    if (newTitle === null) return
    await window.electronAPI.mindmaps.updateNode(id, { title: newTitle })
    await reload()
  }, [nodes, reload])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
      }}>
        <button onClick={onBack}>← 返回</button>
        <span style={{ fontWeight: 500 }}>{title}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>脑图</span>
      </div>
      <MindmapToolbar
        title={title}
        selectedNodeId={selectedNodeId}
        onAddRoot={handleAddRoot}
        onAddChild={handleAddChild}
        onDeleteNode={handleDeleteNode}
        onEditNode={handleEditNode}
        onTitleChange={handleTitleChange}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <MindmapCanvas
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onDoubleClickNode={handleDoubleClickNode}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update App.tsx**

Add `viewingMindmap` state and route to MindmapView:

```typescript
import MindmapView from './views/MindmapView.js'

// Add state:
const [viewingMindmap, setViewingMindmap] = useState<any>(null)

// Add routing (before viewingNote):
if (viewingMindmap) return <MindmapView mindmap={viewingMindmap} onBack={() => setViewingMindmap(null)} />

// Pass to LibraryView:
return <LibraryView rootPath={libraryPath} onOpenDoc={setViewingDoc} onOpenNote={setViewingNote} onOpenMindmap={setViewingMindmap} />
```

- [ ] **Step 4: Update LibraryView**

Add `onOpenMindmap` prop, add a mindmap section in the sidebar with create/list/delete:

Add a simple mindmap list section after the note list, similar pattern to NoteList but inline (no separate component needed for MVP):

```typescript
// Add to Props:
onOpenMindmap: (mindmap: any) => void

// Add state:
const [mindmaps, setMindmaps] = useState<any[]>([])

// Load mindmaps in useEffect alongside documents
const loadMindmaps = async () => {
  const maps = await window.electronAPI.mindmaps.list()
  setMindmaps(maps)
}
// Call loadMindmaps() in useEffect

// Render in sidebar after NoteList:
<div style={{ marginTop: 24 }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
    <h3 style={{ fontSize: 14, margin: 0 }}>脑图</h3>
    <button onClick={handleCreateMindmap} style={{ fontSize: 12 }}>+ 新建</button>
  </div>
  {mindmaps.map(map => (
    <div key={map.id} onClick={() => onOpenMindmap(map)} style={{
      padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
      background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 4,
    }}>
      {map.title}
    </div>
  ))}
</div>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(app): mind map view with D3.js tree layout and navigation"
```

---

## Task 6: Final Integration + Verification

- [ ] **Step 1: Run core tests**

```bash
pnpm --filter @banjuan/core test
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @banjuan/core exec tsc --noEmit
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 3: Manual verification**

- Library sidebar shows "脑图" section with "新建" button
- Create a new mind map → opens MindmapView with empty canvas
- Add root node → node appears centered
- Select node → highlighted in blue
- Add child node → connected with curved line
- Double-click node → edit title
- Collapse/expand children via +/− button
- Zoom in/out with scroll wheel, pan by dragging
- Delete node → removes node and children
- Navigate back → mind map appears in sidebar list

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: Phase 5 complete — mind map notes with D3.js"
```
