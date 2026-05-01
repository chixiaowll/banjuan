import React, { useState, useEffect, useCallback } from 'react'
import BlockEditor from '../../notes/BlockEditor.js'

interface Props {
  noteId: string
  onClose: () => void
}

export default function NoteEditorPanel({ noteId, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  useEffect(() => {
    window.electronAPI.notes.get(noteId).then((note: any) => {
      if (note) {
        setTitle(note.title)
        setContent(note.content ?? '')
      }
    })
  }, [noteId])

  const handleChange = useCallback((json: string) => {
    window.electronAPI.notes.update(noteId, { content: json })
  }, [noteId])

  if (content === null) {
    return <div style={{ padding: 16 }}>Loading...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border, #e0e0e0)' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>{title}</h3>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <BlockEditor
          noteId={noteId}
          initialContent={content}
          onChange={handleChange}
        />
      </div>
    </div>
  )
}
