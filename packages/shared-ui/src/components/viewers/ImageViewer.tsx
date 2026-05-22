import React, { useState, useRef, useCallback } from 'react'
import { Minus, Plus, RotateCw, Maximize, Sun, Hand, MousePointer2 } from 'lucide-react'
import { useEyeProtection } from './useEyeProtection.js'

interface Props {
  filePath: string
}

const btnStyle: React.CSSProperties = {
  background: 'var(--surface-raised, #fff)',
  border: '1px solid var(--border-solid, #e5e5e7)',
  borderRadius: 'var(--radius-sm, 6px)',
  cursor: 'pointer',
  padding: '4px 8px',
  display: 'inline-flex',
  alignItems: 'center',
  color: 'var(--text-secondary, #6e6e73)',
}

export default function ImageViewer({ filePath }: Props) {
  const { eyeProtection, toggleEyeProtection } = useEyeProtection()
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [panMode, setPanMode] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setScale(s => {
        const next = Math.min(5, Math.max(0.1, s + (e.deltaY > 0 ? -0.1 : 0.1)))
        if (next <= 1) setOffset({ x: 0, y: 0 })
        return next
      })
    }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!panMode) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [panMode, offset])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.startX),
      y: dragRef.current.oy + (e.clientY - dragRef.current.startY),
    })
  }, [])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const resetView = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '6px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        flexShrink: 0,
        background: 'var(--surface, #f8f7f5)',
      }}>
        <button
          style={{ ...btnStyle, ...(panMode ? {} : { background: 'var(--selected, #eee)' }) }}
          onClick={() => setPanMode(false)}
          title="Select"
        >
          <MousePointer2 size={14} />
        </button>
        <button
          style={{ ...btnStyle, ...(panMode ? { background: 'var(--selected, #eee)' } : {}) }}
          onClick={() => setPanMode(true)}
          title="Pan"
        >
          <Hand size={14} />
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />
        <button style={btnStyle} onClick={() => { setScale(s => { const n = Math.max(0.1, +(s - 0.1).toFixed(2)); if (n <= 1) setOffset({ x: 0, y: 0 }); return n }) }}>
          <Minus size={14} />
        </button>
        <span style={{ fontSize: 12, minWidth: 44, textAlign: 'center', color: 'var(--text-muted)' }}>
          {Math.round(scale * 100)}%
        </span>
        <button style={btnStyle} onClick={() => setScale(s => Math.min(5, +(s + 0.1).toFixed(2)))}>
          <Plus size={14} />
        </button>
        <button style={btnStyle} onClick={resetView} title="Fit to window">
          <Maximize size={14} />
        </button>
        <button style={btnStyle} onClick={() => setRotation(r => (r + 90) % 360)}>
          <RotateCw size={14} />
        </button>
        <button
          style={{ ...btnStyle, color: eyeProtection ? '#d69e2e' : 'var(--text-secondary, #6e6e73)' }}
          onClick={toggleEyeProtection}
          title="Eye Protection"
        >
          <Sun size={14} />
        </button>
        {naturalSize && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
            {naturalSize.w} × {naturalSize.h}
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--surface, #f8f7f5)',
          cursor: panMode ? 'grab' : 'default',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <img
          src={`local-file://${encodeURIComponent(filePath)}`}
          onLoad={handleLoad}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})${rotation ? ` rotate(${rotation}deg)` : ''}`,
            transformOrigin: 'center center',
            display: 'block',
            filter: eyeProtection ? 'sepia(0.18) saturate(1.1)' : undefined,
            transition: dragRef.current ? 'none' : 'transform 0.15s ease, filter 0.2s ease',
          }}
          draggable={false}
        />
      </div>
    </div>
  )
}
