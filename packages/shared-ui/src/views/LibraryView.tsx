import SyncConfigPanel from '../components/sync/SyncConfigPanel.js'
import TagManagerView from './TagManagerView.js'
import TrashView from './TrashView.js'
import { ResizeHandle } from '../components/ResizeHandle.js'
import SettingsPanel from './library/SettingsPanel.js'
import { useLibraryState } from './library/useLibraryState.js'
import { LibraryContext } from './library/LibraryContext.js'
import type { LibraryViewProps } from './library/helpers.js'
import LibrarySidebar from './library/LibrarySidebar.js'
import LibraryHome from './library/LibraryHome.js'
import LibraryPlugins from './library/LibraryPlugins.js'
import LibraryTagResults from './library/LibraryTagResults.js'
import LibraryList from './library/LibraryList.js'
import LibraryDetail from './library/LibraryDetail.js'
import LibraryDialogs from './library/LibraryDialogs.js'
import LibraryContextMenu from './library/LibraryContextMenu.js'

/**
 * The library window's main view. State and actions live in useLibraryState();
 * the parts (library/*) read them through LibraryContext.
 */
export default function LibraryView(props: LibraryViewProps) {
  const lib = useLibraryState(props)
  const {
    centerStyle, handleSectionChange, layout, leftResize, libraryName, loadDocuments, loadNoteDirs,
    loadNotes, locale, rootPath, selectedSection, setLocale, sidebarCollapsed, t,
  } = lib
  return (
    <LibraryContext.Provider value={lib}>
      <div data-long-press-menu style={{ display: 'flex', height: '100%' }}>
        {/* Left Sidebar */}
        <LibrarySidebar />

        {!sidebarCollapsed && layout.sidebarResizable && <ResizeHandle onPointerDown={leftResize.onPointerDown} />}

        {/* Center Panel */}
        <div style={centerStyle}>
          {selectedSection === 'home' ? (
            <LibraryHome />
          ) : selectedSection === 'settings' ? (
            <div style={layout.contentMaxWidth ? { flex: 1, overflow: 'auto' } : { display: 'contents' }}>
              <div style={layout.contentMaxWidth ? { maxWidth: layout.contentMaxWidth, margin: '0 auto' } : { display: 'contents' }}>
                <SettingsPanel locale={locale} setLocale={setLocale} t={t} />
              </div>
            </div>
          ) : selectedSection === 'trash' ? (
            <div style={layout.contentMaxWidth ? { flex: 1, overflow: 'auto' } : { display: 'contents' }}>
              <div style={layout.contentMaxWidth ? { maxWidth: layout.contentMaxWidth, margin: '0 auto' } : { display: 'contents' }}>
                <TrashView onRestored={() => { void loadDocuments(); void loadNotes(); void loadNoteDirs() }} />
              </div>
            </div>
          ) : selectedSection === 'plugins' ? (
            <LibraryPlugins />
          ) : selectedSection === 'sync' ? (
            <div style={layout.contentMaxWidth ? { flex: 1, overflow: 'auto' } : { display: 'contents' }}>
              <div style={layout.contentMaxWidth ? { maxWidth: layout.contentMaxWidth, margin: '0 auto' } : { display: 'contents' }}>
                <SyncConfigPanel libraryKey={rootPath} onClose={() => { handleSectionChange('home'); loadDocuments() }} />
              </div>
            </div>
          ) : selectedSection === 'tags' ? (
            <TagManagerView libraryName={libraryName} onBack={() => handleSectionChange('home')} />
          ) : selectedSection === 'tag-results' ? (
            <LibraryTagResults />
          ) : (
            <LibraryList />
          )}
        </div>

        {/* Detail content is portaled into the shared right inspector container
            owned by TabManager, so it shares one resizable panel with plugins. */}
        <LibraryDetail />

        <LibraryDialogs />
        <LibraryContextMenu />

      </div>
    </LibraryContext.Provider>
  )
}
