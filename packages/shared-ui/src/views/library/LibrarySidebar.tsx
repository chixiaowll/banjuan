import { PanelLeftClose, PanelLeftOpen, Home, LibraryBig, ChevronDown, ChevronRight, Folder, PenLine, Cloud, Puzzle, Settings, Trash2, Tag, ArrowLeftRight } from 'lucide-react'
import DirTreeItem from './DirTreeItem.js'
import { type DirNode, type LibraryTag } from './helpers.js'
import { useLibrary } from './LibraryContext.js'

/** The left sidebar: library header, sections, document and note folder trees, tags, switching libraries. */
export default function LibrarySidebar() {
  const {
    api, dirTree, docSectionExpanded, documents, expandedDirs, expandedNoteDirs,
    handleSectionChange, handleSidebarContextMenu, isMinimal, isModern, isNotebook, libraryName,
    noteDirTree, noteSectionExpanded, notes, onSwitchLibrary, plugins, sb, selectedDir,
    selectedNoteDir, selectedSection, selectedTag, setDocSectionExpanded, setExpandedNoteDirs,
    setNoteSectionExpanded, setRenameInputValue, setRenameTarget, setSelectedDir,
    setSelectedItemDetail, setSelectedItemId, setSelectedNoteDir, setSelectedSection,
    setSelectedTag, setShowAllTags, setShowRenameInput, setSidebarCollapsed, setTagFilteredItems,
    setTagSearch, showAllTags, sidebarCollapsed, sidebarItemStyle, sidebarStyle, t, tagSearch,
    tagsWithCounts, toggleDir,
  } = useLibrary()
  return (
    <div style={sidebarStyle}>
      {/* Header */}
      {isModern && !sidebarCollapsed ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 8px 14px',
          margin: '0 0 14px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: isNotebook ? '#E07856' : 'var(--ink)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-serif, "Noto Serif SC", serif)',
            fontSize: 15, fontWeight: 600, flexShrink: 0,
            boxShadow: isNotebook ? '0 2px 6px rgba(224,120,86,.35)' : 'none',
          }}>{t('library.sealChar')}</div>
          <div
            style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'default' }}
            onDoubleClick={() => { setRenameTarget({ type: 'library' }); setRenameInputValue(libraryName); setShowRenameInput(true) }}
          >{libraryName}</div>
          <div
            onClick={() => setSidebarCollapsed(v => !v)}
            style={{
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--ink-mute)',
              transition: 'background 0.15s ease', flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = isNotebook ? 'rgba(255,255,255,.6)' : 'var(--hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <PanelLeftClose size={16} />
          </div>
        </div>
      ) : isModern && sidebarCollapsed ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '10px 4px',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: isNotebook ? '#E07856' : 'var(--ink)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-serif, "Noto Serif SC", serif)',
            fontSize: 15, fontWeight: 600, flexShrink: 0,
            boxShadow: isNotebook ? '0 2px 6px rgba(224,120,86,.35)' : 'none',
            cursor: 'pointer',
          }} onClick={() => setSidebarCollapsed(false)}>{t('library.sealChar')}</div>
        </div>
      ) : (
        <div style={{
          padding: sidebarCollapsed ? '12px 4px 10px' : '12px 20px 10px',
          display: 'flex', alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          gap: 8, flexShrink: 0,
        }}>
          {!sidebarCollapsed && (
            <span
              style={{
                fontSize: 15, fontWeight: 600, color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                letterSpacing: '0.02em',
                textTransform: 'uppercase', cursor: 'default',
              }}
              onDoubleClick={() => { setRenameTarget({ type: 'library' }); setRenameInputValue(libraryName); setShowRenameInput(true) }}
            >
              {libraryName}
            </span>
          )}
          <div
            onClick={() => setSidebarCollapsed(v => !v)}
            style={{
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)',
              transition: 'background 0.15s ease', flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        {/* Home */}
        <div
          style={sidebarItemStyle(selectedSection === 'home')}
          onClick={() => handleSectionChange('home')}
          onMouseEnter={e => { if (selectedSection !== 'home') e.currentTarget.style.background = sb.hoverBackground }}
          onMouseLeave={e => { if (selectedSection !== 'home') e.currentTarget.style.background = 'transparent' }}
          title={sidebarCollapsed ? t('library.home') : undefined}
        >
          <Home size={sb.iconSize} style={{ flexShrink: 0 }} />
          {!sidebarCollapsed && t('library.home')}
        </div>

        {/* Documents */}
        <div
          style={sidebarItemStyle(selectedSection === 'documents' && selectedDir === null && !selectedTag)}
          onClick={() => { handleSectionChange('documents'); if (!sidebarCollapsed) setDocSectionExpanded(prev => selectedSection === 'documents' ? !prev : true) }}
          onContextMenu={(e) => handleSidebarContextMenu(e, 'documents')}
          onMouseEnter={e => { if (!(selectedSection === 'documents' && selectedDir === null && !selectedTag)) e.currentTarget.style.background = sb.hoverBackground }}
          onMouseLeave={e => { if (!(selectedSection === 'documents' && selectedDir === null && !selectedTag)) e.currentTarget.style.background = 'transparent' }}
          title={sidebarCollapsed ? t('library.documents') : undefined}
        >
          <LibraryBig size={sb.iconSize} style={{ flexShrink: 0, color: isMinimal ? 'var(--ink-mute)' : undefined }} />
          {!sidebarCollapsed && <><span style={{ flex: 1 }}>{t('library.documents')}</span>
            {sb.showBadge && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500, padding: '1px 7px', borderRadius: 9, minWidth: 22, textAlign: 'center', background: selectedSection === 'documents' && selectedDir === null && !selectedTag ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.04)', color: selectedSection === 'documents' && selectedDir === null && !selectedTag ? '#fff' : 'var(--ink-mute)' }}>{documents.length}</span>}
            {isMinimal && <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', fontWeight: 400 }}>{documents.length}</span>}
            {isMinimal && dirTree.length > 0 && <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 4 }}>{docSectionExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
            {!isModern && dirTree.length > 0 && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{docSectionExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
          </>}
        </div>

        {!sidebarCollapsed && docSectionExpanded && dirTree.length > 0 && (
          <div style={sb.treeIndent ? { paddingLeft: sb.treeIndent } : undefined}>
            {dirTree.map((node, ni) => (
              <DirTreeItem
                key={node.path} node={node} selectedDir={selectedDir}
                onSelect={(p) => { setSelectedSection('documents'); setSelectedDir(p); setSelectedTag(null); setTagFilteredItems(null); setSelectedNoteDir(null); setSelectedItemId(null); setSelectedItemDetail(null) }}
                expandedDirs={expandedDirs} onToggle={toggleDir} depth={1} icon={<Folder size={16} />}
                onContextMenu={(e, path) => handleSidebarContextMenu(e, 'docDir', path)}
                siblingIndex={ni}
              />
            ))}
          </div>
        )}

        {/* Notes */}
        <div
          style={sidebarItemStyle(selectedSection === 'notes' && selectedNoteDir === null && !selectedTag)}
          onClick={() => { handleSectionChange('notes'); if (!sidebarCollapsed) setNoteSectionExpanded(prev => selectedSection === 'notes' ? !prev : true) }}
          onContextMenu={(e) => handleSidebarContextMenu(e, 'notes')}
          onMouseEnter={e => { if (!(selectedSection === 'notes' && selectedNoteDir === null && !selectedTag)) e.currentTarget.style.background = sb.hoverBackground }}
          onMouseLeave={e => { if (!(selectedSection === 'notes' && selectedNoteDir === null && !selectedTag)) e.currentTarget.style.background = 'transparent' }}
          title={sidebarCollapsed ? t('library.notes') : undefined}
        >
          <PenLine size={sb.iconSize} style={{ flexShrink: 0, color: isMinimal ? 'var(--ink-mute)' : undefined }} />
          {!sidebarCollapsed && <><span style={{ flex: 1 }}>{t('library.notes')}</span>
            {sb.showBadge && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500, padding: '1px 7px', borderRadius: 9, minWidth: 22, textAlign: 'center', background: selectedSection === 'notes' && selectedNoteDir === null && !selectedTag ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.04)', color: selectedSection === 'notes' && selectedNoteDir === null && !selectedTag ? '#fff' : 'var(--ink-mute)' }}>{notes.length}</span>}
            {isMinimal && <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', fontWeight: 400 }}>{notes.length}</span>}
            {isMinimal && noteDirTree.length > 0 && <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 4 }}>{noteSectionExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
            {!isModern && noteDirTree.length > 0 && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{noteSectionExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
          </>}
        </div>

        {!sidebarCollapsed && noteSectionExpanded && noteDirTree.length > 0 && (
          <div style={sb.treeIndent ? { paddingLeft: sb.treeIndent } : undefined}>
            {noteDirTree.map((node, ni) => (
              <DirTreeItem
                key={node.path} node={node} selectedDir={selectedNoteDir}
                onSelect={(p) => { setSelectedSection('notes'); setSelectedNoteDir(p); setSelectedTag(null); setTagFilteredItems(null); setSelectedDir(null); setSelectedItemId(null); setSelectedItemDetail(null) }}
                expandedDirs={expandedNoteDirs}
                onToggle={(path) => setExpandedNoteDirs(prev => {
                  const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next
                })}
                onContextMenu={(e, path) => handleSidebarContextMenu(e, 'noteDir', path)}
                depth={1} icon={<Folder size={16} />}
                siblingIndex={ni}
              />
            ))}
          </div>
        )}

        {!sidebarCollapsed && <div style={{ margin: sb.dividerMargin, borderTop: '1px solid var(--border)' }} />}
        {sidebarCollapsed && <div style={{ margin: '6px 8px', borderTop: '1px solid var(--border)' }} />}

        {/* Utilities */}
        <div
          style={sidebarItemStyle(selectedSection === 'sync')}
          onClick={() => handleSectionChange('sync')}
          onMouseEnter={e => { if (selectedSection !== 'sync') e.currentTarget.style.background = sb.hoverBackground }}
          onMouseLeave={e => { if (selectedSection !== 'sync') e.currentTarget.style.background = 'transparent' }}
          title={sidebarCollapsed ? t('library.sync') : undefined}
        >
          <Cloud size={sb.iconSize} style={{ flexShrink: 0 }} />
          {!sidebarCollapsed && t('library.sync')}
        </div>
        <div
          style={sidebarItemStyle(selectedSection === 'plugins')}
          onClick={() => handleSectionChange('plugins')}
          onMouseEnter={e => { if (selectedSection !== 'plugins') e.currentTarget.style.background = sb.hoverBackground }}
          onMouseLeave={e => { if (selectedSection !== 'plugins') e.currentTarget.style.background = 'transparent' }}
          title={sidebarCollapsed ? t('library.plugins') : undefined}
        >
          <Puzzle size={sb.iconSize} style={{ flexShrink: 0 }} />
          {!sidebarCollapsed && <>{t('library.plugins')}{plugins.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>({plugins.length})</span>}</>}
        </div>
        <div
          style={sidebarItemStyle(selectedSection === 'settings')}
          onClick={() => handleSectionChange('settings')}
          onMouseEnter={e => { if (selectedSection !== 'settings') e.currentTarget.style.background = sb.hoverBackground }}
          onMouseLeave={e => { if (selectedSection !== 'settings') e.currentTarget.style.background = 'transparent' }}
          title={sidebarCollapsed ? t('settings.title') : undefined}
        >
          <Settings size={sb.iconSize} style={{ flexShrink: 0 }} />
          {!sidebarCollapsed && t('settings.title')}
        </div>
        {api.trash && (
          <div
            style={sidebarItemStyle(selectedSection === 'trash')}
            onClick={() => handleSectionChange('trash')}
            onMouseEnter={e => { if (selectedSection !== 'trash') e.currentTarget.style.background = sb.hoverBackground }}
            onMouseLeave={e => { if (selectedSection !== 'trash') e.currentTarget.style.background = 'transparent' }}
            title={sidebarCollapsed ? t('trash.title') : undefined}
          >
            <Trash2 size={sb.iconSize} style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && t('trash.title')}
          </div>
        )}
        {!sidebarCollapsed && <div style={{ margin: sb.dividerMargin, borderTop: '1px solid var(--border)' }} />}
        {sidebarCollapsed && <div style={{ margin: '6px 8px', borderTop: '1px solid var(--border)' }} />}

        {/* Tags */}
        {sidebarCollapsed ? (
          <div
            style={{ ...sidebarItemStyle(selectedSection === 'tags'), justifyContent: 'center' }}
            onClick={() => handleSectionChange('tags')}
            onMouseEnter={e => { if (selectedSection !== 'tags') e.currentTarget.style.background = sb.hoverBackground }}
            onMouseLeave={e => { if (selectedSection !== 'tags') e.currentTarget.style.background = 'transparent' }}
            title={t('library.tags')}
          >
            <Tag size={sb.iconSize} style={{ flexShrink: 0 }} />
          </div>
        ) : (
        <div style={{ padding: sb.tagPadding }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-mute, var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('library.tags')}</div>
            <Settings
              size={13}
              onClick={() => handleSectionChange('tags')}
              aria-label={t('tags.manager')}
              style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
            />
          </div>
          {tagsWithCounts.length > 0 && (
            <input
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              placeholder={t('tags.search')}
              style={{
                width: '100%', fontSize: 11, padding: '3px 6px', marginBottom: 6,
                border: '1px solid var(--border)', borderRadius: 4,
                background: 'var(--surface)', color: 'var(--text)', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(() => {
              const filtered = tagsWithCounts.filter(tag =>
                !tagSearch || tag.name.toLowerCase().includes(tagSearch.toLowerCase())
              )
              const MAX_VISIBLE = 10
              const visible = showAllTags ? filtered : filtered.slice(0, MAX_VISIBLE)
              const remaining = filtered.length - MAX_VISIBLE
              return (
                <>
                  {visible.map((tag) => (
                    <span
                      key={tag.id}
                      onClick={() => { const next = selectedTag === tag.id ? null : tag.id; setSelectedTag(next); if (next) setSelectedSection('tag-results'); else setSelectedSection('home') }}
                      style={{
                        fontSize: 11, padding: '2px 6px', borderRadius: 9999, cursor: 'pointer',
                        background: selectedTag === tag.id ? (tag.color || 'var(--accent)') : 'var(--hover)',
                        color: selectedTag === tag.id ? '#fff' : (tag.color || 'var(--text-muted)'),
                        border: selectedTag === tag.id ? `1px solid ${tag.color || 'var(--accent)'}` : '1px solid transparent',
                        fontWeight: 500,
                      }}
                    >
                      {tag.name.split('/').pop()} ({tag.count})
                    </span>
                  ))}
                  {!showAllTags && remaining > 0 && (
                    <span
                      onClick={() => setShowAllTags(true)}
                      style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px' }}
                    >
                      {t('tags.more', remaining)}
                    </span>
                  )}
                  {showAllTags && filtered.length > MAX_VISIBLE && (
                    <span
                      onClick={() => setShowAllTags(false)}
                      style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px' }}
                    >
                      ▲
                    </span>
                  )}
                </>
              )
            })()}
            {tagsWithCounts.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('library.noTags')}</span>}
          </div>
        </div>
        )}

      </div>

      {/* Switch library */}
      {onSwitchLibrary && (
        <div style={{ padding: sidebarCollapsed ? '8px 4px' : '8px 12px', borderTop: '1px solid var(--border)' }}>
          <div
            onClick={onSwitchLibrary}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              gap: 8, padding: sidebarCollapsed ? '6px' : '6px 12px',
              fontSize: 12, color: 'var(--text-muted)',
              cursor: 'pointer', borderRadius: 'var(--radius-sm)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title={sidebarCollapsed ? t('library.switchLibrary') : undefined}
          >
            <ArrowLeftRight size={13} />
            {!sidebarCollapsed && t('library.switchLibrary')}
          </div>
        </div>
      )}
    </div>
  )
}
