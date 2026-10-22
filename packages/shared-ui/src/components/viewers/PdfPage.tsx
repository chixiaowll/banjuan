import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from '@banjuan/zotero-pdfjs-dist'
import HighlightLayer from '../annotations/HighlightLayer.js'
import AreaSelectTool from './AreaSelectTool.js'
import ResizableAreaOverlay from './ResizableAreaOverlay.js'
import TextNoteTool from './TextNoteTool.js'
import InkTool from './InkTool.js'
import InkLassoTool from './InkLassoTool.js'
import EraserTool from './EraserTool.js'
import { useBanjuanAPI } from '../../api.js'
import { useEyeProtection, EYE_PROTECTION_TINT, useEinkMode, EINK_FILTER } from './useEyeProtection.js'

// Max canvas backing-store pixels per page (pdf.js viewer default, 2^24).
const MAX_CANVAS_PIXELS = 16_777_216
const noop = () => {}

export interface TextSelectInfo {
  page: number
  rects: Array<{ x: number; y: number; w: number; h: number }>
  text: string
  clientRect: DOMRect
}

export interface PdfChar {
  c: string
  u?: string
  rect: [number, number, number, number]
  fontName?: string
  fontSize?: number
  rotation?: number
}

export interface PageInfo {
  width: number
  height: number
  chars: PdfChar[]
}

interface AnnotationData {
  id: string
  page: number | null
  position: any
  color: string
  type: string
}

interface PdfPageProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy
  pageNum: number
  scale: number
  baseSize: { w: number; h: number }
  highlights: Array<{ id: string; color: string; type?: string; rects: Array<{ x: number; y: number; w: number; h: number }> }>
  scrollRoot?: HTMLElement | null
  onTextSelect?: (info: TextSelectInfo) => void
  onHighlightClick?: (id: string) => void
  onAnnotationContextMenu?: (e: React.MouseEvent, id: string) => void
  searchHighlights?: Array<{ rects: Array<{ x: number; y: number; w: number; h: number }>; active: boolean }>
  onPageReady?: (pageNum: number, info: PageInfo) => void
  activeTool?: string
  activeColor?: string
  inkWidth?: number
  inkEraserActive?: boolean
  docId?: string
  annotations?: AnnotationData[]
  onAnnotationCreated?: () => void
  onAnnotationDelete?: (id: string) => void
  onAnnotationUpdate?: (id: string, updates: any) => void
}

export function findClosestCharIdx(chars: PdfChar[], px: number, py: number): number {
  let bestIdx = -1
  let bestDist = Infinity
  for (let i = 0; i < chars.length; i++) {
    const [x1, y1, x2, y2] = chars[i].rect
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    const dx = px - cx
    const dy = py - cy
    const d = dx * dx + dy * dy
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  return bestIdx
}

export default function PdfPage({
  pdfDoc,
  pageNum,
  scale,
  baseSize,
  highlights,
  scrollRoot,
  onTextSelect,
  onHighlightClick,
  onAnnotationContextMenu,
  searchHighlights,
  onPageReady,
  activeTool = 'none',
  activeColor = '#fde68a',
  inkWidth = 2,
  inkEraserActive = false,
  docId = '',
  annotations = [],
  onAnnotationCreated,
  onAnnotationDelete,
  onAnnotationUpdate,
}: PdfPageProps) {
  const api = useBanjuanAPI()
  const { eyeProtection } = useEyeProtection()
  const { einkMode } = useEinkMode()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const pageInfoRef = useRef<PageInfo | null>(null)
  const viewportRef = useRef<pdfjsLib.PageViewport | null>(null)
  const renderedScaleRef = useRef<number>(0)
  const [pageRotation, setPageRotation] = useState(0)

  const [ready, setReady] = useState(false)

  const buildCaptureCanvas = useCallback((): HTMLCanvasElement | null => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const textLayer = textLayerRef.current
    if (!canvas || !container) return null
    const uc = document.createElement('canvas')
    uc.width = canvas.width
    uc.height = canvas.height
    const uctx = uc.getContext('2d')!
    uctx.drawImage(canvas, 0, 0)
    if (textLayer) {
      const cr = container.getBoundingClientRect()
      if (cr.width > 0 && cr.height > 0) {
        const sx = canvas.width / cr.width
        const sy = canvas.height / cr.height
        for (const span of textLayer.querySelectorAll('span')) {
          const text = span.textContent
          if (!text?.trim()) continue
          const sr = span.getBoundingClientRect()
          if (sr.width === 0 || sr.height === 0) continue
          const x = (sr.left - cr.left) * sx
          const y = (sr.top - cr.top) * sy
          const h = sr.height * sy
          const cs = window.getComputedStyle(span)
          const fontSize = parseFloat(cs.fontSize) * sx
          uctx.save()
          uctx.font = `${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`
          uctx.fillStyle = cs.color
          uctx.textBaseline = 'top'
          const tw = uctx.measureText(text).width || 1
          uctx.translate(x, y)
          uctx.scale(sr.width * sx / tw, h / fontSize)
          uctx.fillText(text, 0, 0)
          uctx.restore()
        }
      }
    }
    return uc
  }, [])

  // Virtualized-away pages: release the canvas bitmap right away (an
  // off-screen canvas otherwise holds its full backing store until GC).
  useEffect(() => () => {
    const c = canvasRef.current
    if (c) { c.width = 0; c.height = 0 }
  }, [])

  // Render canvas + text layer + extract chars[] when mounted or scale changes.
  useEffect(() => {
    if (renderedScaleRef.current === scale && ready) return

    let cancelled = false
    // Kept so a scale change / unmount cancels the in-flight render instead of
    // letting it race the next one on the same canvas.
    let renderTask: ReturnType<pdfjsLib.PDFPageProxy['render']> | null = null
    let textLayer: InstanceType<typeof pdfjsLib.TextLayer> | null = null
    setReady(false)

    const init = async () => {
      const page = await pdfDoc.getPage(pageNum)
      if (cancelled) return

      setPageRotation(page.rotate)
      const viewport = page.getViewport({ scale, rotation: 0 })
      viewportRef.current = viewport

      const canvas = canvasRef.current
      const dpr = window.devicePixelRatio || 1
      let ctx: CanvasRenderingContext2D | null = null
      if (canvas) {
        // Cap the backing store like pdf.js's own viewer (maxCanvasPixels): at
        // high zoom a page at full devicePixelRatio can reach hundreds of
        // megapixels and exhaust memory. Above the cap, render at a lower
        // resolution and let CSS stretch it.
        const outputScale = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)))
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = viewport.width + 'px'
        canvas.style.height = viewport.height + 'px'
        ctx = canvas.getContext('2d')!
        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] as [number, number, number, number, number, number] : undefined
        renderTask = page.render({ canvasContext: ctx, viewport, transform })
        await renderTask.promise.catch(() => {})   // RenderingCancelledException when superseded
      }
      if (cancelled) return

      const textContent = await page.getTextContent()
      if (cancelled) return
      const textLayerEl = textLayerRef.current
      if (textLayerEl) {
        textLayerEl.innerHTML = ''
        textLayerEl.style.setProperty('--total-scale-factor', String(scale))
        textLayerEl.style.setProperty('--scale-factor', String(scale))
        const patchedContent = {
          ...textContent,
          styles: Object.fromEntries(
            Object.entries(textContent.styles as Record<string, any>).map(
              ([name, style]) => [name, { ...style, fontFamily: `"${name}", ${style.fontFamily || 'serif'}` }]
            )
          ),
        }
        textLayer = new pdfjsLib.TextLayer({
          textContentSource: patchedContent,
          container: textLayerEl,
          viewport,
        })
        await textLayer.render()
        if (cancelled) return

        const textItems = (patchedContent.items as any[]).filter((it: any) => it.str !== undefined && it.str !== '')
        const allSpans = textLayerEl.querySelectorAll('span[role="presentation"]')
        const getLocalWidth = (el: HTMLElement) => parseFloat(getComputedStyle(el).width) || el.offsetWidth


        // Calibrate each span's width to the canvas glyph widths. Writes and
        // reads are batched (write all → read all → write all …): interleaving
        // them per span forced a synchronous layout for every span on the page.
        type Measure = { el: HTMLElement; expectedWidth: number; restTransform: string; originalTransform: string; text: string; natural: number }
        const measurements: Measure[] = []
        // Write 1: strip scaleX so natural widths can be measured.
        for (let i = 0; i < allSpans.length && i < textItems.length; i++) {
          const el = allSpans[i] as HTMLElement
          const canvasWidth = textItems[i].width || 0
          const currentTransform = el.style.transform || ''
          if (canvasWidth <= 0 || !currentTransform.includes('scaleX(')) continue
          const restTransform = currentTransform.replace(/scaleX\([^)]+\)\s*/, '').trim()
          el.style.transform = restTransform || 'none'
          measurements.push({ el, expectedWidth: canvasWidth * scale, restTransform, originalTransform: currentTransform, text: el.textContent || '', natural: 0 })
        }
        // Read 1: natural widths → pure character width ratio from space-free spans.
        let charRatioSum = 0, charRatioCount = 0
        for (const m of measurements) {
          m.natural = getLocalWidth(m.el)
          if (m.natural > 0 && !m.text.includes(' ')) {
            charRatioSum += m.expectedWidth / m.natural
            charRatioCount++
          }
        }
        const charRatio = charRatioCount > 0 ? charRatioSum / charRatioCount : 1.0
        // Write 2: scaleX for characters (spans with spaces get the shared ratio).
        const spaced: Measure[] = []
        for (const m of measurements) {
          const prefix = m.restTransform ? m.restTransform + ' ' : ''
          if (m.text.includes(' ')) {
            m.el.style.transform = `${prefix}scaleX(${charRatio})`
            spaced.push(m)
          } else if (m.natural > 0) {
            m.el.style.transform = `${prefix}scaleX(${m.expectedWidth / m.natural})`
          } else {
            m.el.style.transform = m.originalTransform
          }
        }
        // Read 2 + write 3: word-spacing makes up the rest for spans with spaces.
        const scaledWidths = spaced.map(m => getLocalWidth(m.el))
        spaced.forEach((m, i) => {
          if (scaledWidths[i] > 0) {
            const spaceCount = (m.text.match(/ /g) || []).length
            m.el.style.wordSpacing = `${(m.expectedWidth / charRatio - scaledWidths[i]) / spaceCount}px`
          }
        })

        for (const el of textLayerEl.querySelectorAll('span, br')) {
          ;(el as HTMLElement).style.color = 'transparent'
        }
      }

      const chars: PdfChar[] = []
      const items = textContent.items as any[]
      for (const item of items) {
        if (Array.isArray(item.chars)) {
          for (const c of item.chars) {
            if (c?.rect) chars.push(c)
          }
        }
      }
      const [, , vbW, vbH] = (page as any).view as [number, number, number, number]
      pageInfoRef.current = { width: vbW, height: vbH, chars }
      onPageReady?.(pageNum, pageInfoRef.current)

      if (!cancelled) {
        renderedScaleRef.current = scale
        setReady(true)
      }
    }

    init().catch((err) => { if (!cancelled) console.error('[PdfPage] init error:', err) })

    return () => { cancelled = true; renderTask?.cancel(); textLayer?.cancel() }
  }, [pdfDoc, pageNum, scale])

  const handleAreaResized = useCallback(async (annId: string, newRect: { x: number; y: number; w: number; h: number }, imageData: string | undefined) => {
    const ann = annotations.find(a => a.id === annId)
    if (!ann) return
    const newPosition = { ...ann.position, rect: newRect, imageData }
    await api.annotations.update(annId, { position: newPosition })
    onAnnotationCreated?.()
  }, [annotations, onAnnotationCreated])

  const handlePointerUp = useCallback(() => {
    if (!onTextSelect) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return

    const text = sel.toString()
    const range = sel.getRangeAt(0)
    const clientRect = range.getBoundingClientRect()

    const container = containerRef.current
    const pageInfo = pageInfoRef.current
    const viewport = viewportRef.current
    if (!container || !pageInfo || !viewport || !pageInfo.chars.length) return

    const pageRect = container.getBoundingClientRect()
    if (clientRect.bottom < pageRect.top || clientRect.top > pageRect.bottom) return

    const screenToPdf = (sx: number, sy: number): [number, number] => {
      const xCss = sx - pageRect.left
      const yCss = sy - pageRect.top
      return (viewport as any).convertToPdfPoint(xCss, yCss)
    }

    const anchorPt = screenToPdf(clientRect.left, clientRect.top + clientRect.height / 2)
    const charStr = pageInfo.chars.map(c => c.c).join('')
    const target = text.trim()

    let startIdx = -1
    let endIdx = -1
    if (target) {
      const occurrences: number[] = []
      let from = 0
      while (true) {
        const i = charStr.indexOf(target, from)
        if (i < 0) break
        occurrences.push(i)
        from = i + 1
      }
      if (occurrences.length > 0) {
        let bestDist = Infinity
        let bestStart = occurrences[0]
        for (const occ of occurrences) {
          const r = pageInfo.chars[occ].rect
          const cx = (r[0] + r[2]) / 2
          const cy = (r[1] + r[3]) / 2
          const dx = cx - anchorPt[0]
          const dy = cy - anchorPt[1]
          const d = dx * dx + dy * dy
          if (d < bestDist) { bestDist = d; bestStart = occ }
        }
        startIdx = bestStart
        endIdx = bestStart + target.length - 1
      }
    }

    if (startIdx < 0 || endIdx < 0) {
      const headPt = screenToPdf(clientRect.right, clientRect.top + clientRect.height / 2)
      startIdx = findClosestCharIdx(pageInfo.chars, anchorPt[0], anchorPt[1])
      endIdx = findClosestCharIdx(pageInfo.chars, headPt[0], headPt[1])
      if (startIdx < 0 || endIdx < 0) return
      if (startIdx > endIdx) [startIdx, endIdx] = [endIdx, startIdx]
    }

    const slice = pageInfo.chars.slice(startIdx, endIdx + 1)
    const preciseText = slice.map(c => c.c).join('')

    const pageW = pageRect.width
    const pageH = pageRect.height
    const rects: Array<{ x: number; y: number; w: number; h: number }> = []
    const clientRects = range.getClientRects()
    for (let i = 0; i < clientRects.length; i++) {
      const cr = clientRects[i]
      if (cr.width === 0 || cr.height === 0) continue
      const midY = cr.top + cr.height / 2
      if (midY < pageRect.top || midY > pageRect.bottom) continue
      rects.push({
        x: (cr.left - pageRect.left) / pageW,
        y: (cr.top - pageRect.top) / pageH,
        w: cr.width / pageW,
        h: cr.height / pageH,
      })
    }

    if (rects.length > 0) {
      onTextSelect({ page: pageNum, rects, text: text, clientRect })
    }
  }, [onTextSelect, pageNum])

  return (
    <div
      ref={containerRef}
      data-page={pageNum}
      onPointerUp={handlePointerUp}
      style={{
        position: 'relative',
        width: baseSize.w,
        height: baseSize.h,
        margin: '0 auto',
        background: 'var(--surface-raised)',
        filter: einkMode ? EINK_FILTER : undefined,
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) rotate(${pageRotation}deg)`,
      }}>
      <div style={{ position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              visibility: ready ? 'visible' : 'hidden',
            }}
          />
          <div
            ref={textLayerRef}
            className="textLayer"
            style={{ visibility: ready ? 'visible' : 'hidden' }}
          />
      </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
        <HighlightLayer
          highlights={highlights}
          scale={scale}
          onHighlightClick={onHighlightClick}
          onContextMenu={onAnnotationContextMenu}
        />
        {annotations.filter(a => a.page === pageNum && a.position?.type === 'area').map(a => {
          const r = a.position.rect
          if (!r) return null
          return (
            <ResizableAreaOverlay
              key={a.id}
              id={a.id}
              rect={r}
              color={a.color}
              buildCaptureCanvas={buildCaptureCanvas}
              onResized={handleAreaResized}
              onContextMenu={onAnnotationContextMenu}
            />
          )
        })}
      </div>
      {searchHighlights && searchHighlights.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
          {searchHighlights.map((sh, i) =>
            sh.rects.map((r, j) => (
              <div key={`${i}-${j}`} style={{
                position: 'absolute',
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                background: sh.active ? 'rgba(255, 140, 0, 0.4)' : 'rgba(255, 255, 0, 0.3)',
                mixBlendMode: 'multiply',
              }} />
            ))
          )}
        </div>
      )}
      {docId && (
        <>
          <AreaSelectTool
            active={activeTool === 'area'}
            color={activeColor}
            pageNum={pageNum}
            docId={docId}
            buildCaptureCanvas={buildCaptureCanvas}
            onCreated={onAnnotationCreated || (() => {})}
          />
          <TextNoteTool
            active={activeTool === 'text'}
            color={activeColor}
            pageNum={pageNum}
            docId={docId}
            pointAnnotations={annotations.filter(a => a.page === pageNum && a.position?.type === 'point').map(a => ({
              id: a.id, page: pageNum, position: a.position, content: a.position?.content || null, color: a.color,
            }))}
            onCreated={onAnnotationCreated || (() => {})}
            onUpdated={onAnnotationUpdate || (() => {})}
            onContextMenu={onAnnotationContextMenu}
          />
          {activeTool !== 'lasso' && (
            <InkTool
              active={activeTool === 'ink'}
              eraserActive={inkEraserActive}
              color={activeColor}
              lineWidth={inkWidth}
              pageNum={pageNum}
              docId={docId}
              existingAnnotationId={annotations.find(a => a.page === pageNum && a.position?.type === 'ink')?.id ?? null}
              existingStrokes={annotations.filter(a => a.page === pageNum && a.position?.type === 'ink').flatMap(a => a.position?.strokes || [])}
              onCreated={onAnnotationCreated || (() => {})}
            />
          )}
          <InkLassoTool
            active={activeTool === 'lasso'}
            pageNum={pageNum}
            annotations={annotations}
            onUpdated={onAnnotationCreated || noop}
          />
          <EraserTool
            active={activeTool === 'eraser'}
            annotations={annotations.filter(a => a.page === pageNum).map(a => ({ ...a, type: a.position?.type || a.type }))}
            pageNum={pageNum}
            onDelete={onAnnotationDelete || (() => {})}
          />
        </>
      )}
      {eyeProtection && <div style={{
        position: 'absolute', inset: 0,
        background: EYE_PROTECTION_TINT,
        pointerEvents: 'none',
        zIndex: 10,
      }} />}
    </div>
  )
}
