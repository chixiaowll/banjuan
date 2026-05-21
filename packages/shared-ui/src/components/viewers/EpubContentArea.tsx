import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { useEpubViewer, ANNOTATION_COLORS } from './EpubViewerContext.js'
import TextSelectionToolbar from './TextSelectionToolbar.js'
import EpubInkOverlay from './EpubInkOverlay.js'
import EpubInkLassoTool from './EpubInkLassoTool.js'
import EpubInkToolbar from './EpubInkToolbar.js'

interface Props {
  annotations: Array<{
    id: string
    position: any
    color: string
    type: string
  }>
  docId: string
  onHighlightCreated: (cfiRange: string, text: string, docY?: number) => void
  onUnderlineCreated: (cfiRange: string, text: string, docY?: number) => void
  onNoteCreated: (cfiRange: string, text: string, noteContent: string, docY?: number) => void
  onInkCreated: () => void
  onInkUndo: () => void
  onInkRedo: () => void
  onInkClearPage: () => void
  onAnnotationDelete: (id: string) => void
  inkCanUndo: boolean
  inkCanRedo: boolean
}

interface SelectionPopup {
  cfiRange: string
  text: string
  x: number
  y: number
  bottom: number
  docY: number
  contents: any
}

interface NotePopup {
  cfiRange: string
  text: string
  x: number
  y: number
  docY: number
}

function styleUnderlineMarks(container: HTMLElement) {
  container.querySelectorAll('g.epub-ul').forEach(g => {
    g.querySelectorAll('rect').forEach(rect => {
      rect.setAttribute('stroke', 'none')
    })
    const color = g.getAttribute('data-ul-color')
      || (g as any).dataset?.ulColor
      || (g as any).dataset?.ulcolor
    if (color) {
      g.querySelectorAll('line').forEach(line => {
        line.setAttribute('stroke', color)
        line.setAttribute('stroke-width', '2')
        line.setAttribute('stroke-opacity', '0.8')
      })
    }
  })
}

function applyAnnotationMark(rendition: any, cfi: string, id: string, color: string, type: string) {
  if (type === 'underline') {
    rendition.annotations.underline(
      cfi,
      { id, ulColor: color },
      undefined,
      'epub-ul',
      {},
    )
  } else {
    rendition.annotations.highlight(
      cfi,
      { id },
      undefined,
      'epub-hl',
      { fill: color, 'fill-opacity': '0.35', 'mix-blend-mode': 'multiply' },
    )
  }
}

export default function EpubContentArea({ annotations, docId, onHighlightCreated, onUnderlineCreated, onNoteCreated, onInkCreated, onInkUndo, onInkRedo, onInkClearPage, onAnnotationDelete, inkCanUndo, inkCanRedo }: Props) {
  const ctx = useEpubViewer()
  const renderedAnnotations = useRef(new Set<string>())
  const renderedCfiMap = useRef(new Map<string, string>())
  const renderedTypeMap = useRef(new Map<string, string>())
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopup | null>(null)
  const [notePopup, setNotePopup] = useState<NotePopup | null>(null)
  const [noteText, setNoteText] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; annotationId: string } | null>(null)
  const ctxMenuRef = useRef<HTMLDivElement>(null)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ctx.rendition) return
    ctx.rendition.themes.fontSize(`${ctx.fontSize}%`)
  }, [ctx.fontSize, ctx.rendition])

  // Apply highlights incrementally and remove deleted ones
  useEffect(() => {
    if (!ctx.rendition) return
    const rendition = ctx.rendition

    const syncHighlights = () => {
      const visibleAnns = ctx.annotationsVisible ? annotations : []
      const currentIds = new Set(
        visibleAnns
          .filter(a => (a.type === 'highlight' || a.type === 'note' || a.type === 'underline') && a.position?.cfi)
          .map(a => a.id)
      )

      // Remove annotations that no longer exist
      for (const id of renderedAnnotations.current) {
        if (!currentIds.has(id)) {
          const cfi = renderedCfiMap.current.get(id)
          const type = renderedTypeMap.current.get(id)
          if (cfi) {
            try { rendition.annotations.remove(cfi, type === 'underline' ? 'underline' : 'highlight') } catch {}
          }
          renderedAnnotations.current.delete(id)
          renderedCfiMap.current.delete(id)
          renderedTypeMap.current.delete(id)
        }
      }

      // Add new annotations
      for (const ann of visibleAnns) {
        if ((ann.type !== 'highlight' && ann.type !== 'note' && ann.type !== 'underline') || !ann.position?.cfi) continue
        if (renderedAnnotations.current.has(ann.id)) continue
        try {
          applyAnnotationMark(rendition, ann.position.cfi, ann.id, ann.color, ann.type)
          renderedAnnotations.current.add(ann.id)
          renderedCfiMap.current.set(ann.id, ann.position.cfi)
          renderedTypeMap.current.set(ann.id, ann.type)
        } catch { /* section not loaded */ }
      }
    }

    const syncAndStyle = () => {
      syncHighlights()
      if (containerRef.current) styleUnderlineMarks(containerRef.current)
      setTimeout(() => {
        if (containerRef.current) styleUnderlineMarks(containerRef.current)
      }, 100)
    }

    syncAndStyle()

    rendition.on('relocated', syncAndStyle)
    return () => { rendition.off('relocated', syncAndStyle) }
  }, [ctx.rendition, annotations, ctx.annotationsVisible])

  // When rendition changes (e.g. flow mode switch), reset tracking
  useEffect(() => {
    renderedAnnotations.current.clear()
    renderedCfiMap.current.clear()
    renderedTypeMap.current.clear()
  }, [ctx.rendition])

  // Click on highlight/underline mark → show delete menu
  useEffect(() => {
    if (!ctx.rendition) return
    const handler = (cfiRange: string, data: any, contents: any) => {
      const annotationId = data?.id
      if (!annotationId) return
      const range = contents.range(cfiRange)
      if (!range) return
      const rect = range.getBoundingClientRect()
      const iframe = containerRef.current?.querySelector('iframe')
      const iframeRect = iframe?.getBoundingClientRect()
      setCtxMenu({
        x: (iframeRect?.left || 0) + rect.left + rect.width / 2,
        y: (iframeRect?.top || 0) + rect.bottom + 4,
        annotationId,
      })
    }
    ctx.rendition.on('markClicked', handler)
    return () => { ctx.rendition?.off('markClicked', handler) }
  }, [ctx.rendition])

  useEffect(() => {
    if (!ctx.rendition) return
    const handler = (cfiRange: string, contents: any) => {
      const range = contents.range(cfiRange)
      const text = range?.toString() || ''
      if (!text.trim()) return

      const rect = range?.getBoundingClientRect()
      const iframe = containerRef.current?.querySelector('iframe')
      const iframeRect = iframe?.getBoundingClientRect()
      const containerRect = containerRef.current?.getBoundingClientRect()
      const x = (iframeRect?.left || 0) + (rect?.left || 0) + ((rect?.width || 0) / 2)
      const y = (iframeRect?.top || 0) + (rect?.top || 0)
      const bottom = (iframeRect?.top || 0) + (rect?.bottom || 0)

      const sc = containerRef.current?.querySelector('.epub-container') as HTMLElement | null
      const scrollTop = sc?.scrollTop || 0
      const docY = ((iframeRect?.top || 0) + (rect?.top || 0) - (containerRect?.top || 0)) + scrollTop

      if (ctx.activeTool === 'highlight') {
        onHighlightCreated(cfiRange, text, docY)
        contents?.window?.getSelection()?.removeAllRanges()
        return
      }

      setSelectionPopup({ cfiRange, text, x, y, bottom, docY, contents })
      setNotePopup(null)
    }
    ctx.rendition.on('selected', handler)
    return () => { ctx.rendition?.off('selected', handler) }
  }, [ctx.rendition, ctx.activeTool, onHighlightCreated])

  const dismissSelection = useCallback(() => {
    setSelectionPopup(null)
  }, [])

  useEffect(() => {
    if (!selectionPopup || !ctx.rendition) return
    const handler = () => dismissSelection()
    const iframes = containerRef.current?.querySelectorAll('iframe')
    iframes?.forEach(iframe => {
      try { iframe.contentDocument?.addEventListener('mousedown', handler) } catch {}
    })
    return () => {
      iframes?.forEach(iframe => {
        try { iframe.contentDocument?.removeEventListener('mousedown', handler) } catch {}
      })
    }
  }, [selectionPopup, ctx.rendition, dismissSelection])

  const handleHighlight = useCallback(() => {
    if (!selectionPopup) return
    onHighlightCreated(selectionPopup.cfiRange, selectionPopup.text, selectionPopup.docY)
    selectionPopup.contents?.window?.getSelection()?.removeAllRanges()
    setSelectionPopup(null)
  }, [selectionPopup, onHighlightCreated])

  const handleUnderline = useCallback(() => {
    if (!selectionPopup) return
    onUnderlineCreated(selectionPopup.cfiRange, selectionPopup.text, selectionPopup.docY)
    selectionPopup.contents?.window?.getSelection()?.removeAllRanges()
    setSelectionPopup(null)
  }, [selectionPopup, onUnderlineCreated])

  const handleCopy = useCallback(() => {
    if (!selectionPopup) return
    navigator.clipboard.writeText(selectionPopup.text)
    selectionPopup.contents?.window?.getSelection()?.removeAllRanges()
    setSelectionPopup(null)
  }, [selectionPopup])

  const handleShowNote = useCallback(() => {
    if (!selectionPopup) return
    setNotePopup({
      cfiRange: selectionPopup.cfiRange,
      text: selectionPopup.text,
      x: selectionPopup.x,
      y: selectionPopup.y + 40,
      docY: selectionPopup.docY,
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
    onNoteCreated(notePopup.cfiRange, notePopup.text, noteText.trim(), notePopup.docY)
    setNotePopup(null)
    setNoteText('')
  }, [notePopup, noteText, onNoteCreated])

  const handleNoteCancel = useCallback(() => {
    setNotePopup(null)
    setNoteText('')
  }, [])

  const handleChangeColor = useCallback((color: string) => {
    ctx.setActiveColor(color)
  }, [ctx])

  useEffect(() => {
    if (!ctxMenu) return
    const dismiss = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', esc)
    const iframes = containerRef.current?.querySelectorAll('iframe')
    iframes?.forEach(iframe => {
      try { iframe.contentDocument?.addEventListener('mousedown', () => setCtxMenu(null)) } catch {}
    })
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', esc)
    }
  }, [ctxMenu])

  const handleCtxDelete = useCallback(() => {
    if (!ctxMenu) return
    onAnnotationDelete(ctxMenu.annotationId)
    setCtxMenu(null)
  }, [ctxMenu, onAnnotationDelete])

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--bg)',
      }}
    >
      <div
        data-epub-container
        style={{ flex: 1, minHeight: 0 }}
      />
      {selectionPopup && (
        <TextSelectionToolbar
          position={{ x: selectionPopup.x, y: selectionPopup.y, bottom: selectionPopup.bottom }}
          color={ctx.activeColor}
          colors={ANNOTATION_COLORS}
          onHighlight={handleHighlight}
          onUnderline={handleUnderline}
          onCopy={handleCopy}
          onChangeColor={handleChangeColor}
          onClose={dismissSelection}
        />
      )}

      {ctx.activeTool !== 'lasso' && (
        <EpubInkOverlay
          docId={docId}
          annotations={ctx.annotationsVisible ? annotations : []}
          containerRef={containerRef}
          onCreated={onInkCreated}
        />
      )}

      {ctx.activeTool === 'lasso' && (
        <EpubInkLassoTool
          docId={docId}
          annotations={ctx.annotationsVisible ? annotations : []}
          containerRef={containerRef}
          onUpdated={onInkCreated}
        />
      )}

      {(ctx.activeTool === 'ink' || ctx.activeTool === 'eraser' || ctx.activeTool === 'lasso') && (
        <EpubInkToolbar
          onUndo={onInkUndo}
          onRedo={onInkRedo}
          canUndo={inkCanUndo}
          canRedo={inkCanRedo}
          onClearPage={onInkClearPage}
        />
      )}

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

      {ctxMenu && (
        <div ref={ctxMenuRef} style={{
          position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', padding: 4, minWidth: 120,
        }}>
          <button
            onClick={handleCtxDelete}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
              cursor: 'pointer', fontSize: 13, color: '#e53e3e', border: 'none',
              background: 'none', width: '100%', textAlign: 'left', borderRadius: 4,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--selected)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}

    </div>
  )
}

