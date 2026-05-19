import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { ChevronDown, ChevronRight, FilePlus, Download, Upload, Trash2, FolderPlus, Check, Pencil, LibraryBig, PenLine, Cloud, Puzzle, Settings, Folder, Tag, Home, ArrowLeftRight, PanelLeftClose, PanelLeftOpen, FolderOutput, X, RefreshCw, Plus } from 'lucide-react'
import { PoetryCard } from '../components/PoetryCard.js'
import type { NoteType } from '../components/notes/TemplatePicker.js'
import SyncConfigPanel from '../components/sync/SyncConfigPanel.js'
import TagManagerView from './TagManagerView.js'
import TemplatePicker from '../components/notes/TemplatePicker.js'
import TagInput from '../components/tags/TagInput.js'
import TagPill from '../components/tags/TagPill.js'
import { useResizable, ResizeHandle } from '../components/ResizeHandle.js'
import { useI18n } from '../i18n/index.js'
import { NOTE_THEMES, NOTE_THEME_KEYS, applyNoteTheme, getStoredNoteTheme } from '../components/notes/noteThemes.js'
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
  onSwitchLibrary?: () => void
}

type SidebarSection = 'home' | 'documents' | 'notes' | 'sync' | 'plugins' | 'settings' | 'tags'

interface DirNode {
  name: string
  path: string
  children: DirNode[]
}

function buildDirTree(docs: Document[], extraDirs?: string[]): DirNode[] {
  const root: Record<string, any> = {}
  const addPath = (parts: string[]) => {
    let current = root
    let pathSoFar = ''
    for (const part of parts) {
      pathSoFar = pathSoFar ? pathSoFar + '/' + part : part
      if (!current[part]) current[part] = { __path: pathSoFar }
      current = current[part]
    }
  }
  for (const doc of docs) {
    const parts = doc.path.split('/')
    if (parts.length <= 1) continue
    addPath(parts.slice(0, -1))
  }
  if (extraDirs) {
    for (const dir of extraDirs) {
      addPath(dir.split('/'))
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
          onSelect(node.path)
          if (hasChildren) onToggle(node.path)
        }}
        onContextMenu={(e) => {
          onSelect(node.path)
          onContextMenu?.(e, node.path)
        }}
        style={{
          height: 30,
          paddingLeft: 12 + depth * 16,
          paddingRight: 12,
          marginLeft: 8,
          marginRight: 8,
          fontSize: 14,
          cursor: 'pointer',
          background: isSelected ? 'var(--accent-soft)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          borderRadius: 'var(--radius-sm)',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--hover)' }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = isSelected ? 'var(--accent-soft)' : 'transparent' }}
      >
        {icon && <span style={{ flexShrink: 0, lineHeight: 1, display: 'inline-flex', color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>{icon}</span>}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 400, color: isSelected ? 'var(--accent)' : (textColor || 'var(--text-secondary)') }}>
          {node.name}
        </span>
        {hasChildren && (
          <span
            onClick={(e) => { e.stopPropagation(); onToggle(node.path) }}
            style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
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

export default function LibraryView({ rootPath, libraryName, onOpenDoc, onOpenNote, onOpenMindmap, onOpenPluginView, onSwitchLibrary }: Props) {
  const api = useBanjuanAPI()
  const { t, locale, setLocale } = useI18n()
  const [documents, setDocuments] = useState<Document[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [plugins, setPlugins] = useState<any[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedSection, setSelectedSection] = useState<SidebarSection>('home')
  const [selectedDir, setSelectedDir] = useState<string | null>(null)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedItemDetail, setSelectedItemDetail] = useState<any>(null)
  const [selectedItemTags, setSelectedItemTags] = useState<Tag[]>([])
  const [docStatuses, setDocStatuses] = useState<Record<string, string>>({})
  const [downloadProgress, setDownloadProgress] = useState<Record<string, { loaded: number; total: number } | null>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<'type' | 'title' | 'createdAt' | 'updatedAt' | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [showNotePicker, setShowNotePicker] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: string; dirPath?: string; noteId?: string; noteTitle?: string; docId?: string; docTitle?: string } | null>(null)
  const [moveDocDialog, setMoveDocDialog] = useState<{ docId: string; docTitle: string } | null>(null)
  const [docDirs, setDocDirs] = useState<string[]>([])
  const [showDocFolderInput, setShowDocFolderInput] = useState(false)
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
  const pluginIconCache = useRef<Map<string, string>>(new Map())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const leftResize = useResizable(220, 160, 400, 'left')
  const rightResize = useResizable(280, 200, 500, 'right')

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  const [docExtraDirs, setDocExtraDirs] = useState<string[]>([])
  const dirTree = useMemo(() => buildDirTree(documents, docExtraDirs), [documents, docExtraDirs])

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
    try { const dirs = await api.documents.listDirs(); setDocExtraDirs(dirs) } catch {}
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
      views.forEach(v => { if (v.icon) pluginIconCache.current.set(v.pluginId, v.icon) })
    } catch { setPluginViews([]) }
  }

  useEffect(() => { loadDocuments(); loadNotes(); loadTags(); loadNoteDirs() }, [])

  useEffect(() => {
    const refresh = () => { loadDocuments(); loadNotes(); loadTags(); loadNoteDirs() }
    document.addEventListener('banjuan:library-focus', refresh)
    return () => document.removeEventListener('banjuan:library-focus', refresh)
  }, [])

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

  const handleDocFolderInputConfirm = async () => {
    const name = folderInputValue.trim()
    setShowDocFolderInput(false)
    if (!name) return
    const dirPath = selectedDir ? `${selectedDir}/${name}` : name
    await api.documents.createDir(dirPath)
    const dirs = await api.documents.listDirs()
    setDocExtraDirs(dirs)
  }

  const handleDocItemContextMenu = (e: React.MouseEvent, docId: string, docTitle: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'docItem', docId, docTitle })
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
    setDownloadProgress(prev => ({ ...prev, [docId]: { loaded: 0, total: 0 } }))
    try {
      await api.sync.stubDownload(docId, (p) => {
        setDownloadProgress(prev => ({ ...prev, [docId]: p }))
      })
      await loadDocuments()
    } catch (err: any) {
      alert(`${t('detail.downloadFailed')}: ${err.message}`)
    } finally {
      setDownloadProgress(prev => ({ ...prev, [docId]: null }))
    }
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
    if (section === 'plugins') loadPlugins()
    setSelectedSection(section)
    setSelectedTag(null)
    setTagFilteredItems(null)
    setSelectedDir(null)
    setSelectedNoteDir(null)
    setSelectedItemId(null)
    setSelectedItemDetail(null)
    setSelectedItemTags([])
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
      items = items.filter((item: any) => {
        const text = [item.title, item.name, item.path, item.type, item.authors?.join(' ')].filter(Boolean).join(' ').toLowerCase()
        return text.includes(q)
      })
    }

    if (sortKey) {
      items = [...items].sort((a: any, b: any) => {
        let va: string, vb: string
        if (sortKey === 'type') {
          va = a.type || ''
          vb = b.type || ''
        } else if (sortKey === 'title') {
          va = (a.title || a.name || '').toLowerCase()
          vb = (b.title || b.name || '').toLowerCase()
        } else if (sortKey === 'updatedAt') {
          va = a.updatedAt || a.createdAt || ''
          vb = b.updatedAt || b.createdAt || ''
        } else {
          va = a.createdAt || ''
          vb = b.createdAt || ''
        }
        const cmp = va.localeCompare(vb, 'zh-CN')
        return sortAsc ? cmp : -cmp
      })
    }

    return items
  }

  const displayItems = getDisplayItems()

  const sidebarStyle: React.CSSProperties = {
    width: sidebarCollapsed ? 48 : leftResize.width,
    minWidth: sidebarCollapsed ? 48 : 180,
    background: 'var(--surface)',
    borderRight: 'none', display: 'flex',
    flexDirection: 'column', overflow: 'hidden', userSelect: 'none',
    transition: 'width 0.2s ease, min-width 0.2s ease',
  }

  const sidebarItemStyle = (active: boolean): React.CSSProperties => ({
    height: 32, display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 8,
    padding: sidebarCollapsed ? '0' : '0 12px',
    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
    margin: sidebarCollapsed ? '1px 4px' : '1px 8px',
    fontSize: 14, cursor: 'pointer',
    fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : 'var(--text-secondary)',
    background: active ? 'var(--accent-soft)' : 'transparent',
    borderRadius: 'var(--radius-sm)',
    transition: 'background 0.15s ease',
    overflow: 'hidden', whiteSpace: 'nowrap',
  })

  const ctxItemStyle: React.CSSProperties = {
    padding: '7px 12px', fontSize: 13, cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
  }

  const centerStyle: React.CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0,
  }

  const toolbarStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 28px', borderBottom: '1px solid var(--border)', gap: 8, flexShrink: 0,
  }

  const detailPanelStyle: React.CSSProperties = {
    width: rightResize.width, minWidth: 200, borderLeft: 'none',
    background: 'var(--surface)', overflow: 'auto', padding: '20px 20px 40px', flexShrink: 0,
  }


  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Left Sidebar */}
      <div style={sidebarStyle}>
        {/* Header */}
        <div style={{
          padding: sidebarCollapsed ? '12px 4px 10px' : '12px 20px 10px',
          display: 'flex', alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          gap: 8, flexShrink: 0,
        }}>
          {!sidebarCollapsed && (
            <span style={{
              fontSize: 15, fontWeight: 600, color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}>
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

        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
          {/* Home */}
          <div
            style={sidebarItemStyle(selectedSection === 'home')}
            onClick={() => handleSectionChange('home')}
            onMouseEnter={e => { if (selectedSection !== 'home') e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (selectedSection !== 'home') e.currentTarget.style.background = 'transparent' }}
            title={sidebarCollapsed ? (t('library.home') ?? 'Home') : undefined}
          >
            <Home size={18} style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && (t('library.home') ?? 'Home')}
          </div>

          {/* Documents */}
          <div
            style={sidebarItemStyle(selectedSection === 'documents' && selectedDir === null && !selectedTag)}
            onClick={() => { handleSectionChange('documents'); if (!sidebarCollapsed) setDocSectionExpanded(prev => selectedSection === 'documents' ? !prev : true) }}
            onContextMenu={(e) => handleSidebarContextMenu(e, 'documents')}
            onMouseEnter={e => { if (!(selectedSection === 'documents' && selectedDir === null && !selectedTag)) e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (!(selectedSection === 'documents' && selectedDir === null && !selectedTag)) e.currentTarget.style.background = 'transparent' }}
            title={sidebarCollapsed ? t('library.documents') : undefined}
          >
            <LibraryBig size={18} style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && <><span style={{ flex: 1 }}>{t('library.documents')}</span>
              {dirTree.length > 0 && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{docSectionExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
            </>}
          </div>

          {!sidebarCollapsed && docSectionExpanded && dirTree.length > 0 && (
            <div>
              {dirTree.map(node => (
                <DirTreeItem
                  key={node.path} node={node} selectedDir={selectedDir}
                  onSelect={(p) => { setSelectedSection('documents'); setSelectedDir(p); setSelectedTag(null); setTagFilteredItems(null); setSelectedNoteDir(null); setSelectedItemId(null); setSelectedItemDetail(null) }}
                  expandedDirs={expandedDirs} onToggle={toggleDir} depth={1} icon={<Folder size={16} />}
                />
              ))}
            </div>
          )}

          {/* Notes */}
          <div
            style={sidebarItemStyle(selectedSection === 'notes' && selectedNoteDir === null && !selectedTag)}
            onClick={() => { handleSectionChange('notes'); if (!sidebarCollapsed) setNoteSectionExpanded(prev => selectedSection === 'notes' ? !prev : true) }}
            onContextMenu={(e) => handleSidebarContextMenu(e, 'notes')}
            onMouseEnter={e => { if (!(selectedSection === 'notes' && selectedNoteDir === null && !selectedTag)) e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (!(selectedSection === 'notes' && selectedNoteDir === null && !selectedTag)) e.currentTarget.style.background = 'transparent' }}
            title={sidebarCollapsed ? t('library.notes') : undefined}
          >
            <PenLine size={18} style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && <><span style={{ flex: 1 }}>{t('library.notes')}</span>
              {noteDirTree.length > 0 && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{noteSectionExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
            </>}
          </div>

          {!sidebarCollapsed && noteSectionExpanded && noteDirTree.length > 0 && (
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
                  depth={1} icon={<Folder size={16} />}
                />
              ))}
            </div>
          )}

          {!sidebarCollapsed && <div style={{ margin: '8px 16px', borderTop: '1px solid var(--border)' }} />}
          {sidebarCollapsed && <div style={{ margin: '6px 8px', borderTop: '1px solid var(--border)' }} />}

          {/* Utilities */}
          <div
            style={sidebarItemStyle(selectedSection === 'sync')}
            onClick={() => handleSectionChange('sync')}
            onMouseEnter={e => { if (selectedSection !== 'sync') e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (selectedSection !== 'sync') e.currentTarget.style.background = 'transparent' }}
            title={sidebarCollapsed ? t('library.sync') : undefined}
          >
            <Cloud size={18} style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && t('library.sync')}
          </div>
          <div
            style={sidebarItemStyle(selectedSection === 'plugins')}
            onClick={() => handleSectionChange('plugins')}
            onMouseEnter={e => { if (selectedSection !== 'plugins') e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (selectedSection !== 'plugins') e.currentTarget.style.background = 'transparent' }}
            title={sidebarCollapsed ? t('library.plugins') : undefined}
          >
            <Puzzle size={18} style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && <>{t('library.plugins')}{plugins.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>({plugins.length})</span>}</>}
          </div>
          <div
            style={sidebarItemStyle(selectedSection === 'settings')}
            onClick={() => handleSectionChange('settings')}
            onMouseEnter={e => { if (selectedSection !== 'settings') e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (selectedSection !== 'settings') e.currentTarget.style.background = 'transparent' }}
            title={sidebarCollapsed ? t('settings.title') : undefined}
          >
            <Settings size={18} style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && t('settings.title')}
          </div>
          {!sidebarCollapsed && <div style={{ margin: '8px 16px', borderTop: '1px solid var(--border)' }} />}
          {sidebarCollapsed && <div style={{ margin: '6px 8px', borderTop: '1px solid var(--border)' }} />}

          {/* Tags */}
          {sidebarCollapsed ? (
            <div
              style={{ ...sidebarItemStyle(false), justifyContent: 'center' }}
              onClick={() => handleSectionChange('tags')}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              title={t('library.tags')}
            >
              <Tag size={18} style={{ flexShrink: 0 }} />
            </div>
          ) : (
          <div style={{ padding: '4px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('library.tags')}</div>
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
              title={sidebarCollapsed ? (t('library.switchLibrary') ?? 'Switch Library') : undefined}
            >
              <ArrowLeftRight size={13} />
              {!sidebarCollapsed && (t('library.switchLibrary') ?? 'Switch Library')}
            </div>
          </div>
        )}
      </div>

      {!sidebarCollapsed && <ResizeHandle onPointerDown={leftResize.onPointerDown} />}

      {/* Center Panel */}
      <div style={centerStyle}>
        {selectedSection === 'home' ? (
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 24px 80px' }}>
            <div style={{ width: '100%', maxWidth: 520 }}>
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 4 }}>
                  {libraryName}
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {documents.length} {t('library.documents')?.toLowerCase()} · {notes.length} {t('library.notes')?.toLowerCase()}
                </p>
              </div>

              <div style={{ marginBottom: 32 }}>
                <PoetryCard locale={locale} />
              </div>

              {/* Quick actions */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
                <button
                  onClick={() => handleSectionChange('documents')}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    padding: '16px 12px', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-solid)', background: 'var(--surface-raised)',
                    cursor: 'pointer', transition: 'box-shadow 0.15s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  <LibraryBig size={20} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{t('library.documents')}</span>
                </button>
                <button
                  onClick={() => handleSectionChange('notes')}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    padding: '16px 12px', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-solid)', background: 'var(--surface-raised)',
                    cursor: 'pointer', transition: 'box-shadow 0.15s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  <PenLine size={20} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{t('library.notes')}</span>
                </button>
                <button
                  onClick={() => handleSectionChange('sync')}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    padding: '16px 12px', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-solid)', background: 'var(--surface-raised)',
                    cursor: 'pointer', transition: 'box-shadow 0.15s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  <Cloud size={20} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{t('library.sync')}</span>
                </button>
              </div>

              {/* Recent notes */}
              {notes.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    {t('library.recentNotes') ?? 'Recent Notes'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {[...notes].sort((a, b) => ((b.updatedAt || b.createdAt) || '').localeCompare((a.updatedAt || a.createdAt) || '')).slice(0, 8).map(note => {
                      const pill = TYPE_PILLS[note.type]
                      return (
                        <div
                          key={note.id}
                          onClick={() => {
                            if (note.type === 'mindmap') onOpenMindmap(note)
                            else onOpenNote(note)
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer', transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
                            padding: '2px 6px', borderRadius: 9999,
                            background: pill?.bg ?? '#edeef0', color: pill?.color ?? '#737a84',
                          }}>
                            {pill?.label ?? note.type}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {note.title}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {formatDate(note.updatedAt || note.createdAt, locale)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Recent documents */}
              {documents.filter(d => d.lastReadAt).length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    {t('library.recentDocs')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {[...documents].filter(d => d.lastReadAt).sort((a, b) => (b.lastReadAt || '').localeCompare(a.lastReadAt || '')).slice(0, 8).map(doc => {
                      const pill = TYPE_PILLS[doc.type]
                      const extLabel = doc.type === 'other' || (doc.type === 'txt' && doc.path && !doc.path.endsWith('.txt'))
                        ? (doc.path?.split('.').pop()?.toUpperCase() || (pill?.label ?? doc.type))
                        : (pill?.label ?? doc.type)
                      return (
                        <div
                          key={doc.id}
                          onClick={() => onOpenDoc(doc)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer', transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
                            padding: '2px 6px', borderRadius: 9999,
                            background: pill?.bg ?? '#edeef0', color: pill?.color ?? '#737a84',
                          }}>
                            {extLabel}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {doc.title}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {formatDate(doc.lastReadAt || doc.updatedAt || doc.createdAt, locale)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : selectedSection === 'settings' ? (
          <SettingsPanel locale={locale} setLocale={setLocale} t={t} />
        ) : selectedSection === 'plugins' ? (
          <div style={{ padding: '24px 28px 80px', overflow: 'auto', flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {plugins.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 13 }}>
                  {t('library.noPlugins')}
                </div>
              )}
              {plugins.map((p) => {
                const pIcon = pluginViews.find(v => v.pluginId === p.id)?.icon || pluginIconCache.current.get(p.id)
                const isSvg = pIcon && pIcon.includes('<svg')
                const views = pluginViews.filter(v => v.pluginId === p.id)
                return (
                  <div key={p.id} style={{
                    background: 'var(--surface-raised, #fff)',
                    borderRadius: 8,
                    border: '1px solid #dadce0',
                    boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
                    display: 'flex', flexDirection: 'column',
                  }}>
                    {/* Top: icon + info */}
                    <div style={{ padding: '20px 20px 0', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                      <div style={{
                        width: 56, height: 56, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSvg ? (
                          <span dangerouslySetInnerHTML={{ __html: pIcon!.replace(/width="18"/, 'width="40"').replace(/height="18"/, 'height="40"') }} />
                        ) : (
                          <span style={{ fontSize: 36 }}>{pIcon || '🧩'}</span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.version}</span>
                        </div>
                        {p.description && (
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 4 }}>{p.description}</div>
                        )}
                      </div>
                    </div>
                    {/* Spacer */}
                    <div style={{ flex: 1 }} />
                    {/* Bottom: actions + toggle */}
                    <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {p.enabled && views.map(view => (
                          <button
                            key={view.viewType}
                            onClick={() => onOpenPluginView?.(view.pluginId, view.viewType)}
                            style={{
                              background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)',
                              borderRadius: 16, padding: '4px 16px', fontSize: 13, fontWeight: 500,
                              cursor: 'pointer',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                          >
                            {t('plugin.openPanel')}
                          </button>
                        ))}
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
                          width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
                          background: p.enabled ? '#1a73e8' : '#dadce0',
                          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 9,
                          background: '#fff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          position: 'absolute', top: 2,
                          left: p.enabled ? 20 : 2,
                          transition: 'left 0.2s',
                        }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : selectedSection === 'sync' ? (
          <SyncConfigPanel onClose={() => { handleSectionChange('home'); loadDocuments() }} />
        ) : selectedSection === 'tags' ? (
          <TagManagerView />
        ) : (
          <>
            {/* Toolbar */}
            <div style={toolbarStyle}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {selectedSection === 'notes' && (
                  <>
                    <button onClick={handleCreateNote} title={t('library.newNote')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}><FilePlus size={18} /></button>
                    <button onClick={async () => { await api.notes.refresh(); await loadNotes(); await loadNoteDirs() }} title={t('library.refresh')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}><RefreshCw size={16} /></button>
                  </>
                )}
                {selectedSection === 'documents' && (
                  <>
                    <button onClick={async () => { await api.documents.import(selectedDir || undefined); await loadDocuments() }} title={t('common.import')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}><Plus size={18} /></button>
                    <button onClick={async () => { await api.documents.refresh(); await loadDocuments() }} title={t('library.refresh')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}><RefreshCw size={16} /></button>
                    {selectedDir && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedDir}</span>}
                  </>
                )}
                {/* Sort controls */}
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
              </div>
              <input
                type="search" placeholder={t('common.search')}
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 220, fontSize: 14, padding: '7px 12px', borderRadius: 'var(--radius-sm)' }}
              />
            </div>

            {/* List */}
            <div
              style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: '12px 24px 80px' }}
              onClick={(e) => { if (e.target === e.currentTarget) { setSelectedItemId(null); setSelectedItemDetail(null); setSelectedItemTags([]) } }}
              onContextMenu={(e) => {
                if (e.target === e.currentTarget && selectedSection === 'documents') {
                  handleSidebarContextMenu(e, 'documents')
                }
              }}
            >
              {displayItems.length === 0 && (
                <div style={{ padding: '40px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                  {selectedSection === 'documents' && (selectedDir ? t('library.emptyDir') : t('library.emptyDocuments'))}
                  {selectedSection === 'notes' && t('library.emptyNotes')}
                </div>
              )}
              {displayItems.map((item: any) => {
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
          </>
        )}
      </div>

      {/* Right Detail Panel */}
      {selectedItemId && selectedSection === 'documents' && selectedItemDetail && (
        <>
        <ResizeHandle onPointerDown={rightResize.onPointerDown} />
        <div style={detailPanelStyle}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{t('detail.title')}</div>
          <DetailField label={t('detail.docTitle')} value={selectedItemDetail.title} />
          <DetailField label={t('detail.type')} value={(() => {
            const pill = TYPE_PILLS[selectedItemDetail.type]
            const label = selectedItemDetail.type === 'other' || (selectedItemDetail.type === 'txt' && selectedItemDetail.path && !selectedItemDetail.path.endsWith('.txt'))
              ? (selectedItemDetail.path?.split('.').pop()?.toUpperCase() || (pill?.label ?? selectedItemDetail.type))
              : pill?.label ?? selectedItemDetail.type
            return <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, padding: '2px 8px', borderRadius: 9999, background: pill?.bg ?? '#edeef0', color: pill?.color ?? '#737a84' }}>{label}</span>
          })()} />
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
            <span style={{ fontSize: 11, color: docStatuses[selectedItemId] === 'synced' ? '#34c759' : docStatuses[selectedItemId] === 'cloud' ? 'var(--accent)' : 'var(--text-muted)' }}>
              {docStatuses[selectedItemId] === 'synced' ? t('detail.synced') : docStatuses[selectedItemId] === 'cloud' ? t('detail.cloud') : t('detail.local')}
            </span>
          } />
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('library.tags')}</div>
            <TagInput targetId={selectedItemId!} targetType={selectedSection === 'documents' ? 'document' : 'note'} />
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docStatuses[selectedItemId] === 'cloud' && (() => {
              const prog = downloadProgress[selectedItemId]
              const downloading = !!prog
              const pct = prog && prog.total > 0 ? Math.round((prog.loaded / prog.total) * 100) : 0
              const sizeStr = prog && prog.total > 0 ? `${(prog.loaded / 1024 / 1024).toFixed(1)}/${(prog.total / 1024 / 1024).toFixed(1)} MB` : ''
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button onClick={() => handleDownload(selectedItemId)} disabled={downloading}
                    style={{ fontSize: 12, padding: '4px 10px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: downloading ? 0.6 : 1 }}>
                    <Download size={14} />{downloading ? `${pct}% ${sizeStr}` : t('detail.download')}
                  </button>
                  {downloading && (
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--border, #e0e0e0)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: 'var(--accent, #5856d6)', width: `${pct}%`, transition: 'width 0.2s ease' }} />
                    </div>
                  )}
                </div>
              )
            })()}
            {docStatuses[selectedItemId] === 'local' && (
              <button onClick={() => handleUpload(selectedItemId)} style={{ fontSize: 12, padding: '4px 10px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Upload size={14} />{t('detail.upload')}</button>
            )}
          </div>
        </div>
        </>
      )}

      {selectedItemId && selectedSection !== 'documents' && selectedSection !== 'plugins' && selectedSection !== 'settings' && selectedSection !== 'sync' && (
        <>
        <ResizeHandle onPointerDown={rightResize.onPointerDown} />
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
                  <button onClick={() => {
                    if (window.confirm(t('folderTree.confirmDeleteNote', item.title))) handleDelete(selectedItemId)
                  }} style={{ fontSize: 12, padding: '4px 10px', width: '100%', color: '#ff3b30', borderColor: 'rgba(255,59,48,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Trash2 size={14} />{t('common.delete')}</button>
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
      {showDocFolderInput && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowDocFolderInput(false)}>
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
              onKeyDown={e => { if (e.key === 'Enter') handleDocFolderInputConfirm() }}
              style={{
                width: '100%', fontSize: 14, padding: '8px 12px',
                border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box',
                background: 'var(--bg, #fff)', color: 'var(--text, #000)',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDocFolderInput(false)} style={{ fontSize: 13, padding: '6px 16px' }}>{t('common.cancel')}</button>
              <button
                onClick={handleDocFolderInputConfirm}
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

      {moveDocDialog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}
          onClick={() => setMoveDocDialog(null)}
        >
          <div style={{ background: 'var(--surface-raised, #fff)', borderRadius: 12, padding: 24, width: 360, maxHeight: '60vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{t('library.moveTitle', moveDocDialog.docTitle)}</span>
              <button onClick={() => setMoveDocDialog(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div
                style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={async () => {
                  await api.documents.move(moveDocDialog.docId, '.')
                  setMoveDocDialog(null)
                  await loadDocuments()
                }}
              >
                <Folder size={14} /> {t('library.moveToRoot')}
              </div>
              {docDirs.map(dir => (
                <div
                  key={dir}
                  style={{ padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={async () => {
                    await api.documents.move(moveDocDialog.docId, dir)
                    setMoveDocDialog(null)
                    await loadDocuments()
                  }}
                >
                  <Folder size={14} /> {dir}
                </div>
              ))}
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
          {contextMenu.type === 'documents' && (
            <>
              <div onClick={async () => { setContextMenu(null); await api.documents.import(selectedDir || undefined); await loadDocuments() }} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><Download size={14} />{t('common.import')}</div>
              <div onClick={() => { setContextMenu(null); setFolderInputValue(''); setShowDocFolderInput(true) }} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><FolderPlus size={14} />{t('library.newFolder')}</div>
            </>
          )}
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
          {contextMenu.type === 'docItem' && (
            <>
              <div onClick={async () => {
                if (contextMenu.docId) {
                  const dirs = await api.documents.listDirs()
                  setDocDirs(dirs)
                  setMoveDocDialog({ docId: contextMenu.docId, docTitle: contextMenu.docTitle || '' })
                }
                setContextMenu(null)
              }} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><FolderOutput size={14} />{t('library.move') || '移动到...'}</div>
              <div onClick={() => {
                if (contextMenu.docId && window.confirm(t('library.confirmDeleteDoc', contextMenu.docTitle || ''))) {
                  handleDelete(contextMenu.docId)
                }
                setContextMenu(null)
              }} style={{ ...ctxItemStyle, color: '#c44040', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><Trash2 size={14} />{t('common.delete')}</div>
            </>
          )}
          {contextMenu.type === 'noteItem' && (
            <>
              <div onClick={handleRenameNote} style={{ ...ctxItemStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              ><Pencil size={14} />{t('library.rename')}</div>
              <div onClick={() => { if (contextMenu.noteId) { const title = notes.find((n: any) => n.id === contextMenu.noteId)?.title || ''; if (window.confirm(t('folderTree.confirmDeleteNote', title))) { handleDelete(contextMenu.noteId) } setContextMenu(null) } }} style={{ ...ctxItemStyle, color: '#c44040', display: 'flex', alignItems: 'center', gap: 6 }}
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

function SettingsPanel({ locale, setLocale, t }: { locale: string; setLocale: (l: Locale) => void; t: (k: string, ...a: any[]) => string }) {
  const [noteTheme, setNoteTheme] = React.useState(getStoredNoteTheme)

  const handleThemeChange = useCallback((key: string) => {
    applyNoteTheme(key)
    setNoteTheme(key)
  }, [])

  return (
    <div style={{ padding: 24, overflow: 'auto', flex: 1 }}>
      <h3 style={{ fontSize: 16, marginBottom: 16 }}>{t('settings.title')}</h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, marginBottom: 28 }}>
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

      <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>{t('settings.noteTheme')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {NOTE_THEME_KEYS.map((key) => {
          const theme = NOTE_THEMES[key]
          const active = key === noteTheme
          return (
            <div
              key={key}
              onClick={() => handleThemeChange(key)}
              style={{
                padding: 12,
                borderRadius: 8,
                border: active ? '2px solid var(--note-h1-color, #2b579a)' : '1px solid var(--border, #e0e0e0)',
                cursor: 'pointer',
                background: active ? 'var(--surface-raised, #f8f9fa)' : 'var(--surface, #fff)',
                transition: 'all 150ms',
              }}
            >
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, background: theme.preview.h1 }} />
                <div style={{ width: 20, height: 20, borderRadius: 4, background: theme.preview.h2 }} />
                <div style={{ width: 20, height: 20, borderRadius: 4, background: theme.preview.h3 }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: 'var(--text)' }}>
                {theme.name}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{value}</div>
    </div>
  )
}
