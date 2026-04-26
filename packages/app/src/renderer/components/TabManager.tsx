import React, { useState, useCallback } from 'react'
import TitleBar, { type Tab } from './TitleBar.js'
import LibraryView from '../views/LibraryView.js'
import DocumentViewer from './viewers/DocumentViewer.js'
import NoteView from '../views/NoteView.js'

const LIBRARY_TAB_ID = 'library'

interface Props {
  libraryPath: string
}

export default function TabManager({ libraryPath }: Props) {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: LIBRARY_TAB_ID, type: 'library', title: '书库', closable: false },
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

  const openNote = useCallback((note: any) => {
    const existingTab = tabs.find(t => t.type === 'note' && tabData.get(t.id)?.id === note.id)
    if (existingTab) {
      setActiveTabId(existingTab.id)
      return
    }
    const tabId = `note-${note.id}`
    const newTab: Tab = { id: tabId, type: 'note', title: note.title, closable: true }
    setTabs(prev => [...prev, newTab])
    setTabData(prev => new Map(prev).set(tabId, note))
    setActiveTabId(tabId)
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
                onOpenDoc={openDocument}
                onOpenNote={openNote}
                onOpenMindmap={() => {}}
                onOpenGraph={() => {}}
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
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
