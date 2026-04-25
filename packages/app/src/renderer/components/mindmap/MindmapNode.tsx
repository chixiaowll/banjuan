import React from 'react'

interface Props {
  id: string
  title: string
  color: string | null
  x: number
  y: number
  isSelected: boolean
  collapsed: boolean
  hasChildren: boolean
  onSelect: (id: string) => void
  onDoubleClick: (id: string) => void
  onToggleCollapse: (id: string) => void
}

export default function MindmapNode({
  id, title, color, x, y, isSelected, collapsed, hasChildren,
  onSelect, onDoubleClick, onToggleCollapse,
}: Props) {
  const width = Math.max(120, title.length * 10 + 32)
  const height = 36

  return (
    <g
      transform={`translate(${x - width / 2},${y - height / 2})`}
      onClick={(e) => { e.stopPropagation(); onSelect(id) }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(id) }}
      style={{ cursor: 'pointer' }}
    >
      <rect
        width={width} height={height} rx={8} ry={8}
        fill={color ?? 'var(--surface, #313244)'}
        stroke={isSelected ? '#89b4fa' : 'var(--border, #45475a)'}
        strokeWidth={isSelected ? 2 : 1}
      />
      <text
        x={width / 2} y={height / 2 + 1}
        textAnchor="middle" dominantBaseline="central"
        fill="var(--text, #cdd6f4)" fontSize={13}
      >
        {title.length > 16 ? title.slice(0, 15) + '\u2026' : title}
      </text>
      {hasChildren && (
        <g onClick={(e) => { e.stopPropagation(); onToggleCollapse(id) }} style={{ cursor: 'pointer' }}>
          <circle cx={width / 2} cy={height + 8} r={8} fill="var(--surface, #313244)" stroke="var(--border, #45475a)" />
          <text x={width / 2} y={height + 9} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="var(--text-muted, #a6adc8)">
            {collapsed ? '+' : '\u2212'}
          </text>
        </g>
      )}
    </g>
  )
}
