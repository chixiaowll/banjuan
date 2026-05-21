import React, { useState } from 'react'
import { useT } from '../../i18n/index.js'
import InkThumbnail from './InkThumbnail.js'

interface AnnotationData {
  id: string
  page: number | null
  selectedText: string | null
  content: string | null
  color: string
  type: string
  position: any
  createdAt: string
}

interface Props {
  annotations: AnnotationData[]
  onAnnotationClick: (page: number, yFraction?: number) => void
  onAnnotationNavigate?: (annotation: AnnotationData) => void
  onAnnotationDelete: (id: string) => void
  onAnnotationUpdate: (id: string, updates: any) => void
}

export default function AnnotationPanel({ annotations, onAnnotationClick, onAnnotationNavigate, onAnnotationDelete, onAnnotationUpdate }: Props) {
  const t = useT()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const isEpub = annotations.some(a => a.position?.type === 'epub')
  // Annotations have no meaningful page when all have null (e.g., EPUB scrolled
  // mode — strokes use absolute Y, highlights use CFI). Hide the page header
  // and show a flat sorted list.
  const hasPages = annotations.some(a => a.page != null)

  const grouped = new Map<number, AnnotationData[]>()
  for (const ann of annotations) {
    const page = ann.page ?? 0
    if (!grouped.has(page)) grouped.set(page, [])
    grouped.get(page)!.push(ann)
  }
  for (const [, list] of grouped) {
    list.sort((a, b) => {
      const posA = a.position
      const posB = b.position
      const yA = posA?.startOffset ?? posA?.bounds?.y ?? posA?.rect?.y ?? posA?.y ?? 0
      const yB = posB?.startOffset ?? posB?.bounds?.y ?? posB?.rect?.y ?? posB?.y ?? 0
      return yA - yB
    })
  }
  const sortedPages = [...grouped.keys()].sort((a, b) => a - b)

  const startEdit = (ann: AnnotationData) => {
    setEditingId(ann.id)
    setEditContent(ann.content || '')
  }

  const saveEdit = (id: string) => {
    onAnnotationUpdate(id, { content: editContent })
    setEditingId(null)
  }

  if (annotations.length === 0) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>{t('pdf.noAnnotations')}</div>
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {sortedPages.map(page => (
        <div key={page}>
          {hasPages && (
            <div style={{
              padding: '8px 12px', fontSize: 11, fontWeight: 600,
              color: 'var(--text-muted)', background: 'var(--surface)',
              textTransform: 'uppercase' as const, letterSpacing: '0.06em',
            }}>
              {isEpub ? `Loc ${page}` : t('pdf.page', page)}
            </div>
          )}
          {grouped.get(page)!.map(ann => (
            <div
              key={ann.id}
              style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, transition: 'background var(--transition, 0.15s ease)' }}
              onClick={() => {
                if (onAnnotationNavigate && (ann.position?.type === 'epub' || ann.position?.type === 'text' || ann.position?.type === 'ink' || ann.position?.type === 'area')) {
                  onAnnotationNavigate(ann)
                  return
                }
                if (ann.page == null) return
                const pos = ann.position
                let yFraction: number | undefined
                if (pos?.type === 'area' && pos.rect) yFraction = pos.rect.y
                else if (pos?.type === 'point') yFraction = pos.y
                else if (pos?.type === 'ink' && pos.bounds) yFraction = pos.bounds.y
                else if (pos?.rects?.[0]) yFraction = pos.rects[0].y
                onAnnotationClick(ann.page, yFraction)
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: ann.color, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {ann.position?.type === 'area' ? (
                    ann.position?.imageData ? (
                      <img src={ann.position.imageData} alt={t('pdf.areaScreenshot')} style={{
                        maxWidth: '100%', maxHeight: 120, borderRadius: 3,
                        border: `1px solid ${ann.color}`, display: 'block',
                      }} />
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        {t('pdf.areaSelect')} ({t('pdf.page', ann.page ?? 0)})
                      </span>
                    )
                  ) : ann.position?.type === 'ink' && ann.position?.strokes?.length > 0 ? (
                    <InkThumbnail
                      strokes={ann.position.strokes}
                      bounds={ann.position.bounds || { x: 0, y: 0, w: 1, h: 1 }}
                    />
                  ) : ann.selectedText ? (
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                      lineHeight: '1.4',
                    }}>
                      {ann.selectedText}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{ann.type}</span>
                  )}
                </div>
              </div>
              {editingId === ann.id ? (
                <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    style={{
                      width: '100%', minHeight: 50, fontSize: 12, fontFamily: 'inherit',
                      border: '1px solid var(--border-solid, #e5e5e7)', borderRadius: 'var(--radius-sm, 6px)', padding: '6px 8px', resize: 'vertical',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <button onClick={() => saveEdit(ann.id)} style={{ fontSize: 11 }}>{t('common.save')}</button>
                    <button onClick={() => setEditingId(null)} style={{ fontSize: 11 }}>{t('common.cancel')}</button>
                  </div>
                </div>
              ) : ann.content ? (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>{ann.content}</div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => startEdit(ann)} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{t('common.edit')}</button>
                <button onClick={() => onAnnotationDelete(ann.id)} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{t('common.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
