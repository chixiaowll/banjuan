import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { v4 as uuid } from 'uuid'
import type {
  MindmapNode, MindmapNodeCreateInput,
  MindmapEdge, MindmapEdgeCreateInput, MindmapNodeType,
} from '../types.js'
import type { EventBus } from '../events/bus.js'

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

interface EdgeRow {
  id: string; mindmap_id: string; source_id: string; target_id: string
  label: string | null; style: string | null
}

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

function rowToEdge(row: EdgeRow): MindmapEdge {
  return { id: row.id, mindmapId: row.mindmap_id, sourceId: row.source_id, targetId: row.target_id, label: row.label, style: row.style }
}

export class MindmapService {
  private notesDir: string

  constructor(private db: Database.Database, rootPath: string, private events: EventBus) {
    this.notesDir = join(rootPath, '.banjuan', 'notes')
  }

  // --- Filesystem operations ---

  private readFileData(noteId: string): { meta: any; nodes: any[]; edges: any[] } | null {
    const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(noteId) as { path: string } | undefined
    if (!row?.path) return null
    const fullPath = join(this.notesDir, row.path)
    if (!existsSync(fullPath)) return null
    try { return JSON.parse(readFileSync(fullPath, 'utf-8')) } catch { return null }
  }

  private writeFileDataById(noteId: string, fileData: any): void {
    const row = this.db.prepare('SELECT path FROM notes WHERE id = ?').get(noteId) as { path: string } | undefined
    if (row?.path) {
      writeFileSync(join(this.notesDir, row.path), JSON.stringify(fileData, null, 2))
    }
  }

  // --- Nodes ---

  async addNode(noteId: string, input: MindmapNodeCreateInput): Promise<MindmapNode> {
    const id = uuid()
    const now = new Date().toISOString()
    const parentId = input.parentId ?? null

    const maxRow = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM mindmap_nodes WHERE mindmap_id = ? AND parent_id IS ?')
      .get(noteId, parentId) as { max_sort: number }
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

    const fileData = this.readFileData(noteId)
    if (fileData) {
      fileData.nodes.push(nodeData)
      fileData.meta.updatedAt = now
      this.writeFileDataById(noteId, fileData)
    }

    this.db.prepare(
      `INSERT INTO mindmap_nodes (id, mindmap_id, parent_id, node_type, annotation_id, note_id, doc_id, hyperlink, image_url, tag_id, title, content, color, notes, shape, style_overrides, position_x, position_y, sort_order, collapsed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(id, noteId, parentId, nodeData.nodeType, nodeData.annotationId, nodeData.noteId, nodeData.docId, nodeData.hyperlink, nodeData.imageUrl, nodeData.tagId, input.title, nodeData.content, nodeData.color, nodeData.notes, nodeData.shape, nodeData.styleOverrides, nodeData.positionX, nodeData.positionY, sortOrder, now)

    const node: MindmapNode = { ...nodeData, mindmapId: noteId, createdAt: now }
    this.events.emit('mindmap:node:added', { node })
    return node
  }

  async getNodes(noteId: string): Promise<MindmapNode[]> {
    return (this.db.prepare('SELECT * FROM mindmap_nodes WHERE mindmap_id = ? ORDER BY sort_order').all(noteId) as NodeRow[]).map(rowToNode)
  }

  async findNodesByNoteId(noteId: string): Promise<Array<MindmapNode & { mindmapTitle: string }>> {
    const contentPattern = `%"noteId":"${noteId}"%`
    const rows = this.db.prepare(`
      SELECT n.*, m.title as mindmap_title
      FROM mindmap_nodes n
      JOIN notes m ON m.id = n.mindmap_id
      WHERE n.note_id = ? OR n.content LIKE ?
    `).all(noteId, contentPattern) as (NodeRow & { mindmap_title: string })[]
    return rows.map(row => ({ ...rowToNode(row), mindmapTitle: row.mindmap_title }))
  }

  async updateNode(id: string, updates: Partial<Pick<MindmapNode, 'title' | 'content' | 'color' | 'notes' | 'shape' | 'styleOverrides' | 'nodeType' | 'noteId' | 'docId' | 'hyperlink' | 'imageUrl' | 'tagId' | 'parentId' | 'positionX' | 'positionY' | 'collapsed' | 'sortOrder'>>): Promise<MindmapNode> {
    const nodeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_nodes WHERE id = ?').get(id) as { mindmap_id: string } | undefined
    if (!nodeRow) throw new Error(`Node not found: ${id}`)

    const fileData = this.readFileData(nodeRow.mindmap_id)
    if (fileData) {
      const nodeInFile = fileData.nodes.find((n: any) => n.id === id)
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
      fileData.meta.updatedAt = new Date().toISOString()
      this.writeFileDataById(nodeRow.mindmap_id, fileData)
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

  async removeNode(id: string): Promise<void> {
    const nodeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_nodes WHERE id = ?').get(id) as { mindmap_id: string } | undefined

    if (nodeRow) {
      const fileData = this.readFileData(nodeRow.mindmap_id)
      if (fileData) {
        const childIds = this.collectChildIds(id, fileData.nodes)
        const removeIds = new Set([id, ...childIds])
        fileData.nodes = fileData.nodes.filter((n: any) => !removeIds.has(n.id))
        fileData.edges = fileData.edges.filter((e: any) => !removeIds.has(e.sourceId) && !removeIds.has(e.targetId))
        fileData.meta.updatedAt = new Date().toISOString()
        this.writeFileDataById(nodeRow.mindmap_id, fileData)
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

  collectDescendantIds(parentId: string): string[] {
    const children = this.db.prepare('SELECT id FROM mindmap_nodes WHERE parent_id = ?').all(parentId) as { id: string }[]
    const result: string[] = []
    for (const child of children) {
      result.push(child.id)
      result.push(...this.collectDescendantIds(child.id))
    }
    return result
  }

  collectChildIds(parentId: string, nodes: any[]): string[] {
    const children = nodes.filter(n => n.parentId === parentId)
    const result: string[] = []
    for (const child of children) {
      result.push(child.id)
      result.push(...this.collectChildIds(child.id, nodes))
    }
    return result
  }

  // --- Edges ---

  async addEdge(noteId: string, input: MindmapEdgeCreateInput): Promise<MindmapEdge> {
    const id = uuid()

    const edgeData = {
      id, sourceId: input.sourceId, targetId: input.targetId,
      label: input.label ?? null, style: null,
    }

    const fileData = this.readFileData(noteId)
    if (fileData) {
      fileData.edges.push(edgeData)
      fileData.meta.updatedAt = new Date().toISOString()
      this.writeFileDataById(noteId, fileData)
    }

    this.db.prepare('INSERT INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)').run(id, noteId, input.sourceId, input.targetId, input.label ?? null, null)

    const edge: MindmapEdge = { ...edgeData, mindmapId: noteId }
    this.events.emit('mindmap:edge:added', { edge })
    return edge
  }

  async getEdges(noteId: string): Promise<MindmapEdge[]> {
    return (this.db.prepare('SELECT * FROM mindmap_edges WHERE mindmap_id = ?').all(noteId) as EdgeRow[]).map(rowToEdge)
  }

  async removeEdge(id: string): Promise<void> {
    const edgeRow = this.db.prepare('SELECT mindmap_id FROM mindmap_edges WHERE id = ?').get(id) as { mindmap_id: string } | undefined

    if (edgeRow) {
      const fileData = this.readFileData(edgeRow.mindmap_id)
      if (fileData) {
        fileData.edges = fileData.edges.filter((e: any) => e.id !== id)
        fileData.meta.updatedAt = new Date().toISOString()
        this.writeFileDataById(edgeRow.mindmap_id, fileData)
      }
    }

    this.db.prepare('DELETE FROM mindmap_edges WHERE id = ?').run(id)
  }
}
