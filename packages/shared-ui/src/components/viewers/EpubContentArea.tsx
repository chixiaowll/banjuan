import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useEpubViewer } from './EpubViewerContext.js'
import EpubInkOverlay from './EpubInkOverlay.js'
import EpubInkToolbar from './EpubInkToolbar.js'

interface Props {
  annotations: Array<{
    id: string
    position: any
    color: string
    type: string
  }>
  docId: string
  onHighlightCreated: (cfiRange: string, text: string) => void
  onNoteCreated: (cfiRange: string, text: string, noteContent: string) => void
  onInkCreated: () => void
  onInkUndo: () => void
  onInkRedo: () => void
  onInkClearPage: () => void
  inkCanUndo: boolean
  inkCanRedo: boolean
}

interface SelectionPopup {
  cfiRange: string
  text: string
  x: number
  y: number
  contents: any
}

interface NotePopup {
  cfiRange: string
  text: string
  x: number
  y: number
}

const HIGHLIGHT_CSS = `
  .epub-hl { position: absolute; pointer-events: none; }
  .epub-hl rect, .epub-hl path { pointer-events: none; }
`

function injectHighlightStyle(rendition: any) {
  const inject = (contents: any) => {
    const doc = contents.document as Document
    if (doc.getElementById('epub-hl-style')) return
    const style = doc.createElement('style')
    style.id = 'epub-hl-style'
    style.textContent = HIGHLIGHT_CSS
    doc.head.appendChild(style)
  }
  rendition.hooks.content.register(inject)
}

function applyHighlight(rendition: any, cfi: string, id: string, color: string) {
  rendition.annotations.highlight(
    cfi,
    { id },
    undefined,
    'epub-hl',
    { fill: color, 'fill-opacity': '0.25', 'mix-blend-mode': 'multiply' },
  )
}

export default function EpubContentArea({ annotations, docId, onHighlightCreated, onNoteCreated, onInkCreated, onInkUndo, onInkRedo, onInkClearPage, inkCanUndo, inkCanRedo }: Props) {
  const ctx = useEpubViewer()
  const renderedAnnotations = useRef(new Set<string>())
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopup | null>(null)
  const [notePopup, setNotePopup] = useState<NotePopup | null>(null)
  const [noteText, setNoteText] = useState('')
  const noteInputRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const styleInjected = useRef(false)

  useEffect(() => {
    if (!ctx.rendition) return
    ctx.rendition.themes.fontSize(`${ctx.fontSize}%`)
  }, [ctx.fontSize, ctx.rendition])

  useEffect(() => {
    if (!ctx.rendition || styleInjected.current) return
    injectHighlightStyle(ctx.rendition)
    styleInjected.current = true
    return () => { styleInjected.current = false }
  }, [ctx.rendition])

  // Apply highlights incrementally — only add new ones, never remove+re-add
  useEffect(() => {
    if (!ctx.rendition) return
    const rendition = ctx.rendition

    const applyNew = () => {
      for (const ann of annotations) {
        if ((ann.type !== 'highlight' && ann.type !== 'note') || !ann.position?.cfi) continue
        if (renderedAnnotations.current.has(ann.id)) continue
        try {
          applyHighlight(rendition, ann.position.cfi, ann.id, ann.color)
          renderedAnnotations.current.add(ann.id)
        } catch { /* section not loaded */ }
      }
    }

    applyNew()

    rendition.on('relocated', applyNew)
    return () => { rendition.off('relocated', applyNew) }
  }, [ctx.rendition, annotations])

  // When rendition changes (e.g. flow mode switch), reset tracking
  useEffect(() => {
    renderedAnnotations.current.clear()
  }, [ctx.rendition])

  // Show selection toolbar on text selection (don't auto-create annotation)
  useEffect(() => {
    if (!ctx.rendition) return
    const handler = (cfiRange: string, contents: any) => {
      const range = contents.range(cfiRange)
      const text = range?.toString() || ''
      if (!text.trim()) return

      const rect = range?.getBoundingClientRect()
      const iframe = containerRef.current?.querySelector('iframe')
      const iframeRect = iframe?.getBoundingClientRect()
      const x = (iframeRect?.left || 0) + (rect?.left || 0) + ((rect?.width || 0) / 2)
      const y = (iframeRect?.top || 0) + (rect?.top || 0)

      setSelectionPopup({ cfiRange, text, x, y, contents })
      setNotePopup(null)
    }
    ctx.rendition.on('selected', handler)
    return () => { ctx.rendition?.off('selected', handler) }
  }, [ctx.rendition])

  const dismissSelection = useCallback(() => {
    setSelectionPopup(null)
  }, [])

  // Dismiss selection popup when clicking outside
  useEffect(() => {
    if (!selectionPopup) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-selection-toolbar]')) return
      dismissSelection()
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [selectionPopup, dismissSelection])

  const handleHighlight = useCallback(() => {
    if (!selectionPopup) return
    onHighlightCreated(selectionPopup.cfiRange, selectionPopup.text)
    selectionPopup.contents?.window?.getSelection()?.removeAllRanges()
    setSelectionPopup(null)
  }, [selectionPopup, onHighlightCreated])

  const handleShowNote = useCallback(() => {
    if (!selectionPopup) return
    setNotePopup({
      cfiRange: selectionPopup.cfiRange,
      text: selectionPopup.text,
      x: selectionPopup.x,
      y: selectionPopup.y + 40,
    })
    selectionPopup.contents?.window?.getSelection()?.removeAllRanges()
    setSelectionPopup(null)
    setNoteText('')
  }, [selectionPopup])

  useEffect(() => {
    if (notePopup && noteInputRef.current) {
      noteInputRef.current.focus()
    }
  }, [notePopup])

  const handleNoteSubmit = useCallback(() => {
    if (!notePopup || !noteText.trim()) return
    onNoteCreated(notePopup.cfiRange, notePopup.text, noteText.trim())
    setNotePopup(null)
    setNoteText('')
  }, [notePopup, noteText, onNoteCreated])

  const handleNoteCancel = useCallback(() => {
    setNotePopup(null)
    setNoteText('')
  }, [])

  const toolbarBtnStyle: React.CSSProperties = {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: 16,
    borderRadius: 4,
    color: 'var(--text)',
    lineHeight: 1,
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--bg)',
      }}
    >
      <div data-epub-container style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />

      {/* Selection toolbar - appears after text selection */}
      {selectionPopup && (
        <div
          data-selection-toolbar
          style={{
            position: 'fixed',
            left: selectionPopup.x,
            top: selectionPopup.y - 40,
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '2px 4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            display: 'flex',
            gap: 2,
          }}
        >
          <button
            style={toolbarBtnStyle}
            onClick={handleHighlight}
            title="Highlight"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            🖍
          </button>
          <button
            style={toolbarBtnStyle}
            onClick={handleShowNote}
            title="Add note"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            📌
          </button>
        </div>
      )}

      {/* Ink overlay */}
      <EpubInkOverlay
        docId={docId}
        annotations={annotations}
        containerRef={containerRef}
        onCreated={onInkCreated}
      />

      {/* Ink toolbar - shown when ink mode active */}
      {(ctx.activeTool === 'ink' || ctx.activeTool === 'eraser' || ctx.activeTool === 'lasso') && (
        <EpubInkToolbar
          onUndo={onInkUndo}
          onRedo={onInkRedo}
          canUndo={inkCanUndo}
          canRedo={inkCanRedo}
          onClearPage={onInkClearPage}
        />
      )}

      {/* Note input popup */}
      {notePopup && (
        <div style={{
          position: 'fixed',
          left: notePopup.x,
          top: notePopup.y,
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          width: 260,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            "{notePopup.text.slice(0, 60)}{notePopup.text.length > 60 ? '…' : ''}"
          </div>
          <textarea
            ref={noteInputRef}
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleNoteSubmit()
              if (e.key === 'Escape') handleNoteCancel()
            }}
            placeholder="Add note..."
            style={{
              width: '100%',
              height: 60,
              resize: 'vertical',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: 6,
              fontSize: 12,
              background: 'var(--surface)',
              color: 'var(--text)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
            <button
              onClick={handleNoteCancel}
              style={{
                border: '1px solid var(--border)', background: 'none', borderRadius: 4,
                padding: '3px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--text)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleNoteSubmit}
              disabled={!noteText.trim()}
              style={{
                border: 'none', background: 'var(--accent)', color: '#fff', borderRadius: 4,
                padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                opacity: noteText.trim() ? 1 : 0.5,
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
