import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { ChevronDown, ChevronRight, FilePlus, Download, Upload, Trash2, FolderPlus, Check, Pencil, LibraryBig, PenLine, Cloud, Puzzle, Settings, Folder, Tag, Home, ArrowLeftRight, PanelLeftClose, PanelLeftOpen, FolderOutput, X, RefreshCw, Plus, Highlighter, MessageSquareQuote } from 'lucide-react'
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
  const [recentAnnotations, setRecentAnnotations] = useState<Array<{ id: string; docId: string; type: string; selectedText: string | null; content: string | null; color: string; page: number | null; createdAt: string; docTitle?: string }>>([])
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

  const loadRecentAnnotations = async () => {
    try {
      const list = await api.annotations.listRecent?.(8) ?? []
      setRecentAnnotations(list as any)
    } catch { setRecentAnnotations([]) }
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

  useEffect(() => { loadDocuments(); loadNotes(); loadTags(); loadNoteDirs(); loadRecentAnnotations() }, [])

  useEffect(() => {
    const refresh = () => { loadDocuments(); loadNotes(); loadTags(); loadNoteDirs(); loadRecentAnnotations() }
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
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 32px 80px' }}>
            <div style={{ width: '100%', maxWidth: 720 }}>
              {/* Header row: name + path | quick actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', margin: 0 }}>
                    {libraryName}
                  </h2>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rootPath}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => setShowNotePicker(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', fontSize: 12, fontWeight: 500,
                      border: 'none', borderRadius: 'var(--radius-sm)',
                      background: 'rgba(0,0,0,0.03)', color: 'var(--text-muted)',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    <PenLine size={12} />
                    {locale === 'zh' ? '新建笔记' : 'New Note'}
                  </button>
                  <button
                    onClick={async () => { await api.documents.import(); await loadDocuments() }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', fontSize: 12, fontWeight: 500,
                      border: 'none', borderRadius: 'var(--radius-sm)',
                      background: 'rgba(0,0,0,0.03)', color: 'var(--text-muted)',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    <Plus size={12} />
                    {locale === 'zh' ? '导入文档' : 'Import'}
                  </button>
                </div>
              </div>

              {/* Poetry card with date overlay */}
              <div style={{ position: 'relative', marginBottom: 24 }}>
                <div style={{
                  position: 'absolute', top: 14, left: 18, zIndex: 1,
                  fontSize: 11, color: 'var(--text-secondary)', opacity: 0.65,
                  display: 'flex', alignItems: 'center', gap: 6,
                  letterSpacing: '0.01em',
                }}>
                  {(() => {
                    const now = new Date()
                    if (locale === 'zh') {
                      const weekdays = ['日', '一', '二', '三', '四', '五', '六']
                      const solar = `${now.getMonth() + 1}月${now.getDate()}日 星期${weekdays[now.getDay()]}`

                      const lunarDayNames = ['', '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
                        '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
                        '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十']
                      let lunarStr = ''
                      try {
                        const fmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' })
                        const parts = fmt.formatToParts(now)
                        const lunarMonth = parts.find(p => p.type === 'month')?.value
                        const lunarDay = parseInt(parts.find(p => p.type === 'day')?.value || '1')
                        lunarStr = `${lunarMonth}${lunarDayNames[lunarDay] || lunarDay}`
                      } catch {}

                      const solarTerms: [number, string, number][] = [
                        [0,'小寒',5.4055],[0,'大寒',20.12],[1,'立春',3.87],[1,'雨水',18.73],
                        [2,'惊蛰',5.63],[2,'春分',20.646],[3,'清明',4.81],[3,'谷雨',20.1],
                        [4,'立夏',5.52],[4,'小满',21.04],[5,'芒种',5.678],[5,'夏至',21.37],
                        [6,'小暑',7.108],[6,'大暑',22.83],[7,'立秋',7.5],[7,'处暑',23.13],
                        [8,'白露',7.646],[8,'秋分',23.042],[9,'寒露',8.318],[9,'霜降',23.438],
                        [10,'立冬',7.438],[10,'小雪',22.36],[11,'大雪',7.18],[11,'冬至',21.94],
                      ]
                      const y = now.getFullYear() - 2000
                      const m = now.getMonth()
                      const d = now.getDate()
                      const calcDay = (c: number) => Math.floor(y * 0.2422 + c) - Math.floor(y / 4)
                      const monthTerms = solarTerms.filter(t => t[0] === m)
                      let termStr = ''
                      if (monthTerms.length === 2) {
                        const d1 = calcDay(monthTerms[0][2])
                        const d2 = calcDay(monthTerms[1][2])
                        if (d === d1) termStr = monthTerms[0][1]
                        else if (d === d2) termStr = monthTerms[1][1]
                      }

                      return <>
                        {solar}
                        {lunarStr && <><span style={{ opacity: 0.3, margin: '0 5px' }}>|</span>{lunarStr}</>}
                        {termStr && <><span style={{ opacity: 0.3, margin: '0 5px' }}>|</span><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{termStr}</span></>}
                      </>
                    }
                    return now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                  })()}
                </div>
                <PoetryCard locale={locale} />
              </div>

              {/* Content sections */}
              <div style={{ display: 'grid', gridTemplateColumns: notes.length > 0 && documents.length > 0 ? '1fr 1fr' : '1fr', gap: 20 }}>

                {/* Recent notes card */}
                {notes.length > 0 && (
                  <div style={{ borderRadius: 'var(--radius-lg)', border: 'none', overflow: 'hidden', minWidth: 0, background: 'var(--surface-raised)', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03)' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderBottom: 'none', background: 'transparent',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#999', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                        {t('library.recentNotes') ?? 'Recent Notes'}
                        <span style={{ fontWeight: 400, opacity: 0.5, marginLeft: 4 }}>{notes.length}</span>
                      </span>
                      <span onClick={() => handleSectionChange('notes')}
                        style={{ fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }}>
                        {locale === 'zh' ? '全部' : 'All'}
                      </span>
                    </div>
                    {[...notes].sort((a, b) => ((b.updatedAt || b.createdAt) || '').localeCompare((a.updatedAt || a.createdAt) || '')).slice(0, 5).map(note => {
                      const pill = TYPE_PILLS[note.type]
                      return (
                        <div key={note.id}
                          onClick={() => { if (note.type === 'mindmap') onOpenMindmap(note); else onOpenNote(note) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 14px', cursor: 'pointer', transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
                            padding: '1px 5px', borderRadius: 9999, flexShrink: 0,
                            background: pill?.bg ?? '#edeef0', color: pill?.color ?? '#737a84',
                          }}>{pill?.label ?? note.type}</span>
                          <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {note.title}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {formatDate(note.updatedAt || note.createdAt, locale)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Recent documents card */}
                {documents.length > 0 && (
                  <div style={{ borderRadius: 'var(--radius-lg)', border: 'none', overflow: 'hidden', minWidth: 0, background: 'var(--surface-raised)', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03)' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderBottom: 'none', background: 'transparent',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#999', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                        {t('library.recentDocs')}
                        <span style={{ fontWeight: 400, opacity: 0.5, marginLeft: 4 }}>{documents.length}</span>
                      </span>
                      <span onClick={() => handleSectionChange('documents')}
                        style={{ fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }}>
                        {locale === 'zh' ? '全部' : 'All'}
                      </span>
                    </div>
                    {[...documents].sort((a, b) => (b.lastReadAt || b.updatedAt || b.createdAt || '').localeCompare(a.lastReadAt || a.updatedAt || a.createdAt || '')).slice(0, 5).map(doc => {
                      const pill = TYPE_PILLS[doc.type]
                      const extLabel = doc.type === 'other' || (doc.type === 'txt' && doc.path && !doc.path.endsWith('.txt'))
                        ? (doc.path?.split('.').pop()?.toUpperCase() || (pill?.label ?? doc.type))
                        : (pill?.label ?? doc.type)
                      return (
                        <div key={doc.id}
                          onClick={() => onOpenDoc(doc)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 14px', cursor: 'pointer', transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
                            padding: '1px 5px', borderRadius: 9999, flexShrink: 0,
                            background: pill?.bg ?? '#edeef0', color: pill?.color ?? '#737a84',
                          }}>{extLabel}</span>
                          <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {doc.title}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {formatDate(doc.lastReadAt || doc.updatedAt || doc.createdAt, locale)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Tags + Annotations row */}
              {(tagsWithCounts.length > 0 || recentAnnotations.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: tagsWithCounts.length > 0 && recentAnnotations.length > 0 ? '1fr 1fr' : '1fr', gap: 20, marginTop: 24 }}>
                  {/* Tags */}
                  {tagsWithCounts.length > 0 && (
                    <div style={{ borderRadius: 'var(--radius-lg)', border: 'none', overflow: 'hidden', minWidth: 0, background: 'var(--surface-raised)', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03)' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderBottom: 'none', background: 'transparent',
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#999', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                          {locale === 'zh' ? '标签' : 'Tags'}
                        </span>
                        <span onClick={() => handleSectionChange('tags' as any)}
                          style={{ fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }}>
                          {locale === 'zh' ? '管理' : 'Manage'}
                        </span>
                      </div>
                      <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {tagsWithCounts.slice(0, 15).map(tag => (
                          <span key={tag.id}
                            onClick={() => { setSelectedTag(tag.id); setSelectedSection('documents') }}
                            style={{
                              padding: '3px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 500,
                              background: tag.color ? `${tag.color}18` : 'var(--hover)',
                              color: tag.color || 'var(--text-secondary)',
                              cursor: 'pointer', transition: 'opacity 0.15s ease',
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent annotations */}
                  {recentAnnotations.length > 0 && (
                    <div style={{ borderRadius: 'var(--radius-lg)', border: 'none', overflow: 'hidden', minWidth: 0, background: 'var(--surface-raised)', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03)' }}>
                      <div style={{
                        padding: '10px 14px', borderBottom: 'none', background: 'transparent',
                        fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                      }}>
                        {locale === 'zh' ? '最近批注' : 'Recent Annotations'}
                      </div>
                      {recentAnnotations.slice(0, 4).map(ann => (
                        <div key={ann.id}
                          onClick={() => { const doc = documents.find(d => d.id === ann.docId); if (doc) onOpenDoc(doc) }}
                          style={{ padding: '6px 14px', cursor: 'pointer', transition: 'background 0.15s ease' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          {ann.selectedText ? (
                            <div style={{
                              fontSize: 12, color: 'var(--text)', lineHeight: 1.4,
                              borderLeft: `2px solid ${ann.color || 'var(--accent)'}`,
                              paddingLeft: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{ann.selectedText}</div>
                          ) : ann.content ? (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ann.content}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              {ann.type === 'ink' ? (locale === 'zh' ? '手写批注' : 'Ink annotation') : ann.type}
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                            {ann.docTitle}{ann.page != null ? ` · p.${ann.page + 1}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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

const BG_TINTS: { key: string; label: string; labelZh: string; bg: string; surface: string; surfaceRaised: string; pdfSurround: string; pdfTint: string }[] = [
  { key: 'default', label: 'Default', labelZh: '默认', bg: '#ffffff', surface: '#f5f5f7', surfaceRaised: '#ffffff', pdfSurround: '#525659', pdfTint: 'transparent' },
  { key: 'warm', label: 'Warm', labelZh: '暖黄', bg: '#faf8f2', surface: '#f3f0e8', surfaceRaised: '#fefcf6', pdfSurround: '#8a8070', pdfTint: 'rgba(245,220,180,0.25)' },
  { key: 'green', label: 'Green', labelZh: '淡绿', bg: '#f5faf5', surface: '#ecf3ec', surfaceRaised: '#f9fdf9', pdfSurround: '#6e806e', pdfTint: 'rgba(180,220,180,0.2)' },
  { key: 'sepia', label: 'Sepia', labelZh: '羊皮纸', bg: '#f9f3e8', surface: '#f0e8d8', surfaceRaised: '#fdf8ef', pdfSurround: '#8a7d6a', pdfTint: 'rgba(220,190,140,0.3)' },
  { key: 'rose', label: 'Rose', labelZh: '淡粉', bg: '#fdf6f6', surface: '#f5ecec', surfaceRaised: '#fefafa', pdfSurround: '#8a7070', pdfTint: 'rgba(230,180,180,0.2)' },
  { key: 'blue', label: 'Blue', labelZh: '浅蓝', bg: '#f4f7fb', surface: '#eaeff6', surfaceRaised: '#f9fbfe', pdfSurround: '#6a7a8a', pdfTint: 'rgba(180,200,235,0.2)' },
  { key: 'gray', label: 'Gray', labelZh: '灰调', bg: '#f0f0f0', surface: '#e8e8e8', surfaceRaised: '#f6f6f6', pdfSurround: '#606060', pdfTint: 'rgba(140,140,140,0.15)' },
  { key: 'eink', label: 'E-Ink', labelZh: '水墨屏', bg: '#e8e4de', surface: '#ddd8d1', surfaceRaised: '#efe9e3', pdfSurround: '#9a9590', pdfTint: 'rgba(120,115,105,0.2)' },
  { key: 'dousha', label: 'Bean Green', labelZh: '豆沙绿', bg: '#c7edcc', surface: '#b8debb', surfaceRaised: '#d4f2d8', pdfSurround: '#6a8a6e', pdfTint: 'rgba(160,210,165,0.3)' },
  { key: 'apricot', label: 'Apricot', labelZh: '杏仁黄', bg: '#faf9de', surface: '#f0efd0', surfaceRaised: '#fdfce8', pdfSurround: '#8a8968', pdfTint: 'rgba(235,225,170,0.25)' },
  { key: 'kindle', label: 'Kindle', labelZh: 'Kindle', bg: '#fbf0d9', surface: '#f0e4c8', surfaceRaised: '#fef6e4', pdfSurround: '#8a7d60', pdfTint: 'rgba(230,200,140,0.3)' },
]

function getStoredBgTint(): string {
  try { return localStorage.getItem('banjuan-bg-tint') || 'default' } catch { return 'default' }
}

function applyBgTint(key: string) {
  const tint = BG_TINTS.find(t => t.key === key) || BG_TINTS[0]
  const root = document.documentElement
  root.style.setProperty('--bg', tint.bg)
  root.style.setProperty('--surface', tint.surface)
  root.style.setProperty('--surface-raised', tint.surfaceRaised)
  root.style.setProperty('--pdf-surround', tint.pdfSurround)
  root.style.setProperty('--pdf-tint', tint.pdfTint)
  try { localStorage.setItem('banjuan-bg-tint', key) } catch {}
}

// Apply stored tint on load
;(() => { const k = getStoredBgTint(); if (k !== 'default') applyBgTint(k) })()

function SettingsPanel({ locale, setLocale, t }: { locale: string; setLocale: (l: Locale) => void; t: (k: string, ...a: any[]) => string }) {
  const [noteTheme, setNoteTheme] = React.useState(getStoredNoteTheme)
  const [bgTint, setBgTint] = React.useState(getStoredBgTint)

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

      <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>{t('settings.bgTint')}</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        {BG_TINTS.map(tint => {
          const active = tint.key === bgTint
          return (
            <div
              key={tint.key}
              onClick={() => { applyBgTint(tint.key); setBgTint(tint.key) }}
              style={{
                width: 56, cursor: 'pointer', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: tint.bg,
                border: active ? '2px solid var(--accent)' : '1px solid var(--border-solid)',
                boxShadow: active ? '0 0 0 2px var(--accent-soft)' : 'inset 0 1px 3px rgba(0,0,0,0.06)',
                transition: 'all 0.15s ease',
              }} />
              <span style={{ fontSize: 10, color: active ? 'var(--accent)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>
                {locale === 'zh' ? tint.labelZh : tint.label}
              </span>
            </div>
          )
        })}
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
