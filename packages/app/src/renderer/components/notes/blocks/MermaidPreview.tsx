import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import type { MermaidTheme } from './mermaidTemplates.js'

let renderCounter = 0

const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict' as const,
  fontFamily: 'inherit',
  fontSize: 13,
  flowchart: { padding: 8, nodeSpacing: 30, rankSpacing: 40, curve: 'basis' as const },
  sequence: { mirrorActors: false, messageMargin: 30, boxMargin: 6, noteMargin: 6 },
  gantt: { barHeight: 20, fontSize: 12, sectionFontSize: 13 },
  themeVariables: { fontSize: '13px' },
}

interface Props {
  code: string
  theme?: MermaidTheme
}

export default function MermaidPreview({ code, theme = 'neutral' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code.trim()) {
      if (containerRef.current) containerRef.current.innerHTML = ''
      setError(null)
      return
    }

    mermaid.initialize({ ...MERMAID_CONFIG, theme })

    const id = `mermaid-${++renderCounter}`
    let cancelled = false

    mermaid.render(id, code).then(({ svg }) => {
      if (cancelled || !containerRef.current) return
      containerRef.current.innerHTML = svg
      const svgEl = containerRef.current.querySelector('svg')
      if (svgEl) {
        svgEl.style.maxWidth = '100%'
        svgEl.style.height = 'auto'
      }
      setError(null)
    }).catch((err) => {
      if (cancelled) return
      setError(err?.message || 'Invalid Mermaid syntax')
      if (containerRef.current) containerRef.current.innerHTML = ''
    })

    return () => { cancelled = true }
  }, [code, theme])

  if (!code.trim()) {
    return (
      <div className="mermaid-preview mermaid-preview--empty">
        Write Mermaid syntax to see diagram
      </div>
    )
  }

  return (
    <div className="mermaid-preview">
      {error && <div className="mermaid-preview__error">{error}</div>}
      <div ref={containerRef} className="mermaid-preview__svg" />
    </div>
  )
}
