import React from 'react'
import { usePdfViewer, type LeftSidebarTab } from './PdfViewerContext.js'
import ThumbnailPanel from './ThumbnailPanel.js'
import OutlinePanel from './OutlinePanel.js'
import AnnotationPanel from './AnnotationPanel.js'
import NotesPanel from './NotesPanel.js'

const TABS: Array<{ id: LeftSidebarTab; icon: string; title: string }> = [
  { id: 'thumbnails', icon: '▦', title: '缩略图' },
  { id: 'outline', icon: '☰', title: '目录' },
  { id: 'annotations', icon: '🖍', title: '标注' },
  { id: 'notes', icon: '📝', title: '笔记' },
]

interface Props {
  docId: string
  annotations: any[]
  onAnnotationClick: (page: number) => void
  onAnnotationDelete: (id: string) => void
  onAnnotationUpdate: (id: string, updates: any) => void
  onOpenNote: (note: any) => void
  onCreateNote: () => void
}

export default function PdfLeftSidebar({
  docId, annotations, onAnnotationClick, onAnnotationDelete, onAnnotationUpdate,
  onOpenNote, onCreateNote,
}: Props) {
  const { leftSidebarTab, setLeftSidebarTab, leftSidebarOpen } = usePdfViewer()

  if (!leftSidebarOpen) return null

  return (
    <div style={{
      width: 240, borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      background: 'var(--bg)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setLeftSidebarTab(tab.id)}
            title={tab.title}
            style={{
              flex: 1, padding: '8px 0', border: 'none',
              background: leftSidebarTab === tab.id ? 'var(--bg)' : 'var(--surface)',
              borderBottom: leftSidebarTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer', fontSize: 14,
              color: leftSidebarTab === tab.id ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            {tab.icon}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {leftSidebarTab === 'thumbnails' && <ThumbnailPanel />}
        {leftSidebarTab === 'outline' && <OutlinePanel />}
        {leftSidebarTab === 'annotations' && (
          <AnnotationPanel annotations={annotations} onAnnotationClick={onAnnotationClick}
            onAnnotationDelete={onAnnotationDelete} onAnnotationUpdate={onAnnotationUpdate} />
        )}
        {leftSidebarTab === 'notes' && (
          <NotesPanel docId={docId} onOpenNote={onOpenNote} onCreateNote={onCreateNote} />
        )}
      </div>
    </div>
  )
}
