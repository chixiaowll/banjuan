import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { NavItem } from 'epubjs'
import { useEpubViewer } from './EpubViewerContext.js'
import { useT } from '../../i18n/index.js'

interface TreeNodeProps {
  item: NavItem
  depth: number
  currentHref: string
  onNavigate: (href: string) => void
}

function TreeNode({ item, depth, currentHref, onNavigate }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = item.subitems && item.subitems.length > 0
  const isActive = currentHref.includes(item.href)

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center',
          padding: '4px 8px', paddingLeft: 8 + depth * 16,
          cursor: 'pointer', fontSize: 12,
          color: 'var(--text)', gap: 4,
          background: isActive ? 'var(--hover)' : 'transparent',
        }}
        onClick={() => onNavigate(item.href)}
        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--hover)' }}
        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
      >
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            style={{ width: 12, flexShrink: 0, fontSize: 10, textAlign: 'center' }}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.label.trim()}
        </span>
      </div>
      {hasChildren && expanded && item.subitems!.map((child, i) => (
        <TreeNode key={child.id || i} item={child} depth={depth + 1} currentHref={currentHref} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

export default function EpubOutlinePanel() {
  const t = useT()
  const { toc, currentHref, navigateTo } = useEpubViewer()

  if (toc.length === 0) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>{t('epub.noOutline' as any)}</div>
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {toc.map((item, i) => (
        <TreeNode key={item.id || i} item={item} depth={0} currentHref={currentHref} onNavigate={navigateTo} />
      ))}
    </div>
  )
}
