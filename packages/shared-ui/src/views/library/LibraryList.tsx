import React from 'react'
import { ChevronRight, RefreshCw, Upload, Plus, FilePlus, Search, ChevronDown, Star, Folder, FileText, Brain, PenTool } from 'lucide-react'
import { alertDialog } from '../../components/feedback.js'
import { TYPE_PILLS, coverColorFor, formatRelativeTime, formatDate, readingProgress } from './helpers.js'
import DocCover, { CoverImage } from './DocCover.js'
import { useLibrary } from './LibraryContext.js'

/** The documents / notes list: header, type filters, search and sorting, rows grouped by day. */
export default function LibraryList() {
  const {
    api, countLabel, currentDir, dirSegments, displayItems, documents, groupItems,
    handleCreateNote, handleDocItemContextMenu, handleNoteItemContextMenu, handleSectionChange,
    handleSelectItem, handleSidebarContextMenu, layout, libraryName, loadDocuments, loadNoteDirs,
    loadNotes, locale, noteDragOver, notes, onOpenDoc, onOpenMindmap, onOpenNote, searchQuery,
    sectionLabel, selectedDir, selectedItemId, selectedNoteDir, selectedSection, selectedTag,
    setCurrentDir, setNoteDragOver, setSearchQuery, setSelectedItemDetail, setSelectedItemId,
    setSelectedItemTags, setShowNotePicker, setSortAsc, setSortKey, setTypeFilter, sortAsc,
    sortKey, t, tagFilteredItems, toolbarStyle, typeFilter,
  } = useLibrary()
  return (
    <>
      {/* Page header */}
      {layout.pageHeader.show && (
        <div style={{ maxWidth: layout.pageHeader.maxWidth ?? undefined, margin: '0 auto', width: '100%', padding: layout.pageHeader.padding }}>
          {/* Breadcrumb */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)',
            marginBottom: 24,
          }}>
            <span style={{ cursor: 'pointer' }} onClick={() => handleSectionChange('home')}>{libraryName}</span>
            <ChevronRight size={12} style={{ color: 'var(--ink-ghost)' }} />
            <span
              style={{ color: currentDir ? undefined : 'var(--ink)', cursor: currentDir ? 'pointer' : undefined }}
              onClick={() => currentDir && setCurrentDir(null)}
            >{sectionLabel}</span>
            {dirSegments.map((seg, i) => (
              <React.Fragment key={i}>
                <ChevronRight size={12} style={{ color: 'var(--ink-ghost)' }} />
                <span
                  style={i === dirSegments.length - 1 ? { color: 'var(--ink)' } : { cursor: 'pointer' }}
                  onClick={() => { if (i < dirSegments.length - 1) setCurrentDir(dirSegments.slice(0, i + 1).join('/')) }}
                >{seg}</span>
              </React.Fragment>
            ))}
          </div>
          {/* Title + buttons */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <h1 style={{
              fontSize: 30, fontWeight: 600, color: 'var(--ink)',
              letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0,
              display: 'inline-flex', alignItems: 'center', gap: 14,
            }}>{dirSegments.length ? dirSegments[dirSegments.length - 1] : sectionLabel}
            </h1>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {selectedSection === 'documents' && (<>
                <button
                  onClick={async () => { await api.documents.refresh(); await loadDocuments() }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 32, padding: '0 12px', borderRadius: 9,
                    fontSize: 13, fontWeight: 500,
                    color: 'var(--ink-soft)', border: '1px solid var(--border-solid)',
                    background: 'var(--surface-raised)', cursor: 'pointer',
                  }}
                ><RefreshCw size={14} />{t('library.refresh')}</button>
                <button
                  onClick={async () => {
                    if (api.documents.importFilesDialog) {
                      await api.documents.importFilesDialog(selectedDir || undefined)
                    } else {
                      await api.documents.import(selectedDir || undefined)
                    }
                    await loadDocuments()
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 32, padding: '0 12px', borderRadius: 9,
                    fontSize: 13, fontWeight: 500,
                    background: layout.home.primaryButtonBg, color: '#fff', border: 'none',
                    cursor: 'pointer', boxShadow: layout.home.primaryButtonShadow,
                  }}
                ><Upload size={14} />{t('library.import')}</button>
              </>)}
              {selectedSection === 'notes' && (<>
                <button
                  onClick={async () => { await api.notes.refresh(); await loadNotes(); await loadNoteDirs() }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 32, padding: '0 12px', borderRadius: 9,
                    fontSize: 13, fontWeight: 500,
                    color: 'var(--ink-soft)', border: '1px solid var(--border-solid)',
                    background: 'var(--surface-raised)', cursor: 'pointer',
                  }}
                ><RefreshCw size={14} />{t('library.refresh')}</button>
                <button
                  onClick={async () => {
                    if (!api.notes.importMarkdownDialog) return
                    const results = await api.notes.importMarkdownDialog(selectedNoteDir)
                    if (!results) return
                    const failed = results.filter((r: any) => !r.success && r.error !== 'NOT_MARKDOWN')
                    if (failed.length > 0) {
                      void alertDialog({ title: t('import.someFailed'), message: failed.map((r: any) => `${r.title}: ${r.error}`).join('\n') })
                    }
                    await loadNotes()
                    await loadNoteDirs()
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 32, padding: '0 12px', borderRadius: 9,
                    fontSize: 13, fontWeight: 500,
                    color: 'var(--ink-soft)', border: '1px solid var(--border-solid)',
                    background: 'var(--surface-raised)', cursor: 'pointer',
                  }}
                ><Upload size={14} />{t('common.import')}</button>
                <button
                  onClick={() => setShowNotePicker(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 32, padding: '0 12px', borderRadius: 9,
                    fontSize: 13, fontWeight: 500,
                    background: layout.home.primaryButtonBg, color: '#fff', border: 'none',
                    cursor: 'pointer', boxShadow: layout.home.primaryButtonShadow,
                  }}
                ><Plus size={14} />{t('library.newNote')}</button>
              </>)}
            </div>
          </div>
          {/* Stats */}
          <div style={{ fontSize: 13, color: 'var(--ink-mute)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
            {selectedSection === 'documents' ? (<>
              <span>{countLabel('library.docCount', displayItems.length)}</span>
              {selectedDir && (<>
                <span style={{ color: 'var(--ink-ghost)' }}>·</span>
                <span>{t('library.totalCount', documents.length)}</span>
              </>)}
            </>) : (<>
              <span>{countLabel('library.noteCount', displayItems.length)}</span>
            </>)}
          </div>
        </div>
      )}
      {/* Toolbar */}
      <div style={{ ...toolbarStyle, ...(layout.contentMaxWidth ? { paddingLeft: 0, paddingRight: 0 } : {}) }}>
      <div style={layout.contentMaxWidth ? { maxWidth: layout.contentMaxWidth, margin: '0 auto', width: '100%', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: layout.toolbar.gap, overflow: 'hidden' } : { display: 'contents' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
          {selectedSection === 'notes' && (
            <>
              {!layout.toolbar.showSectionButtons && (() => {
                let baseItems: any[] = notes
                if (selectedNoteDir) { const prefix = selectedNoteDir + '/'; baseItems = baseItems.filter((n: any) => n.path?.startsWith(prefix)) }
                if (selectedTag && tagFilteredItems) { baseItems = tagFilteredItems }
                const typeCounts: Record<string, number> = {}
                for (const n of baseItems) { typeCounts[n.type] = (typeCounts[n.type] || 0) + 1 }
                const types = Object.keys(typeCounts).sort((a, b) => typeCounts[b] - typeCounts[a]).slice(0, 5)
                if (types.length <= 1 && !typeFilter) return null   // "All 7 / MD 7" filters nothing
                const DOT_COLORS: Record<string, string> = { note: '#5B8C6B', mindmap: '#9881B8', canvas: '#6B8EA0' }
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0,
                    background: layout.list.controlBackground, border: '1px solid var(--paper-edge)',
                    borderRadius: 9, padding: 3, boxShadow: '0 1px 3px rgba(60,40,20,.06)',
                  }}>
                    <button onClick={() => setTypeFilter('')} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      height: 24, padding: '0 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                      background: !typeFilter ? layout.home.primaryButtonBg : 'transparent',
                      color: !typeFilter ? '#fff' : 'var(--ink-soft)',
                      border: 'none', cursor: 'pointer',
                      boxShadow: !typeFilter ? layout.list.activeChipShadow : 'none',
                    }}>
                      {t('library.allNotes')}
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, opacity: 0.7, fontWeight: 400 }}>{baseItems.length}</span>
                    </button>
                    {types.map(tp => {
                      const pill = TYPE_PILLS[tp]
                      const isActive = typeFilter === tp
                      return (
                        <button key={tp} onClick={() => setTypeFilter(isActive ? '' : tp)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          height: 24, padding: '0 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                          background: isActive ? layout.home.primaryButtonBg : 'transparent',
                          color: isActive ? '#fff' : 'var(--ink-soft)',
                          border: 'none', cursor: 'pointer',
                          boxShadow: isActive ? layout.list.activeChipShadow : 'none',
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: DOT_COLORS[tp] || pill?.color || '#888', boxShadow: isActive ? '0 0 0 1.5px rgba(255,255,255,.4)' : 'none' }} />
                          {pill?.label || tp}
                          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, opacity: 0.7, fontWeight: 400 }}>{typeCounts[tp]}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
              {layout.toolbar.showSectionButtons && (
                <>
                  <button onClick={handleCreateNote} title={t('library.newNote')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}><FilePlus size={18} /></button>
                  <button onClick={async () => { await api.notes.refresh(); await loadNotes(); await loadNoteDirs() }} title={t('library.refresh')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}><RefreshCw size={16} /></button>
                </>
              )}
            </>
          )}
          {selectedSection === 'documents' && (
            <>
              {!layout.toolbar.showSectionButtons && (() => {
                let baseItems: any[] = documents
                if (selectedDir) { const prefix = selectedDir + '/'; baseItems = baseItems.filter((d: any) => d.path.startsWith(prefix)) }
                if (selectedTag && tagFilteredItems) { baseItems = tagFilteredItems }
                const typeCounts: Record<string, number> = {}
                for (const doc of baseItems) { typeCounts[doc.type] = (typeCounts[doc.type] || 0) + 1 }
                const types = Object.keys(typeCounts).sort((a, b) => typeCounts[b] - typeCounts[a]).slice(0, 5)
                if (types.length <= 1 && !typeFilter) return null
                const DOT_COLORS: Record<string, string> = { markdown: '#E6C84A', pdf: '#E07856', epub: '#7AAE7E', mindmap: '#9881B8' }
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0,
                    background: layout.list.controlBackground, border: '1px solid var(--paper-edge)',
                    borderRadius: 9, padding: 3, boxShadow: '0 1px 3px rgba(60,40,20,.06)',
                  }}>
                    <button onClick={() => setTypeFilter('')} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      height: 24, padding: '0 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                      background: !typeFilter ? layout.home.primaryButtonBg : 'transparent',
                      color: !typeFilter ? '#fff' : 'var(--ink-soft)',
                      border: 'none', cursor: 'pointer',
                      boxShadow: !typeFilter ? layout.list.activeChipShadow : 'none',
                    }}>
                      {t('library.allDocs')}
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, opacity: 0.7, fontWeight: 400 }}>{baseItems.length}</span>
                    </button>
                    {types.map(tp => {
                      const pill = TYPE_PILLS[tp]
                      const isActive = typeFilter === tp
                      return (
                        <button key={tp} onClick={() => setTypeFilter(isActive ? '' : tp)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          height: 24, padding: '0 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                          background: isActive ? layout.home.primaryButtonBg : 'transparent',
                          color: isActive ? '#fff' : 'var(--ink-soft)',
                          border: 'none', cursor: 'pointer',
                          boxShadow: isActive ? layout.list.activeChipShadow : 'none',
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: DOT_COLORS[tp] || pill?.color || '#888', boxShadow: isActive ? '0 0 0 1.5px rgba(255,255,255,.4)' : 'none' }} />
                          {pill?.label || tp}
                          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, opacity: 0.7, fontWeight: 400 }}>{typeCounts[tp]}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
              {layout.toolbar.showSectionButtons && (
                <>
                  <button onClick={async () => { if (api.documents.importFilesDialog) { await api.documents.importFilesDialog(selectedDir || undefined) } else { await api.documents.import(selectedDir || undefined) }; await loadDocuments() }} title={t('common.import')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}><Plus size={18} /></button>
                  <button onClick={async () => { await api.documents.refresh(); await loadDocuments() }} title={t('library.refresh')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}><RefreshCw size={16} /></button>
                </>
              )}
              {selectedDir && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedDir}</span>}
            </>
          )}
          {/* Sort controls */}
          {layout.toolbar.showSectionButtons && (
            <div style={{ display: 'flex', gap: 2 }}>
              {['title', 'type', 'updatedAt', 'createdAt'].map(key => (
                <button
                  key={key}
                  onClick={() => { if (sortKey === key) setSortAsc(a => !a); else { setSortKey(key as any); setSortAsc(true) } }}
                  style={{
                    background: sortKey === key ? 'var(--accent-soft)' : 'none',
                    border: 'none', cursor: 'pointer', padding: '3px 8px',
                    fontSize: 14, fontWeight: 500, borderRadius: 'var(--radius-sm)',
                    color: sortKey === key ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {key === 'title' ? t('library.colTitle') : key === 'type' ? t('library.colType') : key === 'updatedAt' ? t('detail.updatedAt') : t('detail.createdAt')}
                  {sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>
          )}
        </div>
        {layout.home.sectionCardStyle === 'card' && (selectedSection === 'documents' || selectedSection === 'notes') ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{
              height: 30, width: 200,
              display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px',
              background: layout.list.controlBackground, border: '1px solid var(--paper-edge)', borderRadius: 8,
              boxShadow: '0 1px 3px rgba(60,40,20,.06)',
            }}>
              <Search size={13} style={{ color: 'var(--ink-mute)', flexShrink: 0 }} />
              <input
                type="text" placeholder={t(selectedSection === 'notes' ? 'library.filterNotes' : 'library.filterDocs')}
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  fontSize: 12, color: 'var(--ink)', minWidth: 0,
                }}
              />
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--ink-faint)', flexShrink: 0 }}>⌘F</span>
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              height: 30, padding: '0 4px 0 10px', borderRadius: 8,
              fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500,
              background: layout.list.controlBackground, border: '1px solid var(--paper-edge)',
              boxShadow: '0 1px 3px rgba(60,40,20,.06)', position: 'relative',
            }}>
              <span style={{ fontSize: 11 }}>⇅</span>
              <select
                value={sortKey ?? 'updatedAt'}
                // Dates default to newest first, text to A→Z.
                onChange={e => { const k = e.target.value as any; setSortKey(k); setSortAsc(k === 'title' || k === 'type') }}
                style={{
                  appearance: 'none', border: 'none', outline: 'none', background: 'transparent',
                  fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, cursor: 'pointer',
                  paddingRight: 16,
                }}
              >
                <option value="updatedAt">{t('detail.updatedAt')}</option>
                <option value="createdAt">{t('detail.createdAt')}</option>
                <option value="title">{t('library.colTitle')}</option>
                <option value="type">{t('library.colType')}</option>
              </select>
              <ChevronDown size={11} style={{ color: 'var(--ink-mute)', position: 'absolute', right: 8, pointerEvents: 'none' }} />
            </div>
            <div
              onClick={() => setSortAsc(a => !a)}
              style={{
                width: 30, height: 30, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: layout.list.controlBackground, border: '1px solid var(--paper-edge)',
                cursor: 'pointer', boxShadow: '0 1px 3px rgba(60,40,20,.06)',
                fontSize: 12, color: 'var(--ink-soft)',
              }}
              title={sortAsc ? t('library.sortAsc') : t('library.sortDesc')}
            >
              {sortAsc ? '↑' : '↓'}
            </div>
            {selectedSection === 'documents' && layout.toolbar.showSectionButtons && <>
              <div
                onClick={async () => { await api.documents.refresh(); await loadDocuments() }}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: layout.list.controlBackground, border: '1px solid var(--paper-edge)',
                  cursor: 'pointer', boxShadow: '0 1px 3px rgba(60,40,20,.06)',
                  color: 'var(--ink-soft)',
                }}
                title={t('library.refresh')}
              >
                <RefreshCw size={13} />
              </div>
              <button onClick={async () => { if (api.documents.importFilesDialog) { await api.documents.importFilesDialog(selectedDir || undefined) } else { await api.documents.import(selectedDir || undefined) }; await loadDocuments() }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, height: 30,
              padding: '0 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: layout.home.primaryButtonBg, color: '#fff', border: 'none',
              cursor: 'pointer', boxShadow: layout.home.primaryButtonShadow,
              whiteSpace: 'nowrap',
            }}><Upload size={13} />{t('common.import')}</button>
            </>}
            {selectedSection === 'notes' && layout.toolbar.showSectionButtons && <>
              <div
                onClick={async () => { await api.notes.refresh(); await loadNotes(); await loadNoteDirs() }}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: layout.list.controlBackground, border: '1px solid var(--paper-edge)',
                  cursor: 'pointer', boxShadow: '0 1px 3px rgba(60,40,20,.06)',
                  color: 'var(--ink-soft)',
                }}
                title={t('library.refresh')}
              >
                <RefreshCw size={13} />
              </div>
              <button onClick={handleCreateNote} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, height: 30,
                padding: '0 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: layout.home.primaryButtonBg, color: '#fff', border: 'none',
                cursor: 'pointer', boxShadow: layout.home.primaryButtonShadow,
                whiteSpace: 'nowrap',
              }}><FilePlus size={13} />{t('common.new')}</button>
            </>}
          </div>
        ) : (
          <input
            type="search" placeholder={t('common.search')}
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 220, fontSize: 14, padding: '7px 12px', borderRadius: 'var(--radius-sm)' }}
          />
        )}
      </div>
      </div>

      {/* List */}
      <div
        style={{
          flex: 1, overflow: 'auto', minHeight: 0,
          ...(noteDragOver ? { outline: '2px dashed var(--accent, #4A90E2)', outlineOffset: -4, background: 'rgba(74,144,226,0.04)', borderRadius: 8 } : {}),
        }}
        onClick={(e) => { if (e.target === e.currentTarget) { setSelectedItemId(null); setSelectedItemDetail(null); setSelectedItemTags([]) } }}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget && selectedSection === 'documents') {
            handleSidebarContextMenu(e, 'documents')
          }
        }}
        onDragOver={(e) => {
          if (selectedSection !== 'notes' && selectedSection !== 'documents') return
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setNoteDragOver(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          setNoteDragOver(false)
        }}
        onDrop={async (e) => {
          e.preventDefault()
          setNoteDragOver(false)
          if (!e.dataTransfer.files.length) return
          const dropped = Array.from(e.dataTransfer.files)
          const paths: string[] = []
          for (const file of dropped) {
            const p = api.getPathForFile?.(file)
            if (p) paths.push(p)
          }
          if (paths.length === 0) {
            // No file paths (iPad): import the dropped files' contents — this
            // used to do nothing at all.
            let results: Array<{ title: string; success: boolean; error?: string }> | null = null
            if (selectedSection === 'notes' && api.notes.importDroppedMarkdown) results = await api.notes.importDroppedMarkdown(dropped, selectedNoteDir)
            else if (selectedSection === 'documents' && api.documents.importDropped) results = await api.documents.importDropped(dropped, selectedDir || undefined)
            if (!results) return
            const failed = results.filter(r => !r.success && r.error !== 'NOT_MARKDOWN' && r.error !== 'ALREADY_IN_LIBRARY')
            if (failed.length > 0) {
              void alertDialog({ title: t('import.someFailed'), message: failed.map(r => `${r.title}: ${r.error}`).join('\n') })
            }
            if (selectedSection === 'notes') { await loadNotes(); await loadNoteDirs() } else await loadDocuments()
            return
          }
          if (selectedSection === 'notes' && api.notes.importMarkdown) {
            const results = await api.notes.importMarkdown(paths, selectedNoteDir)
            const failed = results.filter((r: any) => !r.success && r.error !== 'NOT_MARKDOWN')
            if (failed.length > 0) {
              void alertDialog({ title: t('import.someFailed'), message: failed.map((r: any) => `${r.title}: ${r.error}`).join('\n') })
            }
            await loadNotes()
            await loadNoteDirs()
          } else if (selectedSection === 'documents' && api.documents.importFiles) {
            const results = await api.documents.importFiles(paths, selectedDir || undefined)
            // Files already in the library are simply left as they are.
            const failed = results.filter((r: any) => !r.success && r.error !== 'ALREADY_IN_LIBRARY')
            if (failed.length > 0) {
              void alertDialog({ title: t('import.someFailed'), message: failed.map((r: any) => `${r.title}: ${r.error}`).join('\n') })
            }
            await loadDocuments()
          }
        }}
      >
      <div style={{ padding: layout.contentMaxWidth && (selectedSection === 'documents' || selectedSection === 'notes') ? layout.listPadding : '12px 24px 80px', maxWidth: layout.contentMaxWidth ?? undefined, margin: layout.centeredContent ? '0 auto' : undefined }}>
        {displayItems.length === 0 && (
          <div style={{ padding: '40px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
            {selectedSection === 'documents' && (selectedDir ? t('library.emptyDir') : t('library.emptyDocuments'))}
            {selectedSection === 'notes' && t('library.emptyNotes')}
          </div>
        )}
        {layout.home.sectionCardStyle === 'card' && selectedSection === 'documents' ? (() => {
          // displayItems is already sorted by the chosen key (getDisplayItems).
          const groups = groupItems(displayItems)
          return groups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 12 }}>
              {/* Date group header */}
              {group.label && <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: gi === 0 ? '10px 12px 8px' : '14px 12px 8px',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.06em', flexShrink: 0 }}>{group.label}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--paper-edge)' }} />
                <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>{t('library.docCount', group.items.length)}</span>
              </div>}
              {group.items.map((item: any) => {
                const isSelected = selectedItemId === item.id
                const pill = TYPE_PILLS[item.type]
                const typeLabel = item.type === 'other' || (item.type === 'txt' && item.path && !item.path.endsWith('.txt'))
                  ? (item.path?.split('.').pop()?.toUpperCase() || (pill?.label ?? item.type))
                  : pill?.label ?? item.type
                const coverColor = coverColorFor(item.type, item.title || item.name || '')
                const progressPct = readingProgress(item)
                const { relative, absolute } = formatRelativeTime(item.updatedAt || item.createdAt, locale, t)
                const pathParts = item.path?.split('/').filter(Boolean) || []
                const itemTags = (item as any).tags || []
                const isFavorite = !!(item as any).favorite || !!(item as any).starred
                const TAG_DOT_COLORS = ['#6B95C9','#7AAE7E','#9881B8','#E07856','#5FA3A0','#F0A858','#D89AA8','#A8835C']

                return (
                  <div
                    key={item.id}
                    className="nb-doc-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '80px minmax(0,1fr) 110px 100px',
                      gap: 14, alignItems: 'center',
                      padding: '10px 12px', marginBottom: 2,
                      cursor: 'pointer', borderRadius: 10,
                      background: isSelected ? layout.list.selectedBackground : 'transparent',
                      transition: 'all 0.12s',
                      position: 'relative',
                    }}
                    onClick={() => handleSelectItem(item.id, 'document')}
                    onDoubleClick={() => onOpenDoc(item)}
                    onContextMenu={(e) => handleDocItemContextMenu(e, item.id, item.title)}
                    onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = layout.list.hoverBackground; e.currentTarget.style.boxShadow = layout.list.hoverShadow } }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? layout.list.selectedBackground : 'transparent'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    {isSelected && <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, background: layout.list.selectedBar, borderRadius: '0 3px 3px 0' }} />}
                    {/* Mini cover: the thumbnail, or the type on a colour while there is none */}
                    <DocCover doc={item}>{cover => (
                    <div style={{
                      width: 48, height: 60, borderRadius: '3px 5px 5px 3px',
                      background: cover ? 'var(--paper, #fff)' : `linear-gradient(135deg, ${coverColor} 0%, ${coverColor}CC 100%)`,
                      position: 'relative', overflow: 'hidden',
                      boxShadow: '0 1px 3px rgba(60,40,20,.06), 0 1px 2px rgba(60,40,20,.04)',
                      border: cover ? '1px solid var(--paper-edge)' : undefined,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {cover ? (<>
                        <CoverImage src={cover} />
                        <span style={{ position: 'absolute', left: 3, bottom: 3, fontFamily: 'var(--font-mono, monospace)', fontSize: 8, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.5)', borderRadius: 2, padding: '0 3px', letterSpacing: '0.04em' }}>{typeLabel}</span>
                      </>) : (<>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: 'rgba(0,0,0,0.12)' }} />
                        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 0 8px 8px', borderColor: 'transparent transparent rgba(255,255,255,.3) transparent' }} />
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.06em', paddingLeft: 5, position: 'relative', zIndex: 1 }}>{typeLabel}</span>
                      </>)}
                    </div>
                    )}</DocCover>
                    {/* Title + path + tags */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 14, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35,
                      }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: (item as any).metadata?.fileMissing ? 'var(--ink-mute)' : undefined }}>
                          {item.title || item.name}
                        </span>
                        {isFavorite && <Star size={13} style={{ color: '#E6C84A', fill: '#E6C84A', flexShrink: 0 }} />}
                        {(item as any).metadata?.fileMissing && <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: '#c0392b', border: '1px solid #c0392b', borderRadius: 3, padding: '0 5px', lineHeight: '16px' }}>{t('library.missing')}</span>}
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, marginTop: 3,
                        overflow: 'hidden',
                      }}>
                        {pathParts.length > 0 && (
                          <div style={{
                            fontSize: 11, color: 'var(--ink-mute)',
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontFamily: 'var(--font-mono, monospace)',
                            flexShrink: 1, minWidth: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            <Folder size={10} style={{ flexShrink: 0 }} />
                            {pathParts.slice(0, 2).map((p: string, pi: number) => (
                              <span key={pi}>
                                {pi > 0 && <span style={{ color: 'var(--ink-ghost)', margin: '0 2px' }}>/</span>}
                                <span style={{ color: pi === pathParts.slice(0, 2).length - 1 ? 'var(--ink-mute)' : 'var(--ink-faint)' }}>{p}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {itemTags.length > 0 && itemTags.slice(0, 3).map((tag: string, ti: number) => (
                          <span key={ti} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            height: 18, padding: '0 7px', borderRadius: 9,
                            fontSize: 10, fontWeight: 500, color: 'var(--ink-soft)',
                            background: 'var(--cream, #FAF5EA)', border: '1px solid var(--paper-edge)',
                            flexShrink: 0, whiteSpace: 'nowrap',
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: TAG_DOT_COLORS[ti % TAG_DOT_COLORS.length] }} />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    {/* Progress */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {progressPct != null ? (<>
                        <div style={{
                          flex: 1, height: 5, borderRadius: 3,
                          background: 'var(--paper-edge)', minWidth: 48, overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%', borderRadius: 3,
                            width: `${Math.min(progressPct, 100)}%`,
                            background: progressPct >= 100 ? '#7AAE7E' : progressPct < 10 ? 'var(--ink-ghost)' : `linear-gradient(90deg, #F0A858, #E07856)`,
                          }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--ink-mute)', fontWeight: 500, minWidth: 30, textAlign: 'right' }}>
                          {progressPct >= 100 ? t('library.progressDone') : progressPct === 0 ? t('library.progressUnread') : `${progressPct}%`}
                        </span>
                      </>) : null}
                    </div>
                    {/* Time */}
                    <div style={{ textAlign: 'right', position: 'relative' }}>
                      <span className="nb-time-rel" style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, transition: 'opacity 0.12s' }}>{relative}</span>
                      <span className="nb-time-abs" style={{ position: 'absolute', top: 0, right: 0, fontSize: 11, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono, monospace)', opacity: 0, transition: 'opacity 0.12s', pointerEvents: 'none' }}>{absolute}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        })() : layout.home.sectionCardStyle === 'card' && selectedSection === 'notes' ? (() => {
          // displayItems is already sorted by the chosen key (getDisplayItems).
          const groups = groupItems(displayItems)
          return groups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 12 }}>
              {group.label && <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: gi === 0 ? '10px 12px 8px' : '14px 12px 8px',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.06em', flexShrink: 0 }}>{group.label}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--paper-edge)' }} />
                <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>{t('library.noteCount', group.items.length)}</span>
              </div>}
              {group.items.map((item: any) => {
                const isSelected = selectedItemId === item.id
                const pill = TYPE_PILLS[item.type]
                const TypeIcon = item.type === 'mindmap' ? Brain : item.type === 'handwriting' ? PenTool : FileText
                const { relative, absolute } = formatRelativeTime(item.updatedAt || item.createdAt, locale, t)
                // A note's file is "<folder>/<uuid>.json": show the folder, never the id file name.
                const pathParts = (item.path?.split('/').filter(Boolean) || []).slice(0, -1)
                return (
                  <div
                    key={item.id}
                    className="nb-doc-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '36px minmax(0,1fr) 110px',
                      gap: 14, alignItems: 'center',
                      padding: '10px 12px', marginBottom: 2,
                      cursor: 'pointer', borderRadius: 10,
                      background: isSelected ? layout.list.selectedBackground : 'transparent',
                      transition: 'all 0.12s',
                      position: 'relative',
                    }}
                    onClick={() => handleSelectItem(item.id, 'note')}
                    onDoubleClick={() => { if (item.type === 'mindmap') onOpenMindmap(item); else onOpenNote(item) }}
                    onContextMenu={(e) => handleNoteItemContextMenu(e, item.id, item.title)}
                    onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = layout.list.hoverBackground; e.currentTarget.style.boxShadow = layout.list.hoverShadow } }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? layout.list.selectedBackground : 'transparent'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    {isSelected && <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, background: layout.list.selectedBar, borderRadius: '0 3px 3px 0' }} />}
                    {/* Type: the same colours as the type filter */}
                    <div title={pill?.label ?? item.type} style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: pill?.bg ?? 'var(--tag-txt-bg)', color: pill?.color ?? 'var(--tag-txt-color)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <TypeIcon size={16} />
                    </div>
                    {/* Title, then folder and the start of the text */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {item.title || item.name}
                      </div>
                      {(pathParts.length > 0 || item.excerpt) && (
                        <div style={{
                          fontSize: 11, color: 'var(--ink-mute)', marginTop: 3,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          {pathParts.length > 0 && <>
                            <Folder size={10} style={{ flexShrink: 0, opacity: 0.5 }} />
                            {pathParts.map((seg: string, si: number) => (
                              <React.Fragment key={si}>
                                {si > 0 && <span style={{ opacity: 0.3 }}>/</span>}
                                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, flexShrink: 0 }}>{seg}</span>
                              </React.Fragment>
                            ))}
                            {item.excerpt && <span style={{ opacity: 0.4, flexShrink: 0 }}>·</span>}
                          </>}
                          {item.excerpt && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{item.excerpt}</span>}
                        </div>
                      )}
                    </div>
                    {/* Time */}
                    <div style={{ textAlign: 'right', position: 'relative' }}>
                      <span className="nb-time-rel" style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, transition: 'opacity 0.12s' }}>{relative}</span>
                      <span className="nb-time-abs" style={{ position: 'absolute', top: 0, right: 0, fontSize: 11, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono, monospace)', opacity: 0, transition: 'opacity 0.12s', pointerEvents: 'none' }}>{absolute}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        })() : displayItems.map((item: any) => {
          const isSelected = selectedItemId === item.id
          const pill = TYPE_PILLS[item.type]
          const typeLabel = item.type === 'other' || (item.type === 'txt' && item.path && !item.path.endsWith('.txt'))
            ? (item.path?.split('.').pop()?.toUpperCase() || (pill?.label ?? item.type))
            : pill?.label ?? item.type
          const typeBg = pill?.bg ?? '#edeef0'
          const typeColor = pill?.color ?? '#737a84'
          const subtitle = selectedSection === 'documents'
            ? (item.authors?.length ? item.authors.join(', ') : item.path)
            : (item.path || '')
          return (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', margin: '1px 0',
                cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                background: isSelected ? 'var(--selected)' : 'transparent',
                transition: 'background 0.15s ease',
              }}
              onClick={() => {
                const type = selectedSection === 'documents' ? 'document' : 'note'
                handleSelectItem(item.id, type)
              }}
              onDoubleClick={() => {
                if (selectedSection === 'documents') onOpenDoc(item)
                else if (selectedSection === 'notes') {
                  if (item.type === 'mindmap') onOpenMindmap(item)
                  else onOpenNote(item)
                }
              }}
              onContextMenu={(e) => {
                if (selectedSection === 'notes') handleNoteItemContextMenu(e, item.id, item.title)
                else if (selectedSection === 'documents') handleDocItemContextMenu(e, item.id, item.title)
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--hover)' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'var(--selected)' : 'transparent' }}
            >
              {/* Type icon */}
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: typeBg, color: typeColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                flexShrink: 0,
              }}>
                {typeLabel}
              </div>
              {/* Title + subtitle */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 500, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  lineHeight: 1.3,
                }}>
                  {item.title || item.name}
                </div>
                {subtitle && (
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    lineHeight: 1.3,
                  }}>
                    {subtitle}
                  </div>
                )}
              </div>
              {/* Dates */}
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                  {formatDate(item.updatedAt || item.createdAt, locale)}
                </div>
                {item.updatedAt && item.updatedAt !== item.createdAt && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.5, lineHeight: 1.3 }}>
                    {formatDate(item.createdAt, locale)}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
    </>
  )
}
