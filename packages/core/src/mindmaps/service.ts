import type { PlatformDatabase, PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'
import { v4 as uuid } from 'uuid'
import type {
  MindmapNode, MindmapNodeCreateInput,
  MindmapEdge, MindmapEdgeCreateInput,
  MindmapBoundary, MindmapSummary,
} from '../types.js'
import type { EventBus } from '../events/bus.js'
import type { NoteLinkService, LinkSyncEntry } from '../notes/link-service.js'

interface NodeRow {
  id: string; mindmap_id: string; parent_id: string | null
  title: string; content: string | null
  hyperlink: string | null; image_url: string | null
  color: string | null; notes: string | null
  shape: string | null; style_overrides: string | null
  position_x: number | null; position_y: number | null
  sort_order: number; collapsed: number; floating: number; created_at: string
}

interface EdgeRow {
  id: string; mindmap_id: string; source_id: string; target_id: string
  label: string | null; style: string | null
}

function rowToNode(row: NodeRow): MindmapNode {
  return {
    id: row.id, mindmapId: row.mindmap_id, parentId: row.parent_id,
    title: row.title, content: row.content,
    hyperlink: row.hyperlink, imageUrl: row.image_url,
    color: row.color, notes: row.notes,
    shape: row.shape, styleOverrides: row.style_overrides,
    positionX: row.position_x, positionY: row.position_y,
    sortOrder: row.sort_order, collapsed: row.collapsed === 1,
    floating: (row.floating ?? 0) === 1,
    createdAt: row.created_at,
  }
}

interface BoundaryRow {
  id: string; mindmap_id: string; node_ids: string; label: string | null; color: string | null
}

interface SummaryRow {
  id: string; mindmap_id: string; node_ids: string; summary_node_id: string
}

function rowToEdge(row: EdgeRow): MindmapEdge {
  return { id: row.id, mindmapId: row.mindmap_id, sourceId: row.source_id, targetId: row.target_id, label: row.label, style: row.style }
}

function rowToBoundary(row: BoundaryRow): MindmapBoundary {
  return { id: row.id, mindmapId: row.mindmap_id, nodeIds: JSON.parse(row.node_ids), label: row.label ?? '', color: row.color }
}

function rowToSummary(row: SummaryRow): MindmapSummary {
  return { id: row.id, mindmapId: row.mindmap_id, nodeIds: JSON.parse(row.node_ids), summaryNodeId: row.summary_node_id }
}

export class MindmapService {
  private notesDir: string
  private linkService: NoteLinkService | null = null

  constructor(private db: PlatformDatabase, rootPath: string, private events: EventBus, private fs: PlatformFS) {
    this.notesDir = join(rootPath, '.banjuan', 'notes')
  }

  setLinkService(svc: NoteLinkService): void {
    this.linkService = svc
  }

  async syncLinks(mindmapNoteId: string): Promise<void> {
    if (!this.linkService) return
    const nodes = this.db.query<{ content: string | null }>(
      'SELECT content FROM mindmap_nodes WHERE mindmap_id = ?', [mindmapNoteId])

    const links: LinkSyncEntry[] = []
    const seen = new Set<string>()

    for (const node of nodes) {
      if (node.content) {
        const re = /"noteId"\s*:\s*"([a-f0-9-]{36})"/g
        let match: RegExpExecArray | null
        while ((match = re.exec(node.content)) !== null) {
          const targetId = match[1]
          if (targetId !== mindmapNoteId && !seen.has(targetId)) {
            seen.add(targetId)
            links.push({ targetId, context: '' })
          }
        }
      }
    }
    await this.linkService.sync(mindmapNoteId, links)
  }

  // --- Filesystem operations ---

  private async readFileData(noteId: string): Promise<{ meta: any; nodes: any[]; edges: any[]; boundaries?: any[]; summaries?: any[] } | null> {
    const row = this.db.queryOne<{ path: string }>('SELECT path FROM notes WHERE id = ?', [noteId])
    if (!row?.path) return null
    const fullPath = join(this.notesDir, row.path)
    if (!(await this.fs.exists(fullPath))) return null
    try { return JSON.parse(await this.fs.readTextFile(fullPath)) } catch { return null }
  }

  private async writeFileDataById(noteId: string, fileData: any): Promise<void> {
    const row = this.db.queryOne<{ path: string }>('SELECT path FROM notes WHERE id = ?', [noteId])
    if (row?.path) {
      await this.fs.writeTextFile(join(this.notesDir, row.path), JSON.stringify(fileData, null, 2))
    }
  }

  // --- Nodes ---

  async addNode(noteId: string, input: MindmapNodeCreateInput): Promise<MindmapNode> {
    const id = uuid()
    const now = new Date().toISOString()
    const parentId = input.parentId ?? null

    const maxRow = this.db.queryOne<{ max_sort: number }>(
      'SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM mindmap_nodes WHERE mindmap_id = ? AND parent_id IS ?',
      [noteId, parentId])!
    const sortOrder = maxRow.max_sort + 1

    const floating = input.floating ?? false
    const nodeData = {
      id, parentId,
      title: input.title, content: input.content ?? null,
      hyperlink: input.hyperlink ?? null, imageUrl: input.imageUrl ?? null,
      color: input.color ?? null, notes: input.notes ?? null,
      shape: input.shape ?? null, styleOverrides: input.styleOverrides ?? null,
      positionX: input.positionX ?? null, positionY: input.positionY ?? null,
      sortOrder, collapsed: false, floating,
    }

    const fileData = await this.readFileData(noteId)
    if (fileData) {
      fileData.nodes.push(nodeData)
      fileData.meta.updatedAt = now
      await this.writeFileDataById(noteId, fileData)
    }

    this.db.run(
      `INSERT INTO mindmap_nodes (id, mindmap_id, parent_id, title, content, hyperlink, image_url, color, notes, shape, style_overrides, position_x, position_y, sort_order, collapsed, floating, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, noteId, parentId, input.title, nodeData.content, nodeData.hyperlink, nodeData.imageUrl, nodeData.color, nodeData.notes, nodeData.shape, nodeData.styleOverrides, nodeData.positionX, nodeData.positionY, sortOrder, floating ? 1 : 0, now],
    )

    const node: MindmapNode = { ...nodeData, mindmapId: noteId, createdAt: now }
    this.events.emit('mindmap:node:added', { node })
    if (nodeData.content) {
      this.syncLinks(noteId).catch(() => {})
    }
    return node
  }

  async getNodes(noteId: string): Promise<MindmapNode[]> {
    return (this.db.query<NodeRow>('SELECT * FROM mindmap_nodes WHERE mindmap_id = ? ORDER BY sort_order', [noteId])).map(rowToNode)
  }

  async findNodesByNoteId(noteId: string): Promise<Array<MindmapNode & { mindmapTitle: string }>> {
    const contentPattern = `%"noteId":"${noteId}"%`
    const rows = this.db.query<NodeRow & { mindmap_title: string }>(`
      SELECT n.*, m.title as mindmap_title
      FROM mindmap_nodes n
      JOIN notes m ON m.id = n.mindmap_id
      WHERE n.content LIKE ?
    `, [contentPattern])
    return rows.map(row => ({ ...rowToNode(row), mindmapTitle: row.mindmap_title }))
  }

  async updateNode(id: string, updates: Partial<Pick<MindmapNode, 'title' | 'content' | 'color' | 'notes' | 'shape' | 'styleOverrides' | 'hyperlink' | 'imageUrl' | 'parentId' | 'positionX' | 'positionY' | 'collapsed' | 'sortOrder'>>): Promise<MindmapNode> {
    const nodeRow = this.db.queryOne<{ mindmap_id: string }>('SELECT mindmap_id FROM mindmap_nodes WHERE id = ?', [id])
    if (!nodeRow) throw new Error(`Node not found: ${id}`)

    const fileData = await this.readFileData(nodeRow.mindmap_id)
    if (fileData) {
      const nodeInFile = fileData.nodes.find((n: any) => n.id === id)
      if (nodeInFile) {
        if (updates.title !== undefined) nodeInFile.title = updates.title
        if (updates.content !== undefined) nodeInFile.content = updates.content
        if (updates.color !== undefined) nodeInFile.color = updates.color
        if (updates.notes !== undefined) nodeInFile.notes = updates.notes
        if (updates.shape !== undefined) nodeInFile.shape = updates.shape
        if (updates.styleOverrides !== undefined) nodeInFile.styleOverrides = updates.styleOverrides
        if (updates.hyperlink !== undefined) nodeInFile.hyperlink = updates.hyperlink
        if (updates.imageUrl !== undefined) nodeInFile.imageUrl = updates.imageUrl
        if (updates.parentId !== undefined) nodeInFile.parentId = updates.parentId
        if (updates.positionX !== undefined) nodeInFile.positionX = updates.positionX
        if (updates.positionY !== undefined) nodeInFile.positionY = updates.positionY
        if (updates.collapsed !== undefined) nodeInFile.collapsed = updates.collapsed
        if (updates.sortOrder !== undefined) nodeInFile.sortOrder = updates.sortOrder
      }
      fileData.meta.updatedAt = new Date().toISOString()
      await this.writeFileDataById(nodeRow.mindmap_id, fileData)
    }

    const fields: string[] = []
    const values: unknown[] = []
    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
    if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content) }
    if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color) }
    if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes) }
    if (updates.shape !== undefined) { fields.push('shape = ?'); values.push(updates.shape) }
    if (updates.styleOverrides !== undefined) { fields.push('style_overrides = ?'); values.push(updates.styleOverrides) }
    if (updates.hyperlink !== undefined) { fields.push('hyperlink = ?'); values.push(updates.hyperlink) }
    if (updates.imageUrl !== undefined) { fields.push('image_url = ?'); values.push(updates.imageUrl) }
    if (updates.parentId !== undefined) { fields.push('parent_id = ?'); values.push(updates.parentId) }
    if (updates.positionX !== undefined) { fields.push('position_x = ?'); values.push(updates.positionX) }
    if (updates.positionY !== undefined) { fields.push('position_y = ?'); values.push(updates.positionY) }
    if (updates.collapsed !== undefined) { fields.push('collapsed = ?'); values.push(updates.collapsed ? 1 : 0) }
    if (updates.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(updates.sortOrder) }

    if (fields.length > 0) {
      values.push(id)
      this.db.run(`UPDATE mindmap_nodes SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    const row = this.db.queryOne<NodeRow>('SELECT * FROM mindmap_nodes WHERE id = ?', [id])!
    if (updates.content !== undefined) {
      this.syncLinks(nodeRow.mindmap_id).catch(() => {})
    }
    return rowToNode(row)
  }

  async removeNode(id: string): Promise<void> {
    const nodeRow = this.db.queryOne<{ mindmap_id: string }>('SELECT mindmap_id FROM mindmap_nodes WHERE id = ?', [id])

    if (nodeRow) {
      const fileData = await this.readFileData(nodeRow.mindmap_id)
      if (fileData) {
        const childIds = this.collectChildIds(id, fileData.nodes)
        const removeIds = new Set([id, ...childIds])
        fileData.nodes = fileData.nodes.filter((n: any) => !removeIds.has(n.id))
        fileData.edges = fileData.edges.filter((e: any) => !removeIds.has(e.sourceId) && !removeIds.has(e.targetId))
        if (fileData.summaries) {
          fileData.summaries = fileData.summaries
            .filter((s: any) => !removeIds.has(s.summaryNodeId))
            .map((s: any) => ({ ...s, nodeIds: s.nodeIds.filter((nid: string) => !removeIds.has(nid)) }))
            .filter((s: any) => s.nodeIds.length > 0)
        }
        fileData.meta.updatedAt = new Date().toISOString()
        await this.writeFileDataById(nodeRow.mindmap_id, fileData)
      }

      const allIds = this.collectDescendantIds(id)
      allIds.push(id)
      const placeholders = allIds.map(() => '?').join(', ')
      this.db.run(`DELETE FROM mindmap_summaries WHERE summary_node_id IN (${placeholders})`, allIds)
      this.db.run(`DELETE FROM mindmap_edges WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`, [...allIds, ...allIds])
      this.db.run(`DELETE FROM mindmap_nodes WHERE id IN (${placeholders})`, allIds)
      this.syncLinks(nodeRow.mindmap_id).catch(() => {})
      this.events.emit('mindmap:node:removed', { id, mindmapId: nodeRow.mindmap_id })
    } else {
      this.db.run('DELETE FROM mindmap_nodes WHERE id = ?', [id])
    }
  }

  collectDescendantIds(parentId: string): string[] {
    const children = this.db.query<{ id: string }>('SELECT id FROM mindmap_nodes WHERE parent_id = ?', [parentId])
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

    const fileData = await this.readFileData(noteId)
    if (fileData) {
      fileData.edges.push(edgeData)
      fileData.meta.updatedAt = new Date().toISOString()
      await this.writeFileDataById(noteId, fileData)
    }

    this.db.run(
      'INSERT INTO mindmap_edges (id, mindmap_id, source_id, target_id, label, style) VALUES (?, ?, ?, ?, ?, ?)',
      [id, noteId, input.sourceId, input.targetId, input.label ?? null, null],
    )

    const edge: MindmapEdge = { ...edgeData, mindmapId: noteId }
    this.events.emit('mindmap:edge:added', { edge })
    return edge
  }

  async getEdges(noteId: string): Promise<MindmapEdge[]> {
    return (this.db.query<EdgeRow>('SELECT * FROM mindmap_edges WHERE mindmap_id = ?', [noteId])).map(rowToEdge)
  }

  async updateEdge(id: string, updates: { label?: string; style?: string }): Promise<MindmapEdge> {
    const edgeRow = this.db.queryOne<EdgeRow>('SELECT * FROM mindmap_edges WHERE id = ?', [id])
    if (!edgeRow) throw new Error(`Edge not found: ${id}`)

    const fileData = await this.readFileData(edgeRow.mindmap_id)
    if (fileData) {
      const edgeInFile = fileData.edges.find((e: any) => e.id === id)
      if (edgeInFile) {
        if (updates.label !== undefined) edgeInFile.label = updates.label
        if (updates.style !== undefined) edgeInFile.style = updates.style
      }
      fileData.meta.updatedAt = new Date().toISOString()
      await this.writeFileDataById(edgeRow.mindmap_id, fileData)
    }

    const fields: string[] = []
    const values: unknown[] = []
    if (updates.label !== undefined) { fields.push('label = ?'); values.push(updates.label) }
    if (updates.style !== undefined) { fields.push('style = ?'); values.push(updates.style) }
    if (fields.length > 0) {
      values.push(id)
      this.db.run(`UPDATE mindmap_edges SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    const row = this.db.queryOne<EdgeRow>('SELECT * FROM mindmap_edges WHERE id = ?', [id])!
    return rowToEdge(row)
  }

  async removeEdge(id: string): Promise<void> {
    const edgeRow = this.db.queryOne<{ mindmap_id: string }>('SELECT mindmap_id FROM mindmap_edges WHERE id = ?', [id])

    if (edgeRow) {
      const fileData = await this.readFileData(edgeRow.mindmap_id)
      if (fileData) {
        fileData.edges = fileData.edges.filter((e: any) => e.id !== id)
        fileData.meta.updatedAt = new Date().toISOString()
        await this.writeFileDataById(edgeRow.mindmap_id, fileData)
      }
    }

    this.db.run('DELETE FROM mindmap_edges WHERE id = ?', [id])
  }

  // --- Boundaries ---

  async addBoundary(noteId: string, input: { nodeIds: string[]; label?: string; color?: string }): Promise<MindmapBoundary> {
    const id = uuid()
    const nodeIdsJson = JSON.stringify(input.nodeIds)
    const label = input.label ?? ''
    const color = input.color ?? null

    const fileData = await this.readFileData(noteId)
    if (fileData) {
      if (!fileData.boundaries) fileData.boundaries = []
      fileData.boundaries.push({ id, nodeIds: input.nodeIds, label, color })
      fileData.meta.updatedAt = new Date().toISOString()
      await this.writeFileDataById(noteId, fileData)
    }

    this.db.run(
      'INSERT INTO mindmap_boundaries (id, mindmap_id, node_ids, label, color) VALUES (?, ?, ?, ?, ?)',
      [id, noteId, nodeIdsJson, label, color],
    )
    return { id, mindmapId: noteId, nodeIds: input.nodeIds, label, color }
  }

  async getBoundaries(noteId: string): Promise<MindmapBoundary[]> {
    return (this.db.query<BoundaryRow>('SELECT * FROM mindmap_boundaries WHERE mindmap_id = ?', [noteId])).map(rowToBoundary)
  }

  async updateBoundary(id: string, updates: { label?: string; color?: string; nodeIds?: string[] }): Promise<MindmapBoundary> {
    const row = this.db.queryOne<{ mindmap_id: string }>('SELECT mindmap_id FROM mindmap_boundaries WHERE id = ?', [id])
    if (!row) throw new Error(`Boundary not found: ${id}`)

    const fileData = await this.readFileData(row.mindmap_id)
    if (fileData && fileData.boundaries) {
      const b = fileData.boundaries.find((b: any) => b.id === id)
      if (b) {
        if (updates.label !== undefined) b.label = updates.label
        if (updates.color !== undefined) b.color = updates.color
        if (updates.nodeIds !== undefined) b.nodeIds = updates.nodeIds
      }
      fileData.meta.updatedAt = new Date().toISOString()
      await this.writeFileDataById(row.mindmap_id, fileData)
    }

    const fields: string[] = []
    const values: unknown[] = []
    if (updates.label !== undefined) { fields.push('label = ?'); values.push(updates.label) }
    if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color) }
    if (updates.nodeIds !== undefined) { fields.push('node_ids = ?'); values.push(JSON.stringify(updates.nodeIds)) }
    if (fields.length > 0) {
      values.push(id)
      this.db.run(`UPDATE mindmap_boundaries SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    const updated = this.db.queryOne<BoundaryRow>('SELECT * FROM mindmap_boundaries WHERE id = ?', [id])!
    return rowToBoundary(updated)
  }

  async removeBoundary(id: string): Promise<void> {
    const row = this.db.queryOne<{ mindmap_id: string }>('SELECT mindmap_id FROM mindmap_boundaries WHERE id = ?', [id])
    if (row) {
      const fileData = await this.readFileData(row.mindmap_id)
      if (fileData && fileData.boundaries) {
        fileData.boundaries = fileData.boundaries.filter((b: any) => b.id !== id)
        fileData.meta.updatedAt = new Date().toISOString()
        await this.writeFileDataById(row.mindmap_id, fileData)
      }
    }
    this.db.run('DELETE FROM mindmap_boundaries WHERE id = ?', [id])
  }

  // --- Summaries ---

  async addSummary(noteId: string, input: { nodeIds: string[]; summaryTitle?: string }): Promise<{ summary: MindmapSummary; summaryNode: MindmapNode }> {
    const summaryNode = await this.addNode(noteId, { title: input.summaryTitle ?? 'Summary', floating: true })
    const id = uuid()
    const nodeIdsJson = JSON.stringify(input.nodeIds)

    const fileData = await this.readFileData(noteId)
    if (fileData) {
      if (!fileData.summaries) fileData.summaries = []
      fileData.summaries.push({ id, nodeIds: input.nodeIds, summaryNodeId: summaryNode.id })
      fileData.meta.updatedAt = new Date().toISOString()
      await this.writeFileDataById(noteId, fileData)
    }

    this.db.run(
      'INSERT INTO mindmap_summaries (id, mindmap_id, node_ids, summary_node_id) VALUES (?, ?, ?, ?)',
      [id, noteId, nodeIdsJson, summaryNode.id],
    )
    return {
      summary: { id, mindmapId: noteId, nodeIds: input.nodeIds, summaryNodeId: summaryNode.id },
      summaryNode,
    }
  }

  async getSummaries(noteId: string): Promise<MindmapSummary[]> {
    return (this.db.query<SummaryRow>('SELECT * FROM mindmap_summaries WHERE mindmap_id = ?', [noteId])).map(rowToSummary)
  }

  async removeSummary(id: string): Promise<void> {
    const row = this.db.queryOne<SummaryRow>('SELECT * FROM mindmap_summaries WHERE id = ?', [id])
    if (!row) return

    const fileData = await this.readFileData(row.mindmap_id)
    if (fileData && fileData.summaries) {
      fileData.summaries = fileData.summaries.filter((s: any) => s.id !== id)
      fileData.meta.updatedAt = new Date().toISOString()
      await this.writeFileDataById(row.mindmap_id, fileData)
    }

    this.db.run('DELETE FROM mindmap_summaries WHERE id = ?', [id])
    // Also remove the summary node
    await this.removeNode(row.summary_node_id)
  }
}
