import React from 'react'
import { Folder, ChevronDown, ChevronRight } from 'lucide-react'
import { useTheme } from '../../theme/index.js'
import { type DirNode, FOLDER_COLORS } from './helpers.js'

export default function DirTreeItem({ node, selectedDir, onSelect, expandedDirs, onToggle, onContextMenu, depth, icon, textColor, siblingIndex }: {
  node: DirNode
  selectedDir: string | null
  onSelect: (path: string | null) => void
  expandedDirs: Set<string>
  onToggle: (path: string) => void
  onContextMenu?: (e: React.MouseEvent, path: string) => void
  depth: number
  icon?: React.ReactNode
  textColor?: string
  siblingIndex?: number
}) {
  const { theme: itemTheme } = useTheme()
  const isNb = itemTheme === 'notebook'
  const isExpanded = expandedDirs.has(node.path)
  const isSelected = selectedDir === node.path
  const hasChildren = node.children.length > 0
  const fc = FOLDER_COLORS[(siblingIndex ?? 0) % FOLDER_COLORS.length]

  return (
    <>
      <div
        onClick={() => {
          onSelect(node.path)
          if (hasChildren) onToggle(node.path)
        }}
        onContextMenu={(e) => {
          onSelect(node.path)
          onContextMenu?.(e, node.path)
        }}
        style={{
          height: 'auto',
          padding: isNb ? '6px 10px 6px' : '5px 10px',
          paddingLeft: isNb ? (10 + depth * 18) : (14 + depth * 18),
          paddingRight: 12,
          marginLeft: 0,
          marginRight: 0,
          marginBottom: 1,
          fontSize: 13,
          cursor: 'pointer',
          background: isSelected ? (isNb ? 'rgba(255,255,255,.6)' : 'var(--accent-soft)') : 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: isNb ? 10 : 8,
          borderRadius: isNb ? 7 : 8,
          transition: 'all 0.12s ease',
        }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = isNb ? 'rgba(255,255,255,.6)' : 'var(--hover)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? (isNb ? 'rgba(255,255,255,.6)' : 'var(--accent-soft)') : 'transparent' }}
      >
        {isNb && depth === 1 ? (
          <span style={{
            width: 16, height: 13, borderRadius: '2px 2px 3px 3px', background: fc,
            flexShrink: 0, position: 'relative', display: 'inline-block',
          }}>
            <span style={{ position: 'absolute', top: -2, left: 1, width: 6, height: 3, background: fc, borderRadius: '1px 1px 0 0' }} />
          </span>
        ) : isNb ? (
          <Folder size={14} style={{ flexShrink: 0, color: 'var(--ink-faint)' }} />
        ) : (
          icon && <span style={{ flexShrink: 0, lineHeight: 1, display: 'inline-flex', color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>{icon}</span>
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 400, color: isNb ? 'var(--ink-soft, #5C564E)' : (isSelected ? 'var(--accent)' : (textColor || 'var(--text-secondary)')) }}>
          {node.name}
        </span>
        {node.count != null && node.count > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono, monospace)' }}>{node.count}</span>
        )}
        {!isNb && hasChildren && (
          <span
            onClick={(e) => { e.stopPropagation(); onToggle(node.path) }}
            style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </div>
      {isExpanded && node.children.map((child, ci) => (
        <DirTreeItem
          key={child.path}
          node={child}
          selectedDir={selectedDir}
          onSelect={onSelect}
          expandedDirs={expandedDirs}
          onToggle={onToggle}
          onContextMenu={onContextMenu}
          depth={depth + 1}
          icon={icon}
          textColor={textColor}
          siblingIndex={ci}
        />
      ))}
    </>
  )
}
