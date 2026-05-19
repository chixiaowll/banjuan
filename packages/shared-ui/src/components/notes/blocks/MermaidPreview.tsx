import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import mermaid from 'mermaid'
import { getMermaidThemeConfig } from './mermaidTemplates.js'
import type { MermaidTheme } from './mermaidTemplates.js'

let renderCounter = 0


const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: 'loose' as const,
  fontFamily: 'inherit',
  fontSize: 12,
  htmlLabels: true,
  flowchart: { padding: 15, nodeSpacing: 30, rankSpacing: 40, curve: 'basis' as const, useMaxWidth: false },
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
  const [fullscreen, setFullscreen] = useState(false)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)
  const fullscreenSvgRef = useRef<string>('')

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

    const themeConfig = getMermaidThemeConfig(theme)
    mermaid.initialize({
      ...MERMAID_CONFIG,
      theme: themeConfig.mermaidTheme,
      ...(themeConfig.themeVariables ? { themeVariables: themeConfig.themeVariables } : {}),
    })

    const id = `mermaid-${++renderCounter}`
    let cancelled = false

    const tempDiv = document.createElement('div')
    tempDiv.style.position = 'absolute'
    tempDiv.style.left = '-9999px'
    tempDiv.style.width = '9999px'
    document.body.appendChild(tempDiv)

    mermaid.render(id, code, tempDiv).then(({ svg }) => {
      document.body.removeChild(tempDiv)
      if (cancelled || !containerRef.current) return
      containerRef.current.innerHTML = svg
      fullscreenSvgRef.current = svg
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

  const openFullscreen = useCallback(() => {
    setScale(1)
    setPan({ x: 0, y: 0 })
    setFullscreen(true)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setScale(s => Math.max(0.2, Math.min(5, s - e.deltaY * 0.001)))
  }, [])

  const didDragRef = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    didDragRef.current = false
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [pan])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true
    setPan({
      x: dragRef.current.startPanX + dx,
      y: dragRef.current.startPanY + dy,
    })
  }, [])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (didDragRef.current) return
    if (e.target === e.currentTarget) setFullscreen(false)
  }, [])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [fullscreen])

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
      <div
        ref={containerRef}
        className="mermaid-preview__svg"
        onClick={openFullscreen}
        style={{ cursor: 'zoom-in' }}
        title="Click to view full size"
      />

      {fullscreen && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.7)',
            overflow: 'hidden', cursor: 'grab',
          }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              className="mermaid-preview__svg"
              style={{
                background: '#fff',
                borderRadius: 8,
                padding: 24,
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              }}
              dangerouslySetInnerHTML={{ __html: fullscreenSvgRef.current }}
            />
          </div>
          <button
            onClick={() => setFullscreen(false)}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
              borderRadius: 20, width: 36, height: 36, cursor: 'pointer',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'auto',
            }}
          >✕</button>
        </div>,
        document.body,
      )}
    </div>
  )
}

