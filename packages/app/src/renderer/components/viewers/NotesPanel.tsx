import React, { useEffect, useState } from 'react'

interface NoteInfo {
  id: string
  title: string
  createdAt: string
}

interface Props {
  docId: string
  onOpenNote: (note: NoteInfo) => void
  onCreateNote: () => void
}

export default function NotesPanel({ docId, onOpenNote, onCreateNote }: Props) {
  const [notes, setNotes] = useState<NoteInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    window.electronAPI.notes.list({ docId }).then((result: NoteInfo[]) => {
      if (!cancelled) { setNotes(result); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [docId])

  if (loading) return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {notes.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>暂无笔记</div>
        )}
        {notes.map(note => (
          <div
            key={note.id}
            onClick={() => onOpenNote(note)}
            style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ fontWeight: 500 }}>{note.title}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {new Date(note.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          onClick={onCreateNote}
          style={{
            width: '100%', padding: '6px 0', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 4,
            background: 'var(--bg)', cursor: 'pointer', color: 'var(--text)',
          }}
        >
          + 新建笔记
        </button>
      </div>
    </div>
  )
}
