import React, { useEffect, useState, useCallback, useRef } from 'react'
import ePub, { Book, Rendition, NavItem } from 'epubjs'
import { EpubViewerProvider, useEpubViewer, type EpubFlowMode } from './EpubViewerContext.js'
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
  const flowModeRef = useRef<EpubFlowMode>(ctx.flowMode)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number>(0)
  const docRef = useRef(initialDoc)

  useEffect(() => { docRef.current = doc }, [doc])
  useEffect(() => {
    flowModeRef.current = ctx.flowMode
  }, [ctx.flowMode])

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

    // Fetch latest metadata first (async), then init epub.js synchronously in RAF
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

        const isScrolled = flowModeRef.current === 'scrolled'
        const rend = epubBook.renderTo(container, {
          width: '100%',
          height: '100%',
          spread: 'none',
          flow: (isScrolled ? 'scrolled-doc' : 'paginated') as any,
          manager: (isScrolled ? 'continuous' : 'default') as any,
        })

        rend.themes.default({
          'body': {
            'max-width': '720px !important',
            'margin': '0 auto !important',
            'padding': '20px 40px !important',
            'line-height': '1.8 !important',
            'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important',
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

        const savedPosition = (docRef.current.metadata?.readingPosition as any)?.cfi
        rend.display(savedPosition || undefined)

        epubBook.loaded.navigation.then((nav) => {
          if (!cancelled) ctx.setToc(nav.toc)
        })

        epubBook.ready.then(() => {
          return epubBook.locations.generate(1024)
        }).then(() => {
          if (!cancelled) {
            ctx.setTotalLocations(epubBook.locations.length())
            const current = rend.currentLocation() as any
            if (current?.start?.location != null) {
              ctx.setCurrentLocation(current.start.location)
            }
            if (current?.start?.percentage != null) {
              ctx.setPercentage(Math.round(current.start.percentage * 100))
            }
          }
        })

        rend.on('relocated', (location: any) => {
          if (cancelled) return
          ctx.setCurrentHref(location.start.href)
          if (location.start.location != null) {
            ctx.setCurrentLocation(location.start.location)
          }
          const pct = location.start.percentage != null
            ? Math.round(location.start.percentage * 100) : 0
          ctx.setPercentage(pct)

          const cfi = location.start.cfi
          if (cfi) saveReadingPosition(cfi, pct)
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
      ctx.setCurrentLocation(0)
      ctx.setTotalLocations(0)
      ctx.setPercentage(0)
    }
  }, [data, ctx.flowMode])

  const handleHighlightCreated = useCallback(async (cfiRange: string, text: string) => {
    await create({
      type: 'highlight',
      page: ctx.currentLocation,
      position: { type: 'epub', cfi: cfiRange, text },
      selectedText: text,
      color: ctx.activeColor,
    })
  }, [create, ctx.activeColor, ctx.currentLocation])

  const handleNoteCreated = useCallback(async (cfiRange: string, text: string, noteContent: string) => {
    await create({
      type: 'note',
      page: ctx.currentLocation,
      position: { type: 'epub', cfi: cfiRange, text },
      selectedText: text,
      content: noteContent,
      color: ctx.activeColor,
    })
  }, [create, ctx.activeColor, ctx.currentLocation])

  const handleAnnotationClick = useCallback(async (cfi: string) => {
    if (!ctx.rendition) return
    await ctx.rendition.display(cfi)
  }, [ctx.rendition])

  const handleAnnotationDelete = useCallback(async (id: string) => {
    const ann = annotations.find(a => a.id === id)
    if (ann?.position?.cfi && ctx.rendition) {
      try { ctx.rendition.annotations.remove(ann.position.cfi, 'highlight') } catch {}
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
    const inkAnns = annotations.filter(
      (a: any) => a.type === 'ink' && a.position?.page === ctx.currentLocation
    )
    for (const ann of inkAnns) {
      await api.annotations.delete(ann.id)
    }
    reload()
  }, [annotations, ctx.currentLocation, reload])

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
        <EpubContentArea
          annotations={annotations}
          docId={doc.id}
          onHighlightCreated={handleHighlightCreated}
          onNoteCreated={handleNoteCreated}
          onInkCreated={handleInkCreated}
          onInkUndo={handleInkUndo}
          onInkRedo={handleInkRedo}
          onInkClearPage={handleInkClearPage}
          inkCanUndo={ctx.inkUndoStack.length > 0}
          inkCanRedo={ctx.inkRedoStack.length > 0}
        />
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
  const api = useBanjuanAPI()
  return (
    <EpubViewerProvider>
      <EpubViewerInner data={data} doc={doc} onOpenNote={onOpenNote} />
    </EpubViewerProvider>
  )
}
