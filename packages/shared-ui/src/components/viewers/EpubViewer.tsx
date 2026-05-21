import React, { useEffect, useState, useCallback, useRef } from 'react'
import ePub, { Book } from 'epubjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { EpubViewerProvider, useEpubViewer } from './EpubViewerContext.js'
import EpubToolbar from './EpubToolbar.js'
import EpubLeftSidebar from './EpubLeftSidebar.js'
import EpubInfoSidebar from './EpubInfoSidebar.js'
import EpubContentArea from './EpubContentArea.js'
import EpubSearchPopup from './EpubSearchPopup.js'
import { useAnnotations } from '../../hooks/useAnnotations.js'
import { useT } from '../../i18n/index.js'
import { useResizable, ResizeHandle } from '../ResizeHandle.js'
import { useBanjuanAPI } from '../../api.js'

interface DocInfo {
  id: string
  title: string
  authors: string[]
  type: string
  path: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface Props {
  data: ArrayBuffer
  doc: DocInfo
  onOpenNote?: (note: any) => void
}

function EpubViewerInner({ data, doc: initialDoc, onOpenNote }: { data: ArrayBuffer; doc: DocInfo; onOpenNote?: (note: any) => void }) {
  const api = useBanjuanAPI()
  const t = useT()
  const ctx = useEpubViewer()
  const leftResize = useResizable(240, 160, 480, 'left')
  const rightResize = useResizable(280, 200, 600, 'right')
  const { annotations, create, update, remove, reload } = useAnnotations(initialDoc.id)
  const [doc, setDoc] = useState<DocInfo>(initialDoc)

  const bookRef = useRef<Book | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number>(0)
  const docRef = useRef(initialDoc)
  const rootRef = useRef<HTMLDivElement>(null)
  const lastCfiRef = useRef<string | null>(null)

  useEffect(() => { docRef.current = doc }, [doc])

  const saveReadingPosition = useCallback((cfi: string, percentage: number) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const d = docRef.current
      api.documents.update(d.id, {
        metadata: { readingPosition: { cfi, percentage } },
      }).catch(() => {})
    }, 1000)
  }, [])

  useEffect(() => {
    let cancelled = false

    api.documents.get(docRef.current.id).then((freshDoc: any) => {
      if (!cancelled && freshDoc?.metadata) {
        docRef.current = { ...docRef.current, metadata: freshDoc.metadata }
        setDoc(prev => ({ ...prev, metadata: freshDoc.metadata }))
      }
    }).catch(() => {}).finally(() => {
      if (cancelled) return

      const raf = requestAnimationFrame(() => {
        if (cancelled) return
        const container = document.querySelector('[data-epub-container]') as HTMLElement | null
        if (!container) return

        container.innerHTML = ''

        if (bookRef.current) {
          bookRef.current.destroy()
          bookRef.current = null
        }

        const epubBook = ePub(data as any)
        bookRef.current = epubBook

        const containerWidth = container.clientWidth
        ctx.setBaseWidth(containerWidth)

        const rend = epubBook.renderTo(container, {
          width: containerWidth,
          height: '100%',
          spread: 'none',
          flow: 'scrolled-doc' as any,
          manager: 'default' as any,
        })

        rend.themes.default({
          'html': {
            'overflow-x': 'hidden !important',
            'overscroll-behavior-x': 'none !important',
          },
          'body': {
            'max-width': '720px !important',
            'margin': '0 auto !important',
            'padding': '20px 40px !important',
            'line-height': '1.8 !important',
            'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important',
            'overflow-x': 'hidden !important',
            'overscroll-behavior-x': 'none !important',
          },
          'img, video, svg, table, pre, code': {
            'max-width': '100% !important',
            'box-sizing': 'border-box !important',
          },
          'p': {
            'margin-bottom': '0.8em !important',
            'text-align': 'justify !important',
          },
          'h1, h2, h3, h4, h5, h6': {
            'margin-top': '1.5em !important',
            'margin-bottom': '0.5em !important',
          },
        })

        ctx.setRendition(rend)
        ctx.setBook(epubBook)

        const epubContainer = container.querySelector('.epub-container') as HTMLElement | null
        if (epubContainer) {
          epubContainer.style.overflowX = 'hidden'
        }

        const savedPosition = (docRef.current.metadata?.readingPosition as any)?.cfi
        rend.display(savedPosition || undefined)

        epubBook.loaded.navigation.then((nav) => {
          if (!cancelled) ctx.setToc(nav.toc)
        })

        rend.on('relocated', (location: any) => {
          if (cancelled) return

          ctx.setCurrentHref(location.start.href)
          const pct = location.start.percentage != null
            ? Math.round(location.start.percentage * 100) : 0
          ctx.setPercentage(pct)

          const cfi = location.start.cfi
          if (cfi) {
            lastCfiRef.current = cfi
            saveReadingPosition(cfi, pct)
          }
        })

        rafRef.current = 0
      })
      rafRef.current = raf
    })

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (bookRef.current) {
        bookRef.current.destroy()
        bookRef.current = null
      }
      ctx.setBook(null)
      ctx.setRendition(null)
      ctx.setToc([])
      ctx.setCurrentHref('')
      ctx.setPercentage(0)
    }
  }, [data])


  const handleHighlightCreated = useCallback(async (cfiRange: string, text: string, docY?: number) => {
    await create({
      type: 'highlight',
      position: { type: 'epub', cfi: cfiRange, text, bounds: docY != null ? { y: docY } : undefined },
      selectedText: text,
      color: ctx.activeColor,
    })
  }, [create, ctx.activeColor])

  const handleUnderlineCreated = useCallback(async (cfiRange: string, text: string, docY?: number) => {
    await create({
      type: 'underline',
      position: { type: 'epub', cfi: cfiRange, text, bounds: docY != null ? { y: docY } : undefined },
      selectedText: text,
      color: ctx.activeColor,
    })
  }, [create, ctx.activeColor])

  const handleNoteCreated = useCallback(async (cfiRange: string, text: string, noteContent: string, docY?: number) => {
    await create({
      type: 'note',
      position: { type: 'epub', cfi: cfiRange, text, bounds: docY != null ? { y: docY } : undefined },
      selectedText: text,
      content: noteContent,
      color: ctx.activeColor,
    })
  }, [create, ctx.activeColor])

  const handleAnnotationClick = useCallback(async (cfi: string) => {
    if (!ctx.rendition) return
    await ctx.rendition.display(cfi)
    requestAnimationFrame(() => {
      const sc = document.querySelector('[data-epub-container] .epub-container') as HTMLElement | null
      if (sc && sc.scrollTop > 80) {
        sc.scrollBy({ top: -80, behavior: 'smooth' })
      }
    })
  }, [ctx.rendition])

  const handleAnnotationDelete = useCallback(async (id: string) => {
    const ann = annotations.find(a => a.id === id)
    if (ann?.position?.cfi && ctx.rendition) {
      const removeType = ann.type === 'underline' ? 'underline' : 'highlight'
      try { ctx.rendition.annotations.remove(ann.position.cfi, removeType) } catch {}
    }
    await remove(id)
  }, [remove, annotations, ctx.rendition])

  const handleAnnotationUpdate = useCallback(async (id: string, updates: any) => {
    await update(id, updates)
  }, [update])

  const handleInkCreated = useCallback(() => {
    reload()
  }, [reload])

  const handleInkClearPage = useCallback(async () => {
    const inkAnns = annotations.filter((a: any) => a.type === 'ink')
    for (const ann of inkAnns) {
      await api.annotations.delete(ann.id)
    }
    reload()
  }, [annotations, reload])

  const handleInkUndo = useCallback(async () => {
    const entry = ctx.popInkUndo()
    if (!entry) return
    const current = annotations.find((a: any) => a.id === entry.annotationId)
    if (current) {
      ctx.pushInkRedo({ annotationId: current.id, strokes: [...(current as any).position.strokes] })
      if (entry.strokes.length === 0) {
        await api.annotations.delete(current.id)
      } else {
        const allPts = entry.strokes.flatMap((s: any) => s.points)
        const xs = allPts.map((p: any) => p.x)
        const ys = allPts.map((p: any) => p.y)
        const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
        await api.annotations.update(current.id, {
          position: { ...(current as any).position, strokes: entry.strokes, bounds },
        })
      }
    }
    reload()
  }, [annotations, reload])

  const handleInkRedo = useCallback(async () => {
    const entry = ctx.popInkRedo()
    if (!entry) return
    const current = annotations.find((a: any) => a.id === entry.annotationId)
    if (current) {
      ctx.pushInkUndo({ annotationId: current.id, strokes: [...(current as any).position.strokes] })
      const allPts = entry.strokes.flatMap((s: any) => s.points)
      const xs = allPts.map((p: any) => p.x)
      const ys = allPts.map((p: any) => p.y)
      const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
      await api.annotations.update(current.id, {
        position: { ...(current as any).position, strokes: entry.strokes, bounds },
      })
    }
    reload()
  }, [annotations, reload])

  const handleCreateNote = useCallback(async () => {
    let title = t('note.defaultTitle' as any, doc.title)
    let note: any
    for (let i = 0; i < 100; i++) {
      try {
        note = await api.notes.create({
          title: i === 0 ? title : `${title} (${i + 1})`,
          docId: doc.id,
          content: '',
        })
        break
      } catch (err: any) {
        if (!err?.message?.includes('DUPLICATE_TITLE')) throw err
      }
    }
    if (note) onOpenNote?.(note)
  }, [doc, onOpenNote, t])

  const handleOpenNote = useCallback((note: any) => {
    onOpenNote?.(note)
  }, [onOpenNote])

  const handleDocUpdated = useCallback((updated: DocInfo) => {
    setDoc(updated)
  }, [])

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <EpubToolbar docId={doc.id} metadata={doc.metadata} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <EpubLeftSidebar
          docId={doc.id}
          annotations={annotations}
          onAnnotationClick={handleAnnotationClick}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationUpdate={handleAnnotationUpdate}
          onOpenNote={handleOpenNote}
          onCreateNote={handleCreateNote}
          width={leftResize.width}
        />
        {ctx.leftSidebarOpen && <ResizeHandle onPointerDown={leftResize.onPointerDown} />}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          <EpubContentArea
            annotations={annotations}
            docId={doc.id}
            onHighlightCreated={handleHighlightCreated}
            onUnderlineCreated={handleUnderlineCreated}
            onNoteCreated={handleNoteCreated}
            onInkCreated={handleInkCreated}
            onInkUndo={handleInkUndo}
            onInkRedo={handleInkRedo}
            onInkClearPage={handleInkClearPage}
            onAnnotationDelete={handleAnnotationDelete}
            onAnnotationUpdate={handleAnnotationUpdate}
            inkCanUndo={ctx.inkUndoStack.length > 0}
            inkCanRedo={ctx.inkRedoStack.length > 0}
          />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            display: 'flex', justifyContent: 'space-between',
            padding: '12px 20px',
            background: 'linear-gradient(transparent, var(--bg) 50%)',
            zIndex: 20, pointerEvents: 'none',
          }}>
            <button
              onClick={ctx.goPrev}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                border: '1px solid var(--border)', background: 'var(--surface)',
                borderRadius: 6, padding: '6px 14px', fontSize: 12,
                cursor: 'pointer', color: 'var(--text)',
                pointerEvents: 'auto',
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              }}
            >
              <ChevronLeft size={14} />
              {t('epub.prevChapter' as any)}
            </button>
            <button
              onClick={ctx.goNext}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                border: '1px solid var(--border)', background: 'var(--surface)',
                borderRadius: 6, padding: '6px 14px', fontSize: 12,
                cursor: 'pointer', color: 'var(--text)',
                pointerEvents: 'auto',
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              }}
            >
              {t('epub.nextChapter' as any)}
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        {ctx.rightSidebarOpen && <ResizeHandle onPointerDown={rightResize.onPointerDown} />}
        <EpubInfoSidebar
          doc={doc}
          onDocUpdated={handleDocUpdated}
          width={rightResize.width}
        />
        <EpubSearchPopup />
      </div>
    </div>
  )
}

export default function EpubViewer({ data, doc, onOpenNote }: Props) {
  return (
    <EpubViewerProvider>
      <EpubViewerInner data={data} doc={doc} onOpenNote={onOpenNote} />
    </EpubViewerProvider>
  )
}
