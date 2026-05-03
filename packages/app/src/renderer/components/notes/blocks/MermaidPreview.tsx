import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  fontFamily: 'inherit',
})

let renderCounter = 0

interface Props {
  code: string
}

export default function MermaidPreview({ code }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code.trim()) {
      if (containerRef.current) containerRef.current.innerHTML = ''
      setError(null)
      return
    }

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
  }, [code])

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
