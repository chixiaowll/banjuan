import React, { useEffect, useState, useCallback, useRef } from 'react'
import * as pdfjsLib from '@banjuan/zotero-pdfjs-dist'
import { PdfViewerProvider } from './PdfViewerContext.js'
import { usePdfViewer } from './PdfViewerContext.js'
import PdfToolbar from './PdfToolbar.js'
import PdfLeftSidebar from './PdfLeftSidebar.js'
import PdfInfoSidebar from './PdfInfoSidebar.js'
import PdfNoteSidebar from './PdfNoteSidebar.js'
import PdfContentArea from './PdfContentArea.js'
import SearchPopup from './SearchPopup.js'
import PdfInkToolbar from './PdfInkToolbar.js'
import { createHighlightFromSelection } from './HighlightTool.js'
import { useAnnotations } from '../../hooks/useAnnotations.js'
import { useT } from '../../i18n/index.js'
import type { TextSelectInfo } from './PdfPage.js'
import TagInput from '../tags/TagInput.js'
import { useResizable, ResizeHandle } from '../ResizeHandle.js'
import { useBanjuanAPI } from '../../api.js'
import DocumentLoadError from './DocumentLoadError.js'
import { takeDocPage, onDocPageRequest } from '../../utils/docNavigation.js'
import TextSelectionToolbar from './TextSelectionToolbar.js'
import AnnotationContextMenu from './AnnotationContextMenu.js'
import { onInkStrokeSaved } from './inkWrites.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '@banjuan/zotero-pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

const baseUrl = typeof window !== 'undefined' && window.location.protocol === 'file:'
  ? new URL('.', window.location.href).href
  : '/'
const cMapUrl = `${baseUrl}bcmaps/`
const standardFontDataUrl = `${baseUrl}standard_fonts/`

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
  filePath: string
  docPath: string
  fileData?: ArrayBuffer
  /** WebView-loadable URL; on mobile pdf.js streams from it instead of reading
   *  the whole file into memory (which fails for large PDFs on iOS). */
  fileSrc?: string | null
  doc: DocInfo
  onOpenNote?: (note: any) => void
}

function PdfViewerInner({ doc: initialDoc, onPageSizesComputed }: Props & { onPageSizesComputed?: (sizes: Array<{ w: number; h: number }>) => void }) {
  const api = useBanjuanAPI()
  const t = useT()
  const ctx = usePdfViewer()
  const leftResize = useResizable(240, 160, 480, 'left')
  const rightResize = useResizable(320, 200, 600, 'right')
  const { annotations, create, update, remove, reload } = useAnnotations(initialDoc.id)
  const [doc, setDoc] = useState<DocInfo>(initialDoc)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef(initialDoc)
  docRef.current = doc

  // --- Ink undo/redo ---
  // In the order strokes were drawn, on whatever page they went to (InkTool
  // reports each saved stroke). Undo used to act on the page in view — the
  // wrong page whenever the reader had scrolled since drawing.
  const inkHistoryRef = useRef<Array<{ page: number; annotationId: string }>>([])
  const inkRedoRef = useRef<Array<{ page: number; annotationId: string; stroke: any }>>([])
  const [inkHistoryVersion, setInkHistoryVersion] = useState(0)
  useEffect(() => onInkStrokeSaved(e => {
    if (e.docId !== doc.id) return
    inkHistoryRef.current.push({ page: e.page, annotationId: e.annotationId })
    inkRedoRef.current = []
    setInkHistoryVersion(v => v + 1)
  }), [doc.id])

  const boundsOf = (strokes: any[]) => {
    const pts = strokes.flatMap((s: any) => s.points)
    const xs = pts.map((p: any) => p.x)
    const ys = pts.map((p: any) => p.y)
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }

  const handleInkUndo = useCallback(async () => {
    // Strokes from before this viewer opened: the page in view, as before.
    const last = inkHistoryRef.current.pop()
    const page = last?.page ?? ctx.currentPage
    const stored = last
      ? await api.annotations.get(last.annotationId)
      : (await api.annotations.list({ docId: doc.id, page })).find(a => (a.position as any)?.type === 'ink') ?? null
    const strokes: any[] = (stored?.position as any)?.strokes ?? []
    if (!stored || strokes.length === 0) { setInkHistoryVersion(v => v + 1); return }
    const remaining = strokes.slice(0, -1)
    inkRedoRef.current.push({ page, annotationId: stored.id, stroke: strokes[strokes.length - 1] })
    if (remaining.length === 0) await remove(stored.id)
    else await update(stored.id, { position: { type: 'ink', page, strokes: remaining, bounds: boundsOf(remaining) } })
    setInkHistoryVersion(v => v + 1)
    reload()
  }, [ctx.currentPage, doc.id, remove, update, reload])

  const handleInkRedo = useCallback(async () => {
    const entry = inkRedoRef.current.pop()
    if (!entry) return
    const stored = await api.annotations.get(entry.annotationId)
    const strokes = [...(((stored?.position as any)?.strokes) ?? []), entry.stroke]
    const position = { type: 'ink' as const, page: entry.page, strokes, bounds: boundsOf(strokes) }
    let annotationId = entry.annotationId
    if (stored) await update(stored.id, { position })
    else annotationId = (await create({ type: 'ink', page: entry.page, position, color: ctx.activeColor })).id
    inkHistoryRef.current.push({ page: entry.page, annotationId })
    setInkHistoryVersion(v => v + 1)
    reload()
  }, [ctx.activeColor, create, update, reload])

  const handleInkClearPage = useCallback(async () => {
    const page = ctx.currentPage
    const inkAnn = annotations.find(a => a.page === page && a.position?.type === 'ink')
    if (!inkAnn) return
    await remove(inkAnn.id)
    inkHistoryRef.current = inkHistoryRef.current.filter(h => h.page !== page)
    inkRedoRef.current = inkRedoRef.current.filter(h => h.page !== page)
    setInkHistoryVersion(v => v + 1)
    reload()
  }, [ctx.currentPage, annotations, remove, reload])

  void inkHistoryVersion   // re-render when the history changes (it lives in refs)
  const inkCanUndo = inkHistoryRef.current.length > 0
    || annotations.some(a => a.page === ctx.currentPage && a.position?.type === 'ink' && a.position?.strokes?.length > 0)
  const inkCanRedo = inkRedoRef.current.length > 0

  // --- Reading position persistence (page + fraction within page, scale-independent) ---
  // Convert scrollTop → { page, offsetFraction } using pageSizes
  const scrollToPosition = useCallback(() => {
    const el = ctx.scrollRef.current
    if (!el || ctx.pageSizes.length === 0) return null
    const scrollTop = el.scrollTop
    let cumTop = 0
    for (let i = 0; i < ctx.pageSizes.length; i++) {
      const pageH = ctx.pageSizes[i].h
      const pageBottom = cumTop + pageH + 16
      if (pageBottom > scrollTop || i === ctx.pageSizes.length - 1) {
        return { page: i + 1, offsetFraction: pageH > 0 ? (scrollTop - cumTop) / pageH : 0 }
      }
      cumTop = pageBottom
    }
    return null
  }, [ctx.pageSizes, ctx.scrollRef])

  // Track position in ref on every scroll
  const lastPositionRef = useRef<{ page: number; offsetFraction: number } | null>(null)
  useEffect(() => {
    const el = ctx.scrollRef.current
    if (!el) return
    const onScroll = () => {
      const pos = scrollToPosition()
      if (pos) lastPositionRef.current = pos
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [ctx.scrollRef, scrollToPosition])

  // Persist to disk (debounced)
  const flushPosition = useCallback(() => {
    const pos = lastPositionRef.current
    if (!pos) return
    const d = docRef.current
    const total = ctx.numPages
    const percentage = total > 0 ? pos.page / total : 0
    api.documents.update(d.id, {
      metadata: { readingPosition: { ...pos, totalPages: total, percentage } },
    }).catch(() => {})
  }, [ctx.numPages])

  useEffect(() => {
    if (ctx.currentPage <= 0) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(flushPosition, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [ctx.currentPage, flushPosition])

  // Flush on unmount
  useEffect(() => () => flushPosition(), [flushPosition])

  // Restore position on initial load
  const restoredRef = useRef(false)
  const pageSizesRef = useRef(ctx.pageSizes)
  pageSizesRef.current = ctx.pageSizes

  useEffect(() => {
    if (restoredRef.current || ctx.pageSizes.length === 0) return
    restoredRef.current = true
    api.documents.get(initialDoc.id).then((fresh: any) => {
      const pos = fresh?.metadata?.readingPosition
      if (!pos || !pos.page || pos.page <= 1) return
      if (lastPositionRef.current) return
      const el = ctx.scrollRef.current
      if (!el) return
      setTimeout(() => {
        if (lastPositionRef.current) return
        const sizes = pageSizesRef.current
        if (sizes.length === 0) return
        let pageTop = 0
        for (let i = 0; i < pos.page - 1 && i < sizes.length; i++) {
          pageTop += sizes[i].h + 16
        }
        const pageH = sizes[Math.min(pos.page - 1, sizes.length - 1)]?.h ?? 0
        const target = pageTop + (pos.offsetFraction ?? 0) * pageH
        el.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior })
      }, 50)
    }).catch(() => {})
  }, [ctx.pageSizes.length])

  useEffect(() => {
    document.dispatchEvent(new CustomEvent('banjuan:context-update', {
      detail: { docId: doc.id, currentPage: ctx.currentPage, totalPages: ctx.numPages }
    }))
  }, [ctx.currentPage, ctx.numPages, doc.id])

  // --- Text selection toolbar ---
  const [selectionToolbar, setSelectionToolbar] = useState<{ info: TextSelectInfo; pos: { x: number; y: number; bottom: number } } | null>(null)
  const selectionColorRef = useRef(ctx.activeColor)
  selectionColorRef.current = ctx.activeColor

  const handleTextSelect = useCallback(async (info: TextSelectInfo) => {
    document.dispatchEvent(new CustomEvent('banjuan:context-update', {
      detail: { docId: doc.id, selectedText: info.text, selectedPage: info.page }
    }))
    if (ctx.activeTool === 'highlight') {
      await createHighlightFromSelection(api, doc.id, info, ctx.activeColor)
      reload()
    } else if (ctx.activeTool === 'none') {
      setSelectionToolbar({
        info,
        pos: {
          x: info.clientRect.left + info.clientRect.width / 2,
          y: info.clientRect.top,
          bottom: info.clientRect.bottom,
        },
      })
    }
  }, [ctx.activeTool, ctx.activeColor, doc.id, reload])

  const handleSelectionHighlight = useCallback(async () => {
    if (!selectionToolbar) return
    await createHighlightFromSelection(api, doc.id, selectionToolbar.info, selectionColorRef.current)
    reload()
    setSelectionToolbar(null)
  }, [selectionToolbar, doc.id, reload])

  const handleSelectionUnderline = useCallback(async () => {
    if (!selectionToolbar) return
    const info = selectionToolbar.info
    await api.annotations.create({
      docId: doc.id,
      type: 'underline',
      page: info.page,
      position: { type: 'pdf', page: info.page, rects: info.rects, text: info.text },
      selectedText: info.text,
      color: selectionColorRef.current,
    })
    window.getSelection()?.removeAllRanges()
    reload()
    setSelectionToolbar(null)
  }, [selectionToolbar, doc.id, reload])

  const handleSelectionCopy = useCallback(() => {
    if (!selectionToolbar) return
    navigator.clipboard.writeText(selectionToolbar.info.text)
    setSelectionToolbar(null)
  }, [selectionToolbar])

  // --- Annotation context menu ---
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; annotationId: string } | null>(null)

  const handleAnnotationContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, annotationId: id })
    setSelectionToolbar(null)
  }, [])

  const handleContextMenuChangeColor = useCallback(async (id: string, color: string) => {
    await update(id, { color })
  }, [update])

  const handleContextMenuDelete = useCallback(async (id: string) => {
    await remove(id)
  }, [remove])

  const handleAnnotationClick = useCallback((page: number, yFraction?: number) => {
    const el = ctx.scrollRef.current
    if (!el || ctx.pageSizes.length === 0) return
    const idx = Math.max(0, Math.min(page - 1, ctx.pageSizes.length - 1))
    let pageTop = 0
    for (let i = 0; i < idx; i++) {
      pageTop += ctx.pageSizes[i].h + 16
    }
    const offset = yFraction != null ? ctx.pageSizes[idx].h * yFraction : 0
    el.scrollTo({ top: pageTop + offset - 80, behavior: 'smooth' })
  }, [ctx.scrollRef, ctx.pageSizes])

  // "Open at page N" from search / annotation cards: wait until page sizes are
  // known, and claim the position so restoring the last reading spot doesn't win.
  // Instant, not smooth: page sizes are recomputed right after load and the
  // content area re-anchors on the current scrollTop — mid-animation that left
  // a smooth scroll stranded a page or two in.
  const pageSizesReady = ctx.pageSizes.length > 0
  useEffect(() => {
    if (!pageSizesReady) return
    const jump = () => {
      const page = takeDocPage(doc.id)
      if (!page) return
      lastPositionRef.current = { page, offsetFraction: 0 }
      requestAnimationFrame(() => {
        const el = ctx.scrollRef.current
        const sizes = pageSizesRef.current
        if (!el || sizes.length === 0) return
        let top = 0
        for (let i = 0; i < Math.min(page, sizes.length) - 1; i++) top += sizes[i].h + 16
        el.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
      })
    }
    jump()
    return onDocPageRequest(doc.id, jump)
  }, [pageSizesReady, doc.id, ctx.scrollRef])

  const handleAnnotationDelete = useCallback(async (id: string) => {
    await remove(id)
  }, [remove])

  const handleAnnotationUpdate = useCallback(async (id: string, updates: any) => {
    await update(id, updates)
  }, [update])

  const [sidebarNoteId, setSidebarNoteId] = useState<string | null>(null)

  const handleCreateNote = useCallback(async () => {
    let title = t('note.defaultTitle', doc.title)
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
    if (note) setSidebarNoteId(note.id)
  }, [doc, t])

  const handleOpenNote = useCallback((note: any) => {
    setSidebarNoteId(note.id)
  }, [])

  const handleCloseNoteSidebar = useCallback(() => {
    setSidebarNoteId(null)
  }, [])

  const handleNoteSidebarOpenNote = useCallback((note: { id: string; title: string }) => {
    setSidebarNoteId(note.id)
  }, [])

  const handleDocUpdated = useCallback((updated: DocInfo) => {
    setDoc(updated)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PdfToolbar docId={doc.id} metadata={doc.metadata} />
      <div style={{
        padding: '4px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
      }}>
        <TagInput targetId={doc.id} targetType="document" compact />
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {(ctx.activeTool === 'ink' || ctx.activeTool === 'lasso') && (
          <PdfInkToolbar
            onUndo={handleInkUndo}
            onRedo={handleInkRedo}
            canUndo={inkCanUndo}
            canRedo={inkCanRedo}
            onClearPage={handleInkClearPage}
          />
        )}
        <PdfLeftSidebar
          docId={doc.id}
          annotations={annotations}
          onAnnotationClick={handleAnnotationClick}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationUpdate={handleAnnotationUpdate}
          onOpenNote={handleOpenNote}
          onCreateNote={handleCreateNote}
          onDeleteNote={(noteId) => { if (sidebarNoteId === noteId) setSidebarNoteId(null) }}
          width={leftResize.width}
        />
        {ctx.leftSidebarOpen && <ResizeHandle onPointerDown={leftResize.onPointerDown} />}
        <PdfContentArea
          annotations={annotations}
          docId={doc.id}
          onTextSelect={handleTextSelect}
          onHighlightClick={() => ctx.setLeftSidebarOpen(true)}
          onAnnotationContextMenu={handleAnnotationContextMenu}
          onAnnotationCreated={reload}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationUpdate={handleAnnotationUpdate}
          onPageSizesComputed={onPageSizesComputed}
        />
        {(sidebarNoteId || ctx.rightSidebarOpen) && <ResizeHandle onPointerDown={rightResize.onPointerDown} />}
        {sidebarNoteId ? (
          <PdfNoteSidebar
            noteId={sidebarNoteId}
            onClose={handleCloseNoteSidebar}
            onOpenNote={handleNoteSidebarOpenNote}
            width={rightResize.width}
          />
        ) : (
          <PdfInfoSidebar
            doc={doc}
            onDocUpdated={handleDocUpdated}
            onOpenNote={handleOpenNote}
            width={rightResize.width}
          />
        )}
        <SearchPopup />
      </div>
      {selectionToolbar && (
        <TextSelectionToolbar
          position={selectionToolbar.pos}
          color={ctx.activeColor}
          onHighlight={handleSelectionHighlight}
          onUnderline={handleSelectionUnderline}
          onCopy={handleSelectionCopy}
          onChangeColor={(c) => ctx.setActiveColor(c)}
          onClose={() => setSelectionToolbar(null)}
        />
      )}
      {contextMenu && (() => {
        const ann = annotations.find(a => a.id === contextMenu.annotationId)
        if (!ann) return null
        return (
          <AnnotationContextMenu
            position={contextMenu.position}
            annotationId={contextMenu.annotationId}
            annotationType={ann.type}
            annotationColor={ann.color}
            selectedText={ann.position?.text || ann.position?.selectedText}
            onDelete={handleContextMenuDelete}
            onChangeColor={handleContextMenuChangeColor}
            onClose={() => setContextMenu(null)}
          />
        )
      })()}
    </div>
  )
}

/** Desktop: PDFs larger than this are read in pieces (see readFileRange). */
const RANGE_READ_FROM = 64 * 1024 * 1024
/** pdf.js range chunk; pieces read per call are a multiple of it. */
const RANGE_CHUNK = 1024 * 1024
const RANGE_PIECE = 16 * RANGE_CHUNK
class PdfTooLargeError extends Error {
  constructor(readonly size: number) { super(`PDF too large to open (${size} bytes)`) }
}

/** A buffer the size of (part of) the file couldn't be allocated. */
const isAllocationFailure = (e: unknown) => /Array buffer allocation failed|Invalid typed array length|Array buffer allocation|out of memory/i.test(String((e as any)?.message ?? e))

const formatBytes = (n: number) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`

export default function PdfViewer(props: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [rawPageSize, setRawPageSize] = useState<{ w: number; h: number } | null>(null)
  const [rawPageSizes, setRawPageSizes] = useState<Array<{ w: number; h: number }>>([])
  const [pageSizes, setPageSizesLocal] = useState<Array<{ w: number; h: number }>>([])
  const [loadError, setLoadError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)

  // Mobile streams the PDF via URL (getFileSrc); desktop reads it over IPC and
  // must not wait for — or reload when — fileSrc arrives: that second effect run
  // read and parsed the whole file again and leaked the first document.
  const streamViaUrl = !!api.documents.getFileSrc && !props.fileData
  useEffect(() => {
    // Mobile: wait for the URL. A full base64 read of a large PDF via Capacitor
    // fails/hangs on iOS, so don't start one while the URL is still pending.
    if (streamViaUrl && !props.fileSrc) return
    let cancelled = false
    let loaded: pdfjsLib.PDFDocumentProxy | null = null
    setLoadError(null)
    const load = async () => {
      try {
        const commonOpts = { cMapUrl, cMapPacked: true, standardFontDataUrl, disableFontFace: true, useSystemFonts: false }
        console.log('[PdfViewer] load start', { streamViaUrl, fileSrc: props.fileSrc, hasFileData: !!props.fileData, workerSrc: pdfjsLib.GlobalWorkerOptions.workerSrc, cMapUrl })
        let doc
        if (streamViaUrl) {
          doc = await pdfjsLib.getDocument({ url: props.fileSrc!, ...commonOpts }).promise
        } else {
          let fileData = props.fileData
          const size = !fileData && api.documents.fileSize ? await api.documents.fileSize(props.docPath) : 0
          if (cancelled) return
          if (size > RANGE_READ_FROM && api.documents.readFileRange) {
            // A large file is read in pieces as pages need them. Whole, it went
            // over IPC at once and sat in memory three times (main process,
            // window, pdf.js worker) before the first page showed.
            const readRange = async (start: number, end: number) => {
              const b = await api.documents.readFileRange!(props.docPath, start, end)
              return b instanceof Uint8Array ? b : new Uint8Array(b)
            }
            const transport = new pdfjsLib.PDFDataRangeTransport(size, await readRange(0, Math.min(size, RANGE_CHUNK)))
            transport.requestDataRange = (begin: number, end: number) => {
              void (async () => {
                for (let at = begin; at < end; at += RANGE_PIECE) {
                  transport.onDataRange(at, await readRange(at, Math.min(end, at + RANGE_PIECE)))
                }
              })().catch(e => console.error('[PdfViewer] reading part of the file failed', e))
            }
            if (cancelled) return
            // Our pdf.js keeps a file this size in pieces too (see the paged
            // ChunkedStream in pdf.worker.mjs): files past 2 GB open as well.
            try {
              doc = await pdfjsLib.getDocument({ range: transport, length: size, rangeChunkSize: RANGE_CHUNK, disableAutoFetch: true, ...commonOpts }).promise
            } catch (e) {
              throw isAllocationFailure(e) ? new PdfTooLargeError(size) : e
            }
          } else {
            if (!fileData) fileData = await api.documents.readFileBuffer(props.docPath)
            if (cancelled) return
            doc = await pdfjsLib.getDocument({ data: new Uint8Array(fileData), ...commonOpts }).promise
          }
        }
        loaded = doc
        if (cancelled) { void doc.destroy(); return }

        setNumPages(doc.numPages)
        setPdfDoc(doc)

        // The first paint only needs page 1's size: use it for every page now and
        // fill in real sizes in the background. Awaiting getPage() for every page
        // first kept a long document blank until all of them had loaded.
        const first = (await doc.getPage(1)).getViewport({ scale: 1 })
        if (cancelled) return
        const sizes = Array.from({ length: doc.numPages }, () => ({ w: first.width, h: first.height }))
        setRawPageSize(sizes[0])
        setRawPageSizes(sizes)
        let differs = false
        for (let i = 2; i <= doc.numPages; i++) {
          const vp = (await doc.getPage(i)).getViewport({ scale: 1 })
          if (cancelled) return
          if (vp.width !== sizes[i - 1].w || vp.height !== sizes[i - 1].h) {
            sizes[i - 1] = { w: vp.width, h: vp.height }
            differs = true
          }
        }
        if (differs) setRawPageSizes([...sizes])
      } catch (err) {
        const e = err as any
        console.error('[PdfViewer] failed to load PDF:', 'name=' + e?.name, 'message=' + e?.message, 'str=' + String(err), 'stack=' + e?.stack)
        // Only a failure before the document opened leaves the viewer empty;
        // a later page-size read failing still has pages to show.
        if (!cancelled && !loaded) setLoadError(err)
      }
    }
    load()
    // Free the worker-side document (parsed objects, fonts, page caches) when
    // the tab closes or the source changes — it was never destroyed before.
    return () => { cancelled = true; void loaded?.destroy() }
  }, [props.fileData, props.docPath, streamViaUrl ? props.fileSrc : null, attempt])

  if (loadError) {
    return loadError instanceof PdfTooLargeError
      ? <DocumentLoadError error={loadError} detail={t('viewer.pdfTooLarge', formatBytes(loadError.size))} onOpenInSystem={() => { void api.documents.openInSystem(props.docPath) }} />
      : <DocumentLoadError error={loadError} onRetry={() => setAttempt(a => a + 1)} />
  }

  return (
    <PdfViewerProvider pdfDoc={pdfDoc} numPages={numPages} initialPageSizes={pageSizes} rawPageSize={rawPageSize} rawPageSizes={rawPageSizes}>
      <PdfViewerInner {...props} onPageSizesComputed={setPageSizesLocal} />
    </PdfViewerProvider>
  )
}
