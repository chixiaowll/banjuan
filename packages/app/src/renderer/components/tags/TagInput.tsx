import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Plus } from 'lucide-react'
import TagPill from './TagPill.js'
import { useT } from '../../i18n/index.js'

interface Tag {
  id: string
  name: string
  color: string | null
}

interface Props {
  targetId: string
  targetType: 'document' | 'note' | 'mindmap'
  compact?: boolean
}

export default function TagInput({ targetId, targetType, compact }: Props) {
  const t = useT()
  const [tags, setTags] = useState<Tag[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [inputOpen, setInputOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadTags = useCallback(async () => {
    const result = await window.electronAPI.tags.forTarget(targetId, targetType)
    setTags(result)
  }, [targetId, targetType])

  const loadAllTags = useCallback(async () => {
    const result = await window.electronAPI.tags.list()
    setAllTags(result)
  }, [])

  useEffect(() => { loadTags() }, [loadTags])

  useEffect(() => {
    if (inputOpen) {
      loadAllTags()
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [inputOpen, loadAllTags])

  useEffect(() => {
    if (!inputOpen) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setInputOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [inputOpen])

  const handleAdd = async (tagName: string) => {
    const trimmed = tagName.trim()
    if (!trimmed) return
    const existing = allTags.find(t => t.name === trimmed)
    if (!existing) {
      await window.electronAPI.tags.create({ name: trimmed })
    }
    await window.electronAPI.tags.assign(targetId, targetType, [trimmed])
    await loadTags()
    document.dispatchEvent(new CustomEvent('tags-changed'))
    setQuery('')
    setInputOpen(false)
  }

  const handleRemove = async (tagName: string) => {
    await window.electronAPI.tags.unassign(targetId, targetType, tagName)
    await loadTags()
    document.dispatchEvent(new CustomEvent('tags-changed'))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      handleAdd(query)
    } else if (e.key === 'Escape') {
      setInputOpen(false)
      setQuery('')
    }
  }

  const suggestions = query.trim()
    ? allTags
        .filter(t => !tags.some(existing => existing.id === t.id))
        .filter(t => t.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8)
    : []

  const isNew = query.trim() && !allTags.some(t => t.name === query.trim())

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', minHeight: compact ? 24 : 28 }}>
      {tags.map((tag) => (
        <TagPill key={tag.id} name={tag.name} color={tag.color} onRemove={() => handleRemove(tag.name)} />
      ))}
      <div ref={containerRef} style={{ position: 'relative' }}>
        {inputOpen ? (
          <div>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('tags.addTag')}
              style={{
                fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)',
                borderRadius: 4, outline: 'none', background: 'var(--surface)',
                color: 'var(--text)', width: 140,
              }}
            />
            {(suggestions.length > 0 || isNew) && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 2,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 100, minWidth: 160, maxHeight: 200, overflowY: 'auto',
              }}>
                {suggestions.map((tag) => (
                  <div
                    key={tag.id}
                    onClick={() => handleAdd(tag.name)}
                    style={{
                      padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: tag.color || '#737a84', flexShrink: 0,
                    }} />
                    {tag.name}
                  </div>
                ))}
                {isNew && (
                  <div
                    onClick={() => handleAdd(query)}
                    style={{
                      padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                      color: 'var(--accent)', borderTop: suggestions.length > 0 ? '1px solid var(--border)' : 'none',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    + Create "{query.trim()}"
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <span
            onClick={() => setInputOpen(true)}
            style={{
              fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 2,
              padding: '2px 4px', borderRadius: 4,
            }}
          >
            <Plus size={12} />{compact ? '' : t('tags.addTag')}
          </span>
        )}
      </div>
    </div>
  )
}
