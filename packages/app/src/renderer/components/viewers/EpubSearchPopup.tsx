import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { useEpubViewer } from './EpubViewerContext.js'
import { useT } from '../../i18n/index.js'

interface SearchResult {
  cfi: string
  excerpt: string
}

export default function EpubSearchPopup() {
  const t = useT()
  const ctx = useEpubViewer()
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (ctx.searchOpen) inputRef.current?.focus()
  }, [ctx.searchOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        ctx.setSearchOpen(true)
      }
      if (e.key === 'Escape' && ctx.searchOpen) {
        handleClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ctx.searchOpen])

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim() || !ctx.book) {
      setResults([])
      setCurrentIndex(-1)
      return
    }
    const allResults: SearchResult[] = []
    const spine = ctx.book.spine as any
    spine.each((section: any) => {
      section.load(ctx.book!.load.bind(ctx.book)).then((contents: any) => {
        const found = section.find(q)
        for (const item of found) {
          allResults.push({ cfi: item.cfi, excerpt: item.excerpt })
        }
        setResults([...allResults])
        if (allResults.length > 0 && currentIndex < 0) {
          setCurrentIndex(0)
          ctx.rendition?.display(allResults[0].cfi)
        }
      })
    })
  }, [ctx.book, ctx.rendition])

  const handleQueryChange = (q: string) => {
    setQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => performSearch(q), 500)
  }

  const goToResult = (index: number) => {
    if (index >= 0 && index < results.length) {
      setCurrentIndex(index)
      ctx.rendition?.display(results[index].cfi)
    }
  }

  const handleNext = () => {
    const next = currentIndex + 1 >= results.length ? 0 : currentIndex + 1
    goToResult(next)
  }

  const handlePrev = () => {
    const prev = currentIndex - 1 < 0 ? results.length - 1 : currentIndex - 1
    goToResult(prev)
  }

  const handleClose = () => {
    ctx.setSearchOpen(false)
    setQuery('')
    setResults([])
    setCurrentIndex(-1)
  }

  if (!ctx.searchOpen) return null

  return (
    <div style={{
      position: 'absolute', top: 8, right: 8, zIndex: 200,
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      minWidth: 280, fontSize: 12,
    }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.shiftKey ? handlePrev() : handleNext() }}
          placeholder={t('search.placeholder' as any)}
          style={{
            flex: 1, padding: '4px 8px', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)',
          }}
        />
        <button onClick={handlePrev} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px', display: 'flex', alignItems: 'center' }}><ChevronUp size={14} /></button>
        <button onClick={handleNext} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px', display: 'flex', alignItems: 'center' }}><ChevronDown size={14} /></button>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center' }}>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
          {results.length > 0 ? `${currentIndex + 1}/${results.length}` : query ? '0/0' : ''}
        </span>
        <button onClick={handleClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, padding: '0 2px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
      </div>
    </div>
  )
}
