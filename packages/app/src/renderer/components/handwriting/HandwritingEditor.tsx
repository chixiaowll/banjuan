import React, { useRef, useEffect, useCallback, useState } from 'react'
import TemplateRenderer from './TemplateRenderer.js'
import HandwritingToolbar from './HandwritingToolbar.js'
import { renderStroke, renderAllStrokes, generateThumbnailDataUrl } from './renderStrokes.js'
import type { HandwritingTemplate, CanvasSnapshot, Stroke, StrokePoint } from '@banjuan/core'

interface Props {
  pageId: string
  snapshot: CanvasSnapshot
  template: HandwritingTemplate
  pageWidth: number
  pageHeight: number
  onSnapshotChange: (snapshot: CanvasSnapshot) => void
  onThumbnailGenerated: (dataUrl: string) => void
}

export type DrawingTool = 'pen' | 'highlighter' | 'eraser' | 'lasso'

export interface ToolState {
  tool: DrawingTool
  color: string
  width: number
}

export interface ToolPreset {
  tool: 'pen' | 'highlighter'
  color: string
  width: number
}

const DEFAULT_PRESETS: ToolPreset[] = [
  { tool: 'pen', color: '#1a1a1a', width: 4 },
  { tool: 'pen', color: '#3182ce', width: 2 },
  { tool: 'highlighter', color: '#d69e2e', width: 8 },
]

const ZOOM_MIN = 0.25
const ZOOM_MAX = 5
const ZOOM_STEP = 1.12
const SEL_MARGIN = 12

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

function findStrokeAtPoint(strokes: Stroke[], point: StrokePoint, threshold: number): number {
  for (let i = strokes.length - 1; i >= 0; i--) {
    for (const p of strokes[i].points) {
      const dx = p.x - point.x
      const dy = p.y - point.y
      if (dx * dx + dy * dy < threshold * threshold) return i
    }
  }
  return -1
}

function isPointInPolygon(px: number, py: number, polygon: StrokePoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

function getStrokesBounds(strokes: Stroke[], indices: Set<number>): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const i of indices) {
    if (i >= strokes.length) continue
    for (const p of strokes[i].points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (minX === Infinity) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function isPointInRect(px: number, py: number, r: { x: number; y: number; w: number; h: number }, margin: number): boolean {
  return px >= r.x - margin && px <= r.x + r.w + margin && py >= r.y - margin && py <= r.y + r.h + margin
}

export default function HandwritingEditor({
  pageId, snapshot, template, pageWidth, pageHeight, onSnapshotChange, onThumbnailGenerated,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const strokesRef = useRef<Stroke[]>(snapshot.strokes ?? [])
  const currentPointsRef = useRef<StrokePoint[]>([])
  const isDrawingRef = useRef(false)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ cx: 0, cy: 0, px: 0, py: 0 })
  const spaceHeldRef = useRef(false)

  // Lasso / selection state
  const selectedIndicesRef = useRef<Set<number>>(new Set())
  const lassoPointsRef = useRef<StrokePoint[]>([])
  const isDraggingSelRef = useRef(false)
  const selDragStartRef = useRef({ x: 0, y: 0 })
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const selBoundsRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const [hasSelection, setHasSelection] = useState(false)

  const [toolState, setToolState] = useState<ToolState>({ tool: 'pen', color: '#1a1a1a', width: 4 })
  const [presets, setPresets] = useState<ToolPreset[]>(() => DEFAULT_PRESETS.map(p => ({ ...p })))
  const [activePresetIndex, setActivePresetIndex] = useState(0)
  const [undoStack, setUndoStack] = useState<Stroke[][]>([snapshot.strokes ?? []])
  const [undoIndex, setUndoIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [cursorVisible, setCursorVisible] = useState(false)

  const undoStackRef = useRef(undoStack)
  undoStackRef.current = undoStack
  const undoIndexRef = useRef(undoIndex)
  undoIndexRef.current = undoIndex
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const panRef = useRef(panOffset)
  panRef.current = panOffset
  const toolRef = useRef(toolState)
  toolRef.current = toolState

  // --- Redraw (plain, no selection overlay) ---
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = pageWidth * dpr
    canvas.height = pageHeight * dpr
    ctx.scale(dpr, dpr)
    renderAllStrokes(ctx, strokesRef.current, pageWidth, pageHeight)
  }, [pageWidth, pageHeight])

  // --- Redraw with selection overlays ---
  const redrawWithSelection = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = pageWidth * dpr
    canvas.height = pageHeight * dpr
    ctx.scale(dpr, dpr)

    const selected = selectedIndicesRef.current
    const offset = dragOffsetRef.current

    for (let i = 0; i < strokesRef.current.length; i++) {
      if (selected.has(i)) {
        ctx.save()
        ctx.translate(offset.x, offset.y)
        renderStroke(ctx, strokesRef.current[i])
        ctx.restore()
      } else {
        renderStroke(ctx, strokesRef.current[i])
      }
    }

    // Draw lasso path while drawing
    const lassoP = lassoPointsRef.current
    if (lassoP.length > 2) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(lassoP[0].x, lassoP[0].y)
      for (let i = 1; i < lassoP.length; i++) {
        ctx.lineTo(lassoP[i].x, lassoP[i].y)
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(49,130,206,0.06)'
      ctx.fill()
      ctx.setLineDash([5, 3])
      ctx.strokeStyle = '#3182ce'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
    }

    // Draw selection bounding box
    const bounds = selBoundsRef.current
    if (selected.size > 0 && bounds) {
      ctx.save()
      ctx.setLineDash([6, 3])
      ctx.strokeStyle = '#3182ce'
      ctx.lineWidth = 1.5
      ctx.strokeRect(
        bounds.x - SEL_MARGIN + offset.x,
        bounds.y - SEL_MARGIN + offset.y,
        bounds.w + SEL_MARGIN * 2,
        bounds.h + SEL_MARGIN * 2,
      )
      // Corner handles
      const corners = [
        [bounds.x - SEL_MARGIN + offset.x, bounds.y - SEL_MARGIN + offset.y],
        [bounds.x + bounds.w + SEL_MARGIN + offset.x, bounds.y - SEL_MARGIN + offset.y],
        [bounds.x - SEL_MARGIN + offset.x, bounds.y + bounds.h + SEL_MARGIN + offset.y],
        [bounds.x + bounds.w + SEL_MARGIN + offset.x, bounds.y + bounds.h + SEL_MARGIN + offset.y],
      ]
      ctx.setLineDash([])
      ctx.fillStyle = 'white'
      ctx.strokeStyle = '#3182ce'
      ctx.lineWidth = 1.5
      for (const [cx, cy] of corners) {
        ctx.beginPath()
        ctx.arc(cx, cy, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }
  }, [pageWidth, pageHeight])

  useEffect(() => { redraw() }, [redraw])

  // --- Fit to viewport ---
  const fitToViewport = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    const pad = 48
    const vw = vp.clientWidth - pad
    const vh = vp.clientHeight - pad
    if (vw <= 0 || vh <= 0) return
    const fit = Math.min(vw / pageWidth, vh / pageHeight, 2)
    setZoom(fit)
    setPanOffset({
      x: (vp.clientWidth - pageWidth * fit) / 2,
      y: (vp.clientHeight - pageHeight * fit) / 2,
    })
  }, [pageWidth, pageHeight])

  // --- Page change ---
  useEffect(() => {
    strokesRef.current = snapshot.strokes ?? []
    setUndoStack([snapshot.strokes ?? []])
    setUndoIndex(0)
    clearSelection()
    redraw()
    requestAnimationFrame(() => {
      fitToViewport()
      generateThumbnail()
    })
  }, [pageId])

  // --- Refit on viewport resize ---
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const observer = new ResizeObserver(() => fitToViewport())
    observer.observe(vp)
    return () => observer.disconnect()
  }, [fitToViewport])

  // --- Thumbnail ---
  const generateThumbnail = useCallback(() => {
    const url = generateThumbnailDataUrl(strokesRef.current, pageWidth, pageHeight)
    if (url) onThumbnailGenerated(url)
  }, [onThumbnailGenerated, pageWidth, pageHeight])

  // --- Push snapshot ---
  const pushSnapshot = useCallback(() => {
    const strokes = [...strokesRef.current]
    onSnapshotChange({ strokes })
    const idx = undoIndexRef.current
    setUndoStack(prev => [...prev.slice(0, idx + 1), strokes])
    setUndoIndex(idx + 1)
    generateThumbnail()
  }, [onSnapshotChange, generateThumbnail])

  // --- Canvas coordinate from pointer ---
  const getCanvasPoint = useCallback((e: React.PointerEvent): StrokePoint => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = pageWidth / rect.width
    const scaleY = pageHeight / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      pressure: e.pressure > 0 ? e.pressure : undefined,
    }
  }, [pageWidth, pageHeight])

  // --- Cursor overlay ---
  const updateCursor = useCallback((clientX: number, clientY: number) => {
    const el = cursorRef.current
    const vp = viewportRef.current
    if (!el || !vp) return
    const rect = vp.getBoundingClientRect()
    el.style.left = `${clientX - rect.left}px`
    el.style.top = `${clientY - rect.top}px`

    const tool = toolRef.current
    const z = zoomRef.current
    let size: number
    if (tool.tool === 'eraser') {
      size = tool.width * 4 * z
    } else if (tool.tool === 'highlighter') {
      size = tool.width * 3 * z
    } else {
      size = tool.width * z
    }
    size = Math.max(4, size)
    el.style.width = `${size}px`
    el.style.height = `${size}px`
  }, [])

  // --- Selection helpers ---
  const clearSelection = useCallback(() => {
    selectedIndicesRef.current = new Set()
    lassoPointsRef.current = []
    dragOffsetRef.current = { x: 0, y: 0 }
    selBoundsRef.current = null
    isDraggingSelRef.current = false
    setHasSelection(false)
  }, [])

  const applyDragOffset = useCallback(() => {
    const offset = dragOffsetRef.current
    if (offset.x === 0 && offset.y === 0) return
    const newStrokes = [...strokesRef.current]
    for (const i of selectedIndicesRef.current) {
      const s = newStrokes[i]
      if (!s) continue
      newStrokes[i] = {
        ...s,
        points: s.points.map(p => ({ ...p, x: p.x + offset.x, y: p.y + offset.y })),
      }
    }
    strokesRef.current = newStrokes
    dragOffsetRef.current = { x: 0, y: 0 }
    selBoundsRef.current = getStrokesBounds(strokesRef.current, selectedIndicesRef.current)
    redrawWithSelection()
    pushSnapshot()
  }, [redrawWithSelection, pushSnapshot])

  const selectStrokesInLasso = useCallback(() => {
    const lasso = lassoPointsRef.current
    if (lasso.length < 3) {
      lassoPointsRef.current = []
      redraw()
      return
    }
    const indices = new Set<number>()
    for (let i = 0; i < strokesRef.current.length; i++) {
      const stroke = strokesRef.current[i]
      const hit = stroke.points.some(p => isPointInPolygon(p.x, p.y, lasso))
      if (hit) indices.add(i)
    }
    lassoPointsRef.current = []

    if (indices.size === 0) {
      redraw()
      return
    }
    selectedIndicesRef.current = indices
    selBoundsRef.current = getStrokesBounds(strokesRef.current, indices)
    setHasSelection(true)
    redrawWithSelection()
  }, [redraw, redrawWithSelection])

  // Clear selection when switching away from lasso
  useEffect(() => {
    if (toolState.tool !== 'lasso' && selectedIndicesRef.current.size > 0) {
      clearSelection()
      redraw()
    }
  }, [toolState.tool, clearSelection, redraw])

  // --- Undo / Redo ---
  const handleUndo = useCallback(() => {
    const idx = undoIndexRef.current
    if (idx <= 0) return
    const newIdx = idx - 1
    strokesRef.current = [...undoStackRef.current[newIdx]]
    setUndoIndex(newIdx)
    clearSelection()
    redraw()
    onSnapshotChange({ strokes: strokesRef.current })
    generateThumbnail()
  }, [redraw, onSnapshotChange, generateThumbnail, clearSelection])

  const handleRedo = useCallback(() => {
    const idx = undoIndexRef.current
    const stack = undoStackRef.current
    if (idx >= stack.length - 1) return
    const newIdx = idx + 1
    strokesRef.current = [...stack[newIdx]]
    setUndoIndex(newIdx)
    clearSelection()
    redraw()
    onSnapshotChange({ strokes: strokesRef.current })
    generateThumbnail()
  }, [redraw, onSnapshotChange, generateThumbnail, clearSelection])

  // --- Clear page ---
  const handleClearPage = useCallback(() => {
    if (strokesRef.current.length === 0) return
    strokesRef.current = []
    clearSelection()
    redraw()
    pushSnapshot()
  }, [redraw, pushSnapshot, clearSelection])

  // --- Zoom controls ---
  const handleZoomIn = useCallback(() => {
    setZoom(z => {
      const nz = clampZoom(z * ZOOM_STEP)
      const vp = viewportRef.current
      if (vp) {
        const cx = vp.clientWidth / 2
        const cy = vp.clientHeight / 2
        setPanOffset(p => ({
          x: cx - (cx - p.x) * (nz / z),
          y: cy - (cy - p.y) * (nz / z),
        }))
      }
      return nz
    })
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(z => {
      const nz = clampZoom(z / ZOOM_STEP)
      const vp = viewportRef.current
      if (vp) {
        const cx = vp.clientWidth / 2
        const cy = vp.clientHeight / 2
        setPanOffset(p => ({
          x: cx - (cx - p.x) * (nz / z),
          y: cy - (cy - p.y) * (nz / z),
        }))
      }
      return nz
    })
  }, [])

  // --- Preset management ---
  const handleSelectPreset = useCallback((index: number) => {
    setActivePresetIndex(index)
    setPresets(prev => {
      const p = prev[index]
      setToolState({ tool: p.tool, color: p.color, width: p.width })
      return prev
    })
  }, [])

  const handleToolStateChange = useCallback((newState: ToolState) => {
    setToolState(newState)
    if (newState.tool !== 'eraser' && newState.tool !== 'lasso') {
      setPresets(prev => {
        const updated = [...prev]
        updated[activePresetIndex] = {
          tool: newState.tool as 'pen' | 'highlighter',
          color: newState.color,
          width: newState.width,
        }
        return updated
      })
    }
  }, [activePresetIndex])

  // --- Pointer handlers ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return

    // Pan mode: space held or middle button
    if (spaceHeldRef.current || e.button === 1) {
      e.preventDefault()
      isPanningRef.current = true
      panStartRef.current = {
        cx: e.clientX, cy: e.clientY,
        px: panRef.current.x, py: panRef.current.y,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    const tool = toolRef.current

    // --- Lasso tool ---
    if (tool.tool === 'lasso') {
      const point = getCanvasPoint(e)

      // Click inside existing selection → start drag
      if (selectedIndicesRef.current.size > 0 && selBoundsRef.current) {
        if (isPointInRect(point.x, point.y, selBoundsRef.current, SEL_MARGIN)) {
          isDraggingSelRef.current = true
          selDragStartRef.current = { x: point.x, y: point.y }
          return
        }
      }

      // Click outside → clear and start new lasso
      clearSelection()
      isDrawingRef.current = true
      lassoPointsRef.current = [point]
      return
    }

    // --- Eraser ---
    if (tool.tool === 'eraser') {
      isDrawingRef.current = true
      const point = getCanvasPoint(e)
      const hitIndex = findStrokeAtPoint(strokesRef.current, point, tool.width * 2)
      if (hitIndex >= 0) {
        strokesRef.current = strokesRef.current.filter((_, i) => i !== hitIndex)
        redraw()
        pushSnapshot()
      }
      return
    }

    // --- Pen / Highlighter ---
    isDrawingRef.current = true
    currentPointsRef.current = [getCanvasPoint(e)]
  }, [getCanvasPoint, redraw, pushSnapshot, clearSelection])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    updateCursor(e.clientX, e.clientY)

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.cx
      const dy = e.clientY - panStartRef.current.cy
      setPanOffset({
        x: panStartRef.current.px + dx,
        y: panStartRef.current.py + dy,
      })
      return
    }

    const tool = toolRef.current

    // --- Lasso: dragging selection ---
    if (tool.tool === 'lasso' && isDraggingSelRef.current) {
      const point = getCanvasPoint(e)
      dragOffsetRef.current = {
        x: point.x - selDragStartRef.current.x,
        y: point.y - selDragStartRef.current.y,
      }
      redrawWithSelection()
      return
    }

    // --- Lasso: drawing lasso path ---
    if (tool.tool === 'lasso' && isDrawingRef.current) {
      lassoPointsRef.current.push(getCanvasPoint(e))
      redrawWithSelection()
      return
    }

    if (!isDrawingRef.current) return

    // --- Eraser ---
    if (tool.tool === 'eraser') {
      const point = getCanvasPoint(e)
      const hitIndex = findStrokeAtPoint(strokesRef.current, point, tool.width * 2)
      if (hitIndex >= 0) {
        strokesRef.current = strokesRef.current.filter((_, i) => i !== hitIndex)
        redraw()
        pushSnapshot()
      }
      return
    }

    // --- Pen / Highlighter: live stroke ---
    currentPointsRef.current.push(getCanvasPoint(e))

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = pageWidth * dpr
    canvas.height = pageHeight * dpr
    ctx.scale(dpr, dpr)
    renderAllStrokes(ctx, strokesRef.current, pageWidth, pageHeight)

    const opacity = tool.tool === 'highlighter' ? 0.3 : 1
    const tempStroke: Stroke = {
      id: '',
      points: currentPointsRef.current,
      color: tool.color,
      width: tool.tool === 'highlighter' ? tool.width * 3 : tool.width,
      opacity,
    }
    renderStroke(ctx, tempStroke)
  }, [getCanvasPoint, pageWidth, pageHeight, redraw, redrawWithSelection, pushSnapshot, updateCursor])

  const handlePointerUp = useCallback((_e: React.PointerEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false
      return
    }

    const tool = toolRef.current

    // --- Lasso: finish drag ---
    if (tool.tool === 'lasso' && isDraggingSelRef.current) {
      isDraggingSelRef.current = false
      applyDragOffset()
      return
    }

    // --- Lasso: finish drawing → select strokes ---
    if (tool.tool === 'lasso' && isDrawingRef.current) {
      isDrawingRef.current = false
      selectStrokesInLasso()
      return
    }

    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    if (tool.tool === 'eraser') return
    if (currentPointsRef.current.length === 0) return

    const opacity = tool.tool === 'highlighter' ? 0.3 : 1
    const newStroke: Stroke = {
      id: crypto.randomUUID(),
      points: currentPointsRef.current,
      color: tool.color,
      width: tool.tool === 'highlighter' ? tool.width * 3 : tool.width,
      opacity,
    }
    strokesRef.current = [...strokesRef.current, newStroke]
    currentPointsRef.current = []
    redraw()
    pushSnapshot()
  }, [redraw, pushSnapshot, applyDragOffset, selectStrokesInLasso])

  const handlePointerLeave = useCallback((_e: React.PointerEvent) => {
    const tool = toolRef.current
    if (tool.tool === 'lasso' && (isDrawingRef.current || isDraggingSelRef.current)) return
    handlePointerUp(_e)
  }, [handlePointerUp])

  // --- Wheel zoom ---
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const rect = vp.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        const oldZ = zoomRef.current
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
        const nz = clampZoom(oldZ * factor)
        setZoom(nz)
        setPanOffset({
          x: cx - (cx - panRef.current.x) * (nz / oldZ),
          y: cy - (cy - panRef.current.y) * (nz / oldZ),
        })
      }
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [])

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        spaceHeldRef.current = true
        return
      }
      if (e.code === 'Escape') {
        clearSelection()
        redraw()
        return
      }
      // Delete selected strokes
      if ((e.code === 'Backspace' || e.code === 'Delete') && selectedIndicesRef.current.size > 0) {
        e.preventDefault()
        strokesRef.current = strokesRef.current.filter((_, i) => !selectedIndicesRef.current.has(i))
        clearSelection()
        redraw()
        pushSnapshot()
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); return }
      if (mod && e.key === '0') { e.preventDefault(); fitToViewport(); return }
      if (mod && e.key === '=') { e.preventDefault(); handleZoomIn(); return }
      if (mod && e.key === '-') { e.preventDefault(); handleZoomOut(); return }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeldRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [handleUndo, handleRedo, fitToViewport, handleZoomIn, handleZoomOut, clearSelection, redraw, pushSnapshot])

  // --- Cursor style ---
  const getCursorStyle = (): string => {
    if (spaceHeldRef.current || isPanningRef.current) return 'grab'
    if (toolState.tool === 'lasso') {
      if (hasSelection) return 'default'
      return 'crosshair'
    }
    if (toolState.tool === 'eraser') return 'none'
    return 'none'
  }

  const showBrushCursor = cursorVisible && toolState.tool !== 'lasso'

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <HandwritingToolbar
        toolState={toolState}
        onToolStateChange={handleToolStateChange}
        presets={presets}
        activePresetIndex={activePresetIndex}
        onSelectPreset={handleSelectPreset}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoIndex > 0}
        canRedo={undoIndex < undoStack.length - 1}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomFit={fitToViewport}
        onClearPage={handleClearPage}
      />
      <div
        ref={viewportRef}
        onPointerEnter={() => setCursorVisible(true)}
        onPointerLeave={() => { setCursorVisible(false); if (!isDrawingRef.current && !isDraggingSelRef.current) isPanningRef.current = false }}
        style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          background: '#e8e8e8',
          cursor: getCursorStyle(),
        }}
      >
        <div style={{
          position: 'absolute',
          left: 0, top: 0,
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}>
          <div style={{
            position: 'relative', width: pageWidth, height: pageHeight,
            background: 'white',
            boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
            borderRadius: 2,
          }}>
            <TemplateRenderer template={template} pageWidth={pageWidth} pageHeight={pageHeight} />
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute', inset: 0, width: pageWidth, height: pageHeight,
                touchAction: 'none',
                cursor: 'inherit',
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
            />
          </div>
        </div>

        {/* Brush cursor overlay */}
        {showBrushCursor && toolState.tool !== 'eraser' && (
          <div
            ref={cursorRef}
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              borderRadius: '50%',
              border: toolState.tool === 'highlighter'
                ? `1.5px solid ${toolState.color}66`
                : '1.5px solid rgba(0,0,0,0.4)',
              background: toolState.tool === 'highlighter'
                ? `${toolState.color}18`
                : 'transparent',
              transform: 'translate(-50%, -50%)',
              transition: 'width 0.1s, height 0.1s',
              zIndex: 10,
            }}
          />
        )}
        {showBrushCursor && toolState.tool === 'eraser' && (
          <div
            ref={cursorRef}
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              borderRadius: '50%',
              border: '1.5px solid rgba(200,0,0,0.4)',
              background: 'rgba(200,0,0,0.06)',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
            }}
          />
        )}
      </div>
    </div>
  )
}
