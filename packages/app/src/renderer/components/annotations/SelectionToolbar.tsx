import React from 'react'
import { useT } from '../../i18n/index.js'

const COLORS = [
  { name: 'yellow', value: '#fde68a' },
  { name: 'green', value: '#86efac' },
  { name: 'blue', value: '#93c5fd' },
  { name: 'pink', value: '#f9a8d4' },
  { name: 'orange', value: '#fed7aa' },
]

interface Props {
  position: { x: number; y: number }
  onHighlight: (color: string) => void
  onNote: () => void
  onDismiss: () => void
}

export default function SelectionToolbar({ position, onHighlight, onNote, onDismiss }: Props) {
  const t = useT()
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
        onClick={onDismiss}
      />
      <div style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
        background: 'var(--surface, #1e1e2e)',
        border: '1px solid var(--border, #45475a)',
        borderRadius: 8,
        padding: '6px 8px',
        display: 'flex',
        gap: '6px',
        alignItems: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}>
        {COLORS.map((c) => (
          <button
            key={c.name}
            onClick={() => onHighlight(c.value)}
            title={c.name}
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: c.value,
              border: '2px solid transparent',
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <button
          onClick={onNote}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text, #cdd6f4)',
            cursor: 'pointer',
            fontSize: 13,
            padding: '2px 6px',
          }}
        >
          {t('selection.annotate')}
        </button>
      </div>
    </>
  )
}
