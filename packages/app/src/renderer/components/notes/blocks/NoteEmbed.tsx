import React, { useEffect, useState, lazy, Suspense } from 'react'
import { createReactBlockSpec } from '@blocknote/react'

const MindmapEmbedPreview = lazy(() => import('./MindmapEmbedPreview.js'))
const BlockEditor = lazy(() => import('../BlockEditor.js'))

export const NoteEmbed = createReactBlockSpec(
  {
    type: 'noteEmbed' as const,
    propSchema: {
      noteId: { default: '' },
      noteTitle: { default: '' },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const { noteId, noteTitle } = props.block.props

      return (
        <NoteEmbedContent noteId={noteId} noteTitle={noteTitle} />
      )
    },
  }
)()

const noop = () => {}

function NoteEmbedContent({ noteId, noteTitle }: { noteId: string; noteTitle: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [noteType, setNoteType] = useState<string | null>(null)

  useEffect(() => {
    if (!noteId) return
    window.electronAPI.notes.get(noteId).then((note: any) => {
      if (!note) return
      setNoteType(note.type ?? 'markdown')
      if (note.type !== 'mindmap') {
        setContent(note.content ?? '')
      }
    })
  }, [noteId])

  const icon = noteType === 'mindmap' ? '🧠' : '📝'
  const title = noteTitle || (noteType === 'mindmap' ? 'Untitled Mindmap' : 'Untitled')

  return (
    <div className="note-embed-clean" data-embed-note-id={noteId} contentEditable={false}>
      <div className="note-embed-clean-header">
        <span className="note-embed-clean-icon">{icon}</span>
        <span className="note-embed-clean-title">{title}</span>
      </div>
      <div className="note-embed-clean-body">
        {noteType === 'mindmap' ? (
          <Suspense fallback={<span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading mindmap...</span>}>
            <MindmapEmbedPreview noteId={noteId} noteTitle={noteTitle} />
          </Suspense>
        ) : content === null ? (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading...</span>
        ) : !content ? (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Empty note</span>
        ) : (
          <Suspense fallback={<span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading...</span>}>
            <BlockEditor
              initialContent={content}
              onChange={noop}
              readOnly
              skipLinkSync
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
