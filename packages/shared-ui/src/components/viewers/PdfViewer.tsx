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
import TextSelectionToolbar from './TextSelectionToolbar.js'
import AnnotationContextMenu from './AnnotationContextMenu.js'

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
  const inkRedoStackRef = useRef<Map<number, any[]>>(new Map())

  const handleInkUndo = useCallback(async () => {
    const page = ctx.currentPage
    const inkAnn = annotations.find(a => a.page === page && a.position?.type === 'ink')
    if (!inkAnn) return
    const strokes = inkAnn.position?.strokes || []
    if (strokes.length === 0) return
    const removed = strokes[strokes.length - 1]
    const remaining = strokes.slice(0, -1)
    const redos = inkRedoStackRef.current.get(page) || []
    inkRedoStackRef.current.set(page, [...redos, removed])
    if (remaining.length === 0) {
      await remove(inkAnn.id)
    } else {
      const allPts = remaining.flatMap((s: any) => s.points)
      const xs = allPts.map((p: any) => p.x)
      const ys = allPts.map((p: any) => p.y)
      const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
      await update(inkAnn.id, { position: { type: 'ink', page, strokes: remaining, bounds } })
    }
    reload()
  }, [ctx.currentPage, annotations, remove, update, reload])

  const handleInkRedo = useCallback(async () => {
    const page = ctx.currentPage
    const redos = inkRedoStackRef.current.get(page) || []
    if (redos.length === 0) return
    const stroke = redos[redos.length - 1]
    inkRedoStackRef.current.set(page, redos.slice(0, -1))
    const inkAnn = annotations.find(a => a.page === page && a.position?.type === 'ink')
    const existing = inkAnn?.position?.strokes || []
    const allStrokes = [...existing, stroke]
    const allPts = allStrokes.flatMap((s: any) => s.points)
    const xs = allPts.map((p: any) => p.x)
    const ys = allPts.map((p: any) => p.y)
    const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    const position = { type: 'ink' as const, page, strokes: allStrokes, bounds }
    if (inkAnn) {
      await update(inkAnn.id, { position })
    } else {
      await create({ type: 'ink', page, position, color: ctx.activeColor })
    }
    reload()
  }, [ctx.currentPage, ctx.activeColor, annotations, create, update, reload])

  const handleInkClearPage = useCallback(async () => {
    const page = ctx.currentPage
    const inkAnn = annotations.find(a => a.page === page && a.position?.type === 'ink')
    if (!inkAnn) return
    await remove(inkAnn.id)
    inkRedoStackRef.current.delete(page)
    reload()
  }, [ctx.currentPage, annotations, remove, reload])

  const inkCanUndo = annotations.some(a => a.page === ctx.currentPage && a.position?.type === 'ink' && a.position?.strokes?.length > 0)
  const inkCanRedo = (inkRedoStackRef.current.get(ctx.currentPage)?.length ?? 0) > 0

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
      detail: { currentPage: ctx.currentPage, totalPages: ctx.numPages }
    }))
  }, [ctx.currentPage, ctx.numPages])

  // --- Text selection toolbar ---
  const [selectionToolbar, setSelectionToolbar] = useState<{ info: TextSelectInfo; pos: { x: number; y: number; bottom: number } } | null>(null)
  const selectionColorRef = useRef(ctx.activeColor)
  selectionColorRef.current = ctx.activeColor

  const handleTextSelect = useCallback(async (info: TextSelectInfo) => {
    document.dispatchEvent(new CustomEvent('banjuan:context-update', {
      detail: { selectedText: info.text, selectedPage: info.page }
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
          onAnnotationCreated={() => { inkRedoStackRef.current.delete(ctx.currentPage); reload() }}
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

export default function PdfViewer(props: Props) {
  const api = useBanjuanAPI()
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [rawPageSize, setRawPageSize] = useState<{ w: number; h: number } | null>(null)
  const [rawPageSizes, setRawPageSizes] = useState<Array<{ w: number; h: number }>>([])
  const [pageSizes, setPageSizesLocal] = useState<Array<{ w: number; h: number }>>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        let fileData = props.fileData
        if (!fileData) {
          fileData = await api.documents.readFileBuffer(props.docPath)
        }
        if (cancelled) return

        const data = new Uint8Array(fileData)
        const doc = await pdfjsLib.getDocument({
          data,
          cMapUrl,
          cMapPacked: true,
          standardFontDataUrl,
          disableFontFace: true,
          useSystemFonts: false,
        }).promise
        if (cancelled) return

        setNumPages(doc.numPages)
        setPdfDoc(doc)

        const sizes: Array<{ w: number; h: number }> = []
        for (let i = 1; i <= doc.numPages; i++) {
          const p = await doc.getPage(i)
          if (cancelled) return
          const vp = p.getViewport({ scale: 1 })
          sizes.push({ w: vp.width, h: vp.height })
        }
        setRawPageSize(sizes[0])
        setRawPageSizes(sizes)
      } catch (err) {
        console.error('[PdfViewer] failed to load PDF:', err)
      }
    }
    load()
    return () => { cancelled = true }
  }, [props.fileData, props.docPath])

  return (
    <PdfViewerProvider pdfDoc={pdfDoc} numPages={numPages} initialPageSizes={pageSizes} rawPageSize={rawPageSize} rawPageSizes={rawPageSizes}>
      <PdfViewerInner {...props} onPageSizesComputed={setPageSizesLocal} />
    </PdfViewerProvider>
  )
}
