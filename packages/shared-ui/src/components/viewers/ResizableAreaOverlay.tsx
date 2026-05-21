import React, { useState, useCallback, useRef, useEffect } from 'react'

interface Rect {
  x: number; y: number; w: number; h: number
}

interface Props {
  id: string
  rect: Rect
  color: string
  buildCaptureCanvas: () => HTMLCanvasElement | null
  onResized: (id: string, newRect: Rect, imageData: string | undefined) => void
  onContextMenu?: (e: React.MouseEvent, id: string) => void
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLE_SIZE = 8
const handles: { key: Handle; cursor: string; getPos: (r: Rect) => { left: string; top: string } }[] = [
  { key: 'nw', cursor: 'nwse-resize', getPos: r => ({ left: '0%', top: '0%' }) },
  { key: 'n', cursor: 'ns-resize', getPos: r => ({ left: '50%', top: '0%' }) },
  { key: 'ne', cursor: 'nesw-resize', getPos: r => ({ left: '100%', top: '0%' }) },
  { key: 'e', cursor: 'ew-resize', getPos: r => ({ left: '100%', top: '50%' }) },
  { key: 'se', cursor: 'nwse-resize', getPos: r => ({ left: '100%', top: '100%' }) },
  { key: 's', cursor: 'ns-resize', getPos: r => ({ left: '50%', top: '100%' }) },
  { key: 'sw', cursor: 'nesw-resize', getPos: r => ({ left: '0%', top: '100%' }) },
  { key: 'w', cursor: 'ew-resize', getPos: r => ({ left: '0%', top: '50%' }) },
]

function captureArea(canvas: HTMLCanvasElement | null, x: number, y: number, w: number, h: number): string | undefined {
  if (!canvas) return undefined
  const sx = Math.round(x * canvas.width)
  const sy = Math.round(y * canvas.height)
  const sw = Math.round(w * canvas.width)
  const sh = Math.round(h * canvas.height)
  if (sw <= 0 || sh <= 0) return undefined
  const offscreen = document.createElement('canvas')
  offscreen.width = sw
  offscreen.height = sh
  const ctx = offscreen.getContext('2d')!
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
  return offscreen.toDataURL('image/png')
}

export default function ResizableAreaOverlay({ id, rect, color, buildCaptureCanvas, onResized, onContextMenu }: Props) {
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState<Handle | null>(null)
  const [currentRect, setCurrentRect] = useState(rect)
  const currentRectRef = useRef(rect)
  const containerRef = useRef<HTMLDivElement>(null)
  const startMouseRef = useRef({ mx: 0, my: 0 })
  const startRectRef = useRef(rect)

  useEffect(() => {
    setCurrentRect(rect)
    currentRectRef.current = rect
  }, [rect.x, rect.y, rect.w, rect.h])

  const handlePointerDown = useCallback((e: React.PointerEvent, handle: Handle) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(handle)
    startMouseRef.current = { mx: e.clientX, my: e.clientY }
    startRectRef.current = { ...currentRect }
  }, [currentRect])

  useEffect(() => {
    if (!dragging) return
    const parent = containerRef.current?.parentElement
    if (!parent) return
    const parentRect = parent.getBoundingClientRect()

    const onMove = (e: PointerEvent) => {
      const dx = (e.clientX - startMouseRef.current.mx) / parentRect.width
      const dy = (e.clientY - startMouseRef.current.my) / parentRect.height
      const r = startRectRef.current
      let { x, y, w, h } = r

      if (dragging.includes('w')) { x = r.x + dx; w = r.w - dx }
      if (dragging.includes('e')) { w = r.w + dx }
      if (dragging.includes('n')) { y = r.y + dy; h = r.h - dy }
      if (dragging.includes('s')) { h = r.h + dy }

      if (w < 0.01) { w = 0.01 }
      if (h < 0.01) { h = 0.01 }
      x = Math.max(0, Math.min(x, 1 - w))
      y = Math.max(0, Math.min(y, 1 - h))

      const newRect = { x, y, w, h }
      setCurrentRect(newRect)
      currentRectRef.current = newRect
    }

    const onUp = () => {
      setDragging(null)
      const r = currentRectRef.current
      const canvas = buildCaptureCanvas()
      const imageData = captureArea(canvas, r.x, r.y, r.w, r.h)
      onResized(id, r, imageData)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, id, buildCaptureCanvas, onResized])

  const r = currentRect

  return (
    <div
      ref={containerRef}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => { if (!dragging) setHovered(false) }}
      onClick={(e) => { if (onContextMenu) { e.stopPropagation(); onContextMenu(e, id) } }}
      style={{
        position: 'absolute',
        left: `${r.x * 100}%`, top: `${r.y * 100}%`,
        width: `${r.w * 100}%`, height: `${r.h * 100}%`,
        border: `2px solid ${color}`,
        borderRadius: 2,
        background: `${color}15`,
        pointerEvents: 'auto',
        cursor: 'default',
        touchAction: 'none',
      }}
    >
      {(hovered || dragging) && handles.map(h => {
        const pos = h.getPos(r)
        return (
          <div
            key={h.key}
            onPointerDown={(e) => handlePointerDown(e, h.key)}
            style={{
              position: 'absolute',
              left: pos.left, top: pos.top,
              width: HANDLE_SIZE, height: HANDLE_SIZE,
              transform: 'translate(-50%, -50%)',
              background: '#fff',
              border: `1.5px solid ${color}`,
              borderRadius: 1,
              cursor: h.cursor,
              zIndex: 1,
            }}
          />
        )
      })}
    </div>
  )
}
