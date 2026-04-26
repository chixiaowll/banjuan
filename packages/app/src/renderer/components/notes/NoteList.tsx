import React, { useEffect, useState, useCallback } from 'react'
import { useI18n } from '../../i18n/index.js'
import TemplatePicker from './TemplatePicker.js'

interface Note {
  id: string
  title: string
  docId: string | null
  folderId: string | null
  createdAt: string
  updatedAt: string
}

interface Props {
  onOpenNote: (note: Note) => void
}

export default function NoteList({ onOpenNote }: Props) {
  const { t, locale } = useI18n()
  const [notes, setNotes] = useState<Note[]>([])
  const [showPicker, setShowPicker] = useState(false)

  const loadNotes = useCallback(async () => {
    const list = await window.electronAPI.notes.list({ sort: 'updated_at', order: 'desc' })
    setNotes(list)
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes])

  const handleCreate = async (templateId: string | null) => {
    setShowPicker(false)
    const title = prompt(t('prompt.noteTitle'))
    if (!title) return
    const note = await window.electronAPI.notes.create({
      title,
      templateId: templateId ?? undefined,
    })
    await loadNotes()
    onOpenNote(note)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await window.electronAPI.notes.delete(id)
    await loadNotes()
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
      }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>{t('library.notes')}</h3>
        <button onClick={() => setShowPicker(true)} style={{ fontSize: 12 }}>{t('common.new')}</button>
      </div>
      {notes.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('library.emptyNotes')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {notes.map((note) => (
            <div
              key={note.id}
              onClick={() => onOpenNote(note)}
              style={{
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                background: 'var(--surface)', border: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{note.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {formatDate(note.updatedAt || note.createdAt)}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, note.id)}
                style={{ fontSize: 11, color: '#f38ba8', borderColor: '#f38ba8' }}
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
        </div>
      )}
      {showPicker && (
        <TemplatePicker onSelect={handleCreate} onClose={() => setShowPicker(false)} />
      )}
    </div>
  )
}
