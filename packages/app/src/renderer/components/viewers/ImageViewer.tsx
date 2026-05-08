import React, { useState } from 'react'
import { Minus, Plus, RotateCw } from 'lucide-react'

interface Props {
  filePath: string
}

export default function ImageViewer({ filePath }: Props) {
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <button onClick={() => setScale(s => Math.max(0.1, s - 0.25))}><Minus size={16} /></button>
        <span style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(5, s + 0.25))}><Plus size={16} /></button>
        <button onClick={() => setScale(1)}>Fit</button>
        <button onClick={() => setRotation(r => (r + 90) % 360)}><RotateCw size={16} /></button>
      </div>
      <div style={{
        flex: 1, overflow: 'auto', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#2a2a3a',
      }}>
        <img
          src={`local-file://${encodeURIComponent(filePath)}`}
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            maxWidth: scale === 1 ? '100%' : 'none',
            maxHeight: scale === 1 ? '100%' : 'none',
            transition: 'transform 0.2s ease',
          }}
          draggable={false}
        />
      </div>
    </div>
  )
}
