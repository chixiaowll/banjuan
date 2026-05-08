import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useT } from '../../i18n/index.js'
import TemplatePicker, { type NoteType } from '../notes/TemplatePicker.js'

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
  onDeleteNote?: (noteId: string) => void
}

export default function NotesPanel({ docId, onOpenNote, onCreateNote, onDeleteNote }: Props) {
  const t = useT()
  const [notes, setNotes] = useState<NoteInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteId: string } | null>(null)

  const loadNotes = useCallback(async () => {
    const result = await window.electronAPI.notes.list({ docId })
    setNotes(result as NoteInfo[])
    setLoading(false)
  }, [docId])

  useEffect(() => { loadNotes() }, [loadNotes])

  const [pickerError, setPickerError] = useState<string | null>(null)

  const handleCreateFromTemplate = async (templateId: string | null, title: string, type: NoteType) => {
    try {
      const note = await window.electronAPI.notes.create({
        title,
        docId,
        ...(type !== 'markdown' ? { type } : { templateId: templateId ?? undefined }),
      })
      setPickerError(null)
      setShowPicker(false)
      await loadNotes()
      onOpenNote(note)
    } catch (err: any) {
      if (err?.message?.includes('DUPLICATE_TITLE')) {
        setPickerError(t('note.duplicateTitle' as any))
      } else {
        throw err
      }
    }
  }

  const handleDeleteNote = useCallback(async (noteId: string) => {
    setContextMenu(null)
    await window.electronAPI.notes.delete(noteId)
    onDeleteNote?.(noteId)
    loadNotes()
  }, [loadNotes, onDeleteNote])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

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
            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, noteId: note.id }) }}
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
        <TemplatePicker onSelect={handleCreateFromTemplate} onClose={() => { setShowPicker(false); setPickerError(null) }} error={pickerError} />
      )}
      {contextMenu && (
        <div style={{
          position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          padding: '4px 0', minWidth: 120,
        }}>
          <button
            onClick={() => handleDeleteNote(contextMenu.noteId)}
            style={{
              display: 'block', width: '100%', padding: '6px 12px', border: 'none',
              background: 'none', textAlign: 'left', fontSize: 12, cursor: 'pointer',
              color: '#e53e3e',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {t('common.delete')}
          </button>
        </div>
      )}
    </div>
  )
}
