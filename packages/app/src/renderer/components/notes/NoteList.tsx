import React, { useEffect, useState } from 'react'

interface Note {
  id: string
  title: string
  docId: string | null
  createdAt: string
}

interface Props {
  onOpenNote: (note: Note) => void
}

export default function NoteList({ onOpenNote }: Props) {
  const [notes, setNotes] = useState<Note[]>([])

  const loadNotes = async () => {
    const list = await window.electronAPI.notes.list()
    setNotes(list)
  }

  useEffect(() => { loadNotes() }, [])

  const handleCreate = async () => {
    const title = prompt('笔记标题：')
    if (!title) return
    const note = await window.electronAPI.notes.create({ title, content: '' })
    await loadNotes()
    onOpenNote(note)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await window.electronAPI.notes.delete(id)
    await loadNotes()
  }

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
      }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>笔记</h3>
        <button onClick={handleCreate} style={{ fontSize: 12 }}>+ 新建</button>
      </div>
      {notes.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>还没有笔记</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {notes.map((note) => (
            <div
              key={note.id}
              onClick={() => onOpenNote(note)}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{note.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(note.createdAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, note.id)}
                style={{ fontSize: 11, color: '#f38ba8', borderColor: '#f38ba8' }}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
