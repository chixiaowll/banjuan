import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useMediaQuery } from '@mantine/hooks'
import { Drawer, ActionIcon } from '@mantine/core'
import { Menu } from 'lucide-react'
import TitleBar, { type Tab, type PluginViewInfo } from './TitleBar.js'
import LibraryView from '../views/LibraryView.js'
import DocumentViewer from './viewers/DocumentViewer.js'
import NoteView from '../views/NoteView.js'
import TagManagerView from '../views/TagManagerView.js'
import PluginViewHost from '../views/PluginViewHost.js'
import { useT } from '../i18n/index.js'
import { useBanjuanAPI } from '../api.js'
import '../styles/mobile.css'

const LIBRARY_TAB_ID = 'library'

interface Props {
  libraryPath: string
  libraryName: string
  onSwitchLibrary?: () => void
}

export default function TabManager({ libraryPath, libraryName, onSwitchLibrary }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const isNarrow = useMediaQuery('(max-width: 768px)')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tabs, setTabs] = useState<Tab[]>([
    { id: LIBRARY_TAB_ID, type: 'library', title: libraryName, closable: false },
  ])
  const [activeTabId, setActiveTabId] = useState(LIBRARY_TAB_ID)
  const [tabData, setTabData] = useState<Map<string, any>>(() => new Map())
  const [pluginViews, setPluginViews] = useState<PluginViewInfo[]>([])
  const [sidePanel, setSidePanel] = useState<{ pluginId: string; viewType: string } | null>(null)
  const tabHistoryRef = useRef<string[]>([LIBRARY_TAB_ID])

  const activateTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
    setSidebarOpen(false)
    const history = tabHistoryRef.current
    const idx = history.lastIndexOf(tabId)
    if (idx !== -1) history.splice(idx, 1)
    history.push(tabId)
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
      return
    }
    const tabId = `doc-${doc.id}`
    const newTab: Tab = { id: tabId, type: 'document', title: doc.title, closable: true }
    setTabs(prev => [...prev, newTab])
    setTabData(prev => new Map(prev).set(tabId, doc))
    activateTab(tabId)
  }, [tabs, tabData, activateTab])

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

  // Update global context for plugins
  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId)
    const data = activeTab ? tabData.get(activeTab.id) : null
    const base: Record<string, any> = {
      view: activeTab?.type || 'library',
      title: activeTab?.title || libraryName,
    }
    if (activeTab?.type === 'document' && data) {
      base.document = { id: data.id, title: data.title, authors: data.authors, type: data.type }
    }
    if (activeTab?.type === 'note' && data) {
      base.note = { id: data.id, title: data.title, type: data.type }
    }
    ;(window as any).__banjuanContext = base
  }, [activeTabId, tabs, tabData, libraryName])

  // Listen for context updates from child components (page changes, selections)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      const ctx = (window as any).__banjuanContext || {}
      ;(window as any).__banjuanContext = { ...ctx, ...detail }
    }
    document.addEventListener('banjuan:context-update', handler)
    return () => document.removeEventListener('banjuan:context-update', handler)
  }, [])

  const closeTab = useCallback((tabId: string) => {
    if (tabId === LIBRARY_TAB_ID) return
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
    />
  )

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {isNarrow ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid var(--mantine-color-default-border, #dee2e6)' }}>
            <ActionIcon variant="subtle" onClick={() => setSidebarOpen(true)} aria-label="Open tabs">
              <Menu size={20} />
            </ActionIcon>
            <span style={{ marginLeft: 8, fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tabs.find(t => t.id === activeTabId)?.title ?? ''}
            </span>
          </div>
          <Drawer
            opened={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            size="80%"
            padding="xs"
            title={libraryName}
            position="left"
          >
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ flex: 1, overflow: 'auto' }}>{titleBarElement}</div>
              {onSwitchLibrary && (
                <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border, #e0e0e0)' }}>
                  <button onClick={() => { setSidebarOpen(false); onSwitchLibrary() }}
                    style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border, #e0e0e0)', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>
                    Switch Library
                  </button>
                </div>
              )}
            </div>
          </Drawer>
        </>
      ) : (
        titleBarElement
      )}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {tabs.map(tab => (
            <div
              key={tab.id}
              style={{
                position: 'absolute',
                inset: 0,
                display: tab.id === activeTabId ? 'flex' : 'none',
                flexDirection: 'column',
              }}
            >
              {tab.type === 'library' && (
                <LibraryView
                  rootPath={libraryPath}
                  libraryName={libraryName}
                  onOpenDoc={openDocument}
                  onOpenNote={openNote}
                  onOpenMindmap={openNote}
                  onOpenTagManager={openTagManager}
                  onOpenPluginView={togglePluginPanel}
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
                <TagManagerView />
              )}
            </div>
          ))}
        </div>
        {sidePanel && (
          <div className="plugin-side-panel">
            <PluginViewHost
              key={sidePanel.pluginId}
              pluginId={sidePanel.pluginId}
              viewType={sidePanel.viewType}
            />
          </div>
        )}
      </div>
    </div>
  )
}
