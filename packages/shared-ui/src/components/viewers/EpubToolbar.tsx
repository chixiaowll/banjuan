import React, { useState, useRef, useEffect } from 'react'
import { PanelLeft, Minus as MinusIcon, Plus as PlusIcon, ChevronDown, Search, PanelRight, Clock, Pen, Eraser, Highlighter, Square, Eye, EyeOff, Sun, Monitor } from 'lucide-react'
import { useEpubViewer, ANNOTATION_COLORS } from './EpubViewerContext.js'
import { useReadingTimer } from './useReadingTimer.js'
import { useEyeProtection, useEinkMode } from './useEyeProtection.js'
import { useT } from '../../i18n/index.js'

interface Props {
  docId: string
  metadata: Record<string, unknown>
}

const TOOL_IDS: Array<{ id: 'highlight' | 'area' | 'ink' | 'eraser'; icon: React.ReactNode; key: string }> = [
  { id: 'highlight', icon: <Highlighter size={16} />, key: 'tool.highlight' },
  { id: 'area', icon: <Square size={16} />, key: 'tool.area' },
  { id: 'ink', icon: <Pen size={16} />, key: 'tool.ink' },
  { id: 'eraser', icon: <Eraser size={16} />, key: 'tool.eraser' },
]

export default function EpubToolbar({ docId, metadata }: Props) {
  const t = useT()
  const ctx = useEpubViewer()
  const { eyeProtection, toggleEyeProtection } = useEyeProtection()
  const { einkMode, toggleEinkMode } = useEinkMode()
  const { formatted: readingTime } = useReadingTimer(docId, metadata)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorRef = useRef<HTMLDivElement>(null)

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
      <button style={btnStyle} onClick={() => ctx.setLeftSidebarOpen(!ctx.leftSidebarOpen)} title="Toggle left sidebar">
        <PanelLeft size={16} />
      </button>
      <div style={sepStyle} />

      <button style={btnStyle} onClick={() => ctx.setFontSize(s => Math.max(50, s - 10))} title="Decrease font">
        <MinusIcon size={16} />
      </button>
      <span style={{ fontSize: 11, minWidth: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
        {ctx.fontSize}%
      </span>
      <button style={btnStyle} onClick={() => ctx.setFontSize(s => Math.min(200, s + 10))} title="Increase font">
        <PlusIcon size={16} />
      </button>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <span style={{ fontSize: 11, minWidth: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
          {ctx.percentage > 0 ? `${ctx.percentage}%` : '—'}
        </span>

        <div style={sepStyle} />

        {TOOL_IDS.map(tool => (
          <button
            key={tool.id}
            style={ctx.activeTool === tool.id ? activeBtnStyle : btnStyle}
            onClick={() => { ctx.setActiveTool(ctx.activeTool === tool.id ? 'none' : tool.id); ctx.setInkEraserActive(false) }}
            title={t(tool.key as any)}
          >
            {tool.icon}
          </button>
        ))}

        {ctx.activeTool !== 'ink' && ctx.activeTool !== 'eraser' && ctx.activeTool !== 'lasso' && ctx.activeTool !== 'area' && (
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
              <ChevronDown size={14} />
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
        )}

        <div style={sepStyle} />
        <button
          style={ctx.annotationsVisible ? btnStyle : activeBtnStyle}
          onClick={() => ctx.setAnnotationsVisible(!ctx.annotationsVisible)}
          title={ctx.annotationsVisible ? t('pdf.hideAnnotations' as any) : t('pdf.showAnnotations' as any)}
        >
          {ctx.annotationsVisible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <button
          style={eyeProtection ? { ...btnStyle, color: '#d69e2e' } : btnStyle}
          onClick={toggleEyeProtection}
          title={t('pdf.eyeProtection' as any)}
        >
          <Sun size={16} />
        </button>
        <button
          style={einkMode ? { ...btnStyle, color: '#718096' } : btnStyle}
          onClick={toggleEinkMode}
          title={t('pdf.einkMode' as any)}
        >
          <Monitor size={16} />
        </button>
      </div>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }} title="Reading time">
        <Clock size={12} />
        {readingTime}
      </span>
      <button
        style={ctx.searchOpen ? activeBtnStyle : btnStyle}
        onClick={() => ctx.setSearchOpen(!ctx.searchOpen)}
        title="Search (Cmd+F)"
      >
        <Search size={16} />
      </button>
      <button style={btnStyle} onClick={() => ctx.setRightSidebarOpen(!ctx.rightSidebarOpen)} title="Toggle right sidebar">
        <PanelRight size={16} />
      </button>
    </div>
  )
}
