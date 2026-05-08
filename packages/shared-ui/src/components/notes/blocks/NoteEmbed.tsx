import React, { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react'
import { RefreshCw, X, ChevronLeft } from 'lucide-react'
import { createReactBlockSpec } from '@blocknote/react'
import { renderAllStrokes } from '../../handwriting/renderStrokes.js'
import type { Stroke } from '@banjuan/core'
import { useBanjuanAPI } from '../../../api.js'

const MindmapEmbedPreview = lazy(() => import('./MindmapEmbedPreview.js'))
const HandwritingEmbedPreview = lazy(() => import('./HandwritingEmbedPreview.js'))
const BlockEditor = lazy(() => import('../BlockEditor.js'))

export const NoteEmbed = createReactBlockSpec(
  {
    type: 'noteEmbed' as const,
    propSchema: {
      noteId: { default: '' },
      noteTitle: { default: '' },
      pageIndex: { default: '' },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const { noteId, noteTitle, pageIndex } = props.block.props

      return (
        <NoteEmbedContent
          noteId={noteId}
          noteTitle={noteTitle}
          pageIndex={pageIndex}
          readOnly={!props.editor.isEditable}
          onChangeNote={(id, title, pi) => {
            props.editor.updateBlock(props.block, {
              props: { noteId: id, noteTitle: title, pageIndex: pi ?? '' },
            })
          }}
          onRemove={() => {
            props.editor.removeBlocks([props.block])
          }}
        />
      )
    },
  }
)()

const noop = () => {}

interface NoteItem {
  id: string
  title: string
  type: string
}

interface HandwritingPageInfo {
  id: string
  strokes: Stroke[]
}

interface PagePickerState {
  noteId: string
  noteTitle: string
  pages: HandwritingPageInfo[]
  pageSize: { width: number; height: number }
}

function PageThumb({ strokes, pageSize }: { strokes: Stroke[]; pageSize: { width: number; height: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const thumbW = 120
  const thumbH = Math.round(thumbW * pageSize.height / pageSize.width)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = 2
    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = pageSize.width * dpr
    srcCanvas.height = pageSize.height * dpr
    const srcCtx = srcCanvas.getContext('2d')
    if (!srcCtx) return
    srcCtx.scale(dpr, dpr)
    renderAllStrokes(srcCtx, strokes, pageSize.width, pageSize.height)

    canvas.width = thumbW * dpr
    canvas.height = thumbH * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(srcCanvas, 0, 0, canvas.width, canvas.height)
  }, [strokes, pageSize, thumbH])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: thumbW, height: thumbH, borderRadius: 4,
        border: '1px solid var(--border, #e1e4e8)',
      }}
    />
  )
}

function NoteEmbedContent({
  noteId, noteTitle, pageIndex, readOnly, onChangeNote, onRemove,
}: {
  noteId: string
  noteTitle: string
  pageIndex: string
  readOnly: boolean
  onChangeNote: (id: string, title: string, pageIndex?: string) => void
  onRemove: () => void
}) {
  const api = useBanjuanAPI()
  const [content, setContent] = useState<string | null>(null)
  const [noteType, setNoteType] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerNotes, setPickerNotes] = useState<NoteItem[]>([])
  const [pickerQuery, setPickerQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [pagePicker, setPagePicker] = useState<PagePickerState | null>(null)

  useEffect(() => {
    if (!noteId) return
    api.notes.get(noteId).then((note: any) => {
      if (!note) return
      setNoteType(note.type ?? 'markdown')
      if (note.type === 'handwriting' && pageIndex === '' && !readOnly) {
        try {
          const parsed = JSON.parse(note.content)
          const pages = parsed.pages ?? []
          const typeMeta = note.typeMeta ?? {}
          const pageSize = (typeMeta as any).pageSize ?? { width: 1024, height: 768 }
          if (pages.length > 1) {
            setPagePicker({
              noteId,
              noteTitle: noteTitle || note.title || '',
              pages: pages.map((p: any) => ({ id: p.id, strokes: p.snapshot?.strokes ?? [] })),
              pageSize,
            })
            setShowPicker(true)
          } else {
            onChangeNote(noteId, noteTitle || note.title || '', '0')
          }
        } catch { /* ignore */ }
      } else if (note.type !== 'mindmap' && note.type !== 'handwriting') {
        setContent(note.content ?? '')
      }
    })
  }, [noteId])

  const openPicker = useCallback(async () => {
    const notes = await api.notes.list({})
    setPickerNotes(notes.map((n: any) => ({ id: n.id, title: n.title, type: n.type })))
    setPickerQuery('')
    setPagePicker(null)
    setShowPicker(true)
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [])

  const handleSelect = useCallback(async (note: NoteItem) => {
    if (note.type === 'handwriting') {
      const full = await api.notes.get(note.id)
      if (!full) return
      try {
        const parsed = JSON.parse(full.content)
        const typeMeta = full.typeMeta ?? {}
        const pageSize = (typeMeta as any).pageSize ?? { width: 1024, height: 768 }
        const pages: HandwritingPageInfo[] = (parsed.pages ?? []).map((p: any) => ({
          id: p.id,
          strokes: p.snapshot?.strokes ?? [],
        }))
        if (pages.length <= 1) {
          onChangeNote(note.id, note.title, '0')
          setShowPicker(false)
          setPagePicker(null)
          setNoteType('handwriting')
        } else {
          setPagePicker({ noteId: note.id, noteTitle: note.title, pages, pageSize })
        }
      } catch {
        onChangeNote(note.id, note.title, '0')
        setShowPicker(false)
        setPagePicker(null)
        setNoteType('handwriting')
      }
      return
    }
    onChangeNote(note.id, note.title)
    setShowPicker(false)
    setPagePicker(null)
    setContent(null)
    setNoteType(null)
  }, [onChangeNote])

  const handlePageSelect = useCallback((pi: number) => {
    if (!pagePicker) return
    onChangeNote(pagePicker.noteId, pagePicker.noteTitle, String(pi))
    setShowPicker(false)
    setPagePicker(null)
    setNoteType('handwriting')
  }, [pagePicker, onChangeNote])

  const icon = noteType === 'mindmap' ? '🧠' : noteType === 'handwriting' ? '✏️' : '📝'
  const parsedPageIndex = pageIndex !== '' ? parseInt(pageIndex, 10) : -1
  const pageLabel = noteType === 'handwriting' && parsedPageIndex >= 0 ? ` · Page ${parsedPageIndex + 1}` : ''
  const title = (noteTitle || (noteType === 'mindmap' ? 'Untitled Mindmap' : noteType === 'handwriting' ? 'Untitled Handwriting' : 'Untitled')) + pageLabel

  const filteredNotes = pickerQuery
    ? pickerNotes.filter(n => n.title.toLowerCase().includes(pickerQuery.toLowerCase()))
    : pickerNotes

  const noteIcon = (type: string) => type === 'mindmap' ? '🧠' : type === 'handwriting' ? '✏️' : '📝'

  return (
    <div className="note-embed-clean" data-embed-note-id={noteId} contentEditable={false}>
      <div className="note-embed-clean-header">
        <span className="note-embed-clean-icon">{icon}</span>
        <span className="note-embed-clean-title">{title}</span>
        {!readOnly && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            <button
              onClick={(e) => { e.stopPropagation(); openPicker() }}
              title="Change note"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--text-muted)', padding: '2px 6px',
                borderRadius: 4, lineHeight: 1,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f0f0f0)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <RefreshCw size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              title="Remove embed"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--text-muted)', padding: '2px 6px',
                borderRadius: 4, lineHeight: 1,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover, #f0f0f0)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Note picker dropdown */}
      {showPicker && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => { setShowPicker(false); setPagePicker(null) }} />
          <div style={{
            position: 'absolute', top: 36, left: 12, right: 12, zIndex: 1000,
            background: 'var(--surface, white)', border: '1px solid var(--border, #e1e4e8)',
            borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            maxHeight: 320, display: 'flex', flexDirection: 'column',
          }}>
            {pagePicker ? (
              <>
                <div style={{
                  padding: '8px 12px', borderBottom: '1px solid var(--border, #e1e4e8)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <button
                    onClick={() => setPagePicker(null)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 14, color: 'var(--text-muted)', padding: '2px 4px',
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>
                    ✏️ {pagePicker.noteTitle || 'Untitled'} — Select page
                  </span>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                  {pagePicker.pages.map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => handlePageSelect(i)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        padding: 6, border: '2px solid transparent',
                        background: 'var(--surface, white)', borderRadius: 8, cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent, #3182ce)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                    >
                      <PageThumb strokes={p.strokes} pageSize={pagePicker.pageSize} />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Page {i + 1}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ padding: 8, borderBottom: '1px solid var(--border, #e1e4e8)' }}>
                  <input
                    ref={searchRef}
                    value={pickerQuery}
                    onChange={e => setPickerQuery(e.target.value)}
                    placeholder="Search notes..."
                    style={{
                      width: '100%', padding: '6px 10px', border: '1px solid var(--border, #e1e4e8)',
                      borderRadius: 6, fontSize: 13, outline: 'none',
                      background: 'var(--surface, white)', color: 'var(--text, #333)',
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Escape') setShowPicker(false)
                      if (e.key === 'Enter' && filteredNotes.length > 0) {
                        handleSelect(filteredNotes[0])
                      }
                    }}
                  />
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
                  {filteredNotes.length === 0 ? (
                    <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>
                      No notes found
                    </div>
                  ) : filteredNotes.map(n => (
                    <button
                      key={n.id}
                      onClick={() => handleSelect(n)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%', padding: '7px 12px', border: 'none',
                        background: n.id === noteId ? 'var(--accent-light, rgba(49,130,206,0.08))' : 'none',
                        textAlign: 'left', fontSize: 13, cursor: 'pointer',
                        color: 'var(--text, #333)',
                      }}
                      onMouseEnter={e => { if (n.id !== noteId) e.currentTarget.style.background = 'var(--hover, #f5f5f5)' }}
                      onMouseLeave={e => { if (n.id !== noteId) e.currentTarget.style.background = 'none' }}
                    >
                      <span>{noteIcon(n.type)}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.title || 'Untitled'}
                      </span>
                      {n.id === noteId && (
                        <span style={{ fontSize: 11, color: 'var(--accent, #3182ce)' }}>current</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      <div className="note-embed-clean-body">
        {noteType === 'mindmap' ? (
          <Suspense fallback={<span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading mindmap...</span>}>
            <MindmapEmbedPreview noteId={noteId} noteTitle={noteTitle} />
          </Suspense>
        ) : noteType === 'handwriting' ? (
          <Suspense fallback={<span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading...</span>}>
            <HandwritingEmbedPreview noteId={noteId} noteTitle={noteTitle} pageIndex={parsedPageIndex >= 0 ? parsedPageIndex : undefined} />
          </Suspense>
        ) : content === null ? (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading...</span>
        ) : !content ? (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Empty note</span>
        ) : (
          <Suspense fallback={<span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading...</span>}>
            <BlockEditor
              initialContent={content}
              onChange={noop}
              readOnly
              skipLinkSync
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
