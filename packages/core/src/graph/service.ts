import type { PlatformDatabase } from '../platform/index.js'
import type { GraphData, GraphNode, GraphEdge } from '../types.js'

export class GraphService {
  constructor(private db: PlatformDatabase) {}

  async getData(): Promise<GraphData> {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const nodeIds = new Set<string>()

    const docs = this.db.query<{ id: string; title: string; type: string }>('SELECT id, title, type FROM documents')
    for (const doc of docs) {
      nodes.push({ id: doc.id, label: doc.title, type: 'document', docType: doc.type as any })
      nodeIds.add(doc.id)
    }

    const notes = this.db.query<{ id: string; title: string; type: string; doc_id: string | null }>('SELECT id, title, type, doc_id FROM notes')
    for (const note of notes) {
      nodes.push({ id: note.id, label: note.title, type: 'note', noteType: note.type as any })
      nodeIds.add(note.id)
      if (note.doc_id && nodeIds.has(note.doc_id)) {
        edges.push({ source: note.id, target: note.doc_id, type: 'note-doc' })
      }
    }

    const noteLinks = this.db.query<{ source_id: string; target_id: string }>('SELECT source_id, target_id FROM note_links')
    for (const link of noteLinks) {
      if (nodeIds.has(link.source_id) && nodeIds.has(link.target_id)) {
        edges.push({ source: link.source_id, target: link.target_id, type: 'note-note' })
      }
    }

    const annLinks = this.db.query<{ note_id: string; doc_id: string }>(`
      SELECT DISTINCT n.id as note_id, a.doc_id
      FROM note_annotations na
      JOIN notes n ON n.id = na.note_id
      JOIN annotations a ON a.id = na.annotation_id
      WHERE n.doc_id IS NULL OR n.doc_id != a.doc_id
    `)
    for (const link of annLinks) {
      if (nodeIds.has(link.note_id) && nodeIds.has(link.doc_id)) {
        edges.push({ source: link.note_id, target: link.doc_id, type: 'annotation-link' })
      }
    }

    return { nodes, edges }
  }
}
