import React from 'react'

export interface HeadingItem {
  id: string
  text: string
  level: number
}

interface Props {
  headings: HeadingItem[]
  activeId?: string
}

export default function NoteOutlinePanel({ headings, activeId }: Props) {
  const handleClick = (id: string) => {
    const el = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
    if (!el) return
    let container = el.parentElement
    while (container && container.scrollHeight <= container.clientHeight) {
      container = container.parentElement
    }
    if (container) {
      const containerRect = container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      container.scrollTo({
        top: elRect.top - containerRect.top + container.scrollTop - 8,
        behavior: 'smooth',
      })
    }
  }

  if (headings.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>
        暂无标题
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 0', overflow: 'auto', height: '100%' }}>
      {headings.map((h) => (
        <div
          key={h.id}
          onClick={() => handleClick(h.id)}
          style={{
            padding: '4px 12px',
            paddingLeft: 12 + (h.level - 1) * 16,
            fontSize: 12,
            cursor: 'pointer',
            color: activeId === h.id ? 'var(--accent)' : 'var(--text)',
            fontWeight: activeId === h.id ? 600 : 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title={h.text}
        >
          {h.text || '(空标题)'}
        </div>
      ))}
    </div>
  )
}
