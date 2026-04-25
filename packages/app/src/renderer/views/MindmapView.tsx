import React, { useEffect, useState, useCallback } from 'react'
import MindmapCanvas from '../components/mindmap/MindmapCanvas.js'
import MindmapToolbar from '../components/mindmap/MindmapToolbar.js'

interface MindmapInfo { id: string; title: string }
interface Props { mindmap: MindmapInfo; onBack: () => void }

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
    const t = prompt('节点标题：')
    if (!t) return
    await window.electronAPI.mindmaps.addNode(mindmap.id, { title: t })
    await reload()
  }, [mindmap.id, reload])

  const handleAddChild = useCallback(async () => {
    if (!selectedNodeId) return
    const t = prompt('子节点标题：')
    if (!t) return
    await window.electronAPI.mindmaps.addNode(mindmap.id, { title: t, parentId: selectedNodeId })
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
    const t = prompt('节点标题：', node.title)
    if (t === null) return
    await window.electronAPI.mindmaps.updateNode(selectedNodeId, { title: t })
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
    const t = prompt('节点标题：', node.title)
    if (t === null) return
    await window.electronAPI.mindmaps.updateNode(id, { title: t })
    await reload()
  }, [nodes, reload])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <button onClick={onBack}>← 返回</button>
        <span style={{ fontWeight: 500 }}>{title}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>脑图</span>
      </div>
      <MindmapToolbar title={title} selectedNodeId={selectedNodeId}
        onAddRoot={handleAddRoot} onAddChild={handleAddChild}
        onDeleteNode={handleDeleteNode} onEditNode={handleEditNode} onTitleChange={handleTitleChange} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <MindmapCanvas nodes={nodes} edges={edges} selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId} onDoubleClickNode={handleDoubleClickNode} onToggleCollapse={handleToggleCollapse} />
      </div>
    </div>
  )
}
