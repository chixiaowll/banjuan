import React, { useEffect, useRef, useCallback } from 'react'
import { usePdfViewer, type SearchMatch } from './PdfViewerContext.js'

export default function SearchPopup() {
  const ctx = usePdfViewer()
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        ctx.setSearchOpen(false)
        ctx.setSearchQuery('')
        ctx.setSearchMatches([])
        ctx.setCurrentMatchIndex(0)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [ctx.searchOpen])

  const performSearch = useCallback((query: string) => {
    if (!query.trim()) {
      ctx.setSearchMatches([])
      ctx.setCurrentMatchIndex(0)
      return
    }

    const matches: SearchMatch[] = []
    const { pageInfoMap, searchOptions } = ctx

    for (const [pageNum, info] of pageInfoMap.entries()) {
      const pageText = info.chars.map(c => c.c).join('')
      let searchText = pageText
      let searchQuery = query
      if (!searchOptions.caseSensitive) {
        searchText = searchText.toLowerCase()
        searchQuery = searchQuery.toLowerCase()
      }

      let pos = 0
      while (true) {
        const idx = searchText.indexOf(searchQuery, pos)
        if (idx < 0) break

        if (searchOptions.wholeWord) {
          const before = idx > 0 ? searchText[idx - 1] : ' '
          const after = idx + searchQuery.length < searchText.length ? searchText[idx + searchQuery.length] : ' '
          if (/\w/.test(before) || /\w/.test(after)) {
            pos = idx + 1
            continue
          }
        }

        const charSlice = info.chars.slice(idx, idx + query.length)
        const pageW = info.width
        const pageH = info.height

        const rects: Array<{ x: number; y: number; w: number; h: number }> = []
        for (const ch of charSlice) {
          const [x1, y1, x2, y2] = ch.rect
          const rx = Math.min(x1, x2) / pageW
          const ry = 1 - (Math.max(y1, y2) / pageH)
          const rw = Math.abs(x2 - x1) / pageW
          const rh = Math.abs(y2 - y1) / pageH
          const last = rects[rects.length - 1]
          if (last && Math.abs(last.y - ry) < rh * 0.5) {
            const newRight = Math.max(last.x + last.w, rx + rw)
            last.w = newRight - last.x
          } else {
            rects.push({ x: rx, y: ry, w: rw, h: rh })
          }
        }

        matches.push({ page: pageNum, charStart: idx, charEnd: idx + query.length - 1, rects })
        pos = idx + 1
      }
    }

    matches.sort((a, b) => a.page - b.page || a.charStart - b.charStart)
    ctx.setSearchMatches(matches)
    ctx.setCurrentMatchIndex(matches.length > 0 ? 0 : -1)
    if (matches.length > 0) ctx.scrollToPage(matches[0].page)
  }, [ctx])

  const handleQueryChange = (query: string) => {
    ctx.setSearchQuery(query)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => performSearch(query), 300)
  }

  const handleNext = () => {
    ctx.nextMatch()
    const nextIdx = ctx.currentMatchIndex + 1 >= ctx.searchMatches.length ? 0 : ctx.currentMatchIndex + 1
    const match = ctx.searchMatches[nextIdx]
    if (match) ctx.scrollToPage(match.page)
  }

  const handlePrev = () => {
    ctx.prevMatch()
    const prevIdx = ctx.currentMatchIndex - 1 < 0 ? ctx.searchMatches.length - 1 : ctx.currentMatchIndex - 1
    const match = ctx.searchMatches[prevIdx]
    if (match) ctx.scrollToPage(match.page)
  }

  const handleClose = () => {
    ctx.setSearchOpen(false)
    ctx.setSearchQuery('')
    ctx.setSearchMatches([])
    ctx.setCurrentMatchIndex(0)
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
          value={ctx.searchQuery}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.shiftKey ? handlePrev() : handleNext() }}
          placeholder="搜索..."
          style={{
            flex: 1, padding: '4px 8px', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)',
          }}
        />
        <button onClick={handlePrev} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>▲</button>
        <button onClick={handleNext} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>▼</button>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={ctx.searchOptions.caseSensitive}
            onChange={(e) => { ctx.setSearchOptions({ caseSensitive: e.target.checked }); performSearch(ctx.searchQuery) }} />
          大小写
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={ctx.searchOptions.wholeWord}
            onChange={(e) => { ctx.setSearchOptions({ wholeWord: e.target.checked }); performSearch(ctx.searchQuery) }} />
          全词
        </label>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
          {ctx.searchMatches.length > 0 ? `${ctx.currentMatchIndex + 1}/${ctx.searchMatches.length}` : ctx.searchQuery ? '0/0' : ''}
        </span>
        <button onClick={handleClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, padding: '0 2px', color: 'var(--text-muted)' }}>×</button>
      </div>
    </div>
  )
}
