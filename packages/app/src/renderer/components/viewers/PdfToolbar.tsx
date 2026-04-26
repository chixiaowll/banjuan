import React, { useState, useRef, useEffect } from 'react'
import { usePdfViewer, ANNOTATION_COLORS, type AnnotationTool } from './PdfViewerContext.js'

const TOOLS: Array<{ id: AnnotationTool; label: string; icon: string }> = [
  { id: 'highlight', label: '高亮', icon: '🖍' },
  { id: 'text', label: '文本', icon: '📌' },
  { id: 'area', label: '区域', icon: '⬜' },
  { id: 'ink', label: '画笔', icon: '✏️' },
  { id: 'eraser', label: '擦除', icon: '🧹' },
]

export default function PdfToolbar() {
  const ctx = usePdfViewer()
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [pageInput, setPageInput] = useState('')
  const colorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPageInput(String(ctx.currentPage))
  }, [ctx.currentPage])

  useEffect(() => {
    if (!showColorPicker) return
    const handler = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setShowColorPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColorPicker])

  const handlePageSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const num = parseInt(pageInput, 10)
      if (num >= 1 && num <= ctx.numPages) {
        ctx.scrollToPage(num)
      } else {
        setPageInput(String(ctx.currentPage))
      }
    }
  }

  const btnStyle: React.CSSProperties = {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: 4,
    fontSize: 14,
    color: 'var(--text)',
    lineHeight: 1,
  }

  const activeBtnStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'var(--selected)',
  }

  const sepStyle: React.CSSProperties = {
    width: 1,
    height: 20,
    background: 'var(--border)',
    margin: '0 4px',
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      height: 36,
      padding: '0 8px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
      flexShrink: 0,
      gap: 2,
      fontSize: 13,
    }}>
      {/* Left section: sidebar toggle + zoom */}
      <button style={btnStyle} onClick={() => ctx.setLeftSidebarOpen(!ctx.leftSidebarOpen)} title="Toggle left sidebar">
        ☰
      </button>
      <div style={sepStyle} />
      <button style={btnStyle} onClick={() => ctx.setZoom(z => Math.max(0.5, z - 0.25))} title="Zoom out">
        −
      </button>
      <span style={{ fontSize: 11, minWidth: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
        {Math.round(ctx.zoom * 100)}%
      </span>
      <button style={btnStyle} onClick={() => ctx.setZoom(z => Math.min(3, z + 0.25))} title="Zoom in">
        +
      </button>
      <button style={btnStyle} onClick={ctx.resetZoom} title="Reset zoom">
        ↺
      </button>

      {/* Center section: page nav + annotation tools */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <button style={btnStyle} onClick={() => ctx.scrollToPage(Math.max(1, ctx.currentPage - 1))} title="Previous page">
          ◀
        </button>
        <input
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={handlePageSubmit}
          onBlur={() => setPageInput(String(ctx.currentPage))}
          style={{
            width: 40, textAlign: 'center', border: '1px solid var(--border)',
            borderRadius: 3, padding: '2px 4px', fontSize: 12,
            background: 'var(--bg)', color: 'var(--text)',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ {ctx.numPages}</span>
        <button style={btnStyle} onClick={() => ctx.scrollToPage(Math.min(ctx.numPages, ctx.currentPage + 1))} title="Next page">
          ▶
        </button>

        <div style={sepStyle} />

        {TOOLS.map(tool => (
          <button
            key={tool.id}
            style={ctx.activeTool === tool.id ? activeBtnStyle : btnStyle}
            onClick={() => ctx.setActiveTool(ctx.activeTool === tool.id ? 'none' : tool.id)}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}

        {/* Color picker */}
        <div ref={colorRef} style={{ position: 'relative' }}>
          <button
            style={{ ...btnStyle, display: 'flex', alignItems: 'center', gap: 3 }}
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="Color"
          >
            <span style={{
              width: 14, height: 14, borderRadius: '50%',
              background: ctx.activeColor, border: '1px solid var(--border)',
              display: 'inline-block',
            }} />
            <span style={{ fontSize: 10 }}>▾</span>
          </button>
          {showColorPicker && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 100,
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 6, padding: 6, display: 'flex', gap: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>
              {ANNOTATION_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => { ctx.setActiveColor(c.value); setShowColorPicker(false) }}
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: c.value, border: ctx.activeColor === c.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                    cursor: 'pointer', padding: 0,
                  }}
                  title={c.name}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right section: search + right sidebar toggle */}
      <button
        style={ctx.searchOpen ? activeBtnStyle : btnStyle}
        onClick={() => ctx.setSearchOpen(!ctx.searchOpen)}
        title="Search (Cmd+F)"
      >
        🔍
      </button>
      <button style={btnStyle} onClick={() => ctx.setRightSidebarOpen(!ctx.rightSidebarOpen)} title="Toggle right sidebar">
        ☰
      </button>
    </div>
  )
}
