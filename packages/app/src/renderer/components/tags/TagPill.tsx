import React from 'react'
import { X } from 'lucide-react'

interface Props {
  name: string
  color: string | null
  onRemove?: () => void
}

function leafName(name: string): string {
  const parts = name.split('/')
  return parts[parts.length - 1]
}

function pillBg(color: string): string {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  const mix = (c: number) => Math.round(c * 0.15 + 255 * 0.85)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

export default function TagPill({ name, color, onRemove }: Props) {
  const fg = color || '#737a84'
  const bg = pillBg(fg)

  return (
    <span
      title={name}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
        padding: '2px 6px', borderRadius: 9999,
        background: bg, color: fg, whiteSpace: 'nowrap',
      }}
    >
      {leafName(name)}
      {onRemove && (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          style={{ cursor: 'pointer', display: 'inline-flex', marginLeft: 2, opacity: 0.6 }}
        >
          <X size={10} />
        </span>
      )}
    </span>
  )
}
