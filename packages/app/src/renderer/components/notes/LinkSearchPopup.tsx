import React, { useState, useEffect, useRef, useCallback } from 'react'

interface NoteResult {
  id: string
  title: string
}

interface Props {
  query: string
  position: { top: number; left: number }
  onSelect: (note: NoteResult) => void
  onCreate: (title: string) => void
  onClose: () => void
}

export default function LinkSearchPopup({ query, position, onSelect, onCreate, onClose }: Props) {
  const [results, setResults] = useState<NoteResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const search = async () => {
      const notes = await window.electronAPI.notes.list()
      const filtered = notes.filter((n: NoteResult) =>
        n.title.toLowerCase().includes(query.toLowerCase())
      )
      setResults(filtered.slice(0, 10))
      setSelectedIndex(0)
    }
    search()
  }, [query])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, results.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedIndex < results.length) {
          onSelect(results[selectedIndex])
        } else {
          onCreate(query)
        }
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [results, selectedIndex, query, onSelect, onCreate, onClose])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: 300,
        maxHeight: 320,
        overflow: 'auto',
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        zIndex: 1000,
        fontSize: 13,
      }}
    >
      {results.map((note, i) => (
        <div
          key={note.id}
          onClick={() => onSelect(note)}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            background: i === selectedIndex ? '#e8f0fe' : 'transparent',
          }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          📄 {note.title}
        </div>
      ))}
      <div
        onClick={() => onCreate(query)}
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          borderTop: results.length > 0 ? '1px solid #e5e7eb' : 'none',
          background: selectedIndex === results.length ? '#e8f0fe' : 'transparent',
          color: '#5e81ac',
        }}
        onMouseEnter={() => setSelectedIndex(results.length)}
      >
        + 创建新笔记: "{query}"
      </div>
    </div>
  )
}
