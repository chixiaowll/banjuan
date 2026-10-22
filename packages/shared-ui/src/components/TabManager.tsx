import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { Menu, X, Info } from 'lucide-react'
import TitleBar, { type Tab, type PluginViewInfo } from './TitleBar.js'
import LibraryView from '../views/LibraryView.js'
// Readers and editors (pdf.js, epub.js, BlockNote, React Flow, …) load on first
// use instead of being parsed before the library view can show.
const DocumentViewer = lazy(() => import('./viewers/DocumentViewer.js'))
const NoteView = lazy(() => import('../views/NoteView.js'))
// Off-screen renderer for mind-map export snapshots: always mounted, but only
// needed when an export runs — don't let it pull BlockNote + React Flow into startup.
const MindmapExportHost = lazy(() => import('./MindmapExportHost.js'))
import TagManagerView from '../views/TagManagerView.js'
import PluginViewHost from '../views/PluginViewHost.js'
import { useT } from '../i18n/index.js'
import { useBanjuanAPI } from '../api.js'
import ExportPanel from './ExportPanel.js'
import { ResizeHandle, useResizable } from './ResizeHandle.js'
import { useExportManagerStore } from '../stores/useExportManagerStore.js'
import { TabActiveContext } from './tabActive.js'
import { readTabSession, writeTabSession, tabShortcut, type SavedTab } from './tabSession.js'
import SearchPalette from './SearchPalette.js'
import '../styles/mobile.css'
import { useEscapeKey } from '../utils/useEscapeKey.js'
import { toast } from './feedback.js'

const LIBRARY_TAB_ID = 'library'

const railBtnStyle = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 30, padding: 0, border: 'none', borderRadius: 8, cursor: 'pointer',
  background: active ? 'var(--accent-soft, rgba(74,144,226,0.14))' : 'transparent',
  color: active ? 'var(--accent, #4A90E2)' : 'var(--text-muted)',
  transition: 'background 0.12s, color 0.12s',
})

interface Props {
  libraryPath: string
  libraryName: string
  onSwitchLibrary?: () => void
  onLibraryRenamed?: (name: string) => void
}

export default function TabManager({ libraryPath, libraryName, onSwitchLibrary, onLibraryRenamed }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsNarrow(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useEscapeKey(sidebarOpen, () => setSidebarOpen(false))
  const [tabs, setTabs] = useState<Tab[]>([
    { id: LIBRARY_TAB_ID, type: 'library', title: libraryName, closable: false },
  ])
  const [activeTabId, setActiveTabId] = useState(LIBRARY_TAB_ID)
  const [tabData, setTabData] = useState<Map<string, any>>(() => new Map())
  const [pluginViews, setPluginViews] = useState<PluginViewInfo[]>([])
  const [sidePanel, setSidePanel] = useState<{ pluginId: string; viewType: string } | null>(null)
  // Default width matches the left sidebar (220) so the two flanks are symmetric.
  const sidePanelResize = useResizable(220, 200, 700, 'right')
  // The right rail toggles a single right-hand surface: either the library
  // detail panel (rendered inside LibraryView) or a plugin view. They are
  // mutually exclusive, so opening one closes the other — no stacked columns.
  const [detailOpen, setDetailOpen] = useState(() => {
    try { return localStorage.getItem('banjuan-detail-open') === '1' } catch { return false }
  })
  const toggleDetail = useCallback(() => {
    setSidePanel(null)
    setDetailOpen(v => { const next = !v; try { localStorage.setItem('banjuan-detail-open', next ? '1' : '0') } catch {} ; return next })
  }, [])
  // The window-level right rail (detail/plugin launchers) is collapsible so the
  // layout isn't lopsided when you don't need it.
  const [railCollapsed, setRailCollapsed] = useState(() => {
    try { return localStorage.getItem('banjuan-rail-collapsed') === '1' } catch { return false }
  })
  const toggleRail = useCallback(() => {
    setRailCollapsed(v => { const next = !v; try { localStorage.setItem('banjuan-rail-collapsed', next ? '1' : '0') } catch {} ; return next })
  }, [])
  // DOM node of the shared inspector's detail slot; LibraryView portals its
  // detail content into it so detail + plugins share one resizable container.
  const [inspectorEl, setInspectorEl] = useState<HTMLDivElement | null>(null)
  const tabHistoryRef = useRef<string[]>([LIBRARY_TAB_ID])
  // Tabs whose content has been rendered. A tab mounts the first time it's
  // shown and then stays mounted (keeping scroll/editor state) until closed.
  const mountedTabsRef = useRef(new Set<string>([LIBRARY_TAB_ID]))
  mountedTabsRef.current.add(activeTabId)

  const activateTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
    setSidebarOpen(false)
    const history = tabHistoryRef.current
    const idx = history.lastIndexOf(tabId)
    if (idx !== -1) history.splice(idx, 1)
    history.push(tabId)
    if (tabId === LIBRARY_TAB_ID) {
      document.dispatchEvent(new Event('banjuan:library-focus'))
    }
  }, [])

  const refreshPluginViews = useCallback(() => {
    api.plugins?.getViews().then(views => setPluginViews(views))
  }, [])

  useEffect(() => {
    if (!api.plugins) return
    refreshPluginViews()
    document.addEventListener('plugins-changed', refreshPluginViews)
    return () => document.removeEventListener('plugins-changed', refreshPluginViews)
  }, [refreshPluginViews])

  const openDocument = useCallback((doc: any) => {
    const existingTab = tabs.find(t => t.type === 'document' && tabData.get(t.id)?.id === doc.id)
    if (existingTab) {
      activateTab(existingTab.id)
      api.documents.markRead(doc.id).catch(() => {})
      return
    }
    const tabId = `doc-${doc.id}`
    const newTab: Tab = { id: tabId, type: 'document', title: doc.title, closable: true }
    setTabs(prev => [...prev, newTab])
    setTabData(prev => new Map(prev).set(tabId, doc))
    activateTab(tabId)
    api.documents.markRead(doc.id).catch(() => {})
  }, [tabs, tabData, activateTab, api])

  const openNote = useCallback(async (note: any) => {
    const existingTab = tabs.find(t => t.type === 'note' && tabData.get(t.id)?.id === note.id)
    if (existingTab) {
      activateTab(existingTab.id)
      return
    }
    const full = note.type ? note : await api.notes.get(note.id)
    if (!full) return
    const tabId = `note-${full.id}`
    const newTab: Tab = { id: tabId, type: 'note', title: full.title, closable: true }
    setTabs(prev => [...prev, newTab])
    setTabData(prev => new Map(prev).set(tabId, full))
    activateTab(tabId)
  }, [tabs, tabData, activateTab])

  const openTagManager = useCallback(() => {
    const existingTab = tabs.find(t => t.type === 'tag-manager')
    if (existingTab) {
      activateTab(existingTab.id)
      return
    }
    const tabId = 'tag-manager'
    const newTab: Tab = { id: tabId, type: 'tag-manager', title: t('tags.manager'), closable: true }
    setTabs(prev => [...prev, newTab])
    activateTab(tabId)
  }, [tabs, t, activateTab])

  const togglePluginPanel = useCallback((pluginId: string, viewType: string) => {
    setDetailOpen(false)
    setSidePanel(prev =>
      prev?.pluginId === pluginId ? null : { pluginId, viewType }
    )
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.viewType) return
      api.plugins?.getViews().then(views => {
        const view = views.find(v => v.viewType === detail.viewType)
        if (view) {
          setSidePanel({ pluginId: view.pluginId, viewType: view.viewType })
        }
      })
    }
    document.addEventListener('plugin:open-view', handler)
    return () => document.removeEventListener('plugin:open-view', handler)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const docId = (e as CustomEvent).detail?.docId
      if (!docId) return
      api.documents.get(docId).then((doc: any) => {
        if (doc) openDocument(doc)
      })
    }
    document.addEventListener('banjuan:open-document', handler)
    return () => document.removeEventListener('banjuan:open-document', handler)
  }, [openDocument])

  // Relay batch-export progress from the background export window into the
  // local export-manager store so the progress panel updates live.
  useEffect(() => {
    if (!api.batchExport) return
    const store = useExportManagerStore.getState
    const offProgress = api.batchExport.onProgress(({ runId, id, status, error }) => {
      store().updateItem(`${runId}/${id}`, { status, error })
    })
    const offDone = api.batchExport.onDone(() => {
      store().setRunning(false)
    })
    return () => { offProgress(); offDone() }
  }, [api])

  useEffect(() => {
    const syncTabTitles = async () => {
      const noteTabs = tabs.filter(t => t.type === 'note')
      if (noteTabs.length === 0) return
      for (const tab of noteTabs) {
        const noteData = tabData.get(tab.id)
        if (!noteData) continue
        const fresh = await api.notes.get(noteData.id)
        if (fresh && fresh.title !== tab.title) {
          setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, title: fresh.title } : t))
        }
      }
    }
    document.addEventListener('notes-changed', syncTabTitles)
    return () => document.removeEventListener('notes-changed', syncTabTitles)
  }, [tabs, tabData])

  // Live reading state reported by viewers, keyed so it survives tab switches.
  // Live reading state for the plugin / AI context. Refs, not state: it's never
  // rendered, and as state every PDF page turn re-rendered every open tab.
  const pageByDocRef = useRef<Record<string, { currentPage?: number; totalPages?: number }>>({})
  const selectionRef = useRef<{ text?: string; page?: number; docId?: string }>({})

  // Assemble the context handed to plugins — and thence to the AI assistant.
  // Single source of truth, rebuilt whenever tabs, the active tab, or the live
  // reading state change. Shaped for an LLM: what's open, what's active, where
  // the user is (page), and what they've selected.
  const publishContext = useCallback(() => {
    const pageByDoc = pageByDocRef.current
    const selection = selectionRef.current
    const activeTab = tabs.find(t => t.id === activeTabId)
    const summarize = (t: Tab) => {
      const d = tabData.get(t.id)
      return d ? { id: d.id, title: d.title, type: d.type } : null
    }
    const openDocuments = tabs.filter(t => t.type === 'document').map(summarize).filter(Boolean)
    const openNotes = tabs.filter(t => t.type === 'note').map(summarize).filter(Boolean)

    const ctx: Record<string, any> = {
      view: activeTab?.type || 'library',
      libraryName,
      openDocuments,
      openNotes,
    }
    if (activeTab?.type === 'document') {
      const d = tabData.get(activeTab.id)
      if (d) {
        const pg = pageByDoc[d.id] || {}
        ctx.activeDocument = {
          id: d.id, title: d.title, authors: d.authors, type: d.type,
          currentPage: pg.currentPage, totalPages: pg.totalPages,
        }
      }
    }
    if (activeTab?.type === 'note') {
      const d = tabData.get(activeTab.id)
      if (d) ctx.activeNote = { id: d.id, title: d.title, type: d.type }
    }
    if (selection.text) {
      ctx.selectedText = selection.text
      ctx.selectedPage = selection.page
      ctx.selectedFromDocId = selection.docId
    }
    ;(window as any).__banjuanContext = ctx
  }, [activeTabId, tabs, tabData, libraryName])
  // Tell main whether the active tab can take "insert screenshot into note".
  useEffect(() => {
    const tab = tabs.find(x => x.id === activeTabId)
    const ok = tab?.type === 'note' && (tabData.get(tab.id)?.type ?? 'markdown') === 'markdown'
    api.screenshot?.setInsertTarget?.(ok)
  }, [api, tabs, activeTabId, tabData])

  useEffect(() => api.screenshot?.onDone?.(r => {
    if (!r.ok) toast.error(t('screenshot.failed', r.detail ?? ''))
    else if (r.action === 'copy') toast.success(t('screenshot.copied'))
    else if (r.action === 'save') toast.success(t('screenshot.saved', r.detail ?? ''))
  }), [api, t])

  const publishContextRef = useRef(publishContext)
  publishContextRef.current = publishContext
  useEffect(() => { publishContext() }, [publishContext])

  useEffect(() => {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-tab-panel="${activeTabId}"]`)
      if (el) el.dispatchEvent(new Event('tab-activated', { bubbles: true }))
    })
  }, [activeTabId])

  // Listen for context updates from viewers (page changes, text selections).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      if (detail.docId && (detail.currentPage != null || detail.totalPages != null)) {
        pageByDocRef.current = {
          ...pageByDocRef.current,
          [detail.docId]: { currentPage: detail.currentPage, totalPages: detail.totalPages },
        }
      }
      // selectedText is set to a string on select, and null when cleared.
      if (detail.selectedText !== undefined) {
        selectionRef.current = detail.selectedText
          ? { text: detail.selectedText, page: detail.selectedPage, docId: detail.docId }
          : {}
      }
      publishContextRef.current()
    }
    document.addEventListener('banjuan:context-update', handler)
    return () => document.removeEventListener('banjuan:context-update', handler)
  }, [])

  const closeTab = useCallback((tabId: string) => {
    if (tabId === LIBRARY_TAB_ID) return
    mountedTabsRef.current.delete(tabId)
    setTabs(prev => prev.filter(t => t.id !== tabId))
    setTabData(prev => { const m = new Map(prev); m.delete(tabId); return m })
    if (activeTabId === tabId) {
      const history = tabHistoryRef.current
      tabHistoryRef.current = history.filter(id => id !== tabId)
      const prev = tabHistoryRef.current[tabHistoryRef.current.length - 1] || LIBRARY_TAB_ID
      setActiveTabId(prev)
    } else {
      tabHistoryRef.current = tabHistoryRef.current.filter(id => id !== tabId)
    }
  }, [activeTabId])

  // Restore the tabs open when this library was last closed. Entities are
  // fetched fresh (titles may have changed, deleted ones are skipped) and the
  // tabs mount lazily, so restoring many PDFs doesn't slow startup.
  const restoredRef = useRef(false)
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId
  useEffect(() => {
    let cancelled = false
    const session = readTabSession(localStorage, libraryPath)
    void (async () => {
      const entries = await Promise.all((session?.tabs ?? []).map(async (s): Promise<[Tab, any] | null> => {
        try {
          if (s.kind === 'tag-manager') return [{ id: 'tag-manager', type: 'tag-manager', title: t('tags.manager'), closable: true }, undefined]
          if (s.kind === 'document') {
            const d = await api.documents.get(s.id)
            return d ? [{ id: `doc-${d.id}`, type: 'document', title: d.title, closable: true }, d] : null
          }
          const n = await api.notes.get(s.id)
          return n ? [{ id: `note-${n.id}`, type: 'note', title: n.title, closable: true }, n] : null
        } catch { return null }
      }))
      if (cancelled) return
      const restored = entries.filter((e): e is [Tab, any] => !!e)
      if (restored.length > 0) {
        // Merge: keep anything the user opened while we were loading.
        setTabs(prev => {
          const have = new Set(prev.map(x => x.id))
          const [library, ...rest] = prev
          return [library, ...restored.map(([tab]) => tab).filter(tab => !have.has(tab.id)), ...rest]
        })
        setTabData(prev => {
          const m = new Map(prev)
          for (const [tab, data] of restored) if (data && !m.has(tab.id)) m.set(tab.id, data)
          return m
        })
        if (session && activeTabIdRef.current === LIBRARY_TAB_ID && restored.some(([tab]) => tab.id === session.active)) {
          activateTab(session.active)
        }
      }
      restoredRef.current = true
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!restoredRef.current) return   // don't overwrite the saved session before it's restored
    const saved: SavedTab[] = []
    for (const tab of tabs) {
      if (tab.type === 'tag-manager') saved.push({ kind: 'tag-manager' })
      else if (tab.type === 'document' || tab.type === 'note') {
        const id = tabData.get(tab.id)?.id
        if (id) saved.push({ kind: tab.type, id })
      }
    }
    writeTabSession(localStorage, libraryPath, { tabs: saved, active: activeTabId })
  }, [tabs, tabData, activeTabId, libraryPath])

  const [paletteOpen, setPaletteOpen] = useState(false)

  // ⌘1–8 / ⌘9 / ⌃Tab switch tabs, ⌘K toggles global search (Ctrl instead of ⌘ off macOS).
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(v => !v)
        return
      }
      const target = tabShortcut(e, isMac, tabs.map(x => x.id), activeTabId)
      if (!target) return
      e.preventDefault()
      if (target !== activeTabId) activateTab(target)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabs, activeTabId, activateTab])

  // File › Close Tab (⌘W) closes the current tab; on the library tab it lets
  // the window close, like a browser's last tab.
  useEffect(() => api.menu?.onCloseTab(() => {
    const tab = tabs.find(x => x.id === activeTabId)
    if (!tab?.closable) return false
    closeTab(tab.id)
    return true
  }), [api, tabs, activeTabId, closeTab])

  // Close tabs whose note / document was deleted from any view; otherwise the
  // editor stays open and keeps saving into something that no longer exists.
  useEffect(() => {
    const prune = async () => {
      for (const tab of tabs) {
        if (tab.type !== 'note' && tab.type !== 'document') continue
        const data = tabData.get(tab.id)
        if (!data) continue
        const exists = tab.type === 'note' ? await api.notes.get(data.id) : await api.documents.get(data.id)
        if (!exists) closeTab(tab.id)
        // Moved, or its folder renamed: viewers read the file by path, so hand
        // them the current document instead of the stale path.
        else if (tab.type === 'document' && (exists as any).path !== data.path) {
          setTabData(prev => new Map(prev).set(tab.id, exists))
        }
      }
    }
    document.addEventListener('notes-changed', prune)
    document.addEventListener('documents-changed', prune)
    return () => {
      document.removeEventListener('notes-changed', prune)
      document.removeEventListener('documents-changed', prune)
    }
  }, [tabs, tabData, api, closeTab])

  const titleBarElement = (
    <TitleBar
      tabs={tabs}
      activeTabId={activeTabId}
      onSelectTab={activateTab}
      onCloseTab={closeTab}
      onReorderTabs={setTabs}
      pluginViews={pluginViews}
      activePanelPlugin={sidePanel?.pluginId ?? null}
      onTogglePluginPanel={togglePluginPanel}
      railRelevant={activeTabId === LIBRARY_TAB_ID || pluginViews.length > 0}
      railCollapsed={railCollapsed}
      onToggleRail={toggleRail}
    />
  )

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {isNarrow ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid var(--border, #dee2e6)' }}>
            <button onClick={() => setSidebarOpen(true)} aria-label={t('tabs.showTabs')}
              style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <Menu size={20} />
            </button>
            <span style={{ marginLeft: 8, fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tabs.find(t => t.id === activeTabId)?.title ?? ''}
            </span>
          </div>
          {sidebarOpen && (
            <>
              <div onClick={() => setSidebarOpen(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 999 }} />
              <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: '80%', maxWidth: 360, background: 'var(--bg, #fff)', zIndex: 1000, display: 'flex', flexDirection: 'column', boxShadow: '2px 0 8px rgba(0,0,0,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border, #e0e0e0)' }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{libraryName}</span>
                  <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <X size={18} />
                  </button>
                </div>
                <div style={{ flex: 1, overflow: 'auto' }}>{titleBarElement}</div>
                {onSwitchLibrary && (
                  <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border, #e0e0e0)' }}>
                    <button onClick={() => { setSidebarOpen(false); onSwitchLibrary() }}
                      style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border, #e0e0e0)', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>
                      {t('library.switchLibrary')}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        titleBarElement
      )}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {tabs.map(tab => (
            <div
              key={tab.id}
              data-tab-panel={tab.id}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                clipPath: tab.id === activeTabId ? 'none' : 'inset(100%)',
                pointerEvents: tab.id === activeTabId ? 'auto' : 'none',
              }}
            >
              <TabActiveContext.Provider value={tab.id === activeTabId}>
              {mountedTabsRef.current.has(tab.id) && <Suspense fallback={null}>
              {tab.type === 'library' && (
                <LibraryView
                  rootPath={libraryPath}
                  libraryName={libraryName}
                  onOpenDoc={openDocument}
                  onOpenNote={openNote}
                  onOpenMindmap={openNote}
                  onOpenTagManager={openTagManager}
                  onOpenPluginView={togglePluginPanel}
                  detailOpen={detailOpen}
                  onToggleDetail={toggleDetail}
                  detailPortalTarget={inspectorEl}
                  onSwitchLibrary={onSwitchLibrary}
                  onLibraryRenamed={(name) => { setTabs(prev => prev.map(t => t.id === LIBRARY_TAB_ID ? { ...t, title: name } : t)); onLibraryRenamed?.(name) }}
                />
              )}
              {tab.type === 'document' && tabData.get(tab.id) && (
                <DocumentViewer
                  doc={tabData.get(tab.id)}
                  onBack={() => closeTab(tab.id)}
                  onOpenNote={openNote}
                />
              )}
              {tab.type === 'note' && tabData.get(tab.id) && (
                <NoteView
                  note={tabData.get(tab.id)}
                  onBack={() => closeTab(tab.id)}
                  onOpenNote={openNote}
                />
              )}
              {tab.type === 'tag-manager' && (
                <TagManagerView libraryName={libraryName} onBack={() => closeTab(tab.id)} />
              )}
              </Suspense>}
              </TabActiveContext.Provider>
            </div>
          ))}
          <Suspense fallback={null}><MindmapExportHost /></Suspense>
          {paletteOpen && (
            <SearchPalette onClose={() => setPaletteOpen(false)} onOpenNote={openNote} onOpenDocument={openDocument} />
          )}
        </div>
        {(sidePanel || detailOpen) && (
          <>
            <ResizeHandle onPointerDown={sidePanelResize.onPointerDown} />
            <div className="plugin-side-panel" style={{ width: sidePanelResize.width, minWidth: sidePanelResize.width }}>
              {sidePanel ? (
                <PluginViewHost
                  key={sidePanel.pluginId}
                  pluginId={sidePanel.pluginId}
                  viewType={sidePanel.viewType}
                />
              ) : (
                <div ref={setInspectorEl} style={{ flex: 1, overflow: 'auto', padding: '20px 20px 40px' }} />
              )}
            </div>
          </>
        )}
        {/* Window-level right rail: switches a single right surface — the library
            detail panel or a plugin view (mutually exclusive). */}
        {(activeTabId === LIBRARY_TAB_ID || pluginViews.length > 0) && !railCollapsed && (
        <div style={{ width: 48, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, gap: 6 }}>
          {activeTabId === LIBRARY_TAB_ID && (
            <button
              onClick={toggleDetail}
              title={t('detail.title')}
              style={railBtnStyle(detailOpen)}
            >
              <Info size={18} />
            </button>
          )}
          {pluginViews.length > 0 && activeTabId === LIBRARY_TAB_ID && (
            <div style={{ width: 22, height: 1, background: 'var(--border)', margin: '2px 0' }} />
          )}
          {pluginViews.map(view => {
            const isSvg = !!view.icon && view.icon.includes('<svg')
            const active = sidePanel?.pluginId === view.pluginId
            return (
              <button
                key={view.viewType}
                onClick={() => togglePluginPanel(view.pluginId, view.viewType)}
                title={view.displayText}
                style={railBtnStyle(active)}
              >
                {isSvg
                  ? <span style={{ display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: view.icon!.replace(/width="\d+"/, 'width="18"').replace(/height="\d+"/, 'height="18"') }} />
                  : <span style={{ fontSize: 16, lineHeight: 1 }}>{view.icon || '🧩'}</span>}
              </button>
            )
          })}
        </div>
        )}
      </div>
      <ExportPanel />
    </div>
  )
}
