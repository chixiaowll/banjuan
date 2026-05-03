import React, { useState, useCallback, lazy, Suspense } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { FLOWCHART_TEMPLATE, MERMAID_TEMPLATES } from './mermaidTemplates.js'

const MermaidCodeEditor = lazy(() => import('./MermaidCodeEditor.js'))
const MermaidPreview = lazy(() => import('./MermaidPreview.js'))

type ViewMode = 'code' | 'preview' | 'split'

export const MermaidBlock = createReactBlockSpec(
  {
    type: 'mermaidBlock' as const,
    propSchema: {
      code: { default: FLOWCHART_TEMPLATE },
      viewMode: { default: 'split' as const },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const { code, viewMode } = props.block.props

      return (
        <MermaidBlockContent
          code={code}
          viewMode={viewMode as ViewMode}
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
          readOnly={!props.editor.isEditable}
        />
      )
    },
  }
)()

interface ContentProps {
  code: string
  viewMode: ViewMode
  onCodeChange: (code: string) => void
  onViewModeChange: (mode: ViewMode) => void
  readOnly: boolean
}

function MermaidBlockContent({ code, viewMode, onCodeChange, onViewModeChange, readOnly }: ContentProps) {
  const [localCode, setLocalCode] = useState(code)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
  }, [onCodeChange])

  React.useEffect(() => {
    return () => clearTimeout(debounceRef.current)
  }, [])

  React.useEffect(() => {
    setLocalCode(code)
  }, [code])

  if (readOnly) {
    return (
      <div className="mermaid-block" contentEditable={false}>
        <Suspense fallback={<div className="mermaid-loading">Loading diagram...</div>}>
          <MermaidPreview code={localCode} />
        </Suspense>
      </div>
    )
  }

  const activeMode = viewMode || 'split'

  return (
    <div className="mermaid-block" contentEditable={false}>
      <div className="mermaid-toolbar">
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
        <div className="mermaid-toolbar__templates">
          {MERMAID_TEMPLATES.map((t) => (
            <button
              key={t.label}
              className="mermaid-toolbar__btn"
              onClick={() => handleTemplateSelect(t.code)}
              title={t.label}
            >
              {t.label}
            </button>
          ))}
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
              <MermaidPreview code={localCode} />
            </div>
          )}
        </div>
      </Suspense>
    </div>
  )
}
