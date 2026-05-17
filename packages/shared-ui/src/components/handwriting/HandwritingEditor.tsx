import React, { useRef, useEffect, useCallback, useState } from 'react'
import TemplateRenderer from './TemplateRenderer.js'
import HandwritingToolbar from './HandwritingToolbar.js'
import { renderStroke, generateThumbnailDataUrl } from './renderStrokes.js'
import type { HandwritingTemplate, CanvasSnapshot, Stroke, StrokePoint, CanvasImage } from '@banjuan/core'

interface Props {
  pageId: string
  snapshot: CanvasSnapshot
  template: HandwritingTemplate
  pageWidth: number
  pageHeight: number
  onSnapshotChange: (snapshot: CanvasSnapshot) => void
  onThumbnailGenerated: (dataUrl: string) => void
}

export type DrawingTool = 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'hand'

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
  { tool: 'pen', color: '#3182ce', width: 2 },
  { tool: 'pen', color: '#1a1a1a', width: 4 },
  { tool: 'highlighter', color: '#d69e2e', width: 8 },
]

const ZOOM_MIN = 0.25
const ZOOM_MAX = 5
const ZOOM_STEP = 1.12
const SEL_MARGIN = 12
const HANDLE_RADIUS = 5
const ROTATION_HANDLE_OFFSET = 25
const HANDLE_HIT_THRESHOLD = 14
const MAX_IMAGE_DIM = 1024

type ImageHandle = 'tl' | 'tr' | 'bl' | 'br' | 'rotate'

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

// --- Image helpers ---

function renderCanvasImage(ctx: CanvasRenderingContext2D, img: CanvasImage, el: HTMLImageElement | undefined) {
  if (!el || !el.complete) return
  ctx.save()
  ctx.translate(img.x + img.width / 2, img.y + img.height / 2)
  ctx.rotate(img.rotation)
  ctx.drawImage(el, -img.width / 2, -img.height / 2, img.width, img.height)
  ctx.restore()
}

function renderImageSelection(ctx: CanvasRenderingContext2D, img: CanvasImage) {
  ctx.save()
  ctx.translate(img.x + img.width / 2, img.y + img.height / 2)
  ctx.rotate(img.rotation)

  const hw = img.width / 2
  const hh = img.height / 2

  ctx.setLineDash([6, 3])
  ctx.strokeStyle = '#3182ce'
  ctx.lineWidth = 1.5
  ctx.strokeRect(-hw, -hh, img.width, img.height)

  ctx.setLineDash([])
  ctx.fillStyle = 'white'
  ctx.strokeStyle = '#3182ce'
  ctx.lineWidth = 1.5
  for (const [hx, hy] of [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]] as [number, number][]) {
    ctx.beginPath()
    ctx.arc(hx, hy, HANDLE_RADIUS, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  const rotY = -hh - ROTATION_HANDLE_OFFSET
  ctx.beginPath()
  ctx.moveTo(0, -hh)
  ctx.lineTo(0, rotY)
  ctx.strokeStyle = '#3182ce'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, rotY, HANDLE_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = '#3182ce'
  ctx.fill()
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.restore()
}

function toImageLocal(px: number, py: number, img: CanvasImage): { lx: number; ly: number } {
  const cx = img.x + img.width / 2
  const cy = img.y + img.height / 2
  const cos = Math.cos(-img.rotation)
  const sin = Math.sin(-img.rotation)
  const dx = px - cx
  const dy = py - cy
  return { lx: dx * cos - dy * sin, ly: dx * sin + dy * cos }
}

function hitTestImage(px: number, py: number, img: CanvasImage): boolean {
  const { lx, ly } = toImageLocal(px, py, img)
  return Math.abs(lx) <= img.width / 2 && Math.abs(ly) <= img.height / 2
}

function hitTestImageHandle(px: number, py: number, img: CanvasImage): ImageHandle | null {
  const { lx, ly } = toImageLocal(px, py, img)
  const hw = img.width / 2
  const hh = img.height / 2
  const t = HANDLE_HIT_THRESHOLD

  if (Math.abs(lx) < t && Math.abs(ly - (-hh - ROTATION_HANDLE_OFFSET)) < t) return 'rotate'
  if (Math.abs(lx - (-hw)) < t && Math.abs(ly - (-hh)) < t) return 'tl'
  if (Math.abs(lx - hw) < t && Math.abs(ly - (-hh)) < t) return 'tr'
  if (Math.abs(lx - (-hw)) < t && Math.abs(ly - hh) < t) return 'bl'
  if (Math.abs(lx - hw) < t && Math.abs(ly - hh) < t) return 'br'
  return null
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

function loadAndResizeImage(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      let w = img.width, h = img.height
      if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM) {
        const scale = MAX_IMAGE_DIM / Math.max(w, h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: w, height: h })
    }
    img.src = dataUrl
  })
}

export default function HandwritingEditor({
  pageId, snapshot, template, pageWidth, pageHeight, onSnapshotChange, onThumbnailGenerated,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const strokesRef = useRef<Stroke[]>(snapshot.strokes ?? [])
  const currentPointsRef = useRef<StrokePoint[]>([])
  const isDrawingRef = useRef(false)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ cx: 0, cy: 0, px: 0, py: 0 })
  const spaceHeldRef = useRef(false)

  // Image state
  const imagesRef = useRef<CanvasImage[]>(snapshot.images ?? [])
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const selectedImageIdxRef = useRef<number | null>(null)
  const imageActionRef = useRef<'none' | 'move' | 'resize' | 'rotate'>('none')
  const imageStartRef = useRef({ mx: 0, my: 0, ix: 0, iy: 0, iw: 0, ih: 0, ir: 0, dist: 0, angle: 0 })

  // Lasso / selection state
  const selectedIndicesRef = useRef<Set<number>>(new Set())
  const lassoPointsRef = useRef<StrokePoint[]>([])
  const isDraggingSelRef = useRef(false)
  const selDragStartRef = useRef({ x: 0, y: 0 })
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const selBoundsRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [hasImageSelection, setHasImageSelection] = useState(false)

  const [toolState, setToolState] = useState<ToolState>({ tool: 'pen', color: '#1a1a1a', width: 4 })
  const [presets, setPresets] = useState<ToolPreset[]>(() => DEFAULT_PRESETS.map(p => ({ ...p })))
  const [activePresetIndex, setActivePresetIndex] = useState(0)
  const [undoStack, setUndoStack] = useState<CanvasSnapshot[]>([{ strokes: snapshot.strokes ?? [], images: snapshot.images ?? [] }])
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

  // --- Load image elements ---
  const loadImageElements = useCallback((images: CanvasImage[], onLoaded?: () => void) => {
    let pending = 0
    for (const img of images) {
      if (imageElementsRef.current.has(img.id)) continue
      pending++
      const el = new Image()
      el.onload = () => {
        pending--
        if (pending === 0) onLoaded?.()
      }
      el.src = img.dataUrl
      imageElementsRef.current.set(img.id, el)
    }
    if (pending === 0) onLoaded?.()
  }, [])

  // --- Redraw ---
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const z = Math.max(1, zoomRef.current)
    canvas.width = pageWidth * dpr * z
    canvas.height = pageHeight * dpr * z
    ctx.scale(dpr * z, dpr * z)
    ctx.clearRect(0, 0, pageWidth, pageHeight)

    for (const img of imagesRef.current) {
      renderCanvasImage(ctx, img, imageElementsRef.current.get(img.id))
    }

    const selIdx = selectedImageIdxRef.current
    if (selIdx !== null && imagesRef.current[selIdx]) {
      renderImageSelection(ctx, imagesRef.current[selIdx])
    }

    for (const s of strokesRef.current) {
      renderStroke(ctx, s)
    }
  }, [pageWidth, pageHeight])

  // --- Redraw with stroke selection overlays ---
  const redrawWithSelection = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const z = Math.max(1, zoomRef.current)
    canvas.width = pageWidth * dpr * z
    canvas.height = pageHeight * dpr * z
    ctx.scale(dpr * z, dpr * z)
    ctx.clearRect(0, 0, pageWidth, pageHeight)

    for (const img of imagesRef.current) {
      renderCanvasImage(ctx, img, imageElementsRef.current.get(img.id))
    }

    const selIdx = selectedImageIdxRef.current
    if (selIdx !== null && imagesRef.current[selIdx]) {
      renderImageSelection(ctx, imagesRef.current[selIdx])
    }

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

    const lassoP = lassoPointsRef.current
    if (lassoP.length > 2) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(lassoP[0].x, lassoP[0].y)
      for (let i = 1; i < lassoP.length; i++) ctx.lineTo(lassoP[i].x, lassoP[i].y)
      ctx.closePath()
      ctx.fillStyle = 'rgba(49,130,206,0.06)'
      ctx.fill()
      ctx.setLineDash([5, 3])
      ctx.strokeStyle = '#3182ce'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
    }

    const bounds = selBoundsRef.current
    if (selected.size > 0 && bounds) {
      ctx.save()
      ctx.setLineDash([6, 3])
      ctx.strokeStyle = '#3182ce'
      ctx.lineWidth = 1.5
      ctx.strokeRect(bounds.x - SEL_MARGIN + offset.x, bounds.y - SEL_MARGIN + offset.y, bounds.w + SEL_MARGIN * 2, bounds.h + SEL_MARGIN * 2)
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

  useEffect(() => { redraw() }, [redraw, zoom])

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
    imagesRef.current = snapshot.images ?? []
    setUndoStack([{ strokes: snapshot.strokes ?? [], images: snapshot.images ?? [] }])
    setUndoIndex(0)
    clearSelection()
    deselectImage()
    loadImageElements(imagesRef.current, () => {
      redraw()
    })
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
    try {
      const srcCanvas = document.createElement('canvas')
      const dpr = window.devicePixelRatio || 1
      srcCanvas.width = pageWidth * dpr
      srcCanvas.height = pageHeight * dpr
      const srcCtx = srcCanvas.getContext('2d')
      if (!srcCtx) return
      srcCtx.scale(dpr, dpr)
      for (const img of imagesRef.current) {
        renderCanvasImage(srcCtx, img, imageElementsRef.current.get(img.id))
      }
      for (const s of strokesRef.current) {
        renderStroke(srcCtx, s)
      }
      const thumbW = 400, thumbH = 300
      const thumbCanvas = document.createElement('canvas')
      thumbCanvas.width = thumbW
      thumbCanvas.height = thumbH
      const tCtx = thumbCanvas.getContext('2d')
      if (!tCtx) return
      tCtx.fillStyle = '#ffffff'
      tCtx.fillRect(0, 0, thumbW, thumbH)
      tCtx.drawImage(srcCanvas, 0, 0, thumbW, thumbH)
      const url = thumbCanvas.toDataURL('image/png')
      if (url) onThumbnailGenerated(url)
    } catch { /* ignore */ }
  }, [onThumbnailGenerated, pageWidth, pageHeight])

  // --- Push snapshot ---
  const pushSnapshot = useCallback(() => {
    const strokes = [...strokesRef.current]
    const images = imagesRef.current.map(img => ({ ...img }))
    const snap: CanvasSnapshot = { strokes, images }
    onSnapshotChange(snap)
    const idx = undoIndexRef.current
    setUndoStack(prev => [...prev.slice(0, idx + 1), snap])
    setUndoIndex(idx + 1)
    generateThumbnail()
  }, [onSnapshotChange, generateThumbnail])

  // --- Canvas coordinate from pointer ---
  const getCanvasPoint = useCallback((e: React.PointerEvent | PointerEvent): StrokePoint => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = pageWidth / rect.width
    const scaleY = pageHeight / rect.height
    const isPen = (e as any).pointerType === 'pen'
    return {
      x: ((e as any).clientX - rect.left) * scaleX,
      y: ((e as any).clientY - rect.top) * scaleY,
      pressure: isPen && (e as any).pressure > 0 ? (e as any).pressure : undefined,
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
    if (tool.tool === 'eraser') size = tool.width * 4 * z
    else if (tool.tool === 'highlighter') size = tool.width * 3 * z
    else size = tool.width * z
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

  const deselectImage = useCallback(() => {
    selectedImageIdxRef.current = null
    imageActionRef.current = 'none'
    setHasImageSelection(false)
  }, [])

  const applyDragOffset = useCallback(() => {
    const offset = dragOffsetRef.current
    if (offset.x === 0 && offset.y === 0) return
    const newStrokes = [...strokesRef.current]
    for (const i of selectedIndicesRef.current) {
      const s = newStrokes[i]
      if (!s) continue
      newStrokes[i] = { ...s, points: s.points.map(p => ({ ...p, x: p.x + offset.x, y: p.y + offset.y })) }
    }
    strokesRef.current = newStrokes
    dragOffsetRef.current = { x: 0, y: 0 }
    selBoundsRef.current = getStrokesBounds(strokesRef.current, selectedIndicesRef.current)
    redrawWithSelection()
    pushSnapshot()
  }, [redrawWithSelection, pushSnapshot])

  const selectStrokesInLasso = useCallback(() => {
    const lasso = lassoPointsRef.current
    if (lasso.length < 3) { lassoPointsRef.current = []; redraw(); return }
    const indices = new Set<number>()
    for (let i = 0; i < strokesRef.current.length; i++) {
      if (strokesRef.current[i].points.some(p => isPointInPolygon(p.x, p.y, lasso))) indices.add(i)
    }
    lassoPointsRef.current = []
    if (indices.size === 0) { redraw(); return }
    selectedIndicesRef.current = indices
    selBoundsRef.current = getStrokesBounds(strokesRef.current, indices)
    setHasSelection(true)
    redrawWithSelection()
  }, [redraw, redrawWithSelection])

  useEffect(() => {
    if (toolState.tool !== 'lasso') {
      if (selectedIndicesRef.current.size > 0) { clearSelection(); redraw() }
      if (selectedImageIdxRef.current !== null) { deselectImage(); redraw() }
    }
  }, [toolState.tool, clearSelection, deselectImage, redraw])

  // --- Add image ---
  const addImage = useCallback(async (result: { dataUrl: string; width: number; height: number }) => {
    let w = result.width, h = result.height
    if (w > pageWidth * 0.8 || h > pageHeight * 0.8) {
      const scale = Math.min(pageWidth * 0.8 / w, pageHeight * 0.8 / h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }

    const newImg: CanvasImage = {
      id: crypto.randomUUID(),
      dataUrl: result.dataUrl,
      x: pageWidth / 2 - w / 2,
      y: pageHeight / 2 - h / 2,
      width: w,
      height: h,
      rotation: 0,
    }

    const el = new Image()
    el.src = result.dataUrl
    await new Promise<void>(r => { el.onload = () => r() })
    imageElementsRef.current.set(newImg.id, el)

    imagesRef.current = [...imagesRef.current, newImg]
    selectedImageIdxRef.current = imagesRef.current.length - 1
    setHasImageSelection(true)
    setToolState(prev => ({ ...prev, tool: 'lasso' }))
    redraw()
    pushSnapshot()
  }, [pageWidth, pageHeight, redraw, pushSnapshot])

  // --- Import image from file ---
  const handleImportImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const raw = await blobToDataUrl(file)
    const result = await loadAndResizeImage(raw)
    await addImage(result)
    e.target.value = ''
  }, [addImage])

  // --- Paste handler ---
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (!blob) continue
          const raw = await blobToDataUrl(blob)
          const result = await loadAndResizeImage(raw)
          await addImage(result)
          return
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addImage])

  // --- Undo / Redo ---
  const handleUndo = useCallback(() => {
    const idx = undoIndexRef.current
    if (idx <= 0) return
    const newIdx = idx - 1
    const snap = undoStackRef.current[newIdx]
    strokesRef.current = [...snap.strokes]
    imagesRef.current = (snap.images ?? []).map(img => ({ ...img }))
    setUndoIndex(newIdx)
    clearSelection()
    deselectImage()
    loadImageElements(imagesRef.current, () => redraw())
    redraw()
    onSnapshotChange({ strokes: strokesRef.current, images: imagesRef.current })
    generateThumbnail()
  }, [redraw, onSnapshotChange, generateThumbnail, clearSelection, deselectImage, loadImageElements])

  const handleRedo = useCallback(() => {
    const idx = undoIndexRef.current
    const stack = undoStackRef.current
    if (idx >= stack.length - 1) return
    const newIdx = idx + 1
    const snap = stack[newIdx]
    strokesRef.current = [...snap.strokes]
    imagesRef.current = (snap.images ?? []).map(img => ({ ...img }))
    setUndoIndex(newIdx)
    clearSelection()
    deselectImage()
    loadImageElements(imagesRef.current, () => redraw())
    redraw()
    onSnapshotChange({ strokes: strokesRef.current, images: imagesRef.current })
    generateThumbnail()
  }, [redraw, onSnapshotChange, generateThumbnail, clearSelection, deselectImage, loadImageElements])

  // --- Clear page ---
  const handleClearPage = useCallback(() => {
    if (strokesRef.current.length === 0 && imagesRef.current.length === 0) return
    strokesRef.current = []
    imagesRef.current = []
    clearSelection()
    deselectImage()
    redraw()
    pushSnapshot()
  }, [redraw, pushSnapshot, clearSelection, deselectImage])

  // --- Zoom controls ---
  const handleZoomIn = useCallback(() => {
    setZoom(z => {
      const nz = clampZoom(z * ZOOM_STEP)
      const vp = viewportRef.current
      if (vp) {
        const cx = vp.clientWidth / 2
        const cy = vp.clientHeight / 2
        setPanOffset(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }))
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
        setPanOffset(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }))
      }
      return nz
    })
  }, [])

  // --- Preset management ---
  const handleSelectPreset = useCallback((index: number) => {
    setActivePresetIndex(index)
    setPresets(prev => {
      const p = prev[index]
      const tool = (p.tool === 'pen' || p.tool === 'highlighter') ? p.tool : 'pen'
      setToolState({ tool, color: p.color, width: p.width })
      return prev
    })
  }, [])

  const handleToolStateChange = useCallback((newState: ToolState) => {
    setToolState(newState)
    if (newState.tool !== 'eraser' && newState.tool !== 'lasso' && newState.tool !== 'hand') {
      setPresets(prev => {
        const updated = [...prev]
        updated[activePresetIndex] = { tool: newState.tool as 'pen' | 'highlighter', color: newState.color, width: newState.width }
        return updated
      })
    }
  }, [activePresetIndex])

  // --- Pointer handlers ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return

    if (spaceHeldRef.current || e.button === 1 || toolRef.current.tool === 'hand') {
      e.preventDefault()
      isPanningRef.current = true
      panStartRef.current = { cx: e.clientX, cy: e.clientY, px: panRef.current.x, py: panRef.current.y }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    const tool = toolRef.current

    // --- Lasso tool ---
    if (tool.tool === 'lasso') {
      const point = getCanvasPoint(e)

      // Check handles on selected image
      if (selectedImageIdxRef.current !== null) {
        const img = imagesRef.current[selectedImageIdxRef.current]
        if (img) {
          const handle = hitTestImageHandle(point.x, point.y, img)
          if (handle === 'rotate') {
            const cx = img.x + img.width / 2
            const cy = img.y + img.height / 2
            imageActionRef.current = 'rotate'
            imageStartRef.current = {
              mx: point.x, my: point.y,
              ix: img.x, iy: img.y, iw: img.width, ih: img.height,
              ir: img.rotation,
              dist: 0,
              angle: Math.atan2(point.y - cy, point.x - cx),
            }
            return
          }
          if (handle) {
            const cx = img.x + img.width / 2
            const cy = img.y + img.height / 2
            imageActionRef.current = 'resize'
            imageStartRef.current = {
              mx: point.x, my: point.y,
              ix: img.x, iy: img.y, iw: img.width, ih: img.height,
              ir: img.rotation,
              dist: Math.hypot(point.x - cx, point.y - cy),
              angle: 0,
            }
            return
          }
          if (hitTestImage(point.x, point.y, img)) {
            imageActionRef.current = 'move'
            imageStartRef.current = {
              mx: point.x, my: point.y,
              ix: img.x, iy: img.y, iw: img.width, ih: img.height,
              ir: img.rotation, dist: 0, angle: 0,
            }
            return
          }
        }
      }

      // Check if clicking on any image
      for (let i = imagesRef.current.length - 1; i >= 0; i--) {
        if (hitTestImage(point.x, point.y, imagesRef.current[i])) {
          selectedImageIdxRef.current = i
          setHasImageSelection(true)
          clearSelection()
          redraw()
          return
        }
      }

      // No image hit — deselect image if any
      if (selectedImageIdxRef.current !== null) {
        deselectImage()
        redraw()
      }

      // Existing stroke selection drag
      if (selectedIndicesRef.current.size > 0 && selBoundsRef.current) {
        if (isPointInRect(point.x, point.y, selBoundsRef.current, SEL_MARGIN)) {
          isDraggingSelRef.current = true
          selDragStartRef.current = { x: point.x, y: point.y }
          return
        }
      }

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
  }, [getCanvasPoint, redraw, pushSnapshot, clearSelection, deselectImage])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    updateCursor(e.clientX, e.clientY)

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.cx
      const dy = e.clientY - panStartRef.current.cy
      setPanOffset({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy })
      return
    }

    // --- Image interaction ---
    if (imageActionRef.current !== 'none' && selectedImageIdxRef.current !== null) {
      const point = getCanvasPoint(e)
      const start = imageStartRef.current
      const idx = selectedImageIdxRef.current
      const img = { ...imagesRef.current[idx] }

      if (imageActionRef.current === 'move') {
        img.x = start.ix + (point.x - start.mx)
        img.y = start.iy + (point.y - start.my)
      } else if (imageActionRef.current === 'resize') {
        const cx = start.ix + start.iw / 2
        const cy = start.iy + start.ih / 2
        const dist = Math.hypot(point.x - cx, point.y - cy)
        const scale = Math.max(0.1, dist / start.dist)
        img.width = start.iw * scale
        img.height = start.ih * scale
        img.x = cx - img.width / 2
        img.y = cy - img.height / 2
      } else if (imageActionRef.current === 'rotate') {
        const cx = start.ix + start.iw / 2
        const cy = start.iy + start.ih / 2
        const angle = Math.atan2(point.y - cy, point.x - cx)
        img.rotation = start.ir + (angle - start.angle)
      }

      const newImages = [...imagesRef.current]
      newImages[idx] = img
      imagesRef.current = newImages
      redraw()
      return
    }

    const tool = toolRef.current

    if (tool.tool === 'lasso' && isDraggingSelRef.current) {
      const point = getCanvasPoint(e)
      dragOffsetRef.current = { x: point.x - selDragStartRef.current.x, y: point.y - selDragStartRef.current.y }
      redrawWithSelection()
      return
    }

    if (tool.tool === 'lasso' && isDrawingRef.current) {
      lassoPointsRef.current.push(getCanvasPoint(e))
      redrawWithSelection()
      return
    }

    if (!isDrawingRef.current) return

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

    currentPointsRef.current.push(getCanvasPoint(e))
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const z = Math.max(1, zoomRef.current)
    canvas.width = pageWidth * dpr * z
    canvas.height = pageHeight * dpr * z
    ctx.scale(dpr * z, dpr * z)
    ctx.clearRect(0, 0, pageWidth, pageHeight)

    for (const img of imagesRef.current) {
      renderCanvasImage(ctx, img, imageElementsRef.current.get(img.id))
    }
    for (const s of strokesRef.current) {
      renderStroke(ctx, s)
    }

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
    if (isPanningRef.current) { isPanningRef.current = false; return }

    // Finalize image interaction
    if (imageActionRef.current !== 'none') {
      imageActionRef.current = 'none'
      pushSnapshot()
      return
    }

    const tool = toolRef.current

    if (tool.tool === 'lasso' && isDraggingSelRef.current) {
      isDraggingSelRef.current = false
      applyDragOffset()
      return
    }

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
    if (imageActionRef.current !== 'none') return
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
        setPanOffset({ x: cx - (cx - panRef.current.x) * (nz / oldZ), y: cy - (cy - panRef.current.y) * (nz / oldZ) })
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

      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); spaceHeldRef.current = true; return }
      if (e.code === 'Escape') {
        clearSelection()
        deselectImage()
        redraw()
        return
      }
      // Delete selected image
      if ((e.code === 'Backspace' || e.code === 'Delete') && selectedImageIdxRef.current !== null) {
        e.preventDefault()
        imagesRef.current = imagesRef.current.filter((_, i) => i !== selectedImageIdxRef.current)
        deselectImage()
        redraw()
        pushSnapshot()
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
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [handleUndo, handleRedo, fitToViewport, handleZoomIn, handleZoomOut, clearSelection, deselectImage, redraw, pushSnapshot])

  // --- Cursor style ---
  const getCursorStyle = (): string => {
    if (spaceHeldRef.current || isPanningRef.current || toolState.tool === 'hand') return 'grab'
    if (toolState.tool === 'lasso') {
      if (hasImageSelection || hasSelection) return 'default'
      return 'crosshair'
    }
    if (toolState.tool === 'eraser') return 'none'
    return 'none'
  }

  const showBrushCursor = cursorVisible && toolState.tool !== 'lasso' && toolState.tool !== 'hand'

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
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
        onImportImage={handleImportImage}
      />
      <div
        ref={viewportRef}
        onPointerEnter={() => setCursorVisible(true)}
        onPointerLeave={() => { setCursorVisible(false); if (!isDrawingRef.current && !isDraggingSelRef.current && imageActionRef.current === 'none') isPanningRef.current = false }}
        style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          background: '#e8e8e8',
          cursor: getCursorStyle(),
        }}
      >
        <div style={{
          position: 'absolute', left: 0, top: 0,
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
                touchAction: 'none', cursor: 'inherit',
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
            />
          </div>
        </div>

        {showBrushCursor && toolState.tool !== 'eraser' && (
          <div ref={cursorRef} style={{
            position: 'absolute', pointerEvents: 'none', borderRadius: '50%',
            border: toolState.tool === 'highlighter' ? `1.5px solid ${toolState.color}66` : '1.5px solid rgba(0,0,0,0.4)',
            background: toolState.tool === 'highlighter' ? `${toolState.color}18` : 'transparent',
            transform: 'translate(-50%, -50%)', transition: 'width 0.1s, height 0.1s', zIndex: 10,
          }} />
        )}
        {showBrushCursor && toolState.tool === 'eraser' && (
          <div ref={cursorRef} style={{
            position: 'absolute', pointerEvents: 'none', borderRadius: '50%',
            border: '1.5px solid rgba(200,0,0,0.4)', background: 'rgba(200,0,0,0.06)',
            transform: 'translate(-50%, -50%)', zIndex: 10,
          }} />
        )}
      </div>
    </div>
  )
}
