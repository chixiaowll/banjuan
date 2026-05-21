import React, { useEffect, useRef, useState } from 'react'
import { Highlighter, Copy, Underline, ChevronDown } from 'lucide-react'
import { ANNOTATION_COLORS as DEFAULT_COLORS } from './PdfViewerContext.js'

interface Props {
  position: { x: number; y: number; bottom: number }
  color: string
  colors?: Array<{ name: string; value: string }>
  onHighlight: () => void
  onUnderline: () => void
  onCopy: () => void
  onChangeColor: (color: string) => void
  onClose: () => void
}

export default function TextSelectionToolbar({
  position, color, colors = DEFAULT_COLORS, onHighlight, onUnderline, onCopy, onChangeColor, onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [above, setAbove] = useState(false)
  const [showColors, setShowColors] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    if (position.bottom + rect.height + 8 > window.innerHeight) {
      setAbove(true)
    }
  }, [position])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const top = above ? position.y - 8 : position.bottom + 6
  const transformY = above ? 'translateX(-50%) translateY(-100%)' : 'translateX(-50%)'

  return (
    <div ref={ref} style={{
      position: 'fixed', left: position.x, top,
      transform: transformY,
      zIndex: 9999, display: 'flex', alignItems: 'center',
      background: 'var(--bg)', borderRadius: 8, padding: 3,
      border: '1px solid var(--border)',
      boxShadow: '0 2px 16px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)',
    }}>
      <ToolBtn onClick={onHighlight} title="高亮" color={color}>
        <Highlighter size={14} />
      </ToolBtn>
      <ToolBtn onClick={onUnderline} title="下划线" color={color}>
        <Underline size={14} />
      </ToolBtn>
      <ToolBtn onClick={onCopy} title="复制">
        <Copy size={14} />
      </ToolBtn>
      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 1px', flexShrink: 0 }} />
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowColors(!showColors)}
          style={{
            border: 'none', background: 'none', cursor: 'pointer',
            padding: '4px 6px', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 3,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--selected)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <span style={{
            width: 14, height: 14, borderRadius: '50%', background: color,
            display: 'block', border: '1px solid var(--border)',
          }} />
          <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} />
        </button>
        {showColors && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 6, display: 'flex', gap: 5,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          }}>
            {colors.map(c => (
              <button key={c.value} onClick={() => { onChangeColor(c.value); setShowColors(false) }} style={{
                width: 20, height: 20, borderRadius: '50%', padding: 0, cursor: 'pointer',
                background: c.value,
                border: color === c.value ? '2.5px solid var(--accent)' : '1.5px solid var(--border)',
                transition: 'transform 0.1s',
              }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ToolBtn({ onClick, title, color, children }: {
  onClick: () => void; title: string; color?: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        border: 'none', background: 'none', cursor: 'pointer',
        padding: '5px 8px', borderRadius: 5, color: 'var(--text)',
        display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1,
        position: 'relative',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--selected)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {children}
      {color && (
        <span style={{
          position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
          width: 10, height: 2, borderRadius: 1, background: color,
        }} />
      )}
    </button>
  )
}
