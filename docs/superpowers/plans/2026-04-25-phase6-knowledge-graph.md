# Phase 6: Knowledge Graph — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a knowledge graph view — a D3.js force-directed graph showing documents, notes, and mindmaps as nodes with edges derived from annotation links, note-document associations, and mindmap-document associations. Users can zoom, drag, and click nodes to navigate.

**Architecture:** A new `GraphService` in core queries SQLite to build graph data (no extra storage). The app renders it with D3.js force simulation in an SVG canvas.

**Tech Stack:** D3.js (d3-force, d3-zoom, d3-selection), React, SVG, existing SQLite data

---

## File Structure

```
packages/core/src/
├── graph/
│   └── service.ts              # GraphService: query to build graph data
├── types.ts                     # Add GraphNode, GraphEdge types
├── library.ts                   # Add graph service

packages/app/src/
├── main/
│   └── ipc.ts                   # Add graph IPC handler
├── preload/
│   └── index.ts                 # Add graph namespace
├── renderer/
│   ├── components/
│   │   └── graph/
│   │       └── KnowledgeGraph.tsx   # D3.js force-directed graph
│   └── views/
│       ├── GraphView.tsx            # Full graph view
│       └── LibraryView.tsx          # Add graph button to sidebar
│   ├── App.tsx                      # Add graph routing
├── electron.d.ts
```

---

## Task 1: Core GraphService

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/graph/service.ts`
- Modify: `packages/core/src/library.ts`

- [ ] **Step 1: Add types**

Add to `packages/core/src/types.ts`:

```typescript
export interface GraphNode {
  id: string
  label: string
  type: 'document' | 'note' | 'mindmap'
  docType?: DocumentType
}

export interface GraphEdge {
  source: string
  target: string
  type: 'note-doc' | 'annotation-link' | 'mindmap-doc'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
```

- [ ] **Step 2: Create GraphService**

Create `packages/core/src/graph/service.ts`:

```typescript
import type Database from 'better-sqlite3'
import type { GraphData, GraphNode, GraphEdge } from '../types.js'

export class GraphService {
  constructor(private db: Database.Database) {}

  async getData(): Promise<GraphData> {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const nodeIds = new Set<string>()

    // Documents as nodes
    const docs = this.db.prepare('SELECT id, title, type FROM documents').all() as Array<{
      id: string; title: string; type: string
    }>
    for (const doc of docs) {
      nodes.push({ id: doc.id, label: doc.title, type: 'document', docType: doc.type as any })
      nodeIds.add(doc.id)
    }

    // Notes as nodes
    const notes = this.db.prepare('SELECT id, title, doc_id FROM notes').all() as Array<{
      id: string; title: string; doc_id: string | null
    }>
    for (const note of notes) {
      nodes.push({ id: note.id, label: note.title, type: 'note' })
      nodeIds.add(note.id)
      if (note.doc_id && nodeIds.has(note.doc_id)) {
        edges.push({ source: note.id, target: note.doc_id, type: 'note-doc' })
      }
    }

    // Mindmaps as nodes
    const maps = this.db.prepare('SELECT id, title, doc_id FROM mindmaps').all() as Array<{
      id: string; title: string; doc_id: string | null
    }>
    for (const map of maps) {
      nodes.push({ id: map.id, label: map.title, type: 'mindmap' })
      nodeIds.add(map.id)
      if (map.doc_id && nodeIds.has(map.doc_id)) {
        edges.push({ source: map.id, target: map.doc_id, type: 'mindmap-doc' })
      }
    }

    // Annotation links: notes linked to annotations on documents
    const annLinks = this.db.prepare(`
      SELECT DISTINCT n.id as note_id, a.doc_id
      FROM note_annotations na
      JOIN notes n ON n.id = na.note_id
      JOIN annotations a ON a.id = na.annotation_id
      WHERE n.doc_id IS NULL OR n.doc_id != a.doc_id
    `).all() as Array<{ note_id: string; doc_id: string }>
    for (const link of annLinks) {
      if (nodeIds.has(link.note_id) && nodeIds.has(link.doc_id)) {
        edges.push({ source: link.note_id, target: link.doc_id, type: 'annotation-link' })
      }
    }

    return { nodes, edges }
  }
}
```

- [ ] **Step 3: Wire into Library**

In `packages/core/src/library.ts`:
1. Import `GraphService`
2. Add `readonly graph: GraphService` field
3. Add `this.graph = new GraphService(db)` in constructor

- [ ] **Step 4: Build and verify**

```bash
pnpm --filter @banjuan/core build
pnpm --filter @banjuan/core test
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(core): GraphService for knowledge graph data"
```

---

## Task 2: Graph IPC + KnowledgeGraph Component

**Files:**
- Modify: `packages/app/src/main/ipc.ts`
- Modify: `packages/app/src/preload/index.ts`
- Modify: `packages/app/electron.d.ts`
- Create: `packages/app/src/renderer/components/graph/KnowledgeGraph.tsx`

- [ ] **Step 1: Add graph IPC**

In ipc.ts:
```typescript
ipcMain.handle('graph:getData', async () => {
  if (!library) throw new Error('No library open')
  return library.graph.getData()
})
```

In preload:
```typescript
graph: {
  getData: () => ipcRenderer.invoke('graph:getData'),
},
```

In electron.d.ts, add to ElectronAPI:
```typescript
graph: {
  getData: () => Promise<{ nodes: any[]; edges: any[] }>
}
```

- [ ] **Step 2: Create KnowledgeGraph component**

Create `packages/app/src/renderer/components/graph/KnowledgeGraph.tsx`:

D3.js force-directed graph in SVG:
- Nodes are circles colored by type (document=blue, note=green, mindmap=purple)
- Edges are lines between connected nodes
- D3 force simulation with charge, link, and center forces
- D3 zoom for pan/zoom
- Node labels below circles
- Click node → calls `onNodeClick(id, type)`
- Drag nodes to reposition

```typescript
import React, { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'

interface GraphNode {
  id: string
  label: string
  type: 'document' | 'note' | 'mindmap'
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
  type: string
}

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeClick: (id: string, type: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  document: '#89b4fa',
  note: '#a6e3a1',
  mindmap: '#cba6f7',
}

export default function KnowledgeGraph({ nodes, edges, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null)

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    svg.selectAll('*').remove()

    const g = svg.append('g')

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2))

    // Clone data for D3 mutation
    const nodeData: GraphNode[] = nodes.map(n => ({ ...n }))
    const edgeData: GraphEdge[] = edges.map(e => ({ ...e }))

    const simulation = d3.forceSimulation(nodeData)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edgeData).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide().radius(40))

    simulationRef.current = simulation

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(edgeData)
      .join('line')
      .attr('stroke', '#585b70')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6)

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodeData)
      .join('g')
      .style('cursor', 'pointer')
      .on('click', (_event, d) => onNodeClick(d.id, d.type))
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
      )

    node.append('circle')
      .attr('r', 12)
      .attr('fill', d => TYPE_COLORS[d.type] ?? '#cdd6f4')
      .attr('stroke', '#313244')
      .attr('stroke-width', 1.5)

    node.append('text')
      .text(d => d.label.length > 12 ? d.label.slice(0, 11) + '…' : d.label)
      .attr('dy', 24)
      .attr('text-anchor', 'middle')
      .attr('fill', '#a6adc8')
      .attr('font-size', 11)

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    return () => {
      simulation.stop()
      svg.on('.zoom', null)
    }
  }, [nodes, edges, onNodeClick])

  return (
    <svg ref={svgRef} style={{ width: '100%', height: '100%', background: 'var(--bg, #1e1e2e)' }} />
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(app): knowledge graph component with D3.js force layout"
```

---

## Task 3: GraphView + Navigation

**Files:**
- Create: `packages/app/src/renderer/views/GraphView.tsx`
- Modify: `packages/app/src/renderer/App.tsx`
- Modify: `packages/app/src/renderer/views/LibraryView.tsx`

- [ ] **Step 1: Create GraphView**

```typescript
import React, { useEffect, useState, useCallback } from 'react'
import KnowledgeGraph from '../components/graph/KnowledgeGraph.js'

interface Props {
  onBack: () => void
  onOpenDoc: (doc: any) => void
  onOpenNote: (note: any) => void
  onOpenMindmap: (mindmap: any) => void
}

export default function GraphView({ onBack, onOpenDoc, onOpenNote, onOpenMindmap }: Props) {
  const [nodes, setNodes] = useState<any[]>([])
  const [edges, setEdges] = useState<any[]>([])

  useEffect(() => {
    window.electronAPI.graph.getData().then((data) => {
      setNodes(data.nodes)
      setEdges(data.edges)
    })
  }, [])

  const handleNodeClick = useCallback(async (id: string, type: string) => {
    switch (type) {
      case 'document': {
        const doc = await window.electronAPI.documents.get(id)
        if (doc) onOpenDoc(doc)
        break
      }
      case 'note': {
        const note = await window.electronAPI.notes.get(id)
        if (note) onOpenNote(note)
        break
      }
      case 'mindmap': {
        const map = await window.electronAPI.mindmaps.get(id)
        if (map) onOpenMindmap(map)
        break
      }
    }
  }, [onOpenDoc, onOpenNote, onOpenMindmap])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
      }}>
        <button onClick={onBack}>← 返回</button>
        <span style={{ fontWeight: 500 }}>知识图谱</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {nodes.length} 节点 · {edges.length} 连接
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {nodes.length > 0 ? (
          <KnowledgeGraph nodes={nodes} edges={edges} onNodeClick={handleNodeClick} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            添加文档和笔记后，知识图谱将自动生成
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx**

Add `showGraph` state (boolean). Add routing:
```typescript
import GraphView from './views/GraphView.js'

const [showGraph, setShowGraph] = useState(false)

// Add before viewingMindmap check:
if (showGraph) return (
  <GraphView
    onBack={() => setShowGraph(false)}
    onOpenDoc={(doc) => { setShowGraph(false); setViewingDoc(doc) }}
    onOpenNote={(note) => { setShowGraph(false); setViewingNote(note) }}
    onOpenMindmap={(map) => { setShowGraph(false); setViewingMindmap(map) }}
  />
)

// Pass to LibraryView:
onOpenGraph={() => setShowGraph(true)}
```

- [ ] **Step 3: Update LibraryView**

Add `onOpenGraph: () => void` to Props. Add a "知识图谱" button in the sidebar:

```typescript
<button onClick={onOpenGraph} style={{ marginTop: 16, width: '100%' }}>
  知识图谱
</button>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(app): knowledge graph view with navigation"
```

---

## Task 4: Final Integration + Verification

- [ ] **Step 1: Run core tests**

```bash
pnpm --filter @banjuan/core test
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @banjuan/core exec tsc --noEmit
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: Phase 6 complete — knowledge graph"
```
