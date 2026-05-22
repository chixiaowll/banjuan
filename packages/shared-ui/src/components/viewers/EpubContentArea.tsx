import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useEpubViewer, ANNOTATION_COLORS } from './EpubViewerContext.js'
import { useEyeProtection, EYE_PROTECTION_TINT } from './useEyeProtection.js'
import TextSelectionToolbar from './TextSelectionToolbar.js'
import AnnotationContextMenu from './AnnotationContextMenu.js'
import EpubInkOverlay from './EpubInkOverlay.js'
import EpubInkLassoTool from './EpubInkLassoTool.js'
import EpubInkToolbar from './EpubInkToolbar.js'
import EpubAreaSelectTool from './EpubAreaSelectTool.js'

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
  onAnnotationUpdate: (id: string, updates: any) => void
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

function EpubAreaOverlays({ annotations, containerRef }: {
  annotations: any[]
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const ctx = useEpubViewer()
  const scrollTopRef = useRef(0)
  const [, forceRender] = useState(0)
  const rafRef = useRef(0)

  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const find = () => {
      if (cancelled) return
      const sc = containerRef.current?.querySelector('.epub-container') as HTMLElement | null
      if (sc) setScrollContainer(sc)
      else timer = setTimeout(find, 100)
    }
    find()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [containerRef, ctx.rendition])

  useEffect(() => {
    if (!scrollContainer) return
    const onScroll = () => {
      scrollTopRef.current = scrollContainer.scrollTop
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => forceRender(n => n + 1))
    }
    scrollTopRef.current = scrollContainer.scrollTop
    scrollContainer.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scrollContainer.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(rafRef.current)
    }
  }, [scrollContainer])

  const areaAnns = annotations.filter((a: any) => a.type === 'area' && a.position?.type === 'area' && a.position?.rect)
  if (areaAnns.length === 0) return null

  const st = scrollTopRef.current

  return (
    <>
      {areaAnns.map((ann: any) => {
        const r = ann.position.rect
        return (
          <div
            key={ann.id}
            style={{
              position: 'absolute',
              left: `${r.x * 100}%`,
              top: r.y - st,
              width: `${r.w * 100}%`,
              height: r.h,
              border: `2px solid ${ann.color}`,
              background: `${ann.color}11`,
              pointerEvents: 'none',
              zIndex: 3,
              borderRadius: 2,
            }}
          />
        )
      })}
    </>
  )
}

export default function EpubContentArea({ annotations, docId, onHighlightCreated, onUnderlineCreated, onNoteCreated, onInkCreated, onInkUndo, onInkRedo, onInkClearPage, onAnnotationDelete, onAnnotationUpdate, inkCanUndo, inkCanRedo }: Props) {
  const ctx = useEpubViewer()
  const { eyeProtection } = useEyeProtection()
  const renderedAnnotations = useRef(new Set<string>())
  const renderedCfiMap = useRef(new Map<string, string>())
  const renderedTypeMap = useRef(new Map<string, string>())
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopup | null>(null)
  const [notePopup, setNotePopup] = useState<NotePopup | null>(null)
  const [noteText, setNoteText] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; annotationId: string; annotationType: string; annotationColor: string; selectedText?: string } | null>(null)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const outerWidthRef = useRef(0)
  const [outerWidth, setOuterWidth] = useState(0)

  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.round(e.contentRect.width)
        if (w !== outerWidthRef.current) {
          outerWidthRef.current = w
          setOuterWidth(w)
        }
      }
    })
    ro.observe(el)
    outerWidthRef.current = Math.round(el.clientWidth)
    setOuterWidth(outerWidthRef.current)
    return () => ro.disconnect()
  }, [])

  const fontZoom = ctx.fontSize / 100
  const rawScale = (ctx.baseWidth && outerWidth) ? (outerWidth / ctx.baseWidth) * fontZoom : fontZoom
  const scale = Math.round(rawScale * 1000) / 1000
  const visualWidth = ctx.baseWidth ? ctx.baseWidth * scale : outerWidth
  const centerMargin = ctx.baseWidth ? (outerWidth - visualWidth) / 2 : 0

  const iframeRangeToScreen = useCallback((rangeRect: DOMRect, iframe: HTMLIFrameElement) => {
    const iframeRect = iframe.getBoundingClientRect()
    const iframeLogicalW = iframe.clientWidth || 1
    const s = iframeRect.width / iframeLogicalW
    return {
      left: iframeRect.left + rangeRect.left * s,
      top: iframeRect.top + rangeRect.top * s,
      right: iframeRect.left + rangeRect.right * s,
      bottom: iframeRect.top + rangeRect.bottom * s,
      width: rangeRect.width * s,
      height: rangeRect.height * s,
    }
  }, [])

  // Apply highlights — clear and re-apply on every sync for correctness
  useEffect(() => {
    if (!ctx.rendition) return
    const rendition = ctx.rendition

    const syncHighlights = () => {
      // Remove all previously tracked marks
      for (const id of renderedAnnotations.current) {
        const cfi = renderedCfiMap.current.get(id)
        const type = renderedTypeMap.current.get(id)
        if (cfi) {
          try { rendition.annotations.remove(cfi, type === 'underline' ? 'underline' : 'highlight') } catch {}
        }
      }
      renderedAnnotations.current.clear()
      renderedCfiMap.current.clear()
      renderedTypeMap.current.clear()

      // Re-apply all visible annotations
      const visibleAnns = ctx.annotationsVisible ? annotations : []
      for (const ann of visibleAnns) {
        if ((ann.type !== 'highlight' && ann.type !== 'note' && ann.type !== 'underline') || !ann.position?.cfi) continue
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

  // Use refs for values accessed inside rendition event handlers
  // so handler identity stays stable (epub.js off() needs same reference)
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const activeColorRef = useRef(ctx.activeColor)
  activeColorRef.current = ctx.activeColor
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const activeToolRef = useRef(ctx.activeTool)
  activeToolRef.current = ctx.activeTool
  const onHighlightCreatedRef = useRef(onHighlightCreated)
  onHighlightCreatedRef.current = onHighlightCreated
  const markClickedAtRef = useRef(0)

  // Direct click handler on iframe contentDocument to detect annotation clicks.
  // marks-pane's proxyMouse breaks under CSS transform: scale() because it
  // compares iframe-local event coords against parent-viewport SVG rects.
  // We bypass it by checking click coords against annotation text ranges directly.
  useEffect(() => {
    if (!ctx.rendition) return
    let iframeDoc: Document | null = null
    let bound = false

    const onClick = (e: MouseEvent) => {
      const iframe = containerRef.current?.querySelector('iframe') as HTMLIFrameElement | null
      if (!iframe) return
      const contents = (ctx.rendition as any)?.getContents()?.[0]
      if (!contents) return
      const clickX = e.clientX
      const clickY = e.clientY

      for (const ann of annotationsRef.current) {
        if ((ann.type !== 'highlight' && ann.type !== 'note' && ann.type !== 'underline') || !ann.position?.cfi) continue
        try {
          const range = contents.range(ann.position.cfi)
          if (!range) continue
          const rects = range.getClientRects()
          for (let i = 0; i < rects.length; i++) {
            const r = rects[i]
            if (clickX >= r.left && clickX <= r.right && clickY >= r.top && clickY <= r.bottom) {
              markClickedAtRef.current = Date.now()
              const screen = iframeRangeToScreen(r, iframe)
              setCtxMenu({
                x: screen.left + screen.width / 2,
                y: screen.bottom + 4,
                annotationId: ann.id,
                annotationType: ann.type,
                annotationColor: ann.color || activeColorRef.current,
                selectedText: ann.position?.text || ann.position?.selectedText,
              })
              setSelectionPopup(null)
              e.stopPropagation()
              return
            }
          }
        } catch {}
      }
      setCtxMenu(null)
    }

    const tryBind = () => {
      const iframe = containerRef.current?.querySelector('iframe') as HTMLIFrameElement | null
      try {
        const doc = iframe?.contentDocument
        if (doc && doc !== iframeDoc) {
          if (iframeDoc) iframeDoc.removeEventListener('click', onClick)
          iframeDoc = doc
          doc.addEventListener('click', onClick)
          bound = true
        }
      } catch {}
    }

    tryBind()
    const timer = setInterval(tryBind, 500)
    ctx.rendition.on('relocated', tryBind)

    return () => {
      clearInterval(timer)
      if (iframeDoc) iframeDoc.removeEventListener('click', onClick)
      ctx.rendition?.off('relocated', tryBind)
    }
  }, [ctx.rendition, iframeRangeToScreen])

  // Handle text selection events from epub.js
  useEffect(() => {
    if (!ctx.rendition) return

    const onSelected = (cfiRange: string, contents: any) => {
      if (Date.now() - markClickedAtRef.current < 300) return

      const range = contents.range(cfiRange)
      const text = range?.toString() || ''
      if (!text.trim()) return

      const rect = range?.getBoundingClientRect()
      const iframe = containerRef.current?.querySelector('iframe') as HTMLIFrameElement | null
      if (!rect || !iframe) return
      const screen = iframeRangeToScreen(rect, iframe)
      const x = screen.left + screen.width / 2
      const y = screen.top
      const bottom = screen.bottom

      const sc = containerRef.current?.querySelector('.epub-container') as HTMLElement | null
      const scrollTop = sc?.scrollTop || 0
      const containerRect = containerRef.current?.getBoundingClientRect()
      const docY = (screen.top - (containerRect?.top || 0)) / scaleRef.current + scrollTop

      if (activeToolRef.current === 'highlight') {
        onHighlightCreatedRef.current(cfiRange, text, docY)
        contents?.window?.getSelection()?.removeAllRanges()
        return
      }

      setSelectionPopup({ cfiRange, text, x, y, bottom, docY, contents })
      setCtxMenu(null)
      setNotePopup(null)
    }

    ctx.rendition.on('selected', onSelected)
    return () => {
      ctx.rendition?.off('selected', onSelected)
    }
  }, [ctx.rendition, iframeRangeToScreen])

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

  const handleCtxChangeColor = useCallback((id: string, color: string) => {
    onAnnotationUpdate(id, { color })
  }, [onAnnotationUpdate])

  // Dismiss ctxMenu on scroll
  useEffect(() => {
    if (!ctxMenu) return
    const dismiss = () => setCtxMenu(null)
    const sc = containerRef.current?.querySelector('.epub-container') as HTMLElement | null
    if (sc) sc.addEventListener('scroll', dismiss, { passive: true })
    return () => {
      if (sc) sc.removeEventListener('scroll', dismiss)
    }
  }, [ctxMenu])

  return (
    <div
      ref={outerRef}
      style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--bg)',
        overscrollBehavior: 'none',
      }}
    >
      <style>{`
        [data-epub-container],
        [data-epub-container] .epub-container,
        [data-epub-container] .epub-container iframe {
          overflow-x: hidden !important;
          overscroll-behavior-x: none !important;
        }
      `}</style>
      <div
        ref={containerRef}
        style={{
          width: ctx.baseWidth || '100%',
          height: ctx.baseWidth ? `${100 / scale}%` : '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          transformOrigin: 'top left',
          transform: ctx.baseWidth ? `scale(${scale})` : undefined,
          marginLeft: centerMargin,
          overflowX: 'hidden',
          overscrollBehaviorX: 'none',
        }}
      >
      <div
        data-epub-container
        style={{ flex: 1, minHeight: 0 }}
      />

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

      <EpubAreaOverlays
        annotations={ctx.annotationsVisible ? annotations : []}
        containerRef={containerRef}
      />

      <EpubAreaSelectTool
        docId={docId}
        containerRef={containerRef}
        onCreated={onInkCreated}
      />

      {(ctx.activeTool === 'ink' || ctx.activeTool === 'eraser' || ctx.activeTool === 'lasso') && (
        <EpubInkToolbar
          onUndo={onInkUndo}
          onRedo={onInkRedo}
          canUndo={inkCanUndo}
          canRedo={inkCanRedo}
          onClearPage={onInkClearPage}
        />
      )}

      {eyeProtection && <div style={{ position: 'absolute', inset: 0, background: EYE_PROTECTION_TINT, pointerEvents: 'none', zIndex: 5 }} />}
      </div>

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
        <AnnotationContextMenu
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          annotationId={ctxMenu.annotationId}
          annotationType={ctxMenu.annotationType}
          annotationColor={ctxMenu.annotationColor}
          selectedText={ctxMenu.selectedText}
          onDelete={onAnnotationDelete}
          onChangeColor={handleCtxChangeColor}
          onClose={() => setCtxMenu(null)}
        />
      )}

    </div>
  )
}

