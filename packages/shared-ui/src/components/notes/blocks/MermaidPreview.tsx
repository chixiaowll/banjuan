import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import type { MermaidTheme } from './mermaidTemplates.js'

let renderCounter = 0

const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict' as const,
  fontFamily: 'inherit',
  fontSize: 12,
  htmlLabels: false,
  flowchart: { padding: 6, nodeSpacing: 30, rankSpacing: 40, curve: 'basis' as const },
  sequence: { mirrorActors: false, messageMargin: 30, boxMargin: 6, noteMargin: 6, messageFontSize: 12, actorFontSize: 12 },
  gantt: { barHeight: 18, fontSize: 12, sectionFontSize: 12 },
}

interface Props {
  code: string
  theme?: MermaidTheme
  renderWidth?: number
}

export default function MermaidPreview({ code, theme = 'neutral', renderWidth }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [debouncedWidth, setDebouncedWidth] = useState(renderWidth)
  const widthTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    clearTimeout(widthTimerRef.current)
    widthTimerRef.current = setTimeout(() => {
      setDebouncedWidth(renderWidth)
    }, 200)
    return () => clearTimeout(widthTimerRef.current)
  }, [renderWidth])

  useEffect(() => {
    if (!code.trim()) {
      if (containerRef.current) containerRef.current.innerHTML = ''
      setError(null)
      return
    }

    mermaid.initialize({ ...MERMAID_CONFIG, theme })

    const id = `mermaid-${++renderCounter}`
    let cancelled = false

    const tempDiv = document.createElement('div')
    tempDiv.style.width = `${debouncedWidth || 500}px`
    tempDiv.style.position = 'absolute'
    tempDiv.style.left = '-9999px'
    document.body.appendChild(tempDiv)

    mermaid.render(id, code, tempDiv).then(({ svg }) => {
      document.body.removeChild(tempDiv)
      if (cancelled || !containerRef.current) return
      containerRef.current.innerHTML = svg
      const svgEl = containerRef.current.querySelector('svg')
      if (svgEl) {
        svgEl.style.maxWidth = '100%'
        svgEl.style.height = 'auto'
      }
      setError(null)
    }).catch((err) => {
      if (document.body.contains(tempDiv)) document.body.removeChild(tempDiv)
      if (cancelled) return
      setError(err?.message || 'Invalid Mermaid syntax')
      if (containerRef.current) containerRef.current.innerHTML = ''
    })

    return () => { cancelled = true }
  }, [code, theme, debouncedWidth])

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
