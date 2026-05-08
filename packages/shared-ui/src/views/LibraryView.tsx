import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { ChevronDown, ChevronRight, FilePlus, Download, Upload, Trash2, FolderPlus, Check, Pencil, LibraryBig, PenLine, Cloud, Puzzle, Settings, Folder, Tag } from 'lucide-react'
import type { NoteType } from '../components/notes/TemplatePicker.js'
import SyncConfigPanel from '../components/sync/SyncConfigPanel.js'
import TemplatePicker from '../components/notes/TemplatePicker.js'
import TagInput from '../components/tags/TagInput.js'
import TagPill from '../components/tags/TagPill.js'
import { useResizable, ResizeHandle } from '../components/ResizeHandle.js'
import { useI18n } from '../i18n/index.js'
import type { Locale } from '../i18n/index.js'
import { useBanjuanAPI } from '../api.js'

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
  color: string | null
}

interface Props {
  rootPath: string
  libraryName: string
  onOpenDoc: (doc: Document) => void
  onOpenNote: (note: any) => void
  onOpenMindmap: (mindmap: any) => void
  onOpenGraph?: () => void
  onOpenTagManager?: () => void
  onOpenPluginView?: (pluginId: string, viewType: string) => void
}

type SidebarSection = 'documents' | 'notes' | 'sync' | 'plugins' | 'settings'

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

const TYPE_PILLS: Record<string, { bg: string; color: string; label: string }> = {
  markdown:    { bg: '#e8eff8', color: '#4a7ab5', label: 'Note' },
  mindmap:     { bg: '#eeebf6', color: '#7b6ba8', label: 'Mind' },
  handwriting: { bg: '#f4ede4', color: '#a07842', label: 'Hand' },
  pdf:         { bg: '#f0e8e4', color: '#a06b4a', label: 'PDF' },
  epub:        { bg: '#e6f2ec', color: '#3d8a66', label: 'EPUB' },
  txt:         { bg: '#edeef0', color: '#737a84', label: 'TXT' },
  md:          { bg: '#eaeaf5', color: '#5d5da0', label: 'MD' },
  image:       { bg: '#f3efe3', color: '#9a8035', label: 'IMG' },
  video:       { bg: '#f3e8ef', color: '#a35882', label: 'Video' },
  html:        { bg: '#e4f0f1', color: '#3a7f86', label: 'HTML' },
  other:       { bg: '#edeef0', color: '#737a84', label: 'Other' },
}

function formatDate(dateStr: string, locale: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
  } catch { return dateStr }
}

function DirTreeItem({ node, selectedDir, onSelect, expandedDirs, onToggle, onContextMenu, depth, icon, textColor }: {
  node: DirNode
  selectedDir: string | null
  onSelect: (path: string | null) => void
  expandedDirs: Set<string>
  onToggle: (path: string) => void
  onContextMenu?: (e: React.MouseEvent, path: string) => void
  depth: number
  icon?: React.ReactNode
  textColor?: string
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
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        {icon && <span style={{ flexShrink: 0, lineHeight: 1, display: 'inline-flex', color: 'var(--text-muted)' }}>{icon}</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 400, color: textColor }}>
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
          textColor={textColor}
        />
      ))}
    </>
  )
}

export default function LibraryView({ rootPath, libraryName, onOpenDoc, onOpenNote, onOpenMindmap, onOpenTagManager, onOpenPluginView }: Props) {
  const api = useBanjuanAPI()
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
  const [docSectionExpanded, setDocSectionExpanded] = useState(true)
  const [noteSectionExpanded, setNoteSectionExpanded] = useState(true)
  const [tagsWithCounts, setTagsWithCounts] = useState<Array<{ id: string; name: string; color: string | null; count: number }>>([])
  const [tagSearch, setTagSearch] = useState('')
  const [showAllTags, setShowAllTags] = useState(false)
  const [tagFilteredItems, setTagFilteredItems] = useState<any[] | null>(null)
  const [pluginViews, setPluginViews] = useState<Array<{ viewType: string; pluginId: string; displayText: string; icon?: string; singleton?: boolean }>>([])
  const leftResize = useResizable(220, 160, 400, 'left')
  const rightResize = useResizable(280, 200, 500, 'right')

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
      try { statuses[doc.id] = await api.sync.getDocStatus(doc.id) }
      catch { statuses[doc.id] = 'local' }
    }
    setDocStatuses(statuses)
  }

  const loadDocuments = async () => {
    const docs = await api.documents.list()
    setDocuments(docs)
    loadDocStatuses(docs)
  }

  const loadNotes = async () => {
    const list = await api.notes.list()
    setNotes(list)
  }

  const loadTags = async () => {
    try {
      const list = await api.tags.listWithCounts()
      setTagsWithCounts(list)
      setTags(list)
    } catch { setTagsWithCounts([]); setTags([]) }
  }

  const loadNoteDirs = async () => {
    try { const dirs = await api.notes.listDirs(); setNoteDirs(dirs) }
    catch { setNoteDirs([]) }
  }

  const loadPlugins = async () => {
    const list = await api.plugins!.listAll()
    setPlugins(list)
    try {
      const views = await api.plugins!.getViews()
      setPluginViews(views)
    } catch { setPluginViews([]) }
  }

  useEffect(() => { loadDocuments(); loadNotes(); loadTags(); loadNoteDirs() }, [])

  useEffect(() => {
    const refresh = () => { loadNotes(); loadNoteDirs() }
    document.addEventListener('notes-changed', refresh)
    return () => document.removeEventListener('notes-changed', refresh)
  }, [])

  useEffect(() => {
    document.addEventListener('tags-changed', loadTags)
    return () => document.removeEventListener('tags-changed', loadTags)
  }, [])

  useEffect(() => {
    if (!selectedTag) {
      setTagFilteredItems(null)
      return
    }
    const tagName = tagsWithCounts.find(t => t.id === selectedTag)?.name
    if (!tagName) { setTagFilteredItems(null); return }
    const load = async () => {
      const [docs, noteList] = await Promise.all([
        api.documents.list({ tag: tagName }),
        api.notes.list({ tag: tagName }),
      ])
      setTagFilteredItems([...docs, ...noteList])
    }
    load()
  }, [selectedTag, tagsWithCounts])

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
    await api.notes.createDir(dirPath)
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
        await api.notes.renameDir(renameTarget.dirPath, newPath)
        await loadNoteDirs()
        await loadNotes()
      }
    } else if (renameTarget.type === 'note' && renameTarget.noteId) {
      await api.notes.update(renameTarget.noteId, { title: name })
      await loadNotes()
    }
    setRenameTarget(null)
  }

  const [notePickerError, setNotePickerError] = useState<string | null>(null)

  const handleNoteTemplateSelect = async (templateId: string | null, title: string, type: NoteType) => {
    try {
      const note = await api.notes.create({
        title,
        folder: selectedNoteDir ?? undefined,
        ...(type !== 'markdown' ? { type } : { templateId: templateId ?? undefined }),
      })
      setNotePickerError(null)
      setShowNotePicker(false)
      await loadNotes()
      await loadNoteDirs()
      if (type === 'mindmap') onOpenMindmap(note)
      else onOpenNote(note)
    } catch (err: any) {
      if (err?.message?.includes('DUPLICATE_TITLE')) {
        setNotePickerError(t('note.duplicateTitle' as any))
      } else {
        throw err
      }
    }
  }

  const handleSidebarContextMenu = (e: React.MouseEvent, type: string, dirPath?: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, type, dirPath })
  }

  const handleNoteItemContextMenu = (e: React.MouseEvent, noteId: string, noteTitle: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'noteItem', noteId, noteTitle })
  }

  const handleDelete = async (id: string) => {
    if (selectedSection === 'documents') {
      await api.documents.delete(id)
      await loadDocuments()
    } else if (selectedSection === 'notes') {
      await api.notes.delete(id)
      await loadNotes()
    }
    if (selectedItemId === id) {
      setSelectedItemId(null)
      setSelectedItemDetail(null)
      setSelectedItemTags([])
    }
  }

  const handleDownload = async (docId: string) => {
    try { await api.sync.stubDownload(docId); await loadDocuments() }
    catch (err: any) { alert(`${t('detail.downloadFailed')}: ${err.message}`) }
  }

  const handleUpload = async (docId: string) => {
    try { await api.sync.stubUpload(docId); await loadDocuments() }
    catch (err: any) { alert(`${t('detail.uploadFailed')}: ${err.message}`) }
  }

  const handleSelectItem = useCallback(async (id: string, type: 'document' | 'note') => {
    setSelectedItemId(id)
    if (type === 'document') {
      try {
        const detail = await api.documents.get(id)
        setSelectedItemDetail(detail)
        const itemTags = await api.tags.forTarget(id, 'document')
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
    setSelectedSection(section)
    setSelectedTag(null)
    setTagFilteredItems(null)
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
    }

    if (selectedTag && tagFilteredItems) {
      items = tagFilteredItems
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter((item: any) => (item.title || item.name || '').toLowerCase().includes(q))
    }
    return items
  }

  const displayItems = getDisplayItems()

  const sidebarStyle: React.CSSProperties = {
    width: leftResize.width, minWidth: 160, background: 'var(--surface)',
    borderRight: 'none', display: 'flex',
    flexDirection: 'column', overflow: 'hidden', userSelect: 'none',
  }

  const sidebarItemStyle = (active: boolean): React.CSSProperties => ({
    height: 26, display: 'flex', alignItems: 'center', gap: 6,
    padding: '0 12px', fontSize: 13, cursor: 'pointer',
    fontWeight: 600, color: 'var(--text)',
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
    width: rightResize.width, minWidth: 200, borderLeft: 'none',
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
        <ResizeHandle onMouseDown={leftResize.onMouseDown} />
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
            style={sidebarItemStyle(selectedSection === 'documents' && selectedDir === null && !selectedTag)}
            onClick={() => { handleSectionChange('documents'); setDocSectionExpanded(prev => selectedSection === 'documents' ? !prev : true) }}
            onMouseEnter={e => { if (!(selectedSection === 'documents' && selectedDir === null && !selectedTag)) e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (!(selectedSection === 'documents' && selectedDir === null && !selectedTag)) e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 14, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
              {dirTree.length > 0 ? (docSectionExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
            </span>
            <LibraryBig size={15} style={{ flexShrink: 0 }} />
            {t('library.documents')}
          </div>

          {docSectionExpanded && dirTree.length > 0 && (
            <div>
              {dirTree.map(node => (
                <DirTreeItem
                  key={node.path} node={node} selectedDir={selectedDir}
                  onSelect={(p) => { setSelectedSection('documents'); setSelectedDir(p); setSelectedTag(null); setTagFilteredItems(null); setSelectedNoteDir(null); setSelectedItemId(null); setSelectedItemDetail(null) }}
                  expandedDirs={expandedDirs} onToggle={toggleDir} depth={1} icon={<Folder size={14} />}
                />
              ))}
            </div>
          )}

          {/* Notes */}
          <div
            style={sidebarItemStyle(selectedSection === 'notes' && selectedNoteDir === null && !selectedTag)}
            onClick={() => { handleSectionChange('notes'); setNoteSectionExpanded(prev => selectedSection === 'notes' ? !prev : true) }}
            onContextMenu={(e) => handleSidebarContextMenu(e, 'notes')}
            onMouseEnter={e => { if (!(selectedSection === 'notes' && selectedNoteDir === null && !selectedTag)) e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (!(selectedSection === 'notes' && selectedNoteDir === null && !selectedTag)) e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 14, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
              {noteDirTree.length > 0 ? (noteSectionExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
            </span>
            <PenLine size={15} style={{ flexShrink: 0 }} />
            {t('library.notes')}
          </div>

          {noteSectionExpanded && noteDirTree.length > 0 && (
            <div>
              {noteDirTree.map(node => (
                <DirTreeItem
                  key={node.path} node={node} selectedDir={selectedNoteDir}
                  onSelect={(p) => { setSelectedSection('notes'); setSelectedNoteDir(p); setSelectedTag(null); setTagFilteredItems(null); setSelectedDir(null); setSelectedItemId(null); setSelectedItemDetail(null) }}
                  expandedDirs={expandedNoteDirs}
                  onToggle={(path) => setExpandedNoteDirs(prev => {
                    const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next
                  })}
                  onContextMenu={(e, path) => handleSidebarContextMenu(e, 'noteDir', path)}
                  depth={1} icon={<Folder size={14} />}
                />
              ))}
            </div>
          )}

          <div style={{ margin: '6px 12px', borderTop: '1px solid var(--border)' }} />

          {/* Utilities */}
          <div
            style={sidebarItemStyle(false)}
            onClick={() => handleSectionChange('sync')}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 14, flexShrink: 0 }} />
            <Cloud size={15} style={{ flexShrink: 0 }} />
            {t('library.sync')}
          </div>
          <div
            style={sidebarItemStyle(selectedSection === 'plugins')}
            onClick={() => handleSectionChange('plugins')}
            onMouseEnter={e => { if (selectedSection !== 'plugins') e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (selectedSection !== 'plugins') e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 14, flexShrink: 0 }} />
            <Puzzle size={15} style={{ flexShrink: 0 }} />
            {t('library.plugins')}{plugins.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({plugins.length})</span>}
          </div>
          <div
            style={sidebarItemStyle(selectedSection === 'settings')}
            onClick={() => handleSectionChange('settings')}
            onMouseEnter={e => { if (selectedSection !== 'settings') e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (selectedSection !== 'settings') e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 14, flexShrink: 0 }} />
            <Settings size={15} style={{ flexShrink: 0 }} />
            {t('settings.title')}
          </div>
          <div style={{ margin: '6px 12px', borderTop: '1px solid var(--border)' }} />

          {/* Tags */}
          <div style={{ padding: '4px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('library.tags')}</div>
              <Settings
                size={13}
                onClick={() => onOpenTagManager?.()}
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
                        onClick={() => setSelectedTag(selectedTag === tag.id ? null : tag.id)}
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

        </div>
      </div>

      <ResizeHandle onMouseDown={leftResize.onMouseDown} />

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
        ) : selectedSection === 'plugins' ? (
          <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {plugins.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                  {t('library.noPlugins')}
                </div>
              )}
              {plugins.map((p) => (
                <div key={p.id} style={{
                  background: 'var(--surface)',
                  borderRadius: 10,
                  padding: 16,
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: p.enabled ? '#4a6cf7' : 'var(--bg-secondary, #333)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, flexShrink: 0,
                      }}>
                        🧩
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>v{p.version}</div>
                      </div>
                    </div>
                    <div
                      onClick={async () => {
                        if (p.enabled) {
                          await api.plugins!.disable(p.id)
                        } else {
                          await api.plugins!.enable(p.id)
                        }
                        await loadPlugins()
                        document.dispatchEvent(new CustomEvent('plugins-changed'))
                      }}
                      style={{
                        width: 38, height: 20, borderRadius: 10, cursor: 'pointer',
                        background: p.enabled ? '#4a6cf7' : 'var(--bg-secondary, #555)',
                        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 8,
                        background: '#fff',
                        position: 'absolute', top: 2,
                        left: p.enabled ? 20 : 2,
                        transition: 'left 0.2s',
                      }} />
                    </div>
                  </div>
                  {p.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{p.description}</div>
                  )}
                  {p.enabled && pluginViews.filter(v => v.pluginId === p.id).length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                      {pluginViews.filter(v => v.pluginId === p.id).map(view => (
                        <button
                          key={view.viewType}
                          onClick={() => onOpenPluginView?.(view.pluginId, view.viewType)}
                          style={{
                            background: '#4a6cf7', color: '#fff', border: 'none',
                            borderRadius: 6, padding: '5px 12px', fontSize: 12,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                          }}
                        >
                          <span>{view.icon || '🧩'}</span>
                          {t('plugin.openPanel')} {view.displayText}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div style={toolbarStyle}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {selectedSection === 'notes' && (
                  <>
                    <button onClick={handleCreateNote} title={t('library.newNote')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}><FilePlus size={16} /></button>
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
              {(selectedSection === 'documents' || selectedSection === 'notes') && <div style={{ width: 80, padding: '6px 4px' }}>{t('library.colType')}</div>}
              <div style={{ flex: 1, padding: '6px 4px' }}>{t('library.colTitle')}</div>
              <div style={{ width: 100, padding: '6px 4px', textAlign: 'right' }}>{t('library.colCreatedAt')}</div>
            </div>

            {/* Table rows */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {displayItems.length === 0 && (
                <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                  {selectedSection === 'documents' && (selectedDir ? t('library.emptyDir') : t('library.emptyDocuments'))}
                  {selectedSection === 'notes' && t('library.emptyNotes')}
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
                    {(selectedSection === 'documents' || selectedSection === 'notes') && (
                      <div style={{ width: 80, padding: '0 4px' }}>
                        {TYPE_PILLS[item.type] ? (
                          <span style={{
                            fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
                            display: 'inline-block',
                            ...(selectedSection === 'notes' ? { width: 48, textAlign: 'center' as const, padding: '2px 0' } : { padding: '2px 8px' }),
                            borderRadius: 9999,
                            background: TYPE_PILLS[item.type].bg,
                            color: TYPE_PILLS[item.type].color,
                          }}>
                            {TYPE_PILLS[item.type].label}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, color: 'var(--text-muted)', letterSpacing: 0.5 }}>
                            {item.type}
                          </span>
                        )}
                      </div>
                    )}
                    <div style={{ flex: 1, overflow: 'hidden', padding: '0 4px', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
                        {item.title || item.name}
                      </span>
                      {/* TODO: item.tags not included in list query; tag pills would go here once list returns tags */}
                    </div>
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
        <>
        <ResizeHandle onMouseDown={rightResize.onMouseDown} />
        <div style={detailPanelStyle}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{t('detail.title')}</div>
          <DetailField label={t('detail.docTitle')} value={selectedItemDetail.title} />
          <DetailField label={t('detail.type')} value={
            TYPE_PILLS[selectedItemDetail.type]
              ? <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, padding: '2px 8px', borderRadius: 9999, background: TYPE_PILLS[selectedItemDetail.type].bg, color: TYPE_PILLS[selectedItemDetail.type].color }}>{TYPE_PILLS[selectedItemDetail.type].label}</span>
              : <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{selectedItemDetail.type}</span>
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
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('library.tags')}</div>
            <TagInput targetId={selectedItemId!} targetType={selectedSection === 'documents' ? 'document' : 'note'} />
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docStatuses[selectedItemId] === 'cloud' && (
              <button onClick={() => handleDownload(selectedItemId)} style={{ fontSize: 12, padding: '4px 10px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Download size={14} />{t('detail.download')}</button>
            )}
            {docStatuses[selectedItemId] === 'local' && (
              <button onClick={() => handleUpload(selectedItemId)} style={{ fontSize: 12, padding: '4px 10px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Upload size={14} />{t('detail.upload')}</button>
            )}
            <button onClick={() => handleDelete(selectedItemId)} style={{ fontSize: 12, padding: '4px 10px', width: '100%', color: '#c44040', borderColor: '#c44040', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Trash2 size={14} />{t('common.delete')}</button>
          </div>
        </div>
        </>
      )}

      {selectedItemId && selectedSection !== 'documents' && selectedSection !== 'plugins' && selectedSection !== 'settings' && (
        <>
        <ResizeHandle onMouseDown={rightResize.onMouseDown} />
        <div style={detailPanelStyle}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{t('detail.title')}</div>
          {(() => {
            const item = notes.find((i: any) => i.id === selectedItemId)
            if (!item) return null
            return (
              <>
                <DetailField label={t('detail.docTitle')} value={item.title} />
                <DetailField label={t('detail.createdAt')} value={formatDate(item.createdAt, locale)} />
                <div style={{ marginTop: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('library.tags')}</div>
                  <TagInput targetId={selectedItemId!} targetType={item.type === 'mindmap' ? 'mindmap' : 'note'} />
                </div>
                <div style={{ marginTop: 16 }}>
                  <button onClick={() => handleDelete(selectedItemId)} style={{ fontSize: 12, padding: '4px 10px', width: '100%', color: '#c44040', borderColor: '#c44040', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Trash2 size={14} />{t('common.delete')}</button>
                </div>
              </>
            )
          })()}
        </div>
        </>
      )}

      {showNotePicker && (
        <TemplatePicker onSelect={handleNoteTemplateSelect} onClose={() => { setShowNotePicker(false); setNotePickerError(null) }} error={notePickerError} />
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
              <div onClick={handleCreateNote} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><FilePlus size={14} />{t('library.newNote')}</div>
              <div onClick={handleCreateFolder} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><FolderPlus size={14} />{t('library.newFolder')}</div>
              {contextMenu.type === 'noteDir' && contextMenu.dirPath && (
                <div onClick={handleRenameDir} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                ><Pencil size={14} />{t('library.rename')}</div>
              )}
            </>
          )}
          {contextMenu.type === 'noteItem' && (
            <>
              <div onClick={handleRenameNote} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><Pencil size={14} />{t('library.rename')}</div>
              <div onClick={() => { if (contextMenu.noteId) { handleDelete(contextMenu.noteId); setContextMenu(null) } }} style={{ ...ctxItemStyle, color: '#c44040', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><Trash2 size={14} />{t('common.delete')}</div>
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
