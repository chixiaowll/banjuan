import React, { useState } from 'react'
import { useEditor } from 'tldraw'
import { useHandwritingStore } from './useHandwritingStore.js'
import { useT } from '../../i18n/index.js'

const COLORS = ['#1a1a1a', '#e53e3e', '#dd6b20', '#d69e2e', '#38a169', '#3182ce', '#805ad5', '#d53f8c']
const WIDTHS = [2, 4, 8]

export default function HandwritingToolbar() {
  const t = useT()
  const editor = useEditor()
  const pages = useHandwritingStore(s => s.pages)
  const currentPageIndex = useHandwritingStore(s => s.currentPageIndex)
  const setCurrentPage = useHandwritingStore(s => s.setCurrentPage)

  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showWidthPicker, setShowWidthPicker] = useState(false)
  const [currentColor, setCurrentColor] = useState(COLORS[0])
  const [currentWidth, setCurrentWidth] = useState(WIDTHS[1])

  const activeTool = editor.getCurrentToolId()

  const selectTool = (toolId: string) => {
    editor.setCurrentTool(toolId)
  }

  const toolBtn = (toolId: string, label: string, icon: string, active?: boolean) => (
    <button
      key={toolId}
      onClick={() => selectTool(toolId)}
      title={label}
      style={{
        background: (active ?? activeTool === toolId) ? 'var(--accent)' : 'none',
        color: (active ?? activeTool === toolId) ? 'white' : 'var(--text-muted)',
        border: 'none', borderRadius: 4, padding: '4px 8px',
        cursor: 'pointer', fontSize: 14, lineHeight: 1,
      }}
    >
      {icon}
    </button>
  )

  return (
    <div style={{
      height: 36, padding: '0 12px', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
      background: 'var(--surface)',
    }}>
      {toolBtn('draw', t('handwriting.tool.pen'), '✏️')}
      {toolBtn('highlight', t('handwriting.tool.highlighter'), '🖍️')}
      {toolBtn('eraser', t('handwriting.tool.eraser'), '⬭')}
      {toolBtn('geo', t('handwriting.tool.shape'), '▭')}
      {toolBtn('select', t('handwriting.tool.lasso'), '◎')}

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

      {/* Color picker */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { setShowColorPicker(v => !v); setShowWidthPicker(false) }}
          style={{
            width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--border)',
            background: currentColor, cursor: 'pointer',
          }}
        />
        {showColorPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowColorPicker(false)} />
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 8, display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}>
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => {
                    setCurrentColor(c)
                    setShowColorPicker(false)
                  }}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', border: c === currentColor ? '2px solid var(--accent)' : '2px solid transparent',
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
            background: 'none', border: '1px solid var(--border)', borderRadius: 4,
            padding: '2px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)',
          }}
        >
          ━ {currentWidth}
        </button>
        {showWidthPicker && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowWidthPicker(false)} />
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}>
              {WIDTHS.map(w => (
                <button
                  key={w}
                  onClick={() => {
                    setCurrentWidth(w)
                    setShowWidthPicker(false)
                  }}
                  style={{
                    display: 'block', width: '100%', padding: '4px 12px', border: 'none',
                    background: w === currentWidth ? 'var(--hover)' : 'none',
                    textAlign: 'left', fontSize: 12, cursor: 'pointer', borderRadius: 4,
                    color: 'var(--text)',
                  }}
                >
                  <span style={{ display: 'inline-block', width: 40, height: w, background: currentColor, borderRadius: w / 2, verticalAlign: 'middle' }} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

      {/* Undo / Redo */}
      <button onClick={() => editor.undo()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', padding: '4px' }} title="Undo">↩</button>
      <button onClick={() => editor.redo()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', padding: '4px' }} title="Redo">↪</button>

      <div style={{ flex: 1 }} />

      {/* Page indicator */}
      <button
        onClick={() => setCurrentPage(currentPageIndex - 1)}
        disabled={currentPageIndex === 0}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: currentPageIndex === 0 ? 'var(--border)' : 'var(--text-muted)', padding: '4px' }}
      >
        ◀
      </button>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {currentPageIndex + 1} / {pages.length}
      </span>
      <button
        onClick={() => setCurrentPage(currentPageIndex + 1)}
        disabled={currentPageIndex === pages.length - 1}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: currentPageIndex === pages.length - 1 ? 'var(--border)' : 'var(--text-muted)', padding: '4px' }}
      >
        ▶
      </button>
    </div>
  )
}
