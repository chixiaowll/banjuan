import React, { useState, useEffect, useRef } from 'react'

const PRESET_COLORS = [
  '#4a7ab5', '#7b6ba8', '#a07842', '#3d8a66',
  '#5d5da0', '#9a8035', '#a35882', '#3a7f86',
  '#737a84', '#6b8a3d', '#8a6b3d', '#3d6b8a',
]

interface Props {
  value: string | null
  onChange: (color: string) => void
  onClose: () => void
}

export default function ColorPicker({ value, onChange, onClose }: Props) {
  const [custom, setCustom] = useState(value || '')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', left: 0, marginTop: 4,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      zIndex: 200, width: 180,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
        {PRESET_COLORS.map((color) => (
          <div
            key={color}
            onClick={() => { onChange(color); onClose() }}
            style={{
              width: 32, height: 32, borderRadius: 6, background: color, cursor: 'pointer',
              border: value === color ? '2px solid var(--text)' : '2px solid transparent',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="#hex"
          style={{
            flex: 1, fontSize: 11, padding: '3px 6px',
            border: '1px solid var(--border)', borderRadius: 4,
            background: 'var(--surface)', color: 'var(--text)', outline: 'none',
          }}
        />
        <button
          onClick={() => { if (/^#[0-9a-fA-F]{6}$/.test(custom)) { onChange(custom); onClose() } }}
          style={{ fontSize: 11, padding: '3px 8px' }}
        >OK</button>
      </div>
    </div>
  )
}
