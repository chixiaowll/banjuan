import React, { useState, useRef, useCallback } from 'react'
import { Minus, Plus, RotateCw, Maximize } from 'lucide-react'

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
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setScale(s => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        return Math.min(5, Math.max(0.1, s + delta))
      })
    }
  }, [])

  const fitScale = 1
  const isSwapped = rotation % 180 !== 0

  const imgW = naturalSize ? naturalSize.w * scale : undefined
  const imgH = naturalSize ? naturalSize.h * scale : undefined

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
        <button style={btnStyle} onClick={() => setScale(s => Math.max(0.1, +(s - 0.25).toFixed(2)))}>
          <Minus size={14} />
        </button>
        <span style={{ fontSize: 12, minWidth: 44, textAlign: 'center', color: 'var(--text-muted)' }}>
          {Math.round(scale * 100)}%
        </span>
        <button style={btnStyle} onClick={() => setScale(s => Math.min(5, +(s + 0.25).toFixed(2)))}>
          <Plus size={14} />
        </button>
        <button style={btnStyle} onClick={() => setScale(fitScale)}>
          <Maximize size={14} />
        </button>
        <button style={btnStyle} onClick={() => setRotation(r => (r + 90) % 360)}>
          <RotateCw size={14} />
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
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          alignItems: scale <= 1 ? 'center' : 'flex-start',
          justifyContent: scale <= 1 ? 'center' : 'flex-start',
          background: 'var(--surface, #f8f7f5)',
          padding: scale > 1 ? 16 : 0,
        }}
      >
        <img
          src={`local-file://${encodeURIComponent(filePath)}`}
          onLoad={handleLoad}
          style={{
            width: imgW,
            height: imgH,
            maxWidth: scale <= 1 ? '100%' : 'none',
            maxHeight: scale <= 1 ? '100%' : 'none',
            objectFit: 'contain',
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            transformOrigin: 'center center',
            display: 'block',
            margin: scale <= 1 ? 'auto' : undefined,
          }}
          draggable={false}
        />
      </div>
    </div>
  )
}
