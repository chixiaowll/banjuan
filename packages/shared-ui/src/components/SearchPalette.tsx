import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search, FileText, Brain, PenTool, LibraryBig, Highlighter } from 'lucide-react'
import type { SearchResult } from '@banjuan/core'
import { useBanjuanAPI } from '../api.js'
import { useT } from '../i18n/index.js'
import type { MessageKey } from '../i18n/index.js'
import { highlightParts, searchTerms } from '../utils/searchHighlight.js'
import { requestDocPage } from '../utils/docNavigation.js'
import { useEscapeKey } from '../utils/useEscapeKey.js'

/**
 * ⌘K global search: notes (title, body, mind-map nodes), documents and
 * annotations. Results are grouped by kind; ↑↓ moves, ↵ opens, Esc closes.
 * With an empty query it lists recently read documents and recently edited notes.
 */

interface Props {
  onClose: () => void
  onOpenNote: (note: { id: string }) => void
  onOpenDocument: (doc: any) => void
}

type Item = SearchResult & { recent?: boolean }

const GROUPS: Array<{ type: SearchResult['type']; label: MessageKey }> = [
  { type: 'note', label: 'library.notes' },
  { type: 'document', label: 'library.documents' },
  { type: 'annotation', label: 'palette.annotations' },
]
const PER_GROUP = 8
const DEBOUNCE_MS = 120

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return <>{highlightParts(text, terms).map((p, i) => p.hit
    ? <mark key={i} style={{ background: 'transparent', color: 'var(--accent)', fontWeight: 600 }}>{p.text}</mark>
    : <React.Fragment key={i}>{p.text}</React.Fragment>)}</>
}

function ItemIcon({ item }: { item: Item }) {
  const size = 15
  if (item.type === 'annotation') return <Highlighter size={size} />
  if (item.type === 'document') return <LibraryBig size={size} />
  if (item.noteType === 'mindmap') return <Brain size={size} />
  if (item.noteType === 'handwriting') return <PenTool size={size} />
  return <FileText size={size} />
}

export default function SearchPalette({ onClose, onOpenNote, onOpenDocument }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Item[]>([])
  const [recent, setRecent] = useState<Item[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef(0)
  const terms = useMemo(() => searchTerms(query), [query])
  useEscapeKey(true, onClose)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Recently read documents and recently edited notes, for the empty state.
  useEffect(() => {
    let cancelled = false
    void Promise.all([api.documents.list(), api.notes.list()]).then(([docs, notes]) => {
      if (cancelled) return
      const recentDocs = [...docs]
        .filter((d: any) => d.lastReadAt)
        .sort((a: any, b: any) => b.lastReadAt.localeCompare(a.lastReadAt))
        .slice(0, 5)
        .map((d: any): Item => ({ type: 'document', id: d.id, title: d.title, snippet: d.path, score: 0, recent: true }))
      const recentNotes = [...notes]
        .sort((a: any, b: any) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
        .slice(0, 5)
        .map((n: any): Item => ({ type: 'note', id: n.id, title: n.title, snippet: '', score: 0, noteType: n.type, recent: true }))
      setRecent([...recentNotes, ...recentDocs])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [api])

  // Debounced search, one query per kind so each group gets its own share.
  useEffect(() => {
    const id = ++requestRef.current
    if (terms.length === 0 || !api.search) { setResults([]); setSelected(0); return }
    const timer = setTimeout(() => {
      void Promise.all(GROUPS.map(g => api.search!.query(query, { type: g.type, limit: PER_GROUP })))
        .then(groups => {
          if (id !== requestRef.current) return   // a newer query is in flight
          setResults(groups.flat())
          setSelected(0)
        })
        .catch(e => console.warn('[SearchPalette] query failed', e))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, terms.length, api])

  const items = terms.length > 0 ? results : recent
  // Flat order used for keyboard navigation follows the on-screen grouping.
  const ordered = useMemo(() => GROUPS.flatMap(g => items.filter(i => i.type === g.type)), [items])

  const open = async (item: Item) => {
    onClose()
    if (item.type === 'note') { onOpenNote({ id: item.id }); return }
    const docId = item.type === 'annotation' ? item.docId : item.id
    if (!docId) return
    const doc = await api.documents.get(docId)
    if (!doc) return
    if (item.type === 'annotation') requestDocPage(docId, item.page)
    onOpenDocument(doc)
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    // These keys belong to the palette, not to the viewer / tab shortcuts underneath.
    if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) e.stopPropagation()
    if (e.key === 'ArrowDown') { e.preventDefault(); if (ordered.length) setSelected(s => (s + 1) % ordered.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (ordered.length) setSelected(s => (s - 1 + ordered.length) % ordered.length) }
    else if (e.key === 'Enter') { e.preventDefault(); const item = ordered[selected]; if (item) void open(item) }
  }

  let index = -1
  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.25)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12vh' }}>
      <div role="dialog" aria-modal="true" aria-label={t('palette.placeholder')} onMouseDown={e => e.stopPropagation()} onKeyDown={onKeyDown}
        style={{ width: 640, maxWidth: 'calc(100vw - 32px)', background: 'var(--surface-raised, #fff)', color: 'var(--text)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.22)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <Search size={17} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={t('palette.placeholder')}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 15, padding: '4px 0' }} />
        </div>
        <div ref={listRef} style={{ maxHeight: '56vh', overflowY: 'auto', padding: ordered.length ? '6px 0' : 0 }}>
          {terms.length === 0 && ordered.length > 0 && (
            <div style={{ padding: '6px 16px 2px', fontSize: 11, color: 'var(--text-muted)' }}>{t('palette.recent')}</div>
          )}
          {GROUPS.map(g => {
            const group = items.filter(i => i.type === g.type)
            if (group.length === 0) return null
            return (
              <div key={g.type}>
                <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{t(g.label)}</div>
                {group.map(item => {
                  const i = ++index
                  const active = i === selected
                  return (
                    <div key={item.type + item.id} data-index={i} onMouseMove={() => setSelected(i)} onClick={() => void open(item)}
                      style={{ display: 'flex', gap: 10, padding: '7px 16px', cursor: 'pointer', background: active ? 'var(--hover)' : 'transparent' }}>
                      <span style={{ color: 'var(--text-muted)', paddingTop: 2, flexShrink: 0 }}><ItemIcon item={item} /></span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Highlighted text={item.title} terms={terms} />
                        </div>
                        {item.snippet && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <Highlighted text={item.snippet} terms={terms} />
                          </div>
                        )}
                      </div>
                      {item.type === 'annotation' && item.page != null && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, paddingTop: 2 }}>{t('pdf.page', item.page)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
          {terms.length > 0 && ordered.length === 0 && (
            <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>{t('palette.noResults', query.trim())}</div>
          )}
        </div>
        <div style={{ padding: '7px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>{t('palette.hint')}</div>
      </div>
    </div>
  )
}
