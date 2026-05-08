import React, { useState } from 'react'
import { Pencil, Save, X, Trash2 } from 'lucide-react'
import { useT } from '../../i18n/index.js'

interface Annotation {
  id: string
  type: string
  page: number | null
  content: string | null
  selectedText: string | null
  color: string
  createdAt: string
}

interface Props {
  annotations: Annotation[]
  onAnnotationClick: (id: string) => void
  onAnnotationDelete: (id: string) => void
  onAnnotationUpdate: (id: string, updates: { content?: string; color?: string }) => void
}

export default function AnnotationSidebar({ annotations, onAnnotationClick, onAnnotationDelete, onAnnotationUpdate }: Props) {
  const t = useT()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const grouped = new Map<number | null, Annotation[]>()
  for (const ann of annotations) {
    const key = ann.page
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(ann)
  }

  const sortedKeys = Array.from(grouped.keys()).sort((a, b) => (a ?? 0) - (b ?? 0))

  const startEdit = (ann: Annotation) => {
    setEditingId(ann.id)
    setEditContent(ann.content ?? '')
  }

  const saveEdit = (id: string) => {
    onAnnotationUpdate(id, { content: editContent })
    setEditingId(null)
  }

  return (
    <div style={{
      width: 280,
      borderLeft: '1px solid var(--border)',
      overflow: 'auto',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        fontWeight: 600,
        fontSize: 14,
      }}>
        {t('annotation.title')} ({annotations.length})
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {sortedKeys.map((pageKey) => (
          <div key={pageKey ?? 'none'}>
            {pageKey !== null && (
              <div style={{
                padding: '8px 16px 4px',
                fontSize: 11,
                color: 'var(--text-muted)',
                fontWeight: 600,
              }}>
                {t('pdf.page', pageKey)}
              </div>
            )}
            {grouped.get(pageKey)!.map((ann) => (
              <div
                key={ann.id}
                style={{
                  padding: '8px 16px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
                onClick={() => onAnnotationClick(ann.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 2,
                    background: ann.color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {ann.type === 'highlight' ? t('annotation.highlight') : ann.type === 'note' ? t('annotation.note') : ann.type}
                  </span>
                </div>
                {ann.selectedText && (
                  <div style={{
                    fontSize: 12,
                    color: 'var(--text)',
                    borderLeft: `3px solid ${ann.color}`,
                    paddingLeft: 8,
                    marginBottom: 4,
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {ann.selectedText}
                  </div>
                )}
                {editingId === ann.id ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      style={{
                        width: '100%', fontSize: 12, padding: 4,
                        background: 'var(--surface)', color: 'var(--text)',
                        border: '1px solid var(--border)', borderRadius: 4,
                        resize: 'vertical', minHeight: 50,
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => saveEdit(ann.id)}><Save size={12} />{t('common.save')}</button>
                      <button style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setEditingId(null)}><X size={12} />{t('common.cancel')}</button>
                    </div>
                  </div>
                ) : ann.content ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {ann.content}
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(ann) }}
                    style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Pencil size={12} />{t('common.edit')}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAnnotationDelete(ann.id) }}
                    style={{ fontSize: 11, color: '#f38ba8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Trash2 size={12} />{t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
        {annotations.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
            {t('annotation.empty')}
          </div>
        )}
      </div>
    </div>
  )
}
