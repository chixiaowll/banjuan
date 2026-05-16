import React from 'react'
import { List, Highlighter, FileText } from 'lucide-react'
import { useMarkdownViewer, type MdLeftSidebarTab } from './MarkdownViewerContext.js'
import NoteOutlinePanel, { type HeadingItem } from '../notes/NoteOutlinePanel.js'
import AnnotationPanel from './AnnotationPanel.js'
import NotesPanel from './NotesPanel.js'
import { useT } from '../../i18n/index.js'

const TAB_IDS: Array<{ id: MdLeftSidebarTab; icon: React.ReactNode; key: string }> = [
  { id: 'outline', icon: <List size={16} />, key: 'md.outline' },
  { id: 'annotations', icon: <Highlighter size={16} />, key: 'md.annotations' },
  { id: 'notes', icon: <FileText size={16} />, key: 'md.notes' },
]

interface Props {
  docId: string
  headings: HeadingItem[]
  annotations: any[]
  onAnnotationClick: (annotation: any) => void
  onAnnotationDelete: (id: string) => void
  onAnnotationUpdate: (id: string, updates: any) => void
  onOpenNote: (note: any) => void
  onCreateNote: () => void
  onDeleteNote?: (noteId: string) => void
  width?: number
}

export default function MarkdownLeftSidebar({
  docId, headings, annotations,
  onAnnotationClick, onAnnotationDelete, onAnnotationUpdate,
  onOpenNote, onCreateNote, onDeleteNote, width = 240,
}: Props) {
  const t = useT()
  const { leftSidebarTab, setLeftSidebarTab, leftSidebarOpen } = useMarkdownViewer()

  if (!leftSidebarOpen) return null

  return (
    <div style={{
      width, borderRight: 'none',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      background: 'var(--bg)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
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
      <div style={{ flex: 1, overflow: 'auto' }}>
        {leftSidebarTab === 'outline' && <NoteOutlinePanel headings={headings} />}
        {leftSidebarTab === 'annotations' && (
          <AnnotationPanel
            annotations={annotations}
            onAnnotationClick={() => {}}
            onAnnotationNavigate={onAnnotationClick}
            onAnnotationDelete={onAnnotationDelete}
            onAnnotationUpdate={onAnnotationUpdate}
          />
        )}
        {leftSidebarTab === 'notes' && (
          <NotesPanel docId={docId} onOpenNote={onOpenNote} onCreateNote={onCreateNote} onDeleteNote={onDeleteNote} />
        )}
      </div>
    </div>
  )
}
