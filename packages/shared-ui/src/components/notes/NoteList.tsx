import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, FileText, Brain, PenTool } from 'lucide-react'
import { useI18n } from '../../i18n/index.js'
import TemplatePicker from './TemplatePicker.js'
import { useBanjuanAPI } from '../../api.js'

interface Note {
  id: string
  title: string
  type: 'markdown' | 'mindmap' | 'handwriting'
  docId: string | null
  folderId: string | null
  createdAt: string
  updatedAt: string
}

interface Props {
  onOpenNote: (note: Note) => void
}

export default function NoteList({ onOpenNote }: Props) {
  const api = useBanjuanAPI()
  const { t, locale } = useI18n()
  const [notes, setNotes] = useState<Note[]>([])
  const [showPicker, setShowPicker] = useState(false)

  const loadNotes = useCallback(async () => {
    const list = await api.notes.list({ sort: 'updated_at', order: 'desc' })
    setNotes(list)
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes])

  useEffect(() => {
    document.addEventListener('notes-changed', loadNotes)
    return () => document.removeEventListener('notes-changed', loadNotes)
  }, [loadNotes])

  const [pickerError, setPickerError] = useState<string | null>(null)

  const handleCreate = async (templateId: string | null, title: string) => {
    try {
      const note = await api.notes.create({
        title,
        templateId: templateId ?? undefined,
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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await api.notes.delete(id)
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
        <button onClick={() => setShowPicker(true)} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={14} />{t('common.new')}</button>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'inline-flex' }}>
                  {note.type === 'mindmap' ? <Brain size={16} /> : note.type === 'handwriting' ? <PenTool size={16} /> : <FileText size={16} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {formatDate(note.updatedAt || note.createdAt)}
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, note.id)}
                style={{ fontSize: 11, color: '#f38ba8', borderColor: '#f38ba8', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Trash2 size={14} />{t('common.delete')}
              </button>
            </div>
          ))}
        </div>
      )}
      {showPicker && (
        <TemplatePicker onSelect={handleCreate} onClose={() => { setShowPicker(false); setPickerError(null) }} error={pickerError} />
      )}
    </div>
  )
}
