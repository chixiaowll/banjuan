import React, { useState, useCallback, useRef } from 'react'

interface Props {
  active: boolean
  color: string
  pageNum: number
  docId: string
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  onCreated: () => void
}

export default function AreaSelectTool({ active, color, pageNum, docId, canvasRef, onCreated }: Props) {
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const getRelativePos = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
  }

  const captureArea = (x: number, y: number, w: number, h: number): string | undefined => {
    const canvas = canvasRef.current
    if (!canvas) {
      console.warn('[AreaSelectTool] canvasRef is null, cannot capture')
      return undefined
    }
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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!active) return
    e.preventDefault()
    setStart(getRelativePos(e))
    setDragging(true)
  }, [active])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    setCurrent(getRelativePos(e))
  }, [dragging])

  const handleMouseUp = useCallback(async () => {
    if (!dragging || !start || !current) { setDragging(false); return }
    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const w = Math.abs(current.x - start.x)
    const h = Math.abs(current.y - start.y)
    if (w > 0.01 && h > 0.01) {
      const imageData = captureArea(x, y, w, h)
      await window.electronAPI.annotations.create({
        docId, type: 'area', page: pageNum,
        position: { type: 'area', page: pageNum, rect: { x, y, w, h }, imageData },
        color,
      })
      onCreated()
    }
    setDragging(false); setStart(null); setCurrent(null)
  }, [dragging, start, current, docId, pageNum, color, onCreated])

  return (
    <div ref={containerRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
      style={{ position: 'absolute', inset: 0, cursor: active ? 'crosshair' : 'default',
        pointerEvents: active ? 'auto' : 'none', zIndex: active ? 10 : -1 }}>
      {start && current && (
        <div style={{
          position: 'absolute',
          left: `${Math.min(start.x, current.x) * 100}%`, top: `${Math.min(start.y, current.y) * 100}%`,
          width: `${Math.abs(current.x - start.x) * 100}%`, height: `${Math.abs(current.y - start.y) * 100}%`,
          border: `2px dashed ${color}`, background: `${color}33`, pointerEvents: 'none',
        }} />
      )}
    </div>
  )
}
