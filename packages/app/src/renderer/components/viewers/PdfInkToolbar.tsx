import React, { useState } from 'react'
import { Eraser, Lasso, Undo2, Redo2, Trash2 } from 'lucide-react'
import { usePdfViewer } from './PdfViewerContext.js'
import { useT } from '../../i18n/index.js'

const INK_COLORS = [
  '#1a1a1a', '#5c5c5c', '#e53e3e', '#dd6b20',
  '#d69e2e', '#38a169', '#3182ce', '#805ad5',
  '#d53f8c', '#ffffff',
]
const INK_WIDTHS = [1, 2, 4, 6, 8, 12]

interface InkPreset {
  color: string
  width: number
  tool: 'pen' | 'highlighter'
}

const DEFAULT_PRESETS: InkPreset[] = [
  { color: '#1a1a1a', width: 4, tool: 'pen' },
  { color: '#3182ce', width: 2, tool: 'pen' },
  { color: '#d69e2e', width: 8, tool: 'highlighter' },
]

interface Props {
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onClearPage: () => void
}

export default function PdfInkToolbar({ onUndo, onRedo, canUndo, canRedo, onClearPage }: Props) {
  const t = useT()
  const ctx = usePdfViewer()
  const [presets] = useState<InkPreset[]>(DEFAULT_PRESETS)
  const [activePresetIndex, setActivePresetIndex] = useState(0)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showWidthPicker, setShowWidthPicker] = useState(false)

  const isEraserActive = ctx.activeTool === 'eraser'
  const isLassoActive = ctx.activeTool === 'lasso'

  const closePopups = () => {
    setShowColorPicker(false)
    setShowWidthPicker(false)
  }

  const selectPreset = (index: number) => {
    setActivePresetIndex(index)
    const p = presets[index]
    ctx.setActiveColor(p.color)
    ctx.setInkWidth(p.width)
    if (ctx.activeTool === 'eraser') ctx.setActiveTool('ink')
    closePopups()
  }

  const sep = () => (
    <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 6px', flexShrink: 0 }} />
  )

  return (
    <div style={{
      height: 38, padding: '0 10px', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
      background: 'var(--surface)',
    }}>
      {presets.map((preset, i) => {
        const isActive = !isEraserActive && !isLassoActive && activePresetIndex === i
        const isLastUsed = (isEraserActive || isLassoActive) && activePresetIndex === i
        const dotSize = Math.min(16, 6 + preset.width)
        return (
          <button
            key={i}
            onClick={() => selectPreset(i)}
            title={preset.tool === 'pen' ? 'Pen' : 'Highlighter'}
            style={{
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isActive ? 'var(--accent-light, rgba(49,130,206,0.12))' : 'none',
              border: isActive
                ? '2px solid var(--accent)'
                : isLastUsed
                  ? '2px dashed var(--accent)'
                  : '2px solid transparent',
              borderRadius: 8, cursor: 'pointer', padding: 0,
              transition: 'all 0.15s',
            }}
          >
            <div style={{
              width: dotSize, height: dotSize,
              borderRadius: '50%',
              background: preset.color,
              opacity: preset.tool === 'highlighter' ? 0.5 : 1,
              border: preset.color === '#ffffff' ? '1px solid #ccc' : 'none',
            }} />
          </button>
        )
      })}

      {sep()}

      {/* Eraser */}
      <button
        onClick={() => {
          ctx.setActiveTool(ctx.activeTool === 'eraser' ? 'ink' : 'eraser')
          closePopups()
        }}
        title="Eraser"
        style={{
          background: isEraserActive ? 'var(--accent-light, rgba(49,130,206,0.12))' : 'none',
          color: isEraserActive ? 'var(--accent)' : 'var(--text-muted)',
          border: isEraserActive ? '1px solid var(--accent)' : '1px solid transparent',
          borderRadius: 6, padding: '3px 7px',
          cursor: 'pointer', fontSize: 14, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
      >
        <Eraser size={16} />
      </button>

      {/* Lasso */}
      <button
        onClick={() => {
          ctx.setActiveTool(ctx.activeTool === 'lasso' ? 'ink' : 'lasso')
          closePopups()
        }}
        title="Lasso"
        style={{
          background: isLassoActive ? 'var(--accent-light, rgba(49,130,206,0.12))' : 'none',
          color: isLassoActive ? 'var(--accent)' : 'var(--text-muted)',
          border: isLassoActive ? '1px solid var(--accent)' : '1px solid transparent',
          borderRadius: 6, padding: '3px 7px',
          cursor: 'pointer', fontSize: 14, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
      >
        <Lasso size={16} />
      </button>

      {/* Clear page strokes */}
      <button
        onClick={onClearPage}
        title="Clear page ink"
        style={{
          background: 'none',
          color: '#e53e3e',
          border: '1px solid transparent',
          borderRadius: 6, padding: '3px 7px',
          cursor: 'pointer', fontSize: 14, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
      >
        <Trash2 size={16} />
      </button>

      {sep()}

      {/* Color picker */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowColorPicker(v => !v); setShowWidthPicker(false) }}
          title="Color"
          style={{
            width: 26, height: 26, borderRadius: '50%',
            border: showColorPicker ? '2px solid var(--accent)' : '2px solid var(--border)',
            background: ctx.activeColor, cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
        />
        {showColorPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowColorPicker(false)} />
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              marginTop: 6, zIndex: 100,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 10, display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)', gap: 6,
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            }}>
              {INK_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => {
                    ctx.setActiveColor(c)
                    if (ctx.activeTool === 'eraser') ctx.setActiveTool('ink')
                    setShowColorPicker(false)
                  }}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: c === ctx.activeColor ? '2.5px solid var(--accent)' : c === '#ffffff' ? '2px solid #ccc' : '2px solid transparent',
                    background: c, cursor: 'pointer',
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

      {/* Width picker */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowWidthPicker(v => !v); setShowColorPicker(false) }}
          style={{
            background: 'none', border: showWidthPicker ? '1px solid var(--accent)' : '1px solid var(--border)',
            borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
            fontSize: 12, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 6,
            transition: 'border-color 0.15s',
          }}
        >
          <span style={{
            display: 'inline-block',
            width: 18, height: Math.max(2, ctx.inkWidth),
            background: ctx.activeColor,
            borderRadius: ctx.inkWidth / 2,
            verticalAlign: 'middle',
          }} />
          <span>{ctx.inkWidth}</span>
        </button>
        {showWidthPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowWidthPicker(false)} />
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              marginTop: 6, zIndex: 100,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 8,
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
              minWidth: 120,
            }}>
              {INK_WIDTHS.map(w => (
                <button
                  key={w}
                  onClick={() => {
                    ctx.setInkWidth(w)
                    if (ctx.activeTool === 'eraser') ctx.setActiveTool('ink')
                    setShowWidthPicker(false)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '5px 10px', border: 'none',
                    background: w === ctx.inkWidth ? 'var(--accent-light, rgba(49,130,206,0.12))' : 'none',
                    textAlign: 'left', fontSize: 12, cursor: 'pointer', borderRadius: 6,
                    color: 'var(--text)',
                  }}
                  onMouseEnter={e => { if (w !== ctx.inkWidth) e.currentTarget.style.background = 'var(--hover)' }}
                  onMouseLeave={e => { if (w !== ctx.inkWidth) e.currentTarget.style.background = 'none' }}
                >
                  <span style={{
                    display: 'inline-block', width: 40,
                    height: Math.max(2, w),
                    background: ctx.activeColor, borderRadius: w / 2,
                  }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{w}px</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {sep()}

      {/* Undo / Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
        style={{
          background: 'none',
          color: !canUndo ? 'var(--border)' : 'var(--text-muted)',
          border: '1px solid transparent',
          borderRadius: 6, padding: '3px 7px',
          cursor: !canUndo ? 'default' : 'pointer',
          fontSize: 14, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
      >
        <Undo2 size={16} />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (⌘⇧Z)"
        style={{
          background: 'none',
          color: !canRedo ? 'var(--border)' : 'var(--text-muted)',
          border: '1px solid transparent',
          borderRadius: 6, padding: '3px 7px',
          cursor: !canRedo ? 'default' : 'pointer',
          fontSize: 14, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
      >
        <Redo2 size={16} />
      </button>
    </div>
  )
}
