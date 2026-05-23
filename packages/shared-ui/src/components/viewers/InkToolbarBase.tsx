import React, { useState, useRef, useCallback } from 'react'
import { Eraser, Lasso, Undo2, Redo2, Trash2, Highlighter, GripVertical, Eye, EyeOff } from 'lucide-react'
import { INK_COLORS, STROKE_WIDTHS, DEFAULT_PRESETS, type InkPreset } from './inkConfig.js'

export interface InkToolbarAPI {
  activeColor: string
  setActiveColor: (c: string) => void
  inkWidth: number
  setInkWidth: (w: number) => void
  isEraserActive: boolean
  setEraserActive: (v: boolean) => void
  isLassoActive: boolean
  setLassoActive: (v: boolean) => void
  ensureInkTool: () => void
  annotationsVisible?: boolean
  toggleAnnotationsVisible?: () => void
}

interface Props {
  api: InkToolbarAPI
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onClear: () => void
}

export default function InkToolbarBase({ api, onUndo, onRedo, canUndo, canRedo, onClear }: Props) {
  const [presets, setPresets] = useState<InkPreset[]>(() => DEFAULT_PRESETS.map(p => ({ ...p })))
  const [activePresetIndex, setActivePresetIndex] = useState(0)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const [pos, setPos] = useState({ x: -1, y: 16 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const barRef = useRef<HTMLDivElement>(null)

  const isPenLike = !api.isEraserActive && !api.isLassoActive
  const activePreset = presets[activePresetIndex]
  const activeColor = isPenLike ? activePreset?.color ?? api.activeColor : api.activeColor

  const closePopups = () => setShowColorPicker(false)

  const selectPreset = (index: number) => {
    setActivePresetIndex(index)
    const p = presets[index]
    api.setActiveColor(p.color)
    api.setInkWidth(p.width)
    api.setEraserActive(false)
    api.ensureInkTool()
    closePopups()
  }

  const setColor = (c: string) => {
    api.setActiveColor(c)
    setPresets(prev => {
      const updated = [...prev]
      updated[activePresetIndex] = { ...updated[activePresetIndex], color: c }
      return updated
    })
    api.ensureInkTool()
    setShowColorPicker(false)
  }

  const setWidth = (w: number) => {
    api.setInkWidth(w)
    setPresets(prev => {
      const updated = [...prev]
      updated[activePresetIndex] = { ...updated[activePresetIndex], width: w }
      return updated
    })
    api.ensureInkTool()
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

  const presetIcon = (preset: InkPreset, index: number, size: number) => {
    if (preset.tool === 'highlighter') return <Highlighter size={size} />
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
        {index > 0 && <path d="M15 5 19 9" />}
      </svg>
    )
  }

  const centeredX = pos.x === -1

  const sep = <div style={{ width: 1, height: 24, background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.1) 20%, rgba(0,0,0,0.1) 80%, transparent 100%)', margin: '0 6px', flexShrink: 0 }} />

  const iconBtn = (onClick: () => void, icon: React.ReactNode, active: boolean, disabled?: boolean) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(0,0,0,0.12)' : 'transparent',
        border: 'none',
        borderRadius: 10, cursor: disabled ? 'default' : 'pointer', padding: 0,
        color: active ? '#1a1a1a' : '#aaa',
        opacity: disabled ? 0.3 : 1,
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={e => { if (!active && !disabled) e.currentTarget.style.background = 'rgba(0,0,0,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(0,0,0,0.12)' : 'transparent' }}
    >
      {icon}
    </button>
  )

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
        padding: '6px 10px',
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(24px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
        borderRadius: 18,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 6px 20px rgba(0,0,0,0.10), 0 16px 48px rgba(0,0,0,0.06)',
        border: '0.5px solid rgba(255,255,255,0.8)',
        gap: 2,
        userSelect: 'none',
      }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={handleDragStart}
        style={{
          cursor: 'grab', display: 'flex', alignItems: 'center',
          color: '#d0d0d0', padding: '0 2px', flexShrink: 0,
          touchAction: 'none',
        }}
      >
        <GripVertical size={14} />
      </div>

      {sep}

      {/* Undo / Redo */}
      <div style={{ display: 'flex', gap: 2 }}>
        {iconBtn(onUndo, <Undo2 size={17} />, false, !canUndo)}
        {iconBtn(onRedo, <Redo2 size={17} />, false, !canRedo)}
      </div>

      {sep}

      {/* Tools group — pen presets + lasso + eraser */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        background: 'rgba(0,0,0,0.035)',
        borderRadius: 12, padding: '3px 5px',
      }}>
        {/* Lasso */}
        {iconBtn(
          () => { api.setLassoActive(!api.isLassoActive); closePopups() },
          <Lasso size={17} />,
          api.isLassoActive,
        )}

        {/* Presets */}
        {presets.map((preset, i) => {
          const isActive = isPenLike && activePresetIndex === i
          return (
            <button
              key={i}
              onClick={() => selectPreset(i)}
              style={{
                width: 36, height: 42,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: isActive ? `${preset.color}15` : 'transparent',
                border: isActive ? `1.5px solid ${preset.color}40` : '1.5px solid transparent',
                borderRadius: 10, cursor: 'pointer', padding: 0,
                color: isActive ? preset.color : '#aaa',
                transition: 'all 0.2s ease',
                position: 'relative',
                gap: 2,
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = '#666' } }}
              onMouseLeave={e => { e.currentTarget.style.background = isActive ? `${preset.color}15` : 'transparent'; e.currentTarget.style.color = isActive ? preset.color : '#aaa' }}
            >
              {presetIcon(preset, i, 17)}
              <div style={{
                width: isActive ? 8 : 5, height: isActive ? 3 : 3, borderRadius: 2,
                background: preset.color,
                border: preset.color === '#ffffff' ? '1px solid #d0d0d0' : 'none',
                transition: 'all 0.2s ease',
              }} />
            </button>
          )
        })}

        {/* Eraser */}
        {iconBtn(
          () => { api.setEraserActive(!api.isEraserActive); closePopups() },
          <Eraser size={17} />,
          api.isEraserActive,
        )}
      </div>

      {sep}

      {/* Stroke width */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {STROKE_WIDTHS.map(sw => {
          const isActive = api.inkWidth === sw.value
          return (
            <button
              key={sw.value}
              onClick={() => setWidth(sw.value)}
              style={{
                width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'rgba(0,0,0,0.10)' : 'transparent',
                border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'rgba(0,0,0,0.10)' : 'transparent' }}
            >
              <div style={{
                width: 16,
                height: sw.height + 1,
                background: isActive ? activeColor : '#bbb',
                borderRadius: 2,
                transition: 'all 0.15s',
              }} />
            </button>
          )
        })}
      </div>

      {sep}

      {/* Color picker */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <button
          onClick={() => setShowColorPicker(v => !v)}
          style={{
            width: 26, height: 26, borderRadius: '50%',
            border: showColorPicker ? '2.5px solid #007aff' : '2.5px solid rgba(0,0,0,0.08)',
            background: activeColor, cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
            boxShadow: showColorPicker
              ? '0 0 0 3px rgba(0,122,255,0.2)'
              : `0 1px 4px ${activeColor === '#ffffff' ? 'rgba(0,0,0,0.1)' : activeColor + '50'}`,
          }}
        />
        {showColorPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowColorPicker(false)} />
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              marginTop: 12, zIndex: 100,
              background: 'rgba(255,255,255,0.97)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '0.5px solid rgba(255,255,255,0.8)',
              borderRadius: 16, padding: 14, display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)', gap: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 16px 48px rgba(0,0,0,0.06)',
            }}>
              {INK_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 30, height: 30, borderRadius: '50%',
                    border: c === activeColor ? '2.5px solid #007aff' : c === '#ffffff' ? '1.5px solid #ddd' : '1.5px solid transparent',
                    background: c, cursor: 'pointer', padding: 0,
                    transition: 'all 0.15s ease',
                    boxShadow: c === activeColor
                      ? '0 0 0 3px rgba(0,122,255,0.15)'
                      : c === '#ffffff' ? 'none' : `0 2px 6px ${c}30`,
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {sep}

      {/* Visibility toggle + Clear */}
      <div style={{ display: 'flex', gap: 2 }}>
        {api.toggleAnnotationsVisible && iconBtn(
          api.toggleAnnotationsVisible,
          api.annotationsVisible === false ? <EyeOff size={17} /> : <Eye size={17} />,
          false,
        )}
        {iconBtn(onClear, <Trash2 size={17} />, false)}
      </div>
    </div>
  )
}
