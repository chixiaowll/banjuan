import React, { useState } from 'react'
import { Eraser, Lasso, Trash2 } from 'lucide-react'
import { useMarkdownViewer, INK_COLORS, INK_WIDTHS } from './MarkdownViewerContext.js'

interface Props {
  onClearAll: () => void
}

export default function MarkdownInkToolbar({ onClearAll }: Props) {
  const ctx = useMarkdownViewer()
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showWidthPicker, setShowWidthPicker] = useState(false)

  const isEraserActive = ctx.activeTool === 'eraser'
  const isLassoActive = ctx.activeTool === 'lasso'

  const closePopups = () => {
    setShowColorPicker(false)
    setShowWidthPicker(false)
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
      {/* Pen indicator */}
      <button
        onClick={() => {
          if (ctx.activeTool !== 'ink') ctx.setActiveTool('ink')
          closePopups()
        }}
        title="Pen"
        style={{
          width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: ctx.activeTool === 'ink' ? 'var(--accent-light, rgba(49,130,206,0.12))' : 'none',
          border: ctx.activeTool === 'ink' ? '2px solid var(--accent)' : '2px solid transparent',
          borderRadius: 8, cursor: 'pointer', padding: 0,
        }}
      >
        <div style={{
          width: Math.min(16, 6 + ctx.inkWidth), height: Math.min(16, 6 + ctx.inkWidth),
          borderRadius: '50%',
          background: ctx.inkColor,
          border: ctx.inkColor === '#ffffff' ? '1px solid #ccc' : 'none',
        }} />
      </button>

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
        }}
      >
        <Lasso size={16} />
      </button>

      {/* Clear all ink */}
      <button
        onClick={onClearAll}
        title="Clear all ink"
        style={{
          background: 'none', color: '#e53e3e',
          border: '1px solid transparent', borderRadius: 6,
          padding: '3px 7px', cursor: 'pointer', fontSize: 14, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
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
            background: ctx.inkColor, cursor: 'pointer',
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
                    ctx.setInkColor(c)
                    if (ctx.activeTool === 'eraser') ctx.setActiveTool('ink')
                    setShowColorPicker(false)
                  }}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: c === ctx.inkColor ? '2.5px solid var(--accent)' : c === '#ffffff' ? '2px solid #ccc' : '2px solid transparent',
                    background: c, cursor: 'pointer',
                  }}
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
            background: 'none',
            border: showWidthPicker ? '1px solid var(--accent)' : '1px solid var(--border)',
            borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
            fontSize: 12, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span style={{
            display: 'inline-block', width: 18,
            height: Math.max(2, ctx.inkWidth),
            background: ctx.inkColor, borderRadius: ctx.inkWidth / 2,
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
              borderRadius: 10, padding: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
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
                >
                  <span style={{
                    display: 'inline-block', width: 40,
                    height: Math.max(2, w),
                    background: ctx.inkColor, borderRadius: w / 2,
                  }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{w}px</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
