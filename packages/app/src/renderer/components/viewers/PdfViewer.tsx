import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import HighlightLayer from '../annotations/HighlightLayer.js'

// Set up the worker for Electron/Vite context
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

interface TextSelectInfo {
  page: number
  rects: Array<{ x: number; y: number; w: number; h: number }>
  text: string
  clientRect: DOMRect
}

interface AnnotationData {
  id: string
  page: number | null
  position: any
  color: string
}

interface Props {
  filePath: string
  docId?: string
  annotations?: AnnotationData[]
  onTextSelect?: (info: TextSelectInfo) => void
  onHighlightClick?: (id: string) => void
}

/* ---------- PdfPage: renders one page with canvas + text + highlight layers ---------- */

interface PdfPageProps {
  page: pdfjsLib.PDFPageProxy
  pageNum: number
  scale: number
  highlights: Array<{ id: string; color: string; rects: Array<{ x: number; y: number; w: number; h: number }> }>
  onTextSelect?: (info: TextSelectInfo) => void
  onHighlightClick?: (id: string) => void
}

function PdfPage({ page, pageNum, scale, highlights, onTextSelect, onHighlightClick }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)

  const viewport = useMemo(() => page.getViewport({ scale }), [page, scale])

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = viewport.width
    canvas.height = viewport.height

    const renderTask = page.render({ canvasContext: ctx, viewport, canvas })
    renderTask.promise.catch(() => { /* cancelled */ })

    return () => { renderTask.cancel() }
  }, [page, viewport])

  // Render text layer
  useEffect(() => {
    const container = textLayerRef.current
    if (!container) return

    let cancelled = false

    const buildTextLayer = async () => {
      const textContent = await page.getTextContent()
      if (cancelled || !container) return

      // Clear previous text spans
      container.innerHTML = ''

      for (const item of textContent.items) {
        if (!('str' in item)) continue
        const textItem = item as any
        if (!textItem.str) continue

        const tx = pdfjsLib.Util.transform(viewport.transform, textItem.transform)

        const span = document.createElement('span')
        span.textContent = textItem.str
        span.style.position = 'absolute'
        span.style.left = `${tx[4]}px`
        // tx[5] is the baseline y; subtract height to get the top edge
        const height = textItem.height * scale
        span.style.top = `${tx[5] - height}px`
        span.style.fontSize = `${height}px`
        span.style.fontFamily = 'sans-serif'
        span.style.color = 'transparent'
        span.style.whiteSpace = 'pre'
        span.style.lineHeight = '1'

        if (textItem.width) {
          span.style.width = `${textItem.width * scale}px`
          span.style.display = 'inline-block'
        }

        container.appendChild(span)
      }
    }

    buildTextLayer()

    return () => { cancelled = true }
  }, [page, viewport, scale])

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    if (!onTextSelect) return

    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return

    const text = sel.toString()
    const range = sel.getRangeAt(0)
    const clientRect = range.getBoundingClientRect()

    // Compute selection rects relative to the page (in PDF coordinates, i.e. divided by scale)
    const pageContainer = textLayerRef.current?.parentElement
    if (!pageContainer) return
    const pageRect = pageContainer.getBoundingClientRect()

    const rects: Array<{ x: number; y: number; w: number; h: number }> = []
    const clientRects = range.getClientRects()
    for (let i = 0; i < clientRects.length; i++) {
      const cr = clientRects[i]
      rects.push({
        x: (cr.left - pageRect.left) / scale,
        y: (cr.top - pageRect.top) / scale,
        w: cr.width / scale,
        h: cr.height / scale,
      })
    }

    if (rects.length > 0) {
      onTextSelect({ page: pageNum, rects, text, clientRect })
    }
  }, [onTextSelect, pageNum, scale])

  return (
    <div
      style={{
        position: 'relative',
        width: viewport.width,
        height: viewport.height,
        margin: '8px auto',
      }}
      onMouseUp={handleMouseUp}
    >
      {/* Canvas layer (bottom) */}
      <canvas
        ref={canvasRef}
        style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}
      />

      {/* Text layer (middle) — transparent text for selection */}
      <div
        ref={textLayerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: viewport.width,
          height: viewport.height,
          overflow: 'hidden',
        }}
      />

      {/* Highlight layer (top) — pointerEvents none so text selection works through */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: viewport.width,
          height: viewport.height,
          pointerEvents: 'none',
        }}
      >
        <HighlightLayer
          highlights={highlights}
          scale={scale}
          onHighlightClick={onHighlightClick}
        />
      </div>
    </div>
  )
}

/* ---------- PdfViewer: loads the document and renders all pages ---------- */

export default function PdfViewer({
  filePath,
  docId,
  annotations = [],
  onTextSelect,
  onHighlightClick,
}: Props) {
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [pages, setPages] = useState<pdfjsLib.PDFPageProxy[]>([])

  // Load PDF document
  useEffect(() => {
    let cancelled = false
    const loadPdf = async () => {
      const url = `file://${filePath}`
      const doc = await pdfjsLib.getDocument(url).promise
      if (!cancelled) {
        setPdfDoc(doc)
        setNumPages(doc.numPages)

        // Pre-load all pages
        const loaded: pdfjsLib.PDFPageProxy[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          loaded.push(await doc.getPage(i))
        }
        if (!cancelled) {
          setPages(loaded)
        }
      }
    }
    loadPdf()
    return () => { cancelled = true }
  }, [filePath])

  // Build highlight data per page from annotations
  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Array<{ id: string; color: string; rects: Array<{ x: number; y: number; w: number; h: number }> }>>()
    for (const ann of annotations) {
      if (ann.page == null) continue
      const rects = ann.position?.rects
      if (!Array.isArray(rects) || rects.length === 0) continue
      if (!map.has(ann.page)) map.set(ann.page, [])
      map.get(ann.page)!.push({
        id: ann.id,
        color: ann.color,
        rects,
      })
    }
    return map
  }, [annotations])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Zoom toolbar */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))}>&#x2212;</button>
        <span style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.25))}>+</button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
          {numPages} pages
        </span>
      </div>

      {/* Page container */}
      <div style={{ flex: 1, overflow: 'auto', background: '#525659' }}>
        {pages.map((page, idx) => {
          const pageNum = idx + 1
          return (
            <PdfPage
              key={pageNum}
              page={page}
              pageNum={pageNum}
              scale={scale}
              highlights={highlightsByPage.get(pageNum) || []}
              onTextSelect={onTextSelect}
              onHighlightClick={onHighlightClick}
            />
          )
        })}
      </div>
    </div>
  )
}
