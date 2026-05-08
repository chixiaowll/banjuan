import React, { useState, useEffect, useCallback } from 'react'
import { useT } from '../../i18n/index.js'
import { useBanjuanAPI } from '../../api.js'

interface Backlink {
  sourceId: string
  targetId: string
  context: string
}

interface NoteInfo {
  id: string
  title: string
}

interface MindmapRef {
  id: string
  title: string
  mindmapId: string
  mindmapTitle: string
}

interface DocRef {
  docId: string
  docTitle: string
  context: string
}

interface Props {
  noteId: string
  docId: string | null
  onOpenNote: (note: NoteInfo) => void
  onOpenMindmap?: (mm: { id: string; title: string; type: 'mindmap' }) => void
}

export default function BacklinksPanel({ noteId, docId, onOpenNote, onOpenMindmap }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const [backlinks, setBacklinks] = useState<Array<Backlink & { sourceTitle: string; sourceType: string }>>([])
  const [forwardLinks, setForwardLinks] = useState<Array<Backlink & { targetTitle: string; targetType: string }>>([])
  const [linkedDoc, setLinkedDoc] = useState<{ id: string; title: string } | null>(null)
  const [annotations, setAnnotations] = useState<Array<{ id: string; content: string | null; selectedText: string | null }>>([])
  const [mindmapRefs, setMindmapRefs] = useState<MindmapRef[]>([])
  const [docRefs, setDocRefs] = useState<DocRef[]>([])

  const load = useCallback(async () => {
    try {
      const [backs, forwards] = await Promise.all([
        api.noteLinks.getBacklinks(noteId),
        api.noteLinks.getForwardLinks(noteId),
      ])
      const enrichedBacks = await Promise.all(
        backs.map(async (link: Backlink) => {
          const note = await api.notes.get(link.sourceId)
          return { ...link, sourceTitle: note?.title ?? 'Untitled', sourceType: note?.type ?? 'markdown' }
        })
      )
      setBacklinks(enrichedBacks)

      const enrichedForwards = await Promise.all(
        forwards.map(async (link: Backlink) => {
          const note = await api.notes.get(link.targetId)
          return { ...link, targetTitle: note?.title ?? 'Untitled', targetType: note?.type ?? 'markdown' }
        })
      )
      setForwardLinks(enrichedForwards)

      if (docId) {
        const doc = await api.documents.get(docId)
        if (doc) setLinkedDoc({ id: doc.id, title: doc.title })
      }

      const anns = await api.notes.getAnnotations(noteId)
      setAnnotations(anns)

      const docForwards = await api.docLinks.getForwardLinks(noteId)
      const enrichedDocRefs = await Promise.all(
        docForwards.map(async (link: any) => {
          const doc = await api.documents.get(link.targetId)
          return { docId: link.targetId, docTitle: doc?.title ?? 'Untitled', context: link.context }
        })
      )
      setDocRefs(enrichedDocRefs)
    } catch (err) {
      console.error('[BacklinksPanel] failed to load links:', err)
    }

    try {
      const mmNodes = await api.mindmaps.findNodesByNoteId(noteId)
      console.log('[BacklinksPanel] findNodesByNoteId result for', noteId, ':', mmNodes)
      setMindmapRefs((mmNodes ?? []).map((n: any) => ({
        id: n.id,
        title: n.title,
        mindmapId: n.mindmapId,
        mindmapTitle: n.mindmapTitle,
      })))
    } catch (err) {
      console.error('[BacklinksPanel] failed to load mindmap refs:', err)
      setMindmapRefs([])
    }
  }, [noteId, docId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    document.addEventListener('note-links-synced', load)
    document.addEventListener('doc-links-synced', load)
    return () => {
      document.removeEventListener('note-links-synced', load)
      document.removeEventListener('doc-links-synced', load)
    }
  }, [load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        height: 40, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 12px', borderBottom: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text-muted)', fontWeight: 500,
      }}>
        {t('backlinks.title')}
      </div>
      <div style={{ flex: 1, padding: 12, fontSize: 13, overflow: 'auto' }}>
      {forwardLinks.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            {t('backlinks.forwardLinks', forwardLinks.length)}
          </h4>
          {forwardLinks.map((link, i) => (
            <div key={i}
              onClick={() => {
                const info = { id: link.targetId, title: link.targetTitle, type: link.targetType }
                link.targetType === 'mindmap' && onOpenMindmap ? onOpenMindmap({ id: link.targetId, title: link.targetTitle, type: 'mindmap' }) : onOpenNote(info)
              }}
              style={{
                padding: '8px 10px', marginBottom: 4, borderRadius: 6,
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ fontWeight: 500 }}>{link.targetType === 'mindmap' ? '🧠' : '📝'} {link.targetTitle}</div>
              {link.context && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  "{link.context}"
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
          {t('backlinks.backlinks', backlinks.length)}
        </h4>
        {backlinks.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('backlinks.noBacklinks')}</div>
        )}
        {backlinks.map((link, i) => (
          <div key={i}
            onClick={() => {
              const info = { id: link.sourceId, title: link.sourceTitle, type: link.sourceType }
              link.sourceType === 'mindmap' && onOpenMindmap ? onOpenMindmap({ id: link.sourceId, title: link.sourceTitle, type: 'mindmap' }) : onOpenNote(info)
            }}
            style={{
              padding: '8px 10px', marginBottom: 4, borderRadius: 6,
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ fontWeight: 500 }}>{link.sourceType === 'mindmap' ? '🧠' : '📝'} {link.sourceTitle}</div>
            {link.context && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                "{link.context}"
              </div>
            )}
          </div>
        ))}
      </div>

      {mindmapRefs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            {t('backlinks.mindmapRefs', mindmapRefs.length)}
          </h4>
          {mindmapRefs.map(ref => (
            <div key={ref.id}
              onClick={() => onOpenMindmap?.({ id: ref.mindmapId, title: ref.mindmapTitle, type: 'mindmap' })}
              style={{
                padding: '8px 10px', marginBottom: 4, borderRadius: 6,
                border: '1px solid var(--border)', cursor: onOpenMindmap ? 'pointer' : 'default',
              }}
              onMouseEnter={e => { if (onOpenMindmap) e.currentTarget.style.background = 'var(--hover)' }}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ fontWeight: 500 }}>🧠 {ref.mindmapTitle}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {t('backlinks.mindmapNode', ref.title)}
              </div>
            </div>
          ))}
        </div>
      )}

      {linkedDoc && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            {t('backlinks.linkedDoc')}
          </h4>
          <div
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
            onClick={() => document.dispatchEvent(new CustomEvent('banjuan:open-document', { detail: { docId: linkedDoc.id } }))}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            📄 {linkedDoc.title}
          </div>
        </div>
      )}

      {docRefs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            {t('backlinks.docRefs', docRefs.length)}
          </h4>
          {docRefs.map(ref => (
            <div key={ref.docId}
              onClick={() => document.dispatchEvent(new CustomEvent('banjuan:open-document', { detail: { docId: ref.docId } }))}
              style={{
                padding: '8px 10px', marginBottom: 4, borderRadius: 6,
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ fontWeight: 500 }}>📄 {ref.docTitle}</div>
              {ref.context && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  "{ref.context}"
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {annotations.length > 0 && (
        <div>
          <h4 style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            {t('backlinks.linkedAnnotations', annotations.length)}
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
    </div>
  )
}
