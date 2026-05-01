import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useMindmapStore } from './useMindmapStore.js'

interface Props {
  onClose: () => void
}

export default function MindmapSearch({ onClose }: Props) {
  const { rfNodes, selectNode } = useMindmapStore()
  const { setCenter } = useReactFlow()
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = rfNodes.filter(n =>
    query && n.data.title.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setMatchIndex(0)
  }, [query])

  const goToMatch = useCallback((index: number) => {
    if (matches.length === 0) return
    const idx = ((index % matches.length) + matches.length) % matches.length
    setMatchIndex(idx)
    const node = matches[idx]
    selectNode(node.id)
    setCenter(node.position.x + 80, node.position.y + 22, { duration: 300, zoom: 1 })
  }, [matches, selectNode, setCenter])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); goToMatch(matchIndex + 1); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); goToMatch(matchIndex - 1); return }
  }, [matchIndex, goToMatch, onClose])

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 100,
      background: 'var(--surface, #fff)', border: '1px solid var(--border, #e0e0e0)',
      borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search nodes..."
        style={{
          border: 'none', outline: 'none', fontSize: 14, width: 200,
          background: 'transparent', color: 'var(--text, #333)',
        }}
      />
      <span style={{ fontSize: 12, color: 'var(--text-muted, #999)', whiteSpace: 'nowrap' }}>
        {matches.length > 0 ? `${matchIndex + 1}/${matches.length}` : query ? 'No matches' : ''}
      </span>
      <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted, #999)' }}>
        ×
      </button>
    </div>
  )
}
