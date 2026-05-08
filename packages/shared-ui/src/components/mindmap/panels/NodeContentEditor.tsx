import React, { useState, useEffect, useCallback } from 'react'
import BlockEditor from '../../notes/BlockEditor.js'
import { useMindmapStore } from '../useMindmapStore.js'

interface Props {
  nodeId: string
  onClose: () => void
}

export default function NodeContentEditor({ nodeId, onClose }: Props) {
  const { mindmapId, rfNodes, updateNodeData } = useMindmapStore()
  const node = rfNodes.find(n => n.id === nodeId)
  const [title, setTitle] = useState(node?.data.title ?? '')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setTitle(node?.data.title ?? '')
    setReady(true)
  }, [nodeId])

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle)
    updateNodeData(nodeId, { title: newTitle })
  }, [nodeId, updateNodeData])

  const handleContentChange = useCallback((json: string) => {
    updateNodeData(nodeId, { content: json })
  }, [nodeId, updateNodeData])

  if (!node || !ready) return <div style={{ padding: 16 }}>Loading...</div>

  const content = (node.data.content as string) ?? ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        padding: '8px 16px', borderBottom: '1px solid var(--border, #e0e0e0)', flexShrink: 0,
      }}>
        <textarea
          value={title}
          onChange={e => handleTitleChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
          }}
          rows={title.split('\n').length}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: 15, fontWeight: 600, flex: 1, color: 'var(--text, #333)',
            resize: 'none', fontFamily: 'inherit', lineHeight: 1.4,
          }}
        />
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted, #999)' }}>×</button>
      </div>
      <div className="node-content-editor-body" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <BlockEditor
          noteId={mindmapId ?? undefined}
          initialContent={content}
          onChange={handleContentChange}
          skipLinkSync
          autoParseMarkdown
        />
      </div>
    </div>
  )
}
