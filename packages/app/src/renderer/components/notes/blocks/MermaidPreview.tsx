import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import type { MermaidTheme } from './mermaidTemplates.js'

let renderCounter = 0

interface Props {
  code: string
  theme?: MermaidTheme
}

export default function MermaidPreview({ code, theme = 'neutral' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme,
      securityLevel: 'strict',
      fontFamily: 'inherit',
    })
  }, [theme])

  useEffect(() => {
    if (!code.trim()) {
      if (containerRef.current) containerRef.current.innerHTML = ''
      setError(null)
      return
    }

    mermaid.initialize({
      startOnLoad: false,
      theme,
      securityLevel: 'strict',
      fontFamily: 'inherit',
    })

    const id = `mermaid-${++renderCounter}`
    let cancelled = false

    mermaid.render(id, code).then(({ svg }) => {
      if (cancelled || !containerRef.current) return
      containerRef.current.innerHTML = svg
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
