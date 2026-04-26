import React, { useState } from 'react'

interface AnnotationData {
  id: string
  page: number | null
  selectedText: string | null
  content: string | null
  color: string
  type: string
  createdAt: string
}

interface Props {
  annotations: AnnotationData[]
  onAnnotationClick: (page: number) => void
  onAnnotationDelete: (id: string) => void
  onAnnotationUpdate: (id: string, updates: any) => void
}

export default function AnnotationPanel({ annotations, onAnnotationClick, onAnnotationDelete, onAnnotationUpdate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const grouped = new Map<number, AnnotationData[]>()
  for (const ann of annotations) {
    const page = ann.page ?? 0
    if (!grouped.has(page)) grouped.set(page, [])
    grouped.get(page)!.push(ann)
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
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>暂无标注</div>
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {sortedPages.map(page => (
        <div key={page}>
          <div style={{
            padding: '6px 12px', fontSize: 11, fontWeight: 600,
            color: 'var(--text-muted)', background: 'var(--surface)',
          }}>
            Page {page}
          </div>
          {grouped.get(page)!.map(ann => (
            <div
              key={ann.id}
              style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}
              onClick={() => ann.page != null && onAnnotationClick(ann.page)}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: ann.color }} />
                {ann.selectedText ? (
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
              {editingId === ann.id ? (
                <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    style={{
                      width: '100%', minHeight: 50, fontSize: 11,
                      border: '1px solid var(--border)', borderRadius: 3, padding: 4, resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <button onClick={() => saveEdit(ann.id)} style={{ fontSize: 11 }}>保存</button>
                    <button onClick={() => setEditingId(null)} style={{ fontSize: 11 }}>取消</button>
                  </div>
                </div>
              ) : ann.content ? (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>{ann.content}</div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => startEdit(ann)} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>编辑</button>
                <button onClick={() => onAnnotationDelete(ann.id)} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>删除</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
