import React, { useState } from 'react'
import { Eraser, Lasso, Trash2, Undo2, Redo2, Minus, Plus, ChevronLeft, ChevronRight, Pen, Highlighter, ImagePlus, Hand } from 'lucide-react'
import { useHandwritingStore } from './useHandwritingStore.js'
import { useT } from '../../i18n/index.js'
import type { DrawingTool, ToolState, ToolPreset } from './HandwritingEditor.js'

const COLORS = [
  '#1a1a1a', '#5c5c5c', '#3182ce', '#805ad5',
  '#e53e3e', '#dd6b20', '#d69e2e', '#38a169',
  '#d53f8c', '#ffffff',
]
const STROKE_WIDTHS = [
  { value: 1, height: 1 },
  { value: 3, height: 2 },
  { value: 6, height: 3 },
]

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
  onImportImage?: () => void
}

export default function HandwritingToolbar({
  toolState, onToolStateChange,
  presets, activePresetIndex, onSelectPreset,
  onUndo, onRedo, canUndo, canRedo,
  zoom, onZoomIn, onZoomOut, onZoomFit, onClearPage, onImportImage,
}: Props) {
  const t = useT()
  const pages = useHandwritingStore(s => s.pages)
  const currentPageIndex = useHandwritingStore(s => s.currentPageIndex)
  const setCurrentPage = useHandwritingStore(s => s.setCurrentPage)

  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showWidthPicker, setShowWidthPicker] = useState(false)

  const isEraserActive = toolState.tool === 'eraser'
  const isLassoActive = toolState.tool === 'lasso'
  const isHandActive = toolState.tool === 'hand'
  const isPenLike = !isEraserActive && !isLassoActive && !isHandActive

  const closePopups = () => {
    setShowColorPicker(false)
    setShowWidthPicker(false)
  }

  const activePreset = presets[activePresetIndex]
  const activeColor = isPenLike ? activePreset?.color ?? toolState.color : toolState.color

  const toolBtn = (
    onClick: () => void,
    icon: React.ReactNode,
    active: boolean,
    color?: string,
  ) => (
    <button
      onClick={onClick}
      style={{
        width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? (color ? `${color}18` : 'rgba(0,0,0,0.08)') : 'transparent',
        border: 'none',
        borderRadius: 8, cursor: 'pointer', padding: 0,
        color: active ? (color || '#1a1a1a') : '#8e8e93',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {icon}
    </button>
  )

  const presetIcon = (preset: ToolPreset, index: number, size: number) => {
    if (preset.tool === 'highlighter') return <Highlighter size={size} />
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
        {index > 0 && <path d="M15 5 19 9" />}
      </svg>
    )
  }

  const sep = () => (
    <div style={{ width: 1, height: 24, background: '#d1d1d6', margin: '0 4px', flexShrink: 0 }} />
  )

  return (
    <div style={{
      height: 48, padding: '0 8px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      background: '#f2f2f7',
      borderBottom: '1px solid #d1d1d6',
    }}>
      {/* Left: undo/redo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {toolBtn(onUndo, <Undo2 size={18} />, false)}
        {toolBtn(onRedo, <Redo2 size={18} />, false)}
      </div>

      {sep()}

      {/* Center: tools */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        background: '#e5e5ea',
        borderRadius: 10, padding: '3px 4px',
      }}>
        {/* Lasso */}
        {toolBtn(
          () => { onToolStateChange({ ...toolState, tool: 'lasso' }); closePopups() },
          <Lasso size={18} />,
          isLassoActive,
        )}

        {/* Presets */}
        {presets.map((preset, i) => {
          const isActive = isPenLike && activePresetIndex === i
          return (
            <button
              key={i}
              onClick={() => { onSelectPreset(i); closePopups() }}
              style={{
                width: 36, height: 36,
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
              {presetIcon(preset, i, 18)}
              {/* Color dot indicator */}
              <div style={{
                position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                width: 5, height: 5, borderRadius: '50%',
                background: preset.color,
                border: preset.color === '#ffffff' ? '1px solid #ccc' : 'none',
              }} />
            </button>
          )
        })}

        {/* Eraser */}
        {toolBtn(
          () => { onToolStateChange({ ...toolState, tool: 'eraser' }); closePopups() },
          <Eraser size={18} />,
          isEraserActive,
        )}

        {/* Hand (pan) */}
        {toolBtn(
          () => { onToolStateChange({ ...toolState, tool: 'hand' }); closePopups() },
          <Hand size={18} />,
          isHandActive,
        )}
      </div>

      {sep()}

      {/* Stroke width */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {STROKE_WIDTHS.map(sw => {
          const isActive = toolState.width === sw.value
          return (
            <button
              key={sw.value}
              onClick={() => {
                onToolStateChange({ ...toolState, width: sw.value, tool: toolState.tool === 'eraser' ? 'pen' : toolState.tool })
                closePopups()
              }}
              style={{
                width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'rgba(0,0,0,0.08)' : 'transparent',
                border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'rgba(0,0,0,0.08)' : 'transparent' }}
            >
              <div style={{
                width: 16,
                height: sw.height + 1,
                background: isActive ? activeColor : '#8e8e93',
                borderRadius: 1,
              }} />
            </button>
          )
        })}
      </div>

      {sep()}

      {/* Color dots */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowColorPicker(v => !v); setShowWidthPicker(false) }}
          style={{
            width: 28, height: 28, borderRadius: '50%',
            border: `2.5px solid ${showColorPicker ? '#007aff' : '#d1d1d6'}`,
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
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              marginTop: 8, zIndex: 100,
              background: '#fff', border: '1px solid #d1d1d6',
              borderRadius: 12, padding: 12, display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}>
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => {
                    onToolStateChange({ ...toolState, color: c, tool: toolState.tool === 'eraser' ? 'pen' : toolState.tool })
                    setShowColorPicker(false)
                  }}
                  style={{
                    width: 30, height: 30, borderRadius: '50%',
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

      {/* Zoom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {toolBtn(onZoomOut, <Minus size={16} />, false)}
        <button
          onClick={onZoomFit}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, color: '#8e8e93', padding: '2px 4px',
            minWidth: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
            fontWeight: 500,
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
        {toolBtn(onZoomIn, <Plus size={16} />, false)}
      </div>

      {sep()}

      {/* Image import */}
      {onImportImage && toolBtn(() => onImportImage(), <ImagePlus size={16} />, false)}

      {sep()}

      {/* Clear */}
      {toolBtn(onClearPage, <Trash2 size={16} />, false)}

      <div style={{ flex: 1 }} />

      {/* Page navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          onClick={() => setCurrentPage(currentPageIndex - 1)}
          disabled={currentPageIndex === 0}
          style={{
            background: 'none', border: 'none',
            cursor: currentPageIndex === 0 ? 'default' : 'pointer',
            color: currentPageIndex === 0 ? '#d1d1d6' : '#8e8e93',
            padding: 4, display: 'flex', alignItems: 'center',
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 12, color: '#8e8e93', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
          {currentPageIndex + 1} / {pages.length}
        </span>
        <button
          onClick={() => setCurrentPage(currentPageIndex + 1)}
          disabled={currentPageIndex === pages.length - 1}
          style={{
            background: 'none', border: 'none',
            cursor: currentPageIndex === pages.length - 1 ? 'default' : 'pointer',
            color: currentPageIndex === pages.length - 1 ? '#d1d1d6' : '#8e8e93',
            padding: 4, display: 'flex', alignItems: 'center',
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
