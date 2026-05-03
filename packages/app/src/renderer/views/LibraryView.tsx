import React, { useEffect, useState, useCallback, useMemo } from 'react'
import SyncConfigPanel from '../components/sync/SyncConfigPanel.js'
import TemplatePicker from '../components/notes/TemplatePicker.js'
import { useI18n } from '../i18n/index.js'
import type { Locale } from '../i18n/index.js'

interface Document {
  id: string
  title: string
  type: string
  path: string
  authors: string[]
  hash: string
  createdAt: string
  updatedAt: string
}

interface Tag {
  id: string
  name: string
  color: string
}

interface Props {
  rootPath: string
  libraryName: string
  onOpenDoc: (doc: Document) => void
  onOpenNote: (note: any) => void
  onOpenMindmap: (mindmap: any) => void
  onOpenGraph: () => void
}

type SidebarSection = 'documents' | 'notes' | 'graph' | 'sync' | 'plugins' | 'settings'

interface DirNode {
  name: string
  path: string
  children: DirNode[]
}

function buildDirTree(docs: Document[]): DirNode[] {
  const root: Record<string, any> = {}
  for (const doc of docs) {
    const parts = doc.path.split('/')
    if (parts.length <= 1) continue
    let current = root
    let pathSoFar = ''
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      pathSoFar = pathSoFar ? pathSoFar + '/' + part : part
      if (!current[part]) current[part] = { __path: pathSoFar }
      current = current[part]
    }
  }

  function toNodes(obj: Record<string, any>): DirNode[] {
    return Object.keys(obj)
      .filter(k => k !== '__path')
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .map(k => ({
        name: k,
        path: obj[k].__path,
        children: toNodes(obj[k]),
      }))
  }
  return toNodes(root)
}

const TYPE_COLOR = 'var(--text-muted)'

function formatDate(dateStr: string, locale: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
  } catch { return dateStr }
}

function DirTreeItem({ node, selectedDir, onSelect, expandedDirs, onToggle, onContextMenu, depth, icon }: {
  node: DirNode
  selectedDir: string | null
  onSelect: (path: string | null) => void
  expandedDirs: Set<string>
  onToggle: (path: string) => void
  onContextMenu?: (e: React.MouseEvent, path: string) => void
  depth: number
  icon?: string
}) {
  const isExpanded = expandedDirs.has(node.path)
  const isSelected = selectedDir === node.path
  const hasChildren = node.children.length > 0

  return (
    <>
      <div
        onClick={() => {
          onSelect(isSelected ? null : node.path)
          if (hasChildren && !isExpanded) onToggle(node.path)
        }}
        onContextMenu={(e) => {
          onSelect(node.path)
          onContextMenu?.(e, node.path)
        }}
        style={{
          height: 26,
          paddingLeft: 8 + depth * 16,
          paddingRight: 8,
          fontSize: 13,
          cursor: 'pointer',
          background: isSelected ? 'var(--selected)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
        }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--hover)' }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <span
          onClick={(e) => { if (hasChildren) { e.stopPropagation(); onToggle(node.path) } }}
          style={{ width: 14, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, opacity: hasChildren ? 1 : 0 }}
        >
          {isExpanded ? '▼' : '▶'}
        </span>
        {icon && <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{icon}</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 500 : 400 }}>
          {node.name}
        </span>
      </div>
      {isExpanded && node.children.map(child => (
        <DirTreeItem
          key={child.path}
          node={child}
          selectedDir={selectedDir}
          onSelect={onSelect}
          expandedDirs={expandedDirs}
          onToggle={onToggle}
          onContextMenu={onContextMenu}
          depth={depth + 1}
          icon={icon}
        />
      ))}
    </>
  )
}

export default function LibraryView({ rootPath, libraryName, onOpenDoc, onOpenNote, onOpenMindmap, onOpenGraph }: Props) {
  const { t, locale, setLocale } = useI18n()
  const [documents, setDocuments] = useState<Document[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [plugins, setPlugins] = useState<any[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedSection, setSelectedSection] = useState<SidebarSection>('documents')
  const [selectedDir, setSelectedDir] = useState<string | null>(null)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedItemDetail, setSelectedItemDetail] = useState<any>(null)
  const [selectedItemTags, setSelectedItemTags] = useState<Tag[]>([])
  const [docStatuses, setDocStatuses] = useState<Record<string, string>>({})
  const [showSync, setShowSync] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [showNotePicker, setShowNotePicker] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: string; dirPath?: string; noteId?: string; noteTitle?: string } | null>(null)
  const [showFolderInput, setShowFolderInput] = useState(false)
  const [folderInputValue, setFolderInputValue] = useState('')
  const [showRenameInput, setShowRenameInput] = useState(false)
  const [renameInputValue, setRenameInputValue] = useState('')
  const [renameTarget, setRenameTarget] = useState<{ type: 'dir' | 'note'; dirPath?: string; noteId?: string } | null>(null)
  const [noteDirs, setNoteDirs] = useState<string[]>([])
  const [selectedNoteDir, setSelectedNoteDir] = useState<string | null>(null)
  const [expandedNoteDirs, setExpandedNoteDirs] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  const dirTree = useMemo(() => buildDirTree(documents), [documents])

  const noteDirTree = useMemo(() => {
    const root: Record<string, any> = {}
    for (const dir of noteDirs) {
      const parts = dir.split('/')
      let current = root
      let pathSoFar = ''
      for (const part of parts) {
        pathSoFar = pathSoFar ? pathSoFar + '/' + part : part
        if (!current[part]) current[part] = { __path: pathSoFar }
        current = current[part]
      }
    }
    function toNodes(obj: Record<string, any>): DirNode[] {
      return Object.keys(obj)
        .filter(k => k !== '__path')
        .sort((a, b) => a.localeCompare(b, 'zh-CN'))
        .map(k => ({ name: k, path: obj[k].__path, children: toNodes(obj[k]) }))
    }
    return toNodes(root)
  }, [noteDirs])

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const loadDocStatuses = async (docs: Document[]) => {
    const statuses: Record<string, string> = {}
    for (const doc of docs) {
      try { statuses[doc.id] = await window.electronAPI.sync.getDocStatus(doc.id) }
      catch { statuses[doc.id] = 'local' }
    }
    setDocStatuses(statuses)
  }

  const loadDocuments = async () => {
    const docs = await window.electronAPI.documents.list()
    setDocuments(docs)
    loadDocStatuses(docs)
  }

  const loadNotes = async () => {
    const list = await window.electronAPI.notes.list()
    setNotes(list)
  }

  const loadTags = async () => {
    try { const list = await window.electronAPI.tags.list(); setTags(list) }
    catch { setTags([]) }
  }

  const loadNoteDirs = async () => {
    try { const dirs = await window.electronAPI.notes.listDirs(); setNoteDirs(dirs) }
    catch { setNoteDirs([]) }
  }

  const loadPlugins = async () => {
    const list = await window.electronAPI.plugins.list()
    setPlugins(list)
  }

  useEffect(() => { loadDocuments(); loadNotes(); loadTags(); loadNoteDirs() }, [])

  useEffect(() => {
    const refresh = () => { loadNotes(); loadNoteDirs() }
    document.addEventListener('notes-changed', refresh)
    return () => document.removeEventListener('notes-changed', refresh)
  }, [])

  const handleImport = async () => {
    const result = await window.electronAPI.documents.import()
    if (result) await loadDocuments()
  }

  const handleCreateNote = () => {
    setContextMenu(null)
    setShowNotePicker(true)
  }

  const handleCreateFolder = () => {
    setContextMenu(null)
    setFolderInputValue('')
    setShowFolderInput(true)
  }

  const handleFolderInputConfirm = async () => {
    const name = folderInputValue.trim()
    setShowFolderInput(false)
    if (!name) return
    const dirPath = selectedNoteDir ? `${selectedNoteDir}/${name}` : name
    await window.electronAPI.notes.createDir(dirPath)
    await loadNoteDirs()
  }

  const handleRenameDir = () => {
    if (!contextMenu?.dirPath) return
    const dirName = contextMenu.dirPath.split('/').pop() || ''
    setRenameTarget({ type: 'dir', dirPath: contextMenu.dirPath })
    setRenameInputValue(dirName)
    setContextMenu(null)
    setShowRenameInput(true)
  }

  const handleRenameNote = () => {
    if (!contextMenu?.noteId) return
    setRenameTarget({ type: 'note', noteId: contextMenu.noteId })
    setRenameInputValue(contextMenu.noteTitle || '')
    setContextMenu(null)
    setShowRenameInput(true)
  }

  const handleRenameConfirm = async () => {
    const name = renameInputValue.trim()
    setShowRenameInput(false)
    if (!name || !renameTarget) return
    if (renameTarget.type === 'dir' && renameTarget.dirPath) {
      const parts = renameTarget.dirPath.split('/')
      parts[parts.length - 1] = name
      const newPath = parts.join('/')
      if (newPath !== renameTarget.dirPath) {
        await window.electronAPI.notes.renameDir(renameTarget.dirPath, newPath)
        await loadNoteDirs()
        await loadNotes()
      }
    } else if (renameTarget.type === 'note' && renameTarget.noteId) {
      await window.electronAPI.notes.update(renameTarget.noteId, { title: name })
      await loadNotes()
    }
    setRenameTarget(null)
  }

  const handleNoteTemplateSelect = async (templateId: string | null, title: string) => {
    setShowNotePicker(false)
    const note = await window.electronAPI.notes.create({
      title,
      folder: selectedNoteDir ?? undefined,
      templateId: templateId ?? undefined,
    })
    await loadNotes()
    onOpenNote(note)
  }

  const handleSidebarContextMenu = (e: React.MouseEvent, type: string, dirPath?: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, type, dirPath })
  }

  const handleNoteItemContextMenu = (e: React.MouseEvent, noteId: string, noteTitle: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'noteItem', noteId, noteTitle })
  }

  const handleCreateMindmapNote = async () => {
    const title = t('library.untitledMindmap')
    const map = await window.electronAPI.notes.create({
      title,
      type: 'mindmap',
      folder: selectedNoteDir ?? undefined,
    })
    await loadNotes()
    await loadNoteDirs()
    onOpenMindmap(map)
  }

  const handleCreateHandwritingNote = async () => {
    const title = t('library.untitledHandwriting')
    const note = await window.electronAPI.notes.create({
      title,
      type: 'handwriting',
      folder: selectedNoteDir ?? undefined,
    })
    await loadNotes()
    await loadNoteDirs()
    onOpenNote(note)
  }

  const handleDelete = async (id: string) => {
    if (selectedSection === 'documents') {
      await window.electronAPI.documents.delete(id)
      await loadDocuments()
    } else if (selectedSection === 'notes') {
      await window.electronAPI.notes.delete(id)
      await loadNotes()
    }
    if (selectedItemId === id) {
      setSelectedItemId(null)
      setSelectedItemDetail(null)
      setSelectedItemTags([])
    }
  }

  const handleDownload = async (docId: string) => {
    try { await window.electronAPI.sync.stubDownload(docId); await loadDocuments() }
    catch (err: any) { alert(`${t('detail.downloadFailed')}: ${err.message}`) }
  }

  const handleUpload = async (docId: string) => {
    try { await window.electronAPI.sync.stubUpload(docId); await loadDocuments() }
    catch (err: any) { alert(`${t('detail.uploadFailed')}: ${err.message}`) }
  }

  const handleSelectItem = useCallback(async (id: string, type: 'document' | 'note') => {
    setSelectedItemId(id)
    if (type === 'document') {
      try {
        const detail = await window.electronAPI.documents.get(id)
        setSelectedItemDetail(detail)
        const itemTags = await window.electronAPI.tags.forTarget(id, 'document')
        setSelectedItemTags(itemTags)
      } catch { setSelectedItemDetail(null); setSelectedItemTags([]) }
    } else {
      setSelectedItemDetail(null)
      setSelectedItemTags([])
    }
  }, [])

  const handleSectionChange = (section: SidebarSection) => {
    if (section === 'sync') { setShowSync(true); return }
    if (section === 'plugins') loadPlugins()
    if (section === 'graph') { onOpenGraph(); return }
    setSelectedSection(section)
    setSelectedDir(null)
    setSelectedNoteDir(null)
    setSelectedItemId(null)
    setSelectedItemDetail(null)
    setSelectedItemTags([])
    setShowSync(false)
  }

  const getDisplayItems = () => {
    let items: any[] = []
    if (selectedSection === 'documents') {
      items = documents
      if (selectedDir) {
        const prefix = selectedDir + '/'
        items = items.filter((doc: Document) => doc.path.startsWith(prefix))
      }
    } else if (selectedSection === 'notes') {
      items = notes
      if (selectedNoteDir) {
        const prefix = selectedNoteDir + '/'
        items = items.filter((n: any) => n.path && n.path.startsWith(prefix))
      }
    } else if (selectedSection === 'plugins') items = plugins

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter((item: any) => (item.title || item.name || '').toLowerCase().includes(q))
    }
    return items
  }

  const displayItems = getDisplayItems()

  const sidebarStyle: React.CSSProperties = {
    width: 220, minWidth: 220, background: 'var(--surface)',
    borderRight: '1px solid var(--border)', display: 'flex',
    flexDirection: 'column', overflow: 'hidden', userSelect: 'none',
  }

  const sidebarItemStyle = (active: boolean): React.CSSProperties => ({
    height: 26, display: 'flex', alignItems: 'center', gap: 6,
    padding: '0 12px', fontSize: 13, cursor: 'pointer',
    fontWeight: active ? 500 : 400, color: 'var(--text)',
    background: active ? 'var(--selected)' : 'transparent',
  })

  const ctxItemStyle: React.CSSProperties = {
    padding: '6px 14px', fontSize: 13, cursor: 'pointer',
  }

  const centerStyle: React.CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0,
  }

  const toolbarStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 12px', borderBottom: '1px solid var(--border)', gap: 8, flexShrink: 0,
  }

  const detailPanelStyle: React.CSSProperties = {
    width: 280, minWidth: 280, borderLeft: '1px solid var(--border)',
    background: 'var(--surface)', overflow: 'auto', padding: '16px', flexShrink: 0,
  }

  if (showSync) {
    return (
      <div style={{ display: 'flex', height: '100vh' }}>
        <div style={sidebarStyle}>
          <div style={{ padding: '12px 12px 8px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 1 }}>{libraryName}</div>
          </div>
          <div style={{ paddingTop: 4 }}>
            <div style={sidebarItemStyle(false)} onClick={() => handleSectionChange('documents')}>
              <span style={{ width: 14, flexShrink: 0 }} /><span style={{ fontSize: 15, lineHeight: 1 }}>📄</span>{t('library.documents')}
            </div>
            <div style={sidebarItemStyle(false)} onClick={() => handleSectionChange('notes')}>
              <span style={{ width: 14, flexShrink: 0 }} /><span style={{ fontSize: 15, lineHeight: 1 }}>📝</span>{t('library.notes')}
            </div>
          </div>
        </div>
        <SyncConfigPanel onClose={() => { setShowSync(false); loadDocuments() }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left Sidebar */}
      <div style={sidebarStyle}>
        <div style={{ padding: '12px 12px 8px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 1 }}>{t('app.name')}</div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', paddingTop: 4 }}>
          {/* Documents */}
          <div
            style={sidebarItemStyle(selectedSection === 'documents' && selectedDir === null)}
            onClick={() => handleSectionChange('documents')}
            onMouseEnter={e => { if (!(selectedSection === 'documents' && selectedDir === null)) e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (!(selectedSection === 'documents' && selectedDir === null)) e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 14, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
              {selectedSection === 'documents' && dirTree.length > 0 ? '▼' : dirTree.length > 0 ? '▶' : ''}
            </span>
            <span style={{ fontSize: 15, lineHeight: 1 }}>📄</span>
            {t('library.documents')}
          </div>

          {selectedSection === 'documents' && dirTree.length > 0 && (
            <div>
              {dirTree.map(node => (
                <DirTreeItem
                  key={node.path} node={node} selectedDir={selectedDir}
                  onSelect={(p) => { setSelectedDir(p); setSelectedItemId(null); setSelectedItemDetail(null) }}
                  expandedDirs={expandedDirs} onToggle={toggleDir} depth={1} icon="📁"
                />
              ))}
            </div>
          )}

          {/* Notes */}
          <div
            style={sidebarItemStyle(selectedSection === 'notes' && selectedNoteDir === null)}
            onClick={() => handleSectionChange('notes')}
            onContextMenu={(e) => handleSidebarContextMenu(e, 'notes')}
            onMouseEnter={e => { if (!(selectedSection === 'notes' && selectedNoteDir === null)) e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (!(selectedSection === 'notes' && selectedNoteDir === null)) e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 14, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
              {selectedSection === 'notes' && noteDirTree.length > 0 ? '▼' : noteDirTree.length > 0 ? '▶' : ''}
            </span>
            <span style={{ fontSize: 15, lineHeight: 1 }}>📝</span>
            {t('library.notes')}
          </div>

          {selectedSection === 'notes' && noteDirTree.length > 0 && (
            <div>
              {noteDirTree.map(node => (
                <DirTreeItem
                  key={node.path} node={node} selectedDir={selectedNoteDir}
                  onSelect={(p) => { setSelectedNoteDir(p); setSelectedItemId(null); setSelectedItemDetail(null) }}
                  expandedDirs={expandedNoteDirs}
                  onToggle={(path) => setExpandedNoteDirs(prev => {
                    const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next
                  })}
                  onContextMenu={(e, path) => handleSidebarContextMenu(e, 'noteDir', path)}
                  depth={1} icon="📁"
                />
              ))}
            </div>
          )}

          {/* Graph */}
          <div
            style={sidebarItemStyle(false)}
            onClick={() => handleSectionChange('graph')}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 14, flexShrink: 0 }} />
            <span style={{ fontSize: 15, lineHeight: 1 }}>🔗</span>
            {t('library.graph')}
          </div>

          <div style={{ margin: '6px 12px', borderTop: '1px solid var(--border)' }} />

          {/* Utilities */}
          <div
            style={sidebarItemStyle(false)}
            onClick={() => handleSectionChange('sync')}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 14, flexShrink: 0 }} />
            <span style={{ fontSize: 15, lineHeight: 1 }}>☁️</span>
            {t('library.sync')}
          </div>
          <div
            style={sidebarItemStyle(selectedSection === 'plugins')}
            onClick={() => handleSectionChange('plugins')}
            onMouseEnter={e => { if (selectedSection !== 'plugins') e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (selectedSection !== 'plugins') e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 14, flexShrink: 0 }} />
            <span style={{ fontSize: 15, lineHeight: 1 }}>🧩</span>
            {t('library.plugins')}{plugins.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({plugins.length})</span>}
          </div>
          <div
            style={sidebarItemStyle(selectedSection === 'settings')}
            onClick={() => handleSectionChange('settings')}
            onMouseEnter={e => { if (selectedSection !== 'settings') e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (selectedSection !== 'settings') e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 14, flexShrink: 0 }} />
            <span style={{ fontSize: 15, lineHeight: 1 }}>⚙️</span>
            {t('settings.title')}
          </div>
          <div
            style={sidebarItemStyle(false)}
            onClick={() => window.electronAPI.library.openNewWindow()}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 14, flexShrink: 0 }} />
            <span style={{ fontSize: 15, lineHeight: 1 }}>➕</span>
            {t('library.openAnother')}
          </div>

          <div style={{ margin: '6px 12px', borderTop: '1px solid var(--border)' }} />

          {/* Tags */}
          <div style={{ padding: '4px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('library.tags')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  onClick={() => setSelectedTag(selectedTag === tag.id ? null : tag.id)}
                  style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                    background: selectedTag === tag.id ? 'var(--selected)' : 'var(--hover)',
                    color: tag.color || 'var(--text-muted)',
                    border: selectedTag === tag.id ? '1px solid var(--accent)' : '1px solid transparent',
                  }}
                >
                  {tag.name}
                </span>
              ))}
              {tags.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('library.noTags')}</span>}
            </div>
          </div>

          {selectedSection === 'plugins' && (
            <div style={{ padding: '4px 12px 12px', borderTop: '1px solid var(--border)', marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{t('library.plugins')}</div>
              {plugins.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('library.noPlugins')}</div>}
              {plugins.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12 }}>
                  <span>{p.name} <span style={{ color: 'var(--text-muted)' }}>v{p.version}</span></span>
                  <span onClick={async () => { await window.electronAPI.plugins.unload(p.id); setPlugins(ps => ps.filter(x => x.id !== p.id)) }}
                    style={{ fontSize: 11, cursor: 'pointer', color: '#c44040' }}>{t('common.unload')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center Panel */}
      <div style={centerStyle}>
        {selectedSection === 'settings' ? (
          <div style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, marginBottom: 16 }}>{t('settings.title')}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
              <span>{t('settings.language')}</span>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
                style={{ fontSize: 13, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        ) : (
          <>
            <div style={toolbarStyle}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {selectedSection === 'documents' && (
                  <button onClick={handleImport} style={{ fontSize: 12, padding: '4px 10px' }}>{t('common.import')}</button>
                )}
                {selectedSection === 'notes' && (
                  <>
                    <button onClick={handleCreateNote} style={{ fontSize: 12, padding: '4px 10px' }}>{t('library.newNote')}</button>
                    <button onClick={handleCreateMindmapNote} style={{ fontSize: 12, padding: '4px 10px' }}>{t('library.newMindmap')}</button>
                    <button onClick={handleCreateHandwritingNote} style={{ fontSize: 12, padding: '4px 10px' }}>{t('library.newHandwriting')}</button>
                  </>
                )}
                {selectedSection === 'documents' && selectedDir && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedDir}</span>
                )}
              </div>
              <input
                type="text" placeholder={t('common.search')}
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 180, fontSize: 12, padding: '4px 8px' }}
              />
            </div>

            {/* Table header */}
            <div style={{
              display: 'flex', padding: '0 12px', borderBottom: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.5, flexShrink: 0,
            }}>
              <div style={{ flex: 1, padding: '6px 4px' }}>{t('library.colTitle')}</div>
              {selectedSection === 'documents' && <div style={{ width: 70, padding: '6px 4px', textAlign: 'center' }}>{t('library.colType')}</div>}
              <div style={{ width: 100, padding: '6px 4px', textAlign: 'right' }}>{t('library.colCreatedAt')}</div>
            </div>

            {/* Table rows */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {displayItems.length === 0 && (
                <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                  {selectedSection === 'documents' && (selectedDir ? t('library.emptyDir') : t('library.emptyDocuments'))}
                  {selectedSection === 'notes' && t('library.emptyNotes')}
                  {selectedSection === 'plugins' && t('library.noPlugins')}
                </div>
              )}
              {displayItems.map((item: any, idx: number) => {
                const isSelected = selectedItemId === item.id
                return (
                  <div
                    key={item.id}
                    className={`table-row ${isSelected ? 'table-row-selected' : ''}`}
                    style={{
                      display: 'flex', padding: '0 12px', height: 32, alignItems: 'center',
                      cursor: 'pointer', fontSize: 13,
                      background: isSelected ? 'var(--selected)' : idx % 2 === 0 ? 'transparent' : 'var(--surface)',
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
                    }}
                  >
                    <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {selectedSection === 'notes' && (
                        <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{item.type === 'mindmap' ? '🧠' : item.type === 'handwriting' ? '✏️' : '📝'}</span>
                      )}
                      {item.title || item.name}
                    </div>
                    {selectedSection === 'documents' && (
                      <div style={{ width: 70, textAlign: 'center', padding: '0 4px' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, color: TYPE_COLOR, letterSpacing: 0.5 }}>
                          {item.type}
                        </span>
                      </div>
                    )}
                    <div style={{ width: 100, textAlign: 'right', padding: '0 4px', fontSize: 12, color: 'var(--text-muted)' }}>
                      {formatDate(item.createdAt, locale)}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Right Detail Panel */}
      {selectedItemId && selectedSection === 'documents' && selectedItemDetail && (
        <div style={detailPanelStyle}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{t('detail.title')}</div>
          <DetailField label={t('detail.docTitle')} value={selectedItemDetail.title} />
          <DetailField label={t('detail.type')} value={
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: TYPE_COLOR }}>{selectedItemDetail.type}</span>
          } />
          <DetailField label={t('detail.path')} value={<span style={{ fontSize: 11, wordBreak: 'break-all' }}>{selectedItemDetail.path}</span>} />
          {selectedItemDetail.hash && (
            <DetailField label={t('detail.hash')} value={<span style={{ fontSize: 11, fontFamily: 'monospace' }}>{selectedItemDetail.hash.substring(0, 16)}...</span>} />
          )}
          {selectedItemDetail.authors && selectedItemDetail.authors.length > 0 && (
            <DetailField label={t('detail.authors')} value={selectedItemDetail.authors.join(', ')} />
          )}
          <DetailField label={t('detail.createdAt')} value={formatDate(selectedItemDetail.createdAt, locale)} />
          <DetailField label={t('detail.updatedAt')} value={formatDate(selectedItemDetail.updatedAt, locale)} />
          <DetailField label={t('detail.syncStatus')} value={
            <span style={{ fontSize: 11, color: docStatuses[selectedItemId] === 'synced' ? '#4a8c4a' : docStatuses[selectedItemId] === 'cloud' ? 'var(--accent)' : 'var(--text-muted)' }}>
              {docStatuses[selectedItemId] === 'synced' ? t('detail.synced') : docStatuses[selectedItemId] === 'cloud' ? t('detail.cloud') : t('detail.local')}
            </span>
          } />
          {selectedItemTags.length > 0 && (
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('library.tags')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedItemTags.map((tag) => (
                  <span key={tag.id} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: 'var(--hover)', color: tag.color || 'var(--text-muted)' }}>{tag.name}</span>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docStatuses[selectedItemId] === 'cloud' && (
              <button onClick={() => handleDownload(selectedItemId)} style={{ fontSize: 12, padding: '4px 10px', width: '100%' }}>{t('detail.download')}</button>
            )}
            {docStatuses[selectedItemId] === 'local' && (
              <button onClick={() => handleUpload(selectedItemId)} style={{ fontSize: 12, padding: '4px 10px', width: '100%' }}>{t('detail.upload')}</button>
            )}
            <button onClick={() => handleDelete(selectedItemId)} style={{ fontSize: 12, padding: '4px 10px', width: '100%', color: '#c44040', borderColor: '#c44040' }}>{t('common.delete')}</button>
          </div>
        </div>
      )}

      {selectedItemId && selectedSection !== 'documents' && selectedSection !== 'plugins' && selectedSection !== 'settings' && (
        <div style={detailPanelStyle}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{t('detail.title')}</div>
          {(() => {
            const item = notes.find((i: any) => i.id === selectedItemId)
            if (!item) return null
            return (
              <>
                <DetailField label={t('detail.docTitle')} value={item.title} />
                <DetailField label={t('detail.createdAt')} value={formatDate(item.createdAt, locale)} />
                <div style={{ marginTop: 16 }}>
                  <button onClick={() => handleDelete(selectedItemId)} style={{ fontSize: 12, padding: '4px 10px', width: '100%', color: '#c44040', borderColor: '#c44040' }}>{t('common.delete')}</button>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {showNotePicker && (
        <TemplatePicker onSelect={handleNoteTemplateSelect} onClose={() => setShowNotePicker(false)} />
      )}

      {showFolderInput && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowFolderInput(false)}>
          <div style={{
            background: 'var(--surface, #fff)', borderRadius: 10, padding: 24, width: 340,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{t('library.newFolder')}</h3>
            <input
              autoFocus
              type="text"
              placeholder={t('library.newFolder')}
              value={folderInputValue}
              onChange={e => setFolderInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleFolderInputConfirm() }}
              style={{
                width: '100%', fontSize: 14, padding: '8px 12px',
                border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box',
                background: 'var(--bg, #fff)', color: 'var(--text, #000)',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowFolderInput(false)} style={{ fontSize: 13, padding: '6px 16px' }}>{t('common.cancel')}</button>
              <button
                onClick={handleFolderInputConfirm}
                disabled={!folderInputValue.trim()}
                style={{
                  fontSize: 13, padding: '6px 16px',
                  background: folderInputValue.trim() ? 'var(--accent, #5e81ac)' : '#ccc',
                  color: '#fff', border: 'none', borderRadius: 6, cursor: folderInputValue.trim() ? 'pointer' : 'default',
                }}
              >{t('welcome.create')}</button>
            </div>
          </div>
        </div>
      )}

      {showRenameInput && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowRenameInput(false)}>
          <div style={{
            background: 'var(--surface, #fff)', borderRadius: 10, padding: 24, width: 340,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{t('library.rename')}</h3>
            <input
              autoFocus
              type="text"
              value={renameInputValue}
              onChange={e => setRenameInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameConfirm() }}
              style={{
                width: '100%', fontSize: 14, padding: '8px 12px',
                border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box',
                background: 'var(--bg, #fff)', color: 'var(--text, #000)',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRenameInput(false)} style={{ fontSize: 13, padding: '6px 16px' }}>{t('common.cancel')}</button>
              <button
                onClick={handleRenameConfirm}
                disabled={!renameInputValue.trim()}
                style={{
                  fontSize: 13, padding: '6px 16px',
                  background: renameInputValue.trim() ? 'var(--accent, #5e81ac)' : '#ccc',
                  color: '#fff', border: 'none', borderRadius: 6, cursor: renameInputValue.trim() ? 'pointer' : 'default',
                }}
              >{t('common.confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div style={{
          position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 2000,
          background: 'var(--surface, #fff)', border: '1px solid var(--border)',
          borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          padding: '4px 0', minWidth: 160,
        }}>
          {(contextMenu.type === 'notes' || contextMenu.type === 'noteDir') && (
            <>
              <div onClick={handleCreateNote} style={ctxItemStyle}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{t('library.newNote')}</div>
              <div onClick={() => { setContextMenu(null); handleCreateMindmapNote() }} style={ctxItemStyle}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{t('library.newMindmap')}</div>
              <div onClick={() => { setContextMenu(null); handleCreateHandwritingNote() }} style={ctxItemStyle}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{t('library.newHandwriting')}</div>
              <div onClick={handleCreateFolder} style={ctxItemStyle}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{t('library.newFolder')}</div>
              {contextMenu.type === 'noteDir' && contextMenu.dirPath && (
                <div onClick={handleRenameDir} style={ctxItemStyle}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >{t('library.rename')}</div>
              )}
            </>
          )}
          {contextMenu.type === 'noteItem' && (
            <>
              <div onClick={handleRenameNote} style={ctxItemStyle}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{t('library.rename')}</div>
              <div onClick={() => { if (contextMenu.noteId) { handleDelete(contextMenu.noteId); setContextMenu(null) } }} style={{ ...ctxItemStyle, color: '#c44040' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{t('common.delete')}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  )
}
