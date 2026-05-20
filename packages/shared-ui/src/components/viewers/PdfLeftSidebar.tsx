import React from 'react'
import { LayoutGrid, List, Highlighter, FileText } from 'lucide-react'
import { usePdfViewer, type LeftSidebarTab } from './PdfViewerContext.js'
import ThumbnailPanel from './ThumbnailPanel.js'
import OutlinePanel from './OutlinePanel.js'
import AnnotationPanel from './AnnotationPanel.js'
import NotesPanel from './NotesPanel.js'
import { useT } from '../../i18n/index.js'

const TAB_IDS: Array<{ id: LeftSidebarTab; icon: React.ReactNode; key: string }> = [
  { id: 'thumbnails', icon: <LayoutGrid size={16} />, key: 'pdf.thumbnails' },
  { id: 'outline', icon: <List size={16} />, key: 'pdf.outline' },
  { id: 'annotations', icon: <Highlighter size={16} />, key: 'pdf.annotations' },
  { id: 'notes', icon: <FileText size={16} />, key: 'pdf.notes' },
]

interface Props {
  docId: string
  annotations: any[]
  onAnnotationClick: (page: number, yFraction?: number) => void
  onAnnotationDelete: (id: string) => void
  onAnnotationUpdate: (id: string, updates: any) => void
  onOpenNote: (note: any) => void
  onCreateNote: () => void
  onDeleteNote?: (noteId: string) => void
  width?: number
}

export default function PdfLeftSidebar({
  docId, annotations, onAnnotationClick, onAnnotationDelete, onAnnotationUpdate,
  onOpenNote, onCreateNote, onDeleteNote, width = 240,
}: Props) {
  const t = useT()
  const { leftSidebarTab, setLeftSidebarTab, leftSidebarOpen } = usePdfViewer()

  if (!leftSidebarOpen) return null

  return (
    <div style={{
      width, borderRight: 'none',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      background: 'var(--bg)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-solid, var(--border))', flexShrink: 0 }}>
        {TAB_IDS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setLeftSidebarTab(tab.id)}
            title={t(tab.key as any)}
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
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' }}>
        {leftSidebarTab === 'thumbnails' && <ThumbnailPanel />}
        {leftSidebarTab === 'outline' && <OutlinePanel />}
        {leftSidebarTab === 'annotations' && (
          <AnnotationPanel annotations={annotations} onAnnotationClick={onAnnotationClick}
            onAnnotationDelete={onAnnotationDelete} onAnnotationUpdate={onAnnotationUpdate} />
        )}
        {leftSidebarTab === 'notes' && (
          <NotesPanel docId={docId} onOpenNote={onOpenNote} onCreateNote={onCreateNote} onDeleteNote={onDeleteNote} />
        )}
      </div>
    </div>
  )
}
