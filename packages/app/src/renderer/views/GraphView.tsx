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
