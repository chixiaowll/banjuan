import type Database from 'better-sqlite3'
import type { GraphData, GraphNode, GraphEdge } from '../types.js'

export class GraphService {
  constructor(private db: Database.Database) {}

  async getData(): Promise<GraphData> {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const nodeIds = new Set<string>()

    const docs = this.db.prepare('SELECT id, title, type FROM documents').all() as Array<{ id: string; title: string; type: string }>
    for (const doc of docs) {
      nodes.push({ id: doc.id, label: doc.title, type: 'document', docType: doc.type as any })
      nodeIds.add(doc.id)
    }

    const notes = this.db.prepare('SELECT id, title, doc_id FROM notes').all() as Array<{ id: string; title: string; doc_id: string | null }>
    for (const note of notes) {
      nodes.push({ id: note.id, label: note.title, type: 'note' })
      nodeIds.add(note.id)
      if (note.doc_id && nodeIds.has(note.doc_id)) {
        edges.push({ source: note.id, target: note.doc_id, type: 'note-doc' })
      }
    }

    const maps = this.db.prepare('SELECT id, title, doc_id FROM mindmaps').all() as Array<{ id: string; title: string; doc_id: string | null }>
    for (const map of maps) {
      nodes.push({ id: map.id, label: map.title, type: 'mindmap' })
      nodeIds.add(map.id)
      if (map.doc_id && nodeIds.has(map.doc_id)) {
        edges.push({ source: map.id, target: map.doc_id, type: 'mindmap-doc' })
      }
    }

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
