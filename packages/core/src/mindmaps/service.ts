import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { v4 as uuid } from 'uuid'
import type {
  Mindmap, MindmapCreateInput, MindmapNode, MindmapNodeCreateInput,
  MindmapEdge, MindmapEdgeCreateInput, MindmapLayout, MindmapFileData,
} from '../types.js'
import type { EventBus } from '../events/bus.js'
import { JsonStore } from '../storage/json-store.js'

interface MindmapRow {
  id: string; title: string; doc_id: string | null; layout: string
  created_at: string; updated_at: string
}

interface NodeRow {
  id: string; mindmap_id: string; parent_id: string | null; annotation_id: string | null
  title: string; content: string | null; color: string | null
  position_x: number | null; position_y: number | null
  sort_order: number; collapsed: number; created_at: string
}

interface EdgeRow {
  id: string; mindmap_id: string; source_id: string; target_id: string
  label: string | null; style: string | null
}

function rowToMindmap(row: MindmapRow): Mindmap {
  return { id: row.id, title: row.title, docId: row.doc_id, layout: row.layout as MindmapLayout, createdAt: row.created_at, updatedAt: row.updated_at }
}

function rowToNode(row: NodeRow): MindmapNode {
  return { id: row.id, mindmapId: row.mindmap_id, parentId: row.parent_id, annotationId: row.annotation_id, title: row.title, content: row.content, color: row.color, positionX: row.position_x, positionY: row.position_y, sortOrder: row.sort_order, collapsed: row.collapsed === 1, createdAt: row.created_at }
}

function rowToEdge(row: EdgeRow): MindmapEdge {
  return { id: row.id, mindmapId: row.mindmap_id, sourceId: row.source_id, targetId: row.target_id, label: row.label, style: row.style }
}

export class MindmapService {
  private store: JsonStore<MindmapFileData>

  constructor(private db: Database.Database, rootPath: string, private events: EventBus) {
    this.store = new JsonStore(join(rootPath, '.banjuan', 'data', 'mindmaps'))
  }

  private readFileData(id: string): MindmapFileData | null {
    return this.store.read(id)
  }

  private writeFileData(data: MindmapFileData): void {
    this.store.write(data)
  }

  async create(input: MindmapCreateInput): Promise<Mindmap> {
    const id = uuid()
    const now = new Date().toISOString()
    const layout = input.layout ?? 'tree'

    const fileData: MindmapFileData = {
      id, title: input.title, docId: input.docId ?? null, layout,
      tags: [], nodes: [], edges: [], createdAt: now, updatedAt: now,
    }
    this.writeFileData(fileData)

    this.db.prepare('INSERT INTO mindmaps (id, title, doc_id, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, input.title, input.docId ?? null, layout, now, now)

    const mindmap = { id, title: input.title, docId: input.docId ?? null, layout, createdAt: now, updatedAt: now }
    this.events.emit('mindmap:created', { mindmap })
    return mindmap
  }

  async list(options?: { docId?: string }): Promise<Mindmap[]> {
    if (options?.docId) {
      return (this.db.prepare('SELECT * FROM mindmaps WHERE doc_id = ? ORDER BY created_at DESC').all(options.docId) as MindmapRow[]).map(rowToMindmap)
    }
    return (this.db.prepare('SELECT * FROM mindmaps ORDER BY created_at DESC').all() as MindmapRow[]).map(rowToMindmap)
  }

  async get(id: string): Promise<Mindmap | undefined> {
    const row = this.db.prepare('SELECT * FROM mindmaps WHERE id = ?').get(id) as MindmapRow | undefined
    return row ? rowToMindmap(row) : undefined
  }

  async update(id: string, updates: Partial<Pick<Mindmap, 'title' | 'layout' | 'docId'>>): Promise<Mindmap> {
    const now = new Date().toISOString()

    const fileData = this.readFileData(id)
    if (fileData) {
      if (updates.title !== undefined) fileData.title = updates.title
      if (updates.layout !== undefined) fileData.layout = updates.layout
      if (updates.docId !== undefined) fileData.docId = updates.docId
      fileData.updatedAt = now
      this.writeFileData(fileData)
    }

    const fields: string[] = ['updated_at = ?']
    const values: unknown[] = [now]
    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
    if (updates.layout !== undefined) { fields.push('layout = ?'); values.push(updates.layout) }
    if (updates.docId !== undefined) { fields.push('doc_id = ?'); values.push(updates.docId) }
    values.push(id)
    this.db.prepare(`UPDATE mindmaps SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    const row = this.db.prepare('SELECT * FROM mindmaps WHERE id = ?').get(id) as MindmapRow
    const mindmap = rowToMindmap(row)
    this.events.emit('mindmap:updated', { mindmap })
    return mindmap
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id)
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM mindmap_edges WHERE mindmap_id = ?').run(id)
      this.db.prepare('DELETE FROM mindmap_nodes WHERE mindmap_id = ?').run(id)
      this.db.prepare('DELETE FROM mindmaps WHERE id = ?').run(id)
    })()
    this.events.emit('mindmap:deleted', { id })
  }

  // --- Nodes ---

  async addNode(mindmapId: string, input: MindmapNodeCreateInput): Promise<MindmapNode> {
    const id = uuid()
    const now = new Date().toISOString()
    const parentId = input.parentId ?? null

    const maxRow = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM mindmap_nodes WHERE mindmap_id = ? AND parent_id IS ?')
      .get(mindmapId, parentId) as { max_sort: number }
    const sortOrder = maxRow.max_sort + 1

    const nodeData = {
      id, parentId, annotationId: input.annotationId ?? null,
      title: input.title, content: input.content ?? null, color: input.color ?? null,
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
      `INSERT INTO mindmap_nodes (id, mindmap_id, parent_id, annotation_id, title, content, color, position_x, position_y, sort_order, collapsed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(id, mindmapId, parentId, input.annotationId ?? null, input.title, input.content ?? null, input.color ?? null, input.positionX ?? null, input.positionY ?? null, sortOrder, now)

    const node: MindmapNode = { ...nodeData, mindmapId, createdAt: now }
    this.events.emit('mindmap:node:added', { node })
    return node
  }

  async getNodes(mindmapId: string): Promise<MindmapNode[]> {
    return (this.db.prepare('SELECT * FROM mindmap_nodes WHERE mindmap_id = ? ORDER BY sort_order').all(mindmapId) as NodeRow[]).map(rowToNode)
  }

  async updateNode(id: string, updates: Partial<Pick<MindmapNode, 'title' | 'content' | 'color' | 'positionX' | 'positionY' | 'collapsed' | 'sortOrder'>>): Promise<MindmapNode> {
    const nodeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_nodes WHERE id = ?').get(id) as { mindmap_id: string } | undefined
    if (!nodeRow) throw new Error(`Node not found: ${id}`)

    const fileData = this.readFileData(nodeRow.mindmap_id)
    if (fileData) {
      const nodeInFile = fileData.nodes.find(n => n.id === id)
      if (nodeInFile) {
        if (updates.title !== undefined) nodeInFile.title = updates.title
        if (updates.content !== undefined) nodeInFile.content = updates.content
        if (updates.color !== undefined) nodeInFile.color = updates.color
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

  async removeNode(id: string): Promise<void> {
    const nodeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_nodes WHERE id = ?').get(id) as { mindmap_id: string } | undefined

    if (nodeRow) {
      const fileData = this.readFileData(nodeRow.mindmap_id)
      if (fileData) {
        const childIds = this.collectChildIds(id, fileData.nodes)
        const removeIds = new Set([id, ...childIds])
        fileData.nodes = fileData.nodes.filter(n => !removeIds.has(n.id))
        fileData.edges = fileData.edges.filter(e => !removeIds.has(e.sourceId) && !removeIds.has(e.targetId))
        fileData.updatedAt = new Date().toISOString()
        this.writeFileData(fileData)
      }

      const allIds = this.collectDescendantIds(id)
      allIds.push(id)
      const placeholders = allIds.map(() => '?').join(', ')
      this.db.prepare(`DELETE FROM mindmap_edges WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`).run(...allIds, ...allIds)
      this.db.prepare(`DELETE FROM mindmap_nodes WHERE id IN (${placeholders})`).run(...allIds)
      this.events.emit('mindmap:node:removed', { id, mindmapId: nodeRow.mindmap_id })
    } else {
      this.db.prepare('DELETE FROM mindmap_nodes WHERE id = ?').run(id)
    }
  }

  private collectDescendantIds(parentId: string): string[] {
    const children = this.db.prepare('SELECT id FROM mindmap_nodes WHERE parent_id = ?').all(parentId) as { id: string }[]
    const result: string[] = []
    for (const child of children) {
      result.push(child.id)
      result.push(...this.collectDescendantIds(child.id))
    }
    return result
  }

  private collectChildIds(parentId: string, nodes: MindmapFileData['nodes']): string[] {
    const children = nodes.filter(n => n.parentId === parentId)
    const result: string[] = []
    for (const child of children) {
      result.push(child.id)
      result.push(...this.collectChildIds(child.id, nodes))
    }
    return result
  }

  // --- Edges ---

  async addEdge(mindmapId: string, input: MindmapEdgeCreateInput): Promise<MindmapEdge> {
    const id = uuid()

    const edgeData = {
      id, sourceId: input.sourceId, targetId: input.targetId,
      label: input.label ?? null, style: null,
    }

    const fileData = this.readFileData(mindmapId)
    if (fileData) {
      fileData.edges.push(edgeData)
      fileData.updatedAt = new Date().toISOString()
      this.writeFileData(fileData)
    }

    this.db.prepare('INSERT INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)').run(id, mindmapId, input.sourceId, input.targetId, input.label ?? null, null)

    const edge: MindmapEdge = { ...edgeData, mindmapId }
    this.events.emit('mindmap:edge:added', { edge })
    return edge
  }

  async getEdges(mindmapId: string): Promise<MindmapEdge[]> {
    return (this.db.prepare('SELECT * FROM mindmap_edges WHERE mindmap_id = ?').all(mindmapId) as EdgeRow[]).map(rowToEdge)
  }

  async removeEdge(id: string): Promise<void> {
    const edgeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_edges WHERE id = ?').get(id) as { mindmap_id: string } | undefined

    if (edgeRow) {
      const fileData = this.readFileData(edgeRow.mindmap_id)
      if (fileData) {
        fileData.edges = fileData.edges.filter(e => e.id !== id)
        fileData.updatedAt = new Date().toISOString()
        this.writeFileData(fileData)
      }
    }

    this.db.prepare('DELETE FROM mindmap_edges WHERE id = ?').run(id)
  }
}
