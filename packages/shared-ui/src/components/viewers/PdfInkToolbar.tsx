import React, { useState, useRef, useCallback } from 'react'
import { Eraser, Lasso, Undo2, Redo2, Trash2, Highlighter, GripVertical } from 'lucide-react'
import { usePdfViewer } from './PdfViewerContext.js'
import { INK_COLORS, STROKE_WIDTHS, DEFAULT_PRESETS, type InkPreset } from './inkConfig.js'

interface Props {
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onClearPage: () => void
}

export default function PdfInkToolbar({ onUndo, onRedo, canUndo, canRedo, onClearPage }: Props) {
  const ctx = usePdfViewer()
  const [presets, setPresets] = useState<InkPreset[]>(() => DEFAULT_PRESETS.map(p => ({ ...p })))
  const [activePresetIndex, setActivePresetIndex] = useState(0)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const [pos, setPos] = useState({ x: -1, y: 16 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const barRef = useRef<HTMLDivElement>(null)

  const isEraserActive = ctx.inkEraserActive
  const isLassoActive = ctx.activeTool === 'lasso'
  const isPenLike = !isEraserActive && !isLassoActive

  const closePopups = () => setShowColorPicker(false)

  const activePreset = presets[activePresetIndex]
  const activeColor = isPenLike ? activePreset?.color ?? ctx.activeColor : ctx.activeColor

  const selectPreset = (index: number) => {
    setActivePresetIndex(index)
    const p = presets[index]
    ctx.setActiveColor(p.color)
    ctx.setInkWidth(p.width)
    ctx.setInkEraserActive(false)
    if (ctx.activeTool !== 'ink') ctx.setActiveTool('ink')
    closePopups()
  }

  const setColor = (c: string) => {
    ctx.setActiveColor(c)
    setPresets(prev => {
      const updated = [...prev]
      updated[activePresetIndex] = { ...updated[activePresetIndex], color: c }
      return updated
    })
    if (ctx.activeTool !== 'ink') ctx.setActiveTool('ink')
    setShowColorPicker(false)
  }

  const setWidth = (w: number) => {
    ctx.setInkWidth(w)
    setPresets(prev => {
      const updated = [...prev]
      updated[activePresetIndex] = { ...updated[activePresetIndex], width: w }
      return updated
    })
    if (ctx.activeTool !== 'ink') ctx.setActiveTool('ink')
    closePopups()
  }

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    const bar = barRef.current
    const parent = bar?.parentElement
    let px = pos.x, py = pos.y
    if (px === -1 && bar && parent) {
      const pr = parent.getBoundingClientRect()
      const br = bar.getBoundingClientRect()
      px = br.left - pr.left
      py = br.top - pr.top
    }
    dragStart.current = { x: e.clientX, y: e.clientY, px, py }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const parent = barRef.current?.parentElement
      const bar = barRef.current
      if (!parent || !bar) return
      const pr = parent.getBoundingClientRect()
      const bw = bar.offsetWidth
      const bh = bar.offsetHeight
      const rawX = dragStart.current.px + (ev.clientX - dragStart.current.x)
      const rawY = dragStart.current.py + (ev.clientY - dragStart.current.y)
      setPos({
        x: Math.max(0, Math.min(pr.width - bw, rawX)),
        y: Math.max(0, Math.min(pr.height - bh, rawY)),
      })
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [pos])

  const toolBtn = (
    onClick: () => void,
    icon: React.ReactNode,
    active: boolean,
  ) => (
    <button
      onClick={onClick}
      style={{
        width: 34, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(0,0,0,0.08)' : 'transparent',
        border: 'none',
        borderRadius: 8, cursor: 'pointer', padding: 0,
        color: active ? '#1a1a1a' : '#8e8e93',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? 'rgba(0,0,0,0.08)' : 'transparent' }}
    >
      {icon}
    </button>
  )

  const presetIcon = (preset: InkPreset, index: number, size: number) => {
    if (preset.tool === 'highlighter') return <Highlighter size={size} />
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
        {index > 0 && <path d="M15 5 19 9" />}
      </svg>
    )
  }

  const sep = () => (
    <div style={{ width: 1, height: 22, background: '#c7c7cc', margin: '0 3px', flexShrink: 0 }} />
  )

  const centeredX = pos.x === -1

  return (
    <div
      ref={barRef}
      style={{
        position: 'absolute',
        top: pos.y,
        ...(centeredX
          ? { left: '50%', transform: 'translateX(-50%)' }
          : { left: pos.x }
        ),
        zIndex: 50,
        display: 'flex', alignItems: 'center',
        padding: '4px 6px',
        background: 'rgba(242,242,247,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 14,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.06)',
        gap: 2,
        userSelect: 'none',
      }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={handleDragStart}
        style={{
          cursor: 'grab', display: 'flex', alignItems: 'center',
          color: '#c7c7cc', padding: '0 2px', flexShrink: 0,
          touchAction: 'none',
        }}
      >
        <GripVertical size={14} />
      </div>

      {sep()}

      {/* Undo/redo */}
      {toolBtn(onUndo, <Undo2 size={16} />, false)}
      {toolBtn(onRedo, <Redo2 size={16} />, false)}

      {sep()}

      {/* Tools group */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 1,
        background: 'rgba(0,0,0,0.05)',
        borderRadius: 10, padding: '2px 3px',
      }}>
        {/* Lasso */}
        {toolBtn(
          () => { ctx.setActiveTool(ctx.activeTool === 'lasso' ? 'ink' : 'lasso'); closePopups() },
          <Lasso size={16} />,
          isLassoActive,
        )}

        {/* Presets */}
        {presets.map((preset, i) => {
          const isActive = isPenLike && activePresetIndex === i
          return (
            <button
              key={i}
              onClick={() => selectPreset(i)}
              style={{
                width: 34, height: 34,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? `${preset.color}20` : 'transparent',
                border: 'none',
                borderRadius: 8, cursor: 'pointer', padding: 0,
                color: isActive ? preset.color : '#8e8e93',
                transition: 'all 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? `${preset.color}20` : 'transparent' }}
            >
              {presetIcon(preset, i, 16)}
              <div style={{
                position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                width: 4, height: 4, borderRadius: '50%',
                background: preset.color,
                border: preset.color === '#ffffff' ? '1px solid #ccc' : 'none',
              }} />
            </button>
          )
        })}

        {/* Eraser */}
        {toolBtn(
          () => { ctx.setInkEraserActive(!ctx.inkEraserActive); closePopups() },
          <Eraser size={16} />,
          isEraserActive,
        )}
      </div>

      {sep()}

      {/* Stroke width */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {STROKE_WIDTHS.map(sw => {
          const isActive = ctx.inkWidth === sw.value
          return (
            <button
              key={sw.value}
              onClick={() => setWidth(sw.value)}
              style={{
                width: 26, height: 26,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'rgba(0,0,0,0.08)' : 'transparent',
                border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'rgba(0,0,0,0.08)' : 'transparent' }}
            >
              <div style={{
                width: 14,
                height: sw.height + 1,
                background: isActive ? activeColor : '#8e8e93',
                borderRadius: 1,
              }} />
            </button>
          )
        })}
      </div>

      {sep()}

      {/* Color picker */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowColorPicker(v => !v)}
          style={{
            width: 24, height: 24, borderRadius: '50%',
            border: `2px solid ${showColorPicker ? '#007aff' : 'rgba(0,0,0,0.12)'}`,
            background: activeColor, cursor: 'pointer',
            transition: 'border-color 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        />
        {showColorPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowColorPicker(false)} />
            <div style={{
              position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
              marginBottom: 8, zIndex: 100,
              background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 12, padding: 10, display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)', gap: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}>
              {INK_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: c === activeColor ? '3px solid #007aff' : c === '#ffffff' ? '2px solid #d1d1d6' : '2px solid transparent',
                    background: c, cursor: 'pointer', padding: 0,
                    transition: 'transform 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {sep()}

      {/* Clear */}
      {toolBtn(onClearPage, <Trash2 size={16} />, false)}
    </div>
  )
}
