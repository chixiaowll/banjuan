import React, { useRef, useEffect, useState, useCallback } from 'react'

interface Stroke {
  points: Array<{ x: number; y: number }>
  color: string
  width: number
}

interface Props {
  active: boolean
  color: string
  lineWidth: number
  pageNum: number
  docId: string
  existingStrokes: Stroke[]
  onCreated: () => void
}

export default function InkTool({ active, color, lineWidth, pageNum, docId, existingStrokes, onCreated }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [drawing, setDrawing] = useState(false)
  const currentStroke = useRef<Array<{ x: number; y: number }>>([])

  const getRelativePos = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const stroke of existingStrokes) {
      if (stroke.points.length < 2) continue
      ctx.beginPath()
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height)
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height)
      }
      ctx.stroke()
    }
  }, [existingStrokes])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!active) return
    e.preventDefault()
    setDrawing(true)
    currentStroke.current = [getRelativePos(e)]
  }, [active])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing) return
    const pos = getRelativePos(e)
    currentStroke.current.push(pos)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const pts = currentStroke.current
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    const prev = pts[pts.length - 2]
    const cur = pts[pts.length - 1]
    ctx.moveTo(prev.x * canvas.width, prev.y * canvas.height)
    ctx.lineTo(cur.x * canvas.width, cur.y * canvas.height)
    ctx.stroke()
  }, [drawing, color, lineWidth])

  const handleMouseUp = useCallback(async () => {
    if (!drawing) return
    setDrawing(false)
    const points = currentStroke.current
    if (points.length < 2) return
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const bounds = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    await window.electronAPI.annotations.create({
      docId, type: 'ink', page: pageNum,
      position: { type: 'ink', page: pageNum, strokes: [{ points, color, width: lineWidth }], bounds }, color,
    })
    currentStroke.current = []
    onCreated()
  }, [drawing, docId, pageNum, color, lineWidth, onCreated])

  return (
    <div ref={containerRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
      style={{ position: 'absolute', inset: 0, cursor: active ? 'crosshair' : 'default',
        pointerEvents: active ? 'auto' : 'none', zIndex: active ? 10 : -1 }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
    </div>
  )
}
