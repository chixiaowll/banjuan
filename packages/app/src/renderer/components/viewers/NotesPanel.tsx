import React, { useEffect, useState, useCallback } from 'react'
import { useT } from '../../i18n/index.js'
import TemplatePicker from '../notes/TemplatePicker.js'

interface NoteInfo {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

interface Props {
  docId: string
  onOpenNote: (note: NoteInfo) => void
  onCreateNote: () => void
}

export default function NotesPanel({ docId, onOpenNote, onCreateNote }: Props) {
  const t = useT()
  const [notes, setNotes] = useState<NoteInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)

  const loadNotes = useCallback(async () => {
    const result = await window.electronAPI.notes.list({ docId })
    setNotes(result as NoteInfo[])
    setLoading(false)
  }, [docId])

  useEffect(() => { loadNotes() }, [loadNotes])

  const handleCreateFromTemplate = async (templateId: string | null) => {
    setShowPicker(false)
    const title = prompt(t('prompt.noteTitle') || 'Note title:')
    if (!title) return
    const note = await window.electronAPI.notes.create({
      title,
      docId,
      templateId: templateId ?? undefined,
    })
    await loadNotes()
    onOpenNote(note)
  }

  if (loading) return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>{t('common.loading')}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {notes.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>{t('pdf.noNotes')}</div>
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
              {new Date(note.updatedAt || note.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          onClick={() => setShowPicker(true)}
          style={{
            width: '100%', padding: '6px 0', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 4,
            background: 'var(--bg)', cursor: 'pointer', color: 'var(--text)',
          }}
        >
          {t('pdf.newNote')}
        </button>
      </div>
      {showPicker && (
        <TemplatePicker onSelect={handleCreateFromTemplate} onClose={() => setShowPicker(false)} />
      )}
    </div>
  )
}
