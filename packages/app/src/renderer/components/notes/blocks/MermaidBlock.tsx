import React, { useState, useCallback, lazy, Suspense } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { FLOWCHART_TEMPLATE, MERMAID_TEMPLATES, MERMAID_THEMES } from './mermaidTemplates.js'
import type { MermaidTheme } from './mermaidTemplates.js'

const MermaidCodeEditor = lazy(() => import('./MermaidCodeEditor.js'))
const MermaidPreview = lazy(() => import('./MermaidPreview.js'))

type ViewMode = 'code' | 'preview' | 'split'

export const MermaidBlock = createReactBlockSpec(
  {
    type: 'mermaidBlock' as const,
    propSchema: {
      code: { default: FLOWCHART_TEMPLATE },
      viewMode: { default: 'split' as const },
      theme: { default: 'neutral' as const },
      renderWidth: { default: 500 },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const { code, viewMode, theme, renderWidth } = props.block.props

      return (
        <MermaidBlockContent
          code={code}
          viewMode={viewMode as ViewMode}
          theme={(theme || 'neutral') as MermaidTheme}
          renderWidth={renderWidth || 500}
          onCodeChange={(newCode) => {
            props.editor.updateBlock(props.block, {
              props: { code: newCode },
            })
          }}
          onViewModeChange={(mode) => {
            props.editor.updateBlock(props.block, {
              props: { viewMode: mode },
            })
          }}
          onThemeChange={(t) => {
            props.editor.updateBlock(props.block, {
              props: { theme: t },
            })
          }}
          onRenderWidthChange={(w) => {
            props.editor.updateBlock(props.block, {
              props: { renderWidth: w },
            })
          }}
          readOnly={!props.editor.isEditable}
        />
      )
    },
  }
)()

interface ContentProps {
  code: string
  viewMode: ViewMode
  theme: MermaidTheme
  renderWidth: number
  onCodeChange: (code: string) => void
  onViewModeChange: (mode: ViewMode) => void
  onThemeChange: (theme: MermaidTheme) => void
  onRenderWidthChange: (width: number) => void
  readOnly: boolean
}

function MermaidBlockContent({ code, viewMode, theme, renderWidth, onCodeChange, onViewModeChange, onThemeChange, onRenderWidthChange, readOnly }: ContentProps) {
  const [localCode, setLocalCode] = useState(code)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const templateRef = React.useRef<HTMLDivElement>(null)
  const themeRef = React.useRef<HTMLDivElement>(null)
  const resizeRef = React.useRef<{ startX: number; startWidth: number } | null>(null)

  const handleCodeChange = useCallback((newCode: string) => {
    setLocalCode(newCode)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onCodeChange(newCode)
    }, 300)
  }, [onCodeChange])

  const handleTemplateSelect = useCallback((templateCode: string) => {
    setLocalCode(templateCode)
    onCodeChange(templateCode)
    setTemplateOpen(false)
  }, [onCodeChange])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizeRef.current = { startX: e.clientX, startWidth: renderWidth }

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const delta = ev.clientX - resizeRef.current.startX
      const newWidth = Math.max(300, Math.min(1200, resizeRef.current.startWidth + delta))
      onRenderWidthChange(newWidth)
    }

    const onMouseUp = () => {
      resizeRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }, [renderWidth, onRenderWidthChange])

  React.useEffect(() => {
    return () => clearTimeout(debounceRef.current)
  }, [])

  React.useEffect(() => {
    setLocalCode(code)
  }, [code])

  React.useEffect(() => {
    if (!templateOpen && !themeOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (templateOpen && templateRef.current && !templateRef.current.contains(e.target as Node)) {
        setTemplateOpen(false)
      }
      if (themeOpen && themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setThemeOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [templateOpen, themeOpen])

  if (readOnly) {
    return (
      <div className="mermaid-block" contentEditable={false}>
        <Suspense fallback={<div className="mermaid-loading">Loading diagram...</div>}>
          <MermaidPreview code={localCode} theme={theme} renderWidth={renderWidth} />
        </Suspense>
      </div>
    )
  }

  const activeMode = viewMode || 'split'
  const currentThemeLabel = MERMAID_THEMES.find(t => t.value === theme)?.label || 'Default'

  return (
    <div className="mermaid-block" contentEditable={false}>
      <div className="mermaid-toolbar">
        <div className="mermaid-toolbar__left">
          <div className="mermaid-toolbar__modes">
            <button
              className={`mermaid-toolbar__btn ${activeMode === 'code' ? 'mermaid-toolbar__btn--active' : ''}`}
              onClick={() => onViewModeChange('code')}
              title="Code"
            >
              {'</>'}
            </button>
            <button
              className={`mermaid-toolbar__btn ${activeMode === 'split' ? 'mermaid-toolbar__btn--active' : ''}`}
              onClick={() => onViewModeChange('split')}
              title="Split"
            >
              ⬜⬜
            </button>
            <button
              className={`mermaid-toolbar__btn ${activeMode === 'preview' ? 'mermaid-toolbar__btn--active' : ''}`}
              onClick={() => onViewModeChange('preview')}
              title="Preview"
            >
              ▶
            </button>
          </div>
        </div>

        <div className="mermaid-toolbar__right">
          <span className="mermaid-toolbar__size-label">{renderWidth}px</span>

          <div className="mermaid-dropdown" ref={themeRef}>
            <button
              className="mermaid-toolbar__btn"
              onClick={() => { setThemeOpen(!themeOpen); setTemplateOpen(false) }}
            >
              🎨 {currentThemeLabel}
            </button>
            {themeOpen && (
              <div className="mermaid-dropdown__menu">
                {MERMAID_THEMES.map((t) => (
                  <button
                    key={t.value}
                    className={`mermaid-dropdown__item ${theme === t.value ? 'mermaid-dropdown__item--active' : ''}`}
                    onClick={() => { onThemeChange(t.value); setThemeOpen(false) }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mermaid-dropdown" ref={templateRef}>
            <button
              className="mermaid-toolbar__btn"
              onClick={() => { setTemplateOpen(!templateOpen); setThemeOpen(false) }}
            >
              📋 Template
            </button>
            {templateOpen && (
              <div className="mermaid-dropdown__menu">
                {MERMAID_TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    className="mermaid-dropdown__item"
                    onClick={() => handleTemplateSelect(t.code)}
                  >
                    <span className="mermaid-dropdown__icon">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Suspense fallback={<div className="mermaid-loading">Loading...</div>}>
        <div className={`mermaid-body mermaid-body--${activeMode}`}>
          {(activeMode === 'code' || activeMode === 'split') && (
            <div className="mermaid-body__editor">
              <MermaidCodeEditor code={localCode} onChange={handleCodeChange} />
            </div>
          )}
          {(activeMode === 'preview' || activeMode === 'split') && (
            <div className="mermaid-body__preview">
              <MermaidPreview code={localCode} theme={theme} renderWidth={renderWidth} />
            </div>
          )}
        </div>
      </Suspense>

      {!readOnly && (
        <div className="mermaid-resize-handle" onMouseDown={handleResizeStart} title="Drag to resize diagram" />
      )}
    </div>
  )
}
