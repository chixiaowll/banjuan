import React, { useState, useEffect } from 'react'
import { useT } from '../../i18n/index.js'

interface Backlink {
  sourceId: string
  targetId: string
  context: string
}

interface NoteInfo {
  id: string
  title: string
}

interface Props {
  noteId: string
  docId: string | null
  onOpenNote: (note: NoteInfo) => void
}

export default function BacklinksPanel({ noteId, docId, onOpenNote }: Props) {
  const t = useT()
  const [backlinks, setBacklinks] = useState<Array<Backlink & { sourceTitle: string }>>([])
  const [linkedDoc, setLinkedDoc] = useState<{ id: string; title: string } | null>(null)
  const [annotations, setAnnotations] = useState<Array<{ id: string; content: string | null; selectedText: string | null }>>([])

  useEffect(() => {
    const load = async () => {
      const links = await window.electronAPI.noteLinks.getBacklinks(noteId)
      const enriched = await Promise.all(
        links.map(async (link: Backlink) => {
          const note = await window.electronAPI.notes.get(link.sourceId)
          return { ...link, sourceTitle: note?.title ?? 'Untitled' }
        })
      )
      setBacklinks(enriched)

      if (docId) {
        const doc = await window.electronAPI.documents.get(docId)
        if (doc) setLinkedDoc({ id: doc.id, title: doc.title })
      }

      const anns = await window.electronAPI.notes.getAnnotations(noteId)
      setAnnotations(anns)
    }
    load()
  }, [noteId, docId])

  return (
    <div style={{ padding: 12, fontSize: 13, overflow: 'auto', height: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
          反向引用 ({backlinks.length})
        </h4>
        {backlinks.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>暂无引用</div>
        )}
        {backlinks.map((link, i) => (
          <div key={i}
            onClick={() => onOpenNote({ id: link.sourceId, title: link.sourceTitle })}
            style={{
              padding: '8px 10px', marginBottom: 4, borderRadius: 6,
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ fontWeight: 500 }}>{link.sourceTitle}</div>
            {link.context && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                "{link.context}"
              </div>
            )}
          </div>
        ))}
      </div>

      {linkedDoc && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            关联文档
          </h4>
          <div style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }}>
            📄 {linkedDoc.title}
          </div>
        </div>
      )}

      {annotations.length > 0 && (
        <div>
          <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            关联标注 ({annotations.length})
          </h4>
          {annotations.map(ann => (
            <div key={ann.id}
              style={{ padding: '6px 10px', marginBottom: 4, borderRadius: 4, fontSize: 12, borderLeft: '3px solid #ebcb8b' }}>
              {ann.selectedText || ann.content || '(empty)'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
