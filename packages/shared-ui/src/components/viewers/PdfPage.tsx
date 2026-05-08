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
  highlights: Array<{ id: string; color: string; rects: Array<{ x: number; y: number; w: number; h: number }> }>
  scrollRoot?: HTMLElement | null
  onTextSelect?: (info: TextSelectInfo) => void
  onHighlightClick?: (id: string) => void
  searchHighlights?: Array<{ rects: Array<{ x: number; y: number; w: number; h: number }>; active: boolean }>
  onPageReady?: (pageNum: number, info: PageInfo) => void
  activeTool?: string
  activeColor?: string
  inkWidth?: number
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
  searchHighlights,
  onPageReady,
  activeTool = 'none',
  activeColor = '#fde68a',
  inkWidth = 2,
  docId = '',
  annotations = [],
  onAnnotationCreated,
  onAnnotationDelete,
  onAnnotationUpdate,
}: PdfPageProps) {
  const api = useBanjuanAPI()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const unmaskedCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const pageInfoRef = useRef<PageInfo | null>(null)
  const viewportRef = useRef<pdfjsLib.PageViewport | null>(null)
  const renderedScaleRef = useRef<number>(0)

  const [ready, setReady] = useState(false)

  // Render canvas + text layer + extract chars[] when mounted or scale changes.
  useEffect(() => {
    if (renderedScaleRef.current === scale && ready) return

    let cancelled = false
    setReady(false)

    const init = async () => {
      const page = await pdfDoc.getPage(pageNum)
      if (cancelled) return

      const viewport = page.getViewport({ scale })
      viewportRef.current = viewport

      const canvas = canvasRef.current
      const dpr = window.devicePixelRatio || 1
      let ctx: CanvasRenderingContext2D | null = null
      if (canvas) {
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = viewport.width + 'px'
        canvas.style.height = viewport.height + 'px'
        ctx = canvas.getContext('2d')!
        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] as [number, number, number, number, number, number] : undefined
        await page.render({ canvasContext: ctx, viewport, transform }).promise.catch(() => {})
      }
      if (cancelled) return

      const textContent = await page.getTextContent()
      if (cancelled) return
      const textLayerEl = textLayerRef.current
      if (textLayerEl) {
        textLayerEl.innerHTML = ''
        textLayerEl.style.setProperty('--total-scale-factor', String(scale))
        textLayerEl.style.setProperty('--scale-factor', String(scale))
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerEl,
          viewport,
        })
        await textLayer.render()
        const textDivs = (textLayer as any).textDivs as HTMLElement[] | undefined
        if (textDivs) {
          const items = textContent.items as any[]
          for (let i = 0; i < textDivs.length && i < items.length; i++) {
            const span = textDivs[i]
            const fontName = items[i]?.fontName
            if (span && fontName) {
              const existing = span.style.fontFamily || 'serif'
              span.style.fontFamily = `"${fontName}", ${existing}`
            }
          }
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

      // Save unmasked canvas for area capture
      if (canvas) {
        const uc = document.createElement('canvas')
        uc.width = canvas.width
        uc.height = canvas.height
        uc.getContext('2d')!.drawImage(canvas, 0, 0)
        unmaskedCanvasRef.current = uc
      }

      // Mask canvas text by line.
      if (ctx && chars.length > 0) {
        type Line = { x1: number; y1: number; x2: number; y2: number }
        const lines: Line[] = []
        let cur: Line | null = null
        for (const ch of chars) {
          const [a, b, c, d] = ch.rect
          const x1 = Math.min(a, c), x2 = Math.max(a, c)
          const y1 = Math.min(b, d), y2 = Math.max(b, d)
          if (!cur) { cur = { x1, y1, x2, y2 }; continue }
          const curMid = (cur.y1 + cur.y2) / 2
          const charMid = (y1 + y2) / 2
          const tol = (cur.y2 - cur.y1) * 0.6
          if (Math.abs(curMid - charMid) <= tol) {
            cur.x1 = Math.min(cur.x1, x1)
            cur.x2 = Math.max(cur.x2, x2)
            cur.y1 = Math.min(cur.y1, y1)
            cur.y2 = Math.max(cur.y2, y2)
          } else {
            lines.push(cur)
            cur = { x1, y1, x2, y2 }
          }
        }
        if (cur) lines.push(cur)

        ctx.save()
        ctx.fillStyle = '#ffffff'
        for (const ln of lines) {
          const [a, b] = viewport.convertToViewportPoint(ln.x1, ln.y1)
          const [c, d] = viewport.convertToViewportPoint(ln.x2, ln.y2)
          const left = Math.min(a, c) * dpr
          const top = Math.min(b, d) * dpr
          const w = Math.abs(c - a) * dpr
          const h = Math.abs(d - b) * dpr
          const padY = h * 0.3
          const padX = 1
          ctx.fillRect(left - padX, top - padY, w + padX * 2, h + padY * 2)
        }
        ctx.restore()
      }

      if (!cancelled) {
        renderedScaleRef.current = scale
        setReady(true)
      }
    }

    init().catch((err) => console.error('[PdfPage] init error:', err))

    return () => { cancelled = true }
  }, [pdfDoc, pageNum, scale])

  const handleAreaResized = useCallback(async (annId: string, newRect: { x: number; y: number; w: number; h: number }, imageData: string | undefined) => {
    const ann = annotations.find(a => a.id === annId)
    if (!ann) return
    const newPosition = { ...ann.position, rect: newRect, imageData }
    await api.annotations.update(annId, { position: newPosition })
    onAnnotationCreated?.()
  }, [annotations, onAnnotationCreated])

  const handleMouseUp = useCallback(() => {
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
      onMouseUp={handleMouseUp}
      style={{
        position: 'relative',
        width: baseSize.w,
        height: baseSize.h,
        margin: '0 auto',
        background: '#fff',
      }}
    >
      <>
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              position: 'absolute',
              top: 0,
              left: 0,
              visibility: ready ? 'visible' : 'hidden',
            }}
          />
          <div
            ref={textLayerRef}
            className="textLayer"
            style={{ visibility: ready ? 'visible' : 'hidden' }}
          />
      </>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
        <HighlightLayer
          highlights={highlights}
          scale={scale}
          onHighlightClick={onHighlightClick}
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
              canvasRef={unmaskedCanvasRef}
              onResized={handleAreaResized}
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
            canvasRef={unmaskedCanvasRef}
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
          />
          {activeTool !== 'lasso' && (
            <InkTool
              active={activeTool === 'ink'}
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
            docId={docId}
            existingAnnotationId={annotations.find(a => a.page === pageNum && a.position?.type === 'ink')?.id ?? null}
            existingStrokes={annotations.filter(a => a.page === pageNum && a.position?.type === 'ink').flatMap(a => a.position?.strokes || [])}
            onUpdated={onAnnotationCreated || (() => {})}
          />
          <EraserTool
            active={activeTool === 'eraser'}
            annotations={annotations.filter(a => a.page === pageNum).map(a => ({ ...a, type: a.position?.type || a.type }))}
            pageNum={pageNum}
            onDelete={onAnnotationDelete || (() => {})}
          />
        </>
      )}
    </div>
  )
}
