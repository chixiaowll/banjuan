import React, { useState, useCallback, lazy, Suspense } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { FLOWCHART_TEMPLATE, MERMAID_TEMPLATES, MERMAID_THEMES } from './mermaidTemplates.js'
import type { MermaidTheme } from './mermaidTemplates.js'
import { useT } from '../../../i18n/index.js'

const MermaidCodeEditor = lazy(() => import('./MermaidCodeEditor.js'))
const MermaidPreview = lazy(() => import('./MermaidPreview.js'))

type ViewMode = 'code' | 'preview' | 'split'

export const MermaidBlock = createReactBlockSpec(
  {
    type: 'mermaidBlock' as const,
    propSchema: {
      code: { default: FLOWCHART_TEMPLATE },
      viewMode: { default: 'preview' as const },
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
  const t = useT()
  const [localCode, setLocalCode] = useState(code)
  const [localWidth, setLocalWidth] = useState(renderWidth)
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

  const latestWidthRef = React.useRef(localWidth)
  latestWidthRef.current = localWidth

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = { startX: e.clientX, startWidth: latestWidthRef.current }

    const onPointerMove = (ev: PointerEvent) => {
      if (!resizeRef.current) return
      const delta = ev.clientX - resizeRef.current.startX
      const newWidth = Math.max(300, Math.min(1200, resizeRef.current.startWidth + delta))
      setLocalWidth(newWidth)
    }

    const onPointerUp = () => {
      resizeRef.current = null
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onRenderWidthChange(latestWidthRef.current)
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.body.style.cursor = 'nwse-resize'
    document.body.style.userSelect = 'none'
  }, [onRenderWidthChange])

  React.useEffect(() => {
    return () => clearTimeout(debounceRef.current)
  }, [])

  React.useEffect(() => {
    setLocalCode(code)
  }, [code])

  React.useEffect(() => {
    setLocalWidth(renderWidth)
  }, [renderWidth])

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
      <div className="mermaid-block" style={{ width: localWidth, maxWidth: '100%' }} contentEditable={false}>
        <Suspense fallback={<div className="mermaid-loading">{t('mermaid.loading')}</div>}>
          <MermaidPreview code={localCode} theme={theme} renderWidth={localWidth} />
        </Suspense>
      </div>
    )
  }

  const activeMode = viewMode || 'split'
  const currentThemeLabel = MERMAID_THEMES.find(th => th.value === theme)?.label || 'Default'

  return (
    <div className="mermaid-block" style={{ width: localWidth, maxWidth: '100%' }} contentEditable={false}>
      <div className="mermaid-toolbar">
        <div className="mermaid-toolbar__left">
          <div className="mermaid-toolbar__modes">
            <button
              className={`mermaid-toolbar__btn ${activeMode === 'code' ? 'mermaid-toolbar__btn--active' : ''}`}
              onClick={() => onViewModeChange('code')}
              title={t('mermaid.viewCode')}
            >
              {'</>'}
            </button>
            <button
              className={`mermaid-toolbar__btn ${activeMode === 'split' ? 'mermaid-toolbar__btn--active' : ''}`}
              onClick={() => onViewModeChange('split')}
              title={t('mermaid.viewSplit')}
            >
              ⬜⬜
            </button>
            <button
              className={`mermaid-toolbar__btn ${activeMode === 'preview' ? 'mermaid-toolbar__btn--active' : ''}`}
              onClick={() => onViewModeChange('preview')}
              title={t('mermaid.viewPreview')}
            >
              ▶
            </button>
          </div>
        </div>

        <div className="mermaid-toolbar__right">
          <div className="mermaid-dropdown" ref={themeRef}>
            <button
              className="mermaid-toolbar__btn"
              onClick={() => { setThemeOpen(!themeOpen); setTemplateOpen(false) }}
            >
              🎨 {currentThemeLabel}
            </button>
            {themeOpen && (
              <div className="mermaid-dropdown__menu">
                {MERMAID_THEMES.map((th) => (
                  <button
                    key={th.value}
                    className={`mermaid-dropdown__item ${theme === th.value ? 'mermaid-dropdown__item--active' : ''}`}
                    onClick={() => { onThemeChange(th.value); setThemeOpen(false) }}
                  >
                    {th.label}
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
              📋 {t('mermaid.template')}
            </button>
            {templateOpen && (
              <div className="mermaid-dropdown__menu">
                {MERMAID_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.labelKey}
                    className="mermaid-dropdown__item"
                    onClick={() => handleTemplateSelect(tpl.code)}
                  >
                    <span className="mermaid-dropdown__icon">{tpl.icon}</span>
                    {t(tpl.labelKey)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Suspense fallback={<div className="mermaid-loading">{t('common.loading')}</div>}>
        <div className={`mermaid-body mermaid-body--${activeMode}`}>
          {(activeMode === 'code' || activeMode === 'split') && (
            <div className="mermaid-body__editor">
              <MermaidCodeEditor code={localCode} onChange={handleCodeChange} />
            </div>
          )}
          {(activeMode === 'preview' || activeMode === 'split') && (
            <div className="mermaid-body__preview">
              <MermaidPreview code={localCode} theme={theme} renderWidth={localWidth} />
            </div>
          )}
        </div>
      </Suspense>

      {!readOnly && (
        <div className="mermaid-resize-handle" onPointerDown={handleResizeStart} title={t('mermaid.resizeHint')} />
      )}
    </div>
  )
}
