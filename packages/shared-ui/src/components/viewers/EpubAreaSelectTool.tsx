import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useEpubViewer } from './EpubViewerContext.js'
import { useBanjuanAPI } from '../../api.js'

interface Props {
  docId: string
  containerRef: React.RefObject<HTMLDivElement | null>
  onCreated: () => void
}

function getScale(el: HTMLElement): number {
  const rect = el.getBoundingClientRect()
  const logical = el.clientWidth
  if (!logical) return 1
  return rect.width / logical
}

function captureIframeArea(
  container: HTMLElement,
  rx: number, ry: number, rw: number, rh: number,
): string | undefined {
  const iframe = container.querySelector('iframe') as HTMLIFrameElement | null
  if (!iframe?.contentDocument || !iframe.contentWindow) return undefined
  const iframeDoc = iframe.contentDocument
  const iframeWin = iframe.contentWindow

  const logicalW = container.clientWidth
  const sc = container.querySelector('.epub-container') as HTMLElement | null
  const scrollTop = sc?.scrollTop || 0
  const scale = getScale(container)

  const selectLeft = rx * logicalW
  const selectTop = ry
  const selectW = rw * logicalW
  const selectH = rh
  if (selectW <= 0 || selectH <= 0) return undefined

  const iframeRect = iframe.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const iframeOffsetX = (iframeRect.left - containerRect.left) / scale
  const iframeOffsetY = (iframeRect.top - containerRect.top) / scale

  const dpr = window.devicePixelRatio || 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(selectW * dpr)
  canvas.height = Math.round(selectH * dpr)
  const c = canvas.getContext('2d')!
  c.scale(dpr, dpr)
  c.fillStyle = '#fff'
  c.fillRect(0, 0, selectW, selectH)

  const drawNode = (node: Element) => {
    const style = iframeWin!.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return

    const r = node.getBoundingClientRect()
    const dx = iframeOffsetX + r.left - selectLeft
    const dy = iframeOffsetY + r.top + scrollTop - selectTop
    const dw = r.width
    const dh = r.height

    const bg = style.backgroundColor
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      c.fillStyle = bg
      c.fillRect(dx, dy, dw, dh)
    }

    const tag = node.tagName.toLowerCase()
    if (tag === 'img') {
      const img = node as HTMLImageElement
      if (img.complete && img.naturalWidth > 0) {
        try { c.drawImage(img, dx, dy, dw, dh) } catch {}
      }
      return
    }
    if (tag === 'svg' || tag === 'canvas') return

    for (const child of node.childNodes) {
      if (child.nodeType === 1) {
        drawNode(child as Element)
      } else if (child.nodeType === 3 && child.textContent?.trim()) {
        const parent = child.parentElement!
        const ps = iframeWin!.getComputedStyle(parent)
        const fontSize = parseFloat(ps.fontSize)
        c.font = `${ps.fontStyle} ${ps.fontWeight} ${fontSize}px ${ps.fontFamily}`
        c.fillStyle = ps.color
        c.textBaseline = 'top'

        const range = iframeDoc!.createRange()
        const text = child.textContent!
        for (let ci = 0; ci < text.length; ci++) {
          range.setStart(child, ci)
          range.setEnd(child, ci + 1)
          const rects = range.getClientRects()
          for (const cr of rects) {
            const cx = iframeOffsetX + cr.left - selectLeft
            const cy = iframeOffsetY + cr.top + scrollTop - selectTop
            if (cx + cr.width < 0 || cx > selectW || cy + cr.height < 0 || cy > selectH) continue
            c.fillText(text[ci], cx, cy)
          }
        }
      }
    }
  }

  const body = iframeDoc.body || iframeDoc.documentElement
  drawNode(body)

  return canvas.toDataURL('image/png')
}

export default function EpubAreaSelectTool({ docId, containerRef, onCreated }: Props) {
  const api = useBanjuanAPI()
  const ctx = useEpubViewer()
  const active = ctx.activeTool === 'area'
  const divRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)

  const toDocCoord = useCallback((e: React.PointerEvent): { x: number; y: number } => {
    const container = containerRef.current!
    const rect = container.getBoundingClientRect()
    const scale = getScale(container)
    const sc = container.querySelector('.epub-container') as HTMLElement | null
    const scrollTop = sc?.scrollTop || 0
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / scale + scrollTop,
    }
  }, [containerRef])

  useEffect(() => {
    const el = divRef.current
    const container = containerRef.current
    if (!el || !container || !active) return
    const sc = container.querySelector('.epub-container') as HTMLElement | null
    if (!sc) return
    const handleWheel = (e: WheelEvent) => {
      const scale = getScale(container)
      sc.scrollBy({ top: e.deltaY / scale })
      e.preventDefault()
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [active, containerRef])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!active || e.pointerType === 'touch') return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const pos = toDocCoord(e)
    setStart(pos)
    setCurrent(pos)
    setDragging(true)
  }, [active, toDocCoord])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return
    setCurrent(toDocCoord(e))
  }, [dragging, toDocCoord])

  const handlePointerUp = useCallback(async () => {
    if (!dragging || !start || !current) { setDragging(false); return }
    const container = containerRef.current
    if (!container) { setDragging(false); return }

    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const w = Math.abs(current.x - start.x)
    const h = Math.abs(current.y - start.y)

    if (w > 0.01 && h > 5) {
      const imageData = captureIframeArea(container, x, y, w, h)
      await api.annotations.create({
        docId,
        type: 'area',
        position: { type: 'area' as const, rect: { x, y, w, h }, imageData } as any,
        color: ctx.activeColor,
      })
      onCreated()
    }

    setDragging(false)
    setStart(null)
    setCurrent(null)
  }, [dragging, start, current, docId, ctx.activeColor, containerRef, onCreated])

  if (!active) return null

  const container = containerRef.current
  const sc = container?.querySelector('.epub-container') as HTMLElement | null
  const scrollTop = sc?.scrollTop || 0

  let selBox: React.CSSProperties | null = null
  if (start && current) {
    const sx = Math.min(start.x, current.x)
    const sy = Math.min(start.y, current.y)
    const sw = Math.abs(current.x - start.x)
    const sh = Math.abs(current.y - start.y)
    selBox = {
      position: 'absolute',
      left: `${sx * 100}%`,
      top: sy - scrollTop,
      width: `${sw * 100}%`,
      height: sh,
      border: `2px dashed ${ctx.activeColor}`,
      background: `${ctx.activeColor}33`,
      pointerEvents: 'none',
    }
  }

  return (
    <div
      ref={divRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
        pointerEvents: 'auto',
        zIndex: 10,
        touchAction: 'none',
      }}
    >
      {selBox && <div style={selBox} />}
    </div>
  )
}
