import React, { useState, useCallback, useEffect } from 'react'
import TitleBar, { type Tab } from './TitleBar.js'
import LibraryView from '../views/LibraryView.js'
import DocumentViewer from './viewers/DocumentViewer.js'
import NoteView from '../views/NoteView.js'
import TagManagerView from '../views/TagManagerView.js'
import { useT } from '../i18n/index.js'

const LIBRARY_TAB_ID = 'library'

interface Props {
  libraryPath: string
  libraryName: string
}

export default function TabManager({ libraryPath, libraryName }: Props) {
  const t = useT()
  const [tabs, setTabs] = useState<Tab[]>([
    { id: LIBRARY_TAB_ID, type: 'library', title: libraryName, closable: false },
  ])
  const [activeTabId, setActiveTabId] = useState(LIBRARY_TAB_ID)
  const [tabData, setTabData] = useState<Map<string, any>>(() => new Map())

  const openDocument = useCallback((doc: any) => {
    const existingTab = tabs.find(t => t.type === 'document' && tabData.get(t.id)?.id === doc.id)
    if (existingTab) {
      setActiveTabId(existingTab.id)
      return
    }
    const tabId = `doc-${doc.id}`
    const newTab: Tab = { id: tabId, type: 'document', title: doc.title, closable: true }
    setTabs(prev => [...prev, newTab])
    setTabData(prev => new Map(prev).set(tabId, doc))
    setActiveTabId(tabId)
  }, [tabs, tabData])

  const openNote = useCallback(async (note: any) => {
    const existingTab = tabs.find(t => t.type === 'note' && tabData.get(t.id)?.id === note.id)
    if (existingTab) {
      setActiveTabId(existingTab.id)
      return
    }
    const full = note.type ? note : await window.electronAPI.notes.get(note.id)
    if (!full) return
    const tabId = `note-${full.id}`
    const newTab: Tab = { id: tabId, type: 'note', title: full.title, closable: true }
    setTabs(prev => [...prev, newTab])
    setTabData(prev => new Map(prev).set(tabId, full))
    setActiveTabId(tabId)
  }, [tabs, tabData])

  const openTagManager = useCallback(() => {
    const existingTab = tabs.find(t => t.type === 'tag-manager')
    if (existingTab) {
      setActiveTabId(existingTab.id)
      return
    }
    const tabId = 'tag-manager'
    const newTab: Tab = { id: tabId, type: 'tag-manager', title: t('tags.manager'), closable: true }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(tabId)
  }, [tabs, t])

  useEffect(() => {
    const syncTabTitles = async () => {
      const noteTabs = tabs.filter(t => t.type === 'note')
      if (noteTabs.length === 0) return
      for (const tab of noteTabs) {
        const noteData = tabData.get(tab.id)
        if (!noteData) continue
        const fresh = await window.electronAPI.notes.get(noteData.id)
        if (fresh && fresh.title !== tab.title) {
          setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, title: fresh.title } : t))
        }
      }
    }
    document.addEventListener('notes-changed', syncTabTitles)
    return () => document.removeEventListener('notes-changed', syncTabTitles)
  }, [tabs, tabData])

  const closeTab = useCallback((tabId: string) => {
    if (tabId === LIBRARY_TAB_ID) return
    setTabs(prev => prev.filter(t => t.id !== tabId))
    setTabData(prev => { const m = new Map(prev); m.delete(tabId); return m })
    if (activeTabId === tabId) {
      setActiveTabId(LIBRARY_TAB_ID)
    }
  }, [activeTabId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TitleBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={closeTab}
        onReorderTabs={setTabs}
      />
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
                onOpenGraph={() => {}}
                onOpenTagManager={openTagManager}
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
    </div>
  )
}
