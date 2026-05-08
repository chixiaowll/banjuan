import React, { useEffect, useState, useCallback } from 'react'
import { ArrowLeft } from 'lucide-react'
import KnowledgeGraph from '../components/graph/KnowledgeGraph.js'
import { useT } from '../i18n/index.js'
import { useBanjuanAPI } from '../api.js'

interface Props {
  onBack: () => void
  onOpenDoc: (doc: any) => void
  onOpenNote: (note: any) => void
  onOpenMindmap: (mindmap: any) => void
}

export default function GraphView({ onBack, onOpenDoc, onOpenNote, onOpenMindmap }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const [nodes, setNodes] = useState<any[]>([])
  const [edges, setEdges] = useState<any[]>([])

  useEffect(() => {
    api.graph.getData().then((data) => {
      setNodes(data.nodes)
      setEdges(data.edges)
    })
  }, [])

  const handleNodeClick = useCallback(async (id: string, type: string) => {
    switch (type) {
      case 'document': {
        const doc = await api.documents.get(id)
        if (doc) onOpenDoc(doc)
        break
      }
      case 'note': {
        const note = await api.notes.get(id)
        if (note) onOpenNote(note)
        break
      }
      case 'mindmap': {
        const map = await api.notes.get(id)
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
        <button onClick={onBack} title={t('common.back')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'inline-flex', alignItems: 'center' }}><ArrowLeft size={16} /></button>
        <span style={{ fontWeight: 500 }}>{t('graph.title')}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {t('graph.stats', nodes.length, edges.length)}
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {nodes.length > 0 ? (
          <KnowledgeGraph nodes={nodes} edges={edges} onNodeClick={handleNodeClick} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            {t('graph.empty')}
          </div>
        )}
      </div>
    </div>
  )
}
