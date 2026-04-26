import React, { useEffect, useState, useCallback } from 'react'
import { usePdfViewer } from './PdfViewerContext.js'

interface OutlineItem {
  title: string
  dest: any
  items?: OutlineItem[]
}

interface TreeNodeProps {
  item: OutlineItem
  depth: number
  onNavigate: (dest: any) => void
}

function TreeNode({ item, depth, onNavigate }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = item.items && item.items.length > 0

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center',
          padding: '4px 8px', paddingLeft: 8 + depth * 16,
          cursor: 'pointer', fontSize: 12, color: 'var(--text)', gap: 4,
        }}
        onClick={() => onNavigate(item.dest)}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            style={{ width: 12, flexShrink: 0, fontSize: 10, textAlign: 'center' }}
          >
            {expanded ? '▼' : '▶'}
          </span>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </span>
      </div>
      {hasChildren && expanded && item.items!.map((child, i) => (
        <TreeNode key={i} item={child} depth={depth + 1} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

export default function OutlinePanel() {
  const { pdfDoc, scrollToPage } = usePdfViewer()
  const [outline, setOutline] = useState<OutlineItem[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    pdfDoc.getOutline().then((result: any) => {
      if (!cancelled) { setOutline(result); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [pdfDoc])

  const handleNavigate = useCallback(async (dest: any) => {
    if (!pdfDoc || !dest) return
    try {
      let resolvedDest = dest
      if (typeof dest === 'string') {
        resolvedDest = await pdfDoc.getDestination(dest)
      }
      if (!resolvedDest) return
      const ref = resolvedDest[0]
      const pageIndex = await pdfDoc.getPageIndex(ref)
      scrollToPage(pageIndex + 1)
    } catch (err) {
      console.error('[OutlinePanel] navigate error:', err)
    }
  }, [pdfDoc, scrollToPage])

  if (loading) return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>Loading...</div>
  if (!outline || outline.length === 0) return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>此文档无目录</div>

  return (
    <div style={{ padding: '4px 0' }}>
      {outline.map((item, i) => (
        <TreeNode key={i} item={item} depth={0} onNavigate={handleNavigate} />
      ))}
    </div>
  )
}
