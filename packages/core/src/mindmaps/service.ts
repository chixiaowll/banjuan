import type Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import type {
  Mindmap,
  MindmapCreateInput,
  MindmapNode,
  MindmapNodeCreateInput,
  MindmapEdge,
  MindmapEdgeCreateInput,
  MindmapLayout,
} from '../types.js'
import type { EventBus } from '../events/bus.js'

interface MindmapRow {
  id: string
  title: string
  doc_id: string | null
  layout: string
  created_at: string
  updated_at: string
}

interface NodeRow {
  id: string
  mindmap_id: string
  parent_id: string | null
  annotation_id: string | null
  title: string
  content: string | null
  color: string | null
  position_x: number | null
  position_y: number | null
  sort_order: number
  collapsed: number
  created_at: string
}

interface EdgeRow {
  id: string
  mindmap_id: string
  source_id: string
  target_id: string
  label: string | null
  style: string | null
}

function rowToMindmap(row: MindmapRow): Mindmap {
  return {
    id: row.id,
    title: row.title,
    docId: row.doc_id,
    layout: row.layout as MindmapLayout,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToNode(row: NodeRow): MindmapNode {
  return {
    id: row.id,
    mindmapId: row.mindmap_id,
    parentId: row.parent_id,
    annotationId: row.annotation_id,
    title: row.title,
    content: row.content,
    color: row.color,
    positionX: row.position_x,
    positionY: row.position_y,
    sortOrder: row.sort_order,
    collapsed: row.collapsed === 1,
    createdAt: row.created_at,
  }
}

function rowToEdge(row: EdgeRow): MindmapEdge {
  return {
    id: row.id,
    mindmapId: row.mindmap_id,
    sourceId: row.source_id,
    targetId: row.target_id,
    label: row.label,
    style: row.style,
  }
}

export class MindmapService {
  constructor(private db: Database.Database, private _rootPath: string, private events: EventBus) {}

  async create(input: MindmapCreateInput): Promise<Mindmap> {
    const id = uuid()
    const now = new Date().toISOString()
    const layout = input.layout ?? 'tree'

    this.db
      .prepare(
        'INSERT INTO mindmaps (id, title, doc_id, layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, input.title, input.docId ?? null, layout, now, now)

    const mindmap = { id, title: input.title, docId: input.docId ?? null, layout, createdAt: now, updatedAt: now }
    this.events.emit('mindmap:created', { mindmap })
    return mindmap
  }

  async list(options?: { docId?: string }): Promise<Mindmap[]> {
    if (options?.docId) {
      return (
        this.db
          .prepare('SELECT * FROM mindmaps WHERE doc_id = ? ORDER BY created_at DESC')
          .all(options.docId) as MindmapRow[]
      ).map(rowToMindmap)
    }
    return (
      this.db.prepare('SELECT * FROM mindmaps ORDER BY created_at DESC').all() as MindmapRow[]
    ).map(rowToMindmap)
  }

  async get(id: string): Promise<Mindmap | undefined> {
    const row = this.db.prepare('SELECT * FROM mindmaps WHERE id = ?').get(id) as
      | MindmapRow
      | undefined
    return row ? rowToMindmap(row) : undefined
  }

  async update(
    id: string,
    updates: Partial<Pick<Mindmap, 'title' | 'layout' | 'docId'>>,
  ): Promise<Mindmap> {
    const now = new Date().toISOString()
    const fields: string[] = ['updated_at = ?']
    const values: unknown[] = [now]

    if (updates.title !== undefined) {
      fields.push('title = ?')
      values.push(updates.title)
    }
    if (updates.layout !== undefined) {
      fields.push('layout = ?')
      values.push(updates.layout)
    }
    if (updates.docId !== undefined) {
      fields.push('doc_id = ?')
      values.push(updates.docId)
    }

    values.push(id)
    this.db.prepare(`UPDATE mindmaps SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    const row = this.db.prepare('SELECT * FROM mindmaps WHERE id = ?').get(id) as MindmapRow
    const mindmap = rowToMindmap(row)
    this.events.emit('mindmap:updated', { mindmap })
    return mindmap
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM mindmap_edges WHERE mindmap_id = ?').run(id)
    this.db.prepare('DELETE FROM mindmap_nodes WHERE mindmap_id = ?').run(id)
    this.db.prepare('DELETE FROM mindmaps WHERE id = ?').run(id)
    this.events.emit('mindmap:deleted', { id })
  }

  // --- Nodes ---

  async addNode(mindmapId: string, input: MindmapNodeCreateInput): Promise<MindmapNode> {
    const id = uuid()
    const now = new Date().toISOString()
    const parentId = input.parentId ?? null

    const maxRow = this.db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM mindmap_nodes WHERE mindmap_id = ? AND parent_id IS ?',
      )
      .get(mindmapId, parentId) as { max_sort: number }
    const sortOrder = maxRow.max_sort + 1

    this.db
      .prepare(
        `INSERT INTO mindmap_nodes (id, mindmap_id, parent_id, annotation_id, title, content, color, position_x, position_y, sort_order, collapsed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .run(
        id,
        mindmapId,
        parentId,
        input.annotationId ?? null,
        input.title,
        input.content ?? null,
        input.color ?? null,
        input.positionX ?? null,
        input.positionY ?? null,
        sortOrder,
        now,
      )

    const node = {
      id,
      mindmapId,
      parentId,
      annotationId: input.annotationId ?? null,
      title: input.title,
      content: input.content ?? null,
      color: input.color ?? null,
      positionX: input.positionX ?? null,
      positionY: input.positionY ?? null,
      sortOrder,
      collapsed: false,
      createdAt: now,
    }
    this.events.emit('mindmap:node:added', { node })
    return node
  }

  async getNodes(mindmapId: string): Promise<MindmapNode[]> {
    return (
      this.db
        .prepare('SELECT * FROM mindmap_nodes WHERE mindmap_id = ? ORDER BY sort_order')
        .all(mindmapId) as NodeRow[]
    ).map(rowToNode)
  }

  async updateNode(
    id: string,
    updates: Partial<Pick<MindmapNode, 'title' | 'content' | 'color' | 'positionX' | 'positionY' | 'collapsed' | 'sortOrder'>>,
  ): Promise<MindmapNode> {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      values.push(updates.title)
    }
    if (updates.content !== undefined) {
      fields.push('content = ?')
      values.push(updates.content)
    }
    if (updates.color !== undefined) {
      fields.push('color = ?')
      values.push(updates.color)
    }
    if (updates.positionX !== undefined) {
      fields.push('position_x = ?')
      values.push(updates.positionX)
    }
    if (updates.positionY !== undefined) {
      fields.push('position_y = ?')
      values.push(updates.positionY)
    }
    if (updates.collapsed !== undefined) {
      fields.push('collapsed = ?')
      values.push(updates.collapsed ? 1 : 0)
    }
    if (updates.sortOrder !== undefined) {
      fields.push('sort_order = ?')
      values.push(updates.sortOrder)
    }

    if (fields.length > 0) {
      values.push(id)
      this.db.prepare(`UPDATE mindmap_nodes SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    const row = this.db.prepare('SELECT * FROM mindmap_nodes WHERE id = ?').get(id) as NodeRow
    return rowToNode(row)
  }

  async removeNode(id: string): Promise<void> {
    const nodeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_nodes WHERE id = ?').get(id) as { mindmap_id: string } | undefined
    this.db.prepare('DELETE FROM mindmap_nodes WHERE parent_id = ?').run(id)
    this.db.prepare('DELETE FROM mindmap_nodes WHERE id = ?').run(id)
    if (nodeRow) this.events.emit('mindmap:node:removed', { id, mindmapId: nodeRow.mindmap_id })
  }

  // --- Edges ---

  async addEdge(mindmapId: string, input: MindmapEdgeCreateInput): Promise<MindmapEdge> {
    const id = uuid()

    this.db
      .prepare(
        'INSERT INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, mindmapId, input.sourceId, input.targetId, input.label ?? null, null)

    const edge = {
      id,
      mindmapId,
      sourceId: input.sourceId,
      targetId: input.targetId,
      label: input.label ?? null,
      style: null,
    }
    this.events.emit('mindmap:edge:added', { edge })
    return edge
  }

  async getEdges(mindmapId: string): Promise<MindmapEdge[]> {
    return (
      this.db.prepare('SELECT * FROM mindmap_edges WHERE mindmap_id = ?').all(mindmapId) as EdgeRow[]
    ).map(rowToEdge)
  }

  async removeEdge(id: string): Promise<void> {
    this.db.prepare('DELETE FROM mindmap_edges WHERE id = ?').run(id)
  }
}
