import React, { useState } from 'react'
import { Eraser, Lasso, Trash2, Undo2, Redo2, Minus, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useHandwritingStore } from './useHandwritingStore.js'
import { useT } from '../../i18n/index.js'
import type { DrawingTool, ToolState, ToolPreset } from './HandwritingEditor.js'

const COLORS = [
  '#1a1a1a', '#5c5c5c', '#e53e3e', '#dd6b20',
  '#d69e2e', '#38a169', '#3182ce', '#805ad5',
  '#d53f8c', '#ffffff',
]
const WIDTHS = [1, 2, 4, 6, 8, 12]

interface Props {
  toolState: ToolState
  onToolStateChange: (state: ToolState) => void
  presets: ToolPreset[]
  activePresetIndex: number
  onSelectPreset: (index: number) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomFit: () => void
  onClearPage: () => void
}

export default function HandwritingToolbar({
  toolState, onToolStateChange,
  presets, activePresetIndex, onSelectPreset,
  onUndo, onRedo, canUndo, canRedo,
  zoom, onZoomIn, onZoomOut, onZoomFit, onClearPage,
}: Props) {
  const t = useT()
  const pages = useHandwritingStore(s => s.pages)
  const currentPageIndex = useHandwritingStore(s => s.currentPageIndex)
  const setCurrentPage = useHandwritingStore(s => s.setCurrentPage)

  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showWidthPicker, setShowWidthPicker] = useState(false)

  const isEraserActive = toolState.tool === 'eraser'
  const isLassoActive = toolState.tool === 'lasso'

  const closePopups = () => {
    setShowColorPicker(false)
    setShowWidthPicker(false)
  }

  const presetBtn = (preset: ToolPreset, index: number) => {
    const isActive = !isEraserActive && !isLassoActive && activePresetIndex === index
    const isLastUsed = (isEraserActive || isLassoActive) && activePresetIndex === index
    const dotSize = Math.min(16, 6 + preset.width)

    return (
      <button
        key={index}
        onClick={() => { onSelectPreset(index); closePopups() }}
        title={t(preset.tool === 'pen' ? 'handwriting.tool.pen' : 'handwriting.tool.highlighter')}
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
  }

  const sep = () => (
    <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 6px', flexShrink: 0 }} />
  )

  const iconBtn = (
    onClick: () => void,
    icon: React.ReactNode,
    title: string,
    opts?: { disabled?: boolean; active?: boolean; danger?: boolean },
  ) => (
    <button
      onClick={onClick}
      disabled={opts?.disabled}
      title={title}
      style={{
        background: opts?.active ? 'var(--accent-light, rgba(49,130,206,0.12))' : 'none',
        color: opts?.disabled ? 'var(--border)' : opts?.danger ? '#e53e3e' : opts?.active ? 'var(--accent)' : 'var(--text-muted)',
        border: opts?.active ? '1px solid var(--accent)' : '1px solid transparent',
        borderRadius: 6, padding: '3px 7px',
        cursor: opts?.disabled ? 'default' : 'pointer',
        fontSize: 14, lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {icon}
    </button>
  )

  return (
    <div style={{
      height: 42, padding: '0 10px', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
      background: 'var(--surface)',
    }}>
      {/* Presets */}
      {presets.map((p, i) => presetBtn(p, i))}

      {sep()}

      {/* Eraser */}
      {iconBtn(
        () => { onToolStateChange({ ...toolState, tool: 'eraser' }); closePopups() },
        <Eraser size={16} />, t('handwriting.tool.eraser'),
        { active: isEraserActive },
      )}

      {/* Lasso */}
      {iconBtn(
        () => { onToolStateChange({ ...toolState, tool: 'lasso' }); closePopups() },
        <Lasso size={16} />, t('handwriting.tool.lasso'),
        { active: toolState.tool === 'lasso' },
      )}

      {/* Clear page */}
      {iconBtn(onClearPage, <Trash2 size={16} />, t('handwriting.clearPage'), { danger: true })}

      {sep()}

      {/* Color picker */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowColorPicker(v => !v); setShowWidthPicker(false) }}
          title={t('handwriting.tool.pen')}
          style={{
            width: 26, height: 26, borderRadius: '50%',
            border: showColorPicker ? '2px solid var(--accent)' : '2px solid var(--border)',
            background: toolState.color, cursor: 'pointer',
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
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => {
                    onToolStateChange({ ...toolState, color: c, tool: toolState.tool === 'eraser' ? 'pen' : toolState.tool })
                    setShowColorPicker(false)
                  }}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: c === toolState.color ? '2.5px solid var(--accent)' : c === '#ffffff' ? '2px solid #ccc' : '2px solid transparent',
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
            width: 18, height: Math.max(2, toolState.width),
            background: toolState.color,
            borderRadius: toolState.width / 2,
            verticalAlign: 'middle',
          }} />
          <span>{toolState.width}</span>
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
              {WIDTHS.map(w => (
                <button
                  key={w}
                  onClick={() => {
                    onToolStateChange({ ...toolState, width: w, tool: toolState.tool === 'eraser' ? 'pen' : toolState.tool })
                    setShowWidthPicker(false)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '5px 10px', border: 'none',
                    background: w === toolState.width ? 'var(--accent-light, rgba(49,130,206,0.12))' : 'none',
                    textAlign: 'left', fontSize: 12, cursor: 'pointer', borderRadius: 6,
                    color: 'var(--text)',
                  }}
                  onMouseEnter={e => { if (w !== toolState.width) e.currentTarget.style.background = 'var(--hover)' }}
                  onMouseLeave={e => { if (w !== toolState.width) e.currentTarget.style.background = 'none' }}
                >
                  <span style={{
                    display: 'inline-block', width: 40,
                    height: Math.max(2, w),
                    background: toolState.color, borderRadius: w / 2,
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
      {iconBtn(onUndo, <Undo2 size={16} />, 'Undo (⌘Z)', { disabled: !canUndo })}
      {iconBtn(onRedo, <Redo2 size={16} />, 'Redo (⌘⇧Z)', { disabled: !canRedo })}

      {sep()}

      {/* Zoom controls */}
      {iconBtn(onZoomOut, <Minus size={16} />, t('handwriting.zoomOut'))}
      <button
        onClick={onZoomFit}
        title={t('handwriting.zoomFit')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px',
          minWidth: 40, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {Math.round(zoom * 100)}%
      </button>
      {iconBtn(onZoomIn, <Plus size={16} />, t('handwriting.zoomIn'))}

      <div style={{ flex: 1 }} />

      {/* Page navigation */}
      <button
        onClick={() => setCurrentPage(currentPageIndex - 1)}
        disabled={currentPageIndex === 0}
        style={{
          background: 'none', border: 'none', cursor: currentPageIndex === 0 ? 'default' : 'pointer',
          fontSize: 12, color: currentPageIndex === 0 ? 'var(--border)' : 'var(--text-muted)', padding: '4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <ChevronLeft size={14} />
      </button>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {currentPageIndex + 1} / {pages.length}
      </span>
      <button
        onClick={() => setCurrentPage(currentPageIndex + 1)}
        disabled={currentPageIndex === pages.length - 1}
        style={{
          background: 'none', border: 'none',
          cursor: currentPageIndex === pages.length - 1 ? 'default' : 'pointer',
          fontSize: 12,
          color: currentPageIndex === pages.length - 1 ? 'var(--border)' : 'var(--text-muted)',
          padding: '4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
