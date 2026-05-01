import React, { useEffect, useState, useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import MindmapCanvas from '../components/mindmap/MindmapCanvas.js'
import MindmapToolbar from '../components/mindmap/MindmapToolbar.js'
import MindmapContextMenu from '../components/mindmap/MindmapContextMenu.js'
import MindmapSearch from '../components/mindmap/MindmapSearch.js'
import NodePropertyPanel from '../components/mindmap/panels/NodePropertyPanel.js'
import NoteEditorPanel from '../components/mindmap/panels/NoteEditorPanel.js'
import ThemePanel from '../components/mindmap/panels/ThemePanel.js'
import { useMindmapStore } from '../components/mindmap/useMindmapStore.js'
import { useKeyboardShortcuts } from '../components/mindmap/useKeyboardShortcuts.js'

interface Props {
  mindmap: { id: string; title: string }
  onBack: () => void
}

function MindmapViewInner({ mindmap, onBack }: Props) {
  const { init, sidePanelType, sidePanelNodeId, closeSidePanel, rfNodes } = useMindmapStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  useKeyboardShortcuts()

  useEffect(() => {
    init(mindmap.id)
  }, [mindmap.id, init])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const target = (e.target as HTMLElement).closest('.react-flow__node')
    if (!target) return
    const nodeId = target.getAttribute('data-id')
    if (nodeId) setContextMenu({ x: e.clientX, y: e.clientY, nodeId })
  }, [])

  const selectedNoteId = sidePanelNodeId
    ? rfNodes.find(n => n.id === sidePanelNodeId)?.data.noteId
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} onContextMenu={handleContextMenu}>
      <MindmapToolbar onBack={onBack} />
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <MindmapCanvas />
          {searchOpen && <MindmapSearch onClose={() => setSearchOpen(false)} />}
        </div>

        {sidePanelType !== 'none' && (
          <>
            <div style={{ width: 4, flexShrink: 0, background: 'var(--border, #e0e0e0)' }} />
            <div style={{ width: 300, flexShrink: 0, overflow: 'hidden', background: 'var(--surface, #fff)' }}>
              {sidePanelType === 'properties' && sidePanelNodeId && (
                <NodePropertyPanel nodeId={sidePanelNodeId} onClose={closeSidePanel} />
              )}
              {sidePanelType === 'noteEditor' && selectedNoteId && (
                <NoteEditorPanel noteId={selectedNoteId} onClose={closeSidePanel} />
              )}
              {sidePanelType === 'theme' && (
                <ThemePanel onClose={closeSidePanel} />
              )}
            </div>
          </>
        )}
      </div>

      {contextMenu && (
        <MindmapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

export default function MindmapView(props: Props) {
  return (
    <ReactFlowProvider>
      <MindmapViewInner {...props} />
    </ReactFlowProvider>
  )
}
