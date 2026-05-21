import React, { useState, useCallback } from 'react'
import { Save, X } from 'lucide-react'
import { useT } from '../../i18n/index.js'
import { useBanjuanAPI } from '../../api.js'

interface PointAnnotation {
  id: string
  page: number
  position: { type: 'point'; x: number; y: number }
  content: string | null
  color: string
}

interface Props {
  active: boolean
  color: string
  pageNum: number
  docId: string
  pointAnnotations: PointAnnotation[]
  onCreated: () => void
  onUpdated: (id: string, updates: { content?: string }) => void
  onContextMenu?: (e: React.MouseEvent, id: string) => void
}

export default function TextNoteTool({ active, color, pageNum, docId, pointAnnotations, onCreated, onUpdated, onContextMenu }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [newNote, setNewNote] = useState<{ x: number; y: number } | null>(null)
  const [newContent, setNewContent] = useState('')

  const handleClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!active) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setNewNote({ x, y })
    setNewContent('')
  }, [active])

  const saveNewNote = async () => {
    if (!newNote) return
    await api.annotations.create({
      docId,
      type: 'note',
      page: pageNum,
      position: { type: 'point', page: pageNum, x: newNote.x, y: newNote.y },
      content: newContent,
      color,
    })
    setNewNote(null)
    setNewContent('')
    onCreated()
  }

  const startEdit = (ann: PointAnnotation) => {
    setEditingId(ann.id)
    setEditContent(ann.content || '')
  }

  const saveEdit = () => {
    if (!editingId) return
    onUpdated(editingId, { content: editContent })
    setEditingId(null)
  }

  const pageAnns = pointAnnotations.filter(a => a.page === pageNum)

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'absolute', inset: 0,
        cursor: active ? 'crosshair' : 'default',
        pointerEvents: active || pageAnns.length > 0 ? 'auto' : 'none',
        zIndex: active ? 10 : 5,
      }}
    >
      {pageAnns.map(ann => (
        <div key={ann.id} style={{ position: 'absolute', left: `${ann.position.x * 100}%`, top: `${ann.position.y * 100}%`, transform: 'translate(-50%, -50%)' }}>
          <div
            onClick={(e) => { e.stopPropagation(); if (onContextMenu) { onContextMenu(e, ann.id) } else { startEdit(ann) } }}
            style={{ fontSize: 18, cursor: 'pointer', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
          >
            📌
          </div>
          {editingId === ann.id && (
            <div onClick={(e) => e.stopPropagation()} style={{
              position: 'absolute', top: 24, left: -60, width: 200,
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 6, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 100,
            }}>
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                style={{ width: '100%', minHeight: 60, fontSize: 12, border: '1px solid var(--border)', borderRadius: 3, padding: 4, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <button onClick={saveEdit} style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Save size={12} />{t('common.save')}</button>
                <button onClick={() => setEditingId(null)} style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}><X size={12} />{t('common.cancel')}</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {newNote && (
        <div style={{
          position: 'absolute', left: `${newNote.x * 100}%`, top: `${newNote.y * 100}%`,
          transform: 'translate(-50%, -50%)',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: 'absolute', top: 0, left: 12, width: 200,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 6, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 100,
          }}>
            <textarea autoFocus value={newContent} onChange={(e) => setNewContent(e.target.value)}
              placeholder={t('tool.noteInput')}
              style={{ width: '100%', minHeight: 60, fontSize: 12, border: '1px solid var(--border)', borderRadius: 3, padding: 4, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <button onClick={saveNewNote} style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Save size={12} />{t('common.save')}</button>
              <button onClick={() => setNewNote(null)} style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}><X size={12} />{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
