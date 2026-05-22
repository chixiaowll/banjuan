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
import { useTheme, APP_THEMES } from '../theme/index.js'
import type { AppTheme } from '../theme/index.js'
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
  markdown:    { bg: 'var(--tag-md-bg)', color: 'var(--tag-md-color)', label: 'MD' },
  mindmap:     { bg: 'var(--tag-mind-bg)', color: 'var(--tag-mind-color)', label: 'MIND' },
  handwriting: { bg: 'var(--tag-hand-bg)', color: 'var(--tag-hand-color)', label: 'HAND' },
  pdf:         { bg: 'var(--tag-pdf-bg)', color: 'var(--tag-pdf-color)', label: 'PDF' },
  epub:        { bg: 'var(--tag-epub-bg)', color: 'var(--tag-epub-color)', label: 'EPUB' },
  txt:         { bg: 'var(--tag-txt-bg)', color: 'var(--tag-txt-color)', label: 'TXT' },
  md:          { bg: 'var(--tag-md-bg)', color: 'var(--tag-md-color)', label: 'MD' },
  image:       { bg: 'var(--tag-img-bg)', color: 'var(--tag-img-color)', label: 'IMG' },
  video:       { bg: 'var(--tag-video-bg)', color: 'var(--tag-video-color)', label: 'VIDEO' },
  html:        { bg: 'var(--tag-html-bg)', color: 'var(--tag-html-color)', label: 'HTML' },
  other:       { bg: 'var(--tag-txt-bg)', color: 'var(--tag-txt-color)', label: 'OTHER' },
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
  const { theme: appTheme } = useTheme()
  const isMinimal = appTheme === 'minimal'
  const isNotebook = appTheme === 'notebook'
  const isModern = isMinimal || isNotebook
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => appTheme !== 'minimal' && appTheme !== 'notebook')
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
    width: sidebarCollapsed ? 60 : (isModern ? 220 : leftResize.width),
    minWidth: sidebarCollapsed ? 60 : (isModern ? 220 : 180),
    background: isModern ? 'var(--bg)' : 'linear-gradient(180deg, #EFE8D7 0%, #E8DFC8 100%)',
    borderRight: `1px solid ${isModern ? 'var(--border)' : 'var(--paper-edge)'}`, display: 'flex',
    flexDirection: 'column', overflow: 'hidden', userSelect: 'none',
    transition: 'width 0.2s ease, min-width 0.2s ease',
  }

  const sidebarItemStyle = (active: boolean): React.CSSProperties => ({
    width: sidebarCollapsed ? 38 : 'auto',
    height: sidebarCollapsed ? 38 : 32,
    display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 8,
    padding: sidebarCollapsed ? '0' : '0 8px',
    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
    margin: sidebarCollapsed ? '3px auto' : '1px 8px',
    fontSize: 13, cursor: 'pointer',
    fontFamily: isModern ? 'var(--font-cjk, var(--font-body))' : undefined,
    fontWeight: active ? 500 : 400,
    color: active ? (isNotebook ? '#fff' : isModern ? 'var(--ink)' : 'var(--vermilion)') : 'var(--ink-mute)',
    background: active ? (isNotebook ? '#E8825D' : isModern ? 'var(--hover)' : 'var(--paper)') : 'transparent',
    borderRadius: sidebarCollapsed ? 9 : (isNotebook ? 8 : 5),
    boxShadow: isModern ? 'none' : (active ? '0 1px 0 rgba(255,255,255,0.7) inset, 0 1px 3px rgba(0,0,0,0.04)' : 'none'),
    transition: 'background 0.15s ease',
    overflow: 'hidden', whiteSpace: 'nowrap',
    position: 'relative',
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
        {isModern && !sidebarCollapsed ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px 14px', margin: '18px 12px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: isNotebook ? 6 : 5,
              background: isNotebook ? '#E8825D' : 'var(--ink)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 500, flexShrink: 0,
            }}>{t('library.sealChar')}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{libraryName}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>local</div>
            </div>
            <div style={{ color: 'var(--ink-faint)' }}>
              <ChevronDown size={11} />
            </div>
          </div>
        ) : (
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
        )}

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

          {/* Group title: 资料库 (minimal/notebook) */}
          {isModern && !sidebarCollapsed && (
            <div style={{
              padding: '14px 8px 6px', margin: '0 8px',
              fontSize: 10, fontWeight: 500, color: 'var(--ink-faint)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>{locale === 'zh' ? '资料库' : 'LIBRARY'}</div>
          )}

          {/* Documents */}
          <div
            style={sidebarItemStyle(selectedSection === 'documents' && selectedDir === null && !selectedTag)}
            onClick={() => { handleSectionChange('documents'); if (!sidebarCollapsed) setDocSectionExpanded(prev => selectedSection === 'documents' ? !prev : true) }}
            onContextMenu={(e) => handleSidebarContextMenu(e, 'documents')}
            onMouseEnter={e => { if (!(selectedSection === 'documents' && selectedDir === null && !selectedTag)) e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { if (!(selectedSection === 'documents' && selectedDir === null && !selectedTag)) e.currentTarget.style.background = 'transparent' }}
            title={sidebarCollapsed ? t('library.documents') : undefined}
          >
            <LibraryBig size={isModern ? 14 : 18} style={{ flexShrink: 0, color: isModern ? 'var(--ink-mute)' : undefined }} />
            {!sidebarCollapsed && <><span style={{ flex: 1 }}>{t('library.documents')}</span>
              {isModern && <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', fontWeight: 400 }}>{documents.length}</span>}
              {!isModern && dirTree.length > 0 && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{docSectionExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
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
            <PenLine size={isModern ? 14 : 18} style={{ flexShrink: 0, color: isModern ? 'var(--ink-mute)' : undefined }} />
            {!sidebarCollapsed && <><span style={{ flex: 1 }}>{t('library.notes')}</span>
              {isModern && <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', fontWeight: 400 }}>{notes.length}</span>}
              {!isModern && noteDirTree.length > 0 && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{noteSectionExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
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

      {!sidebarCollapsed && !isModern && <ResizeHandle onPointerDown={leftResize.onPointerDown} />}

      {/* Center Panel */}
      <div style={centerStyle}>
        {selectedSection === 'home' ? (
          <div style={{ flex: 1, overflow: 'auto', padding: isModern ? '36px 48px 48px' : '36px 56px 80px' }}>
            {/* Breadcrumb (modern themes) */}
            {isModern && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)',
                marginBottom: 24,
              }}>
                {rootPath.split('/').filter(Boolean).map((part, i, arr) => (
                  <span key={i}>
                    {i > 0 && <span style={{ color: 'var(--ink-ghost)', margin: '0 2px' }}>/</span>}
                    <span style={i === arr.length - 1 ? { color: 'var(--ink)' } : undefined}>{part}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Page header */}
            <div style={{
              display: 'flex', alignItems: isModern ? 'flex-start' : 'flex-end', justifyContent: 'space-between',
              paddingBottom: isModern ? 0 : 24, marginBottom: isModern ? 8 : 32,
              borderBottom: isModern ? 'none' : '1px solid rgba(28,26,23,0.08)',
              position: 'relative',
            }}>
              {!isModern && <div style={{
                position: 'absolute', bottom: -1, left: 0, width: 64, height: 1,
                background: 'var(--vermilion)',
              }} />}
              <div style={{ minWidth: 0 }}>
                {!isModern && <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                  <h1 style={{
                    fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 34,
                    color: 'var(--ink)', letterSpacing: '0.04em', lineHeight: 1, margin: 0,
                  }}>
                    {libraryName}
                  </h1>
                  <span style={{
                    width: 26, height: 26, background: 'var(--seal)', color: '#FBE9D8',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600,
                    borderRadius: 3, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
                    transform: 'rotate(-2deg)',
                  }}>
                    {t('library.sealChar')}
                  </span>
                </div>}
                {isModern && <h1 style={{
                  fontSize: 30, fontWeight: 600, color: 'var(--ink)',
                  letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0,
                }}>{libraryName}</h1>}
                {!isModern && <div style={{
                  marginTop: 8, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)',
                  fontSize: 11, letterSpacing: '0.02em',
                }}>
                  {rootPath.split('/').map((part, i, arr) => (
                    <span key={i}>
                      {i > 0 && <span style={{ color: 'var(--ink-ghost)', margin: '0 2px' }}>/</span>}
                      <span style={i === arr.length - 1 ? { color: 'var(--vermilion)' } : undefined}>{part}</span>
                    </span>
                  ))}
                </div>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={async () => { await api.documents.import(); await loadDocuments() }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: isModern ? 32 : undefined,
                    padding: isModern ? '0 12px' : '9px 18px', borderRadius: 6,
                    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                    color: 'var(--ink-soft)', border: '1px solid var(--border-solid)',
                    background: isModern ? 'var(--surface-raised)' : 'transparent',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isModern ? 'var(--surface-raised)' : 'transparent' }}
                >
                  <Upload size={14} />
                  {t('library.import')}
                </button>
                <button
                  onClick={() => setShowNotePicker(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: isModern ? 32 : undefined,
                    padding: isModern ? '0 12px' : '9px 18px', borderRadius: 6,
                    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
                    background: 'var(--ink)', color: '#fff', border: 'none',
                    cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#000' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--ink)' }}
                >
                  <Plus size={14} />
                  {t('library.newNote')}
                </button>
              </div>
            </div>

            {/* Stats line (minimal) */}
            {isModern && (
              <div style={{
                fontSize: 13, color: 'var(--ink-mute)', marginBottom: 36,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <span><strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{documents.length}</strong>&nbsp;{locale === 'zh' ? '文档' : 'docs'}</span>
                <span style={{ color: 'var(--ink-ghost)' }}>·</span>
                <span><strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{notes.length}</strong>&nbsp;{locale === 'zh' ? '笔记' : 'notes'}</span>
                <span style={{ color: 'var(--ink-ghost)' }}>·</span>
                <span><strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{recentAnnotations.length}</strong>&nbsp;{locale === 'zh' ? '批注' : 'annotations'}</span>
              </div>
            )}

            {/* Poetry / Quote section */}
            <div style={{ marginBottom: isModern ? 40 : 36, paddingBottom: isModern ? 32 : 0, borderBottom: (isModern && !isNotebook) ? '1px solid var(--border)' : 'none' }}>
              <PoetryCard locale={locale} />
            </div>

            {isNotebook ? (<>
              {/* ── Notebook theme: cover card grid ── */}

              {/* Recent documents as cover cards */}
              {documents.length > 0 && (
                <div style={{ marginBottom: 40 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>📚 {t('library.recentDocs')}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-faint)', background: 'var(--hover)', padding: '2px 8px', borderRadius: 10 }}>{documents.length} {locale === 'zh' ? '个文档' : 'docs'}</span>
                    </div>
                    <span onClick={() => handleSectionChange('documents')} style={{ fontSize: 12, color: 'var(--ink-mute)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{t('library.viewAll')}<ChevronRight size={11} /></span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 18 }}>
                    {[...documents].sort((a, b) => ((b as any).lastReadAt || b.updatedAt || b.createdAt || '').localeCompare((a as any).lastReadAt || a.updatedAt || a.createdAt || '')).slice(0, 6).map((doc, di) => {
                      const pill = TYPE_PILLS[doc.type]
                      const coverColors = ['#E8DCC8', '#B85C4A', '#5B8C6B', '#8B7E9B', '#6B8EA0']
                      const coverBg = coverColors[di % coverColors.length]
                      const isLight = di === 0
                      const extLabel = doc.type === 'other' || (doc.type === 'txt' && doc.path && !doc.path.endsWith('.txt'))
                        ? (doc.path?.split('.').pop()?.toUpperCase() || (pill?.label ?? doc.type))
                        : (pill?.label ?? doc.type)
                      return (
                        <div key={doc.id} onClick={() => onOpenDoc(doc)} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)' }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
                        >
                          <div style={{
                            aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden', position: 'relative',
                            background: coverBg, padding: 16,
                            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
                          }}>
                            {/* Binding lines */}
                            <div style={{ position: 'absolute', left: 12, top: 0, bottom: 0, width: 2, background: 'rgba(0,0,0,0.08)' }} />
                            <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,0.05)' }} />
                            {/* Type badge */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <span style={{
                                fontSize: 9, fontWeight: 600, letterSpacing: '0.05em',
                                padding: '2px 6px', borderRadius: 3,
                                background: 'rgba(255,255,255,0.25)', color: isLight ? 'var(--ink-soft)' : '#fff',
                              }}>{extLabel}</span>
                            </div>
                            {/* Title */}
                            <div style={{ marginTop: 'auto' }}>
                              <div style={{
                                fontSize: 14, fontWeight: 600, lineHeight: 1.3,
                                color: isLight ? 'var(--ink)' : '#fff',
                                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                              }}>{doc.title}</div>
                              {doc.authors?.[0] && <div style={{
                                fontSize: 11, color: isLight ? 'var(--ink-mute)' : 'rgba(255,255,255,0.7)',
                                marginTop: 4,
                              }}>{doc.authors[0]}</div>}
                            </div>
                          </div>
                          {/* Card footer */}
                          <div style={{ padding: '8px 2px 0', fontSize: 12, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{doc.title}</div>
                          <div style={{ padding: '2px 2px 0', fontSize: 11, color: 'var(--ink-faint)' }}>
                            {doc.authors?.[0] && <>{doc.authors[0]} · </>}
                            {formatDate((doc as any).lastReadAt || doc.updatedAt || doc.createdAt, locale)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Notes as cover cards */}
              <div style={{ marginBottom: 40 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>✏️ {locale === 'zh' ? '我的笔记' : 'My Notes'}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-faint)', background: 'var(--hover)', padding: '2px 8px', borderRadius: 10 }}>{notes.length} {locale === 'zh' ? '个' : ''}</span>
                  </div>
                  <span onClick={() => handleSectionChange('notes')} style={{ fontSize: 12, color: 'var(--ink-mute)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{t('library.viewAll')}<ChevronRight size={11} /></span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 18 }}>
                  {[...notes].sort((a, b) => ((b.updatedAt || b.createdAt) || '').localeCompare((a.updatedAt || a.createdAt) || '')).slice(0, 5).map((note, ni) => {
                    const pill = TYPE_PILLS[note.type]
                    const noteColors = ['#5B8C6B', '#B85C4A', '#6B8EA0', '#8B7E9B', '#E07856']
                    const coverBg = noteColors[ni % noteColors.length]
                    return (
                      <div key={note.id} onClick={() => { if (note.type === 'mindmap') onOpenMindmap(note); else onOpenNote(note) }}
                        style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)' }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
                      >
                        <div style={{
                          aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden', position: 'relative',
                          background: coverBg, padding: 16,
                          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
                        }}>
                          <div style={{ position: 'absolute', left: 12, top: 0, bottom: 0, width: 2, background: 'rgba(0,0,0,0.08)' }} />
                          <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,0.05)' }} />
                          <span style={{
                            fontSize: 9, fontWeight: 600, letterSpacing: '0.05em',
                            padding: '2px 6px', borderRadius: 3, alignSelf: 'flex-start',
                            background: 'rgba(255,255,255,0.25)', color: '#fff',
                          }}>{pill?.label ?? note.type.toUpperCase()}</span>
                          <div style={{ marginTop: 'auto' }}>
                            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: '#fff',
                              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}>{note.title}</div>
                          </div>
                        </div>
                        <div style={{ padding: '8px 2px 0', fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</div>
                        <div style={{ padding: '2px 2px 0', fontSize: 11, color: 'var(--ink-faint)' }}>{formatDate(note.updatedAt || note.createdAt, locale)}</div>
                      </div>
                    )
                  })}
                  {/* New note card */}
                  <div onClick={() => setShowNotePicker(true)} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
                  >
                    <div style={{
                      aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden',
                      border: '2px dashed var(--border-solid)', background: 'var(--surface-raised)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                      <Plus size={24} style={{ color: 'var(--ink-faint)' }} />
                      <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>{t('library.newNote')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Annotations as sticky notes */}
              {recentAnnotations.length > 0 && (
                <div style={{ marginBottom: 40 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>📌 {t('library.recentAnnotations')}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-faint)', background: 'var(--hover)', padding: '2px 8px', borderRadius: 10 }}>{recentAnnotations.length}</span>
                    </div>
                    <span onClick={() => handleSectionChange('annotations' as any)} style={{ fontSize: 12, color: 'var(--ink-mute)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{t('library.viewAll')}<ChevronRight size={11} /></span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                    {recentAnnotations.slice(0, 8).map((ann, i) => {
                      const stickyColors = ['#FFFDF0', '#FFF0F2', '#F0F6FE']
                      const tapeColors = ['rgba(255,225,150,0.65)', 'rgba(240,190,200,0.45)', 'rgba(180,210,240,0.45)']
                      const stickyBg = stickyColors[i % stickyColors.length]
                      const tapeBg = tapeColors[i % tapeColors.length]
                      return (
                        <div key={ann.id}
                          onClick={() => { const doc = documents.find(d => d.id === ann.docId); if (doc) onOpenDoc(doc) }}
                          style={{
                            position: 'relative', cursor: 'pointer', transition: 'transform 0.15s',
                            paddingTop: 12,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) rotate(-0.5deg)' }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
                        >
                          {/* Tape decoration */}
                          <div style={{
                            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%) rotate(-2deg)',
                            width: 48, height: 16, background: tapeBg, borderRadius: 2, zIndex: 1,
                          }} />
                          <div style={{
                            background: stickyBg, borderRadius: 8, padding: '16px 18px', minHeight: 180,
                            boxShadow: '0 4px 12px rgba(60,40,20,0.08), 0 2px 4px rgba(60,40,20,0.04)',
                            display: 'flex', flexDirection: 'column', gap: 8,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ann.color || '#4CAF50' }} />
                              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' }}>
                                {ann.type === 'highlight' ? 'HIGHLIGHT' : ann.type === 'note' ? 'NOTE' : ann.type.toUpperCase()}
                              </span>
                            </div>
                            <div style={{
                              fontSize: 13, color: 'rgba(0,0,0,0.75)', lineHeight: 1.5, flex: 1,
                              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}>
                              {ann.selectedText ? `"${ann.selectedText}"` : ann.content || (ann.type === 'ink' ? t('library.inkAnnotation') : ann.type)}
                            </div>
                            <div style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              borderTop: '1px dashed rgba(0,0,0,0.10)', paddingTop: 10, marginTop: 'auto',
                            }}>
                              <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ann.docTitle}</span>
                              <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', flexShrink: 0, marginLeft: 6 }}>
                                {ann.page != null ? `P. ${String(ann.page + 1).padStart(2, '0')}` : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>) : (<>
              {/* ── Default / Minimal layout ── */}

              {/* Content sections — two columns */}
              <div style={{ display: 'grid', gridTemplateColumns: notes.length > 0 && documents.length > 0 ? (isModern ? '1fr 1.4fr' : '1fr 1fr') : '1fr', gap: isModern ? 48 : 24, marginBottom: isModern ? 48 : 28 }}>

                {/* Recent notes */}
                {notes.length > 0 && (
                  <div style={isModern ? {} : {
                    background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(28,26,23,0.08)',
                    borderRadius: 6, padding: '22px 24px',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: isModern ? 'baseline' : 'center', justifyContent: 'space-between',
                      marginBottom: isModern ? 14 : 18,
                      paddingBottom: isModern ? 0 : 14,
                      borderBottom: isModern ? 'none' : '1px solid rgba(28,26,23,0.08)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                          letterSpacing: isModern ? '.01em' : '0.06em',
                          fontFamily: isModern ? undefined : 'var(--font-display)',
                        }}>
                          {t('library.recentNotes')}
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 400,
                          color: 'var(--ink-faint)',
                        }}>{notes.length}</span>
                      </div>
                      <span onClick={() => handleSectionChange('notes')}
                        style={{
                          fontSize: 12, color: 'var(--ink-mute)', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                        }}>
                        {t('library.viewAll')}
                        <ChevronRight size={11} />
                      </span>
                    </div>
                    <div>
                      {[...notes].sort((a, b) => ((b.updatedAt || b.createdAt) || '').localeCompare((a.updatedAt || a.createdAt) || '')).slice(0, 5).map(note => {
                        const pill = TYPE_PILLS[note.type]
                        return (
                          <div key={note.id}
                            onClick={() => { if (note.type === 'mindmap') onOpenMindmap(note); else onOpenNote(note) }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '10px 0',
                              borderBottom: isModern ? '1px solid var(--border-soft, var(--border))' : 'none',
                              borderRadius: isModern ? 0 : 4, cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { if (isModern) { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.margin = '0 -8px'; e.currentTarget.style.padding = '10px 8px'; e.currentTarget.style.borderRadius = '5px' } else { e.currentTarget.style.background = 'rgba(255,255,255,0.6)' } }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; if (isModern) { e.currentTarget.style.margin = '0'; e.currentTarget.style.padding = '10px 0'; e.currentTarget.style.borderRadius = '0' } }}
                          >
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              height: 18, minWidth: 38, padding: '0 6px', borderRadius: 3,
                              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500,
                              letterSpacing: '0.02em',
                              background: pill?.bg ?? 'var(--tag-txt-bg)', color: pill?.color ?? 'var(--tag-txt-color)',
                            }}>{pill?.label ?? note.type.toUpperCase()}</span>
                            <span style={{
                              flex: 1, fontSize: 13, color: 'var(--ink)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {note.title}
                            </span>
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)',
                              flexShrink: 0,
                            }}>
                              {formatDate(note.updatedAt || note.createdAt, locale)}
                            </span>
                          </div>
                        )
                      })}
                      {notes.length === 0 && (
                        <div style={{
                          padding: '32px 0', textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12,
                        }}>
                          {t('library.emptyNotesPoetic')} · <span
                            onClick={() => setShowNotePicker(true)}
                            style={{ color: 'var(--ink)', cursor: 'pointer', borderBottom: '1px solid var(--ink-ghost)', paddingBottom: 1 }}
                          >{t('library.createNote')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Recent documents */}
                {documents.length > 0 && (
                  <div style={isModern ? {} : {
                    background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(28,26,23,0.08)',
                    borderRadius: 6, padding: '22px 24px',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: isModern ? 'baseline' : 'center', justifyContent: 'space-between',
                      marginBottom: isModern ? 14 : 18,
                      paddingBottom: isModern ? 0 : 14,
                      borderBottom: isModern ? 'none' : '1px solid rgba(28,26,23,0.08)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                          letterSpacing: isModern ? '.01em' : '0.06em',
                          fontFamily: isModern ? undefined : 'var(--font-display)',
                        }}>
                          {t('library.recentDocs')}
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 400,
                          color: 'var(--ink-faint)',
                        }}>{documents.length}</span>
                      </div>
                      <span onClick={() => handleSectionChange('documents')}
                        style={{
                          fontSize: 12, color: 'var(--ink-mute)', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                        }}>
                        {t('library.viewAll')}
                        <ChevronRight size={11} />
                      </span>
                    </div>
                    <div>
                    {[...documents].sort((a, b) => ((b as any).lastReadAt || b.updatedAt || b.createdAt || '').localeCompare((a as any).lastReadAt || a.updatedAt || a.createdAt || '')).slice(0, 5).map(doc => {
                      const pill = TYPE_PILLS[doc.type]
                      const extLabel = doc.type === 'other' || (doc.type === 'txt' && doc.path && !doc.path.endsWith('.txt'))
                        ? (doc.path?.split('.').pop()?.toUpperCase() || (pill?.label ?? doc.type))
                        : (pill?.label ?? doc.type)
                      return (
                        <div key={doc.id}
                          onClick={() => onOpenDoc(doc)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 0',
                            borderBottom: isModern ? '1px solid var(--border-soft, var(--border))' : 'none',
                            borderRadius: isModern ? 0 : 4, cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { if (isModern) { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.margin = '0 -8px'; e.currentTarget.style.padding = '10px 8px'; e.currentTarget.style.borderRadius = '5px' } else { e.currentTarget.style.background = 'rgba(255,255,255,0.6)' } }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; if (isModern) { e.currentTarget.style.margin = '0'; e.currentTarget.style.padding = '10px 0'; e.currentTarget.style.borderRadius = '0' } }}
                        >
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            height: 18, minWidth: 38, padding: '0 6px', borderRadius: 3,
                            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500,
                            letterSpacing: '0.02em',
                            background: pill?.bg ?? 'var(--tag-txt-bg)', color: pill?.color ?? 'var(--tag-txt-color)',
                          }}>{extLabel}</span>
                          <span style={{
                            flex: 1, fontSize: 13, color: 'var(--ink)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {doc.title}
                          </span>
                          {isModern && (doc as any).author && <span style={{
                            color: 'var(--ink-faint)', fontSize: 12, flexShrink: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140,
                          }}>{(doc as any).author}</span>}
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)',
                            flexShrink: 0, width: 64, textAlign: 'right',
                          }}>
                            {formatDate((doc as any).lastReadAt || doc.updatedAt || doc.createdAt, locale)}
                          </span>
                        </div>
                      )
                    })}
                    </div>
                  </div>
                )}
              </div>

              {/* Annotations section */}
              {recentAnnotations.length > 0 && (
                <div style={isModern ? { marginBottom: 40 } : {
                  background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(28,26,23,0.08)',
                  borderRadius: 6, padding: '22px 24px',
                }}>
                  <div style={{
                    display: 'flex', alignItems: isModern ? 'baseline' : 'center', justifyContent: 'space-between',
                    marginBottom: isModern ? 14 : 20,
                    paddingBottom: isModern ? 0 : 14,
                    borderBottom: isModern ? 'none' : '1px solid rgba(28,26,23,0.08)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                        letterSpacing: isModern ? '.01em' : '0.06em',
                        fontFamily: isModern ? undefined : 'var(--font-display)',
                      }}>
                        {t('library.recentAnnotations')}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 400,
                        color: 'var(--ink-faint)',
                      }}>{recentAnnotations.slice(0, 6).length} / {recentAnnotations.length}</span>
                    </div>
                    <span onClick={() => handleSectionChange('annotations' as any)}
                      style={{
                        fontSize: 12, color: 'var(--ink-mute)', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                      {t('library.viewAll')}
                      <ChevronRight size={11} />
                    </span>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isModern ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: isModern ? 16 : 20,
                  }}>
                    {recentAnnotations.slice(0, isModern ? 3 : 6).map((ann, i) => {
                      const markerColors = ['var(--ink)', '#10B981', '#F59E0B', '#3B82F6']
                      const markerColor = ann.color || markerColors[i % markerColors.length]
                      return (
                        <div key={ann.id}
                          onClick={() => { const doc = documents.find(d => d.id === ann.docId); if (doc) onOpenDoc(doc) }}
                          style={isModern ? {
                            background: 'var(--surface-raised)', border: '1px solid var(--border)',
                            borderRadius: 8, padding: 16, cursor: 'pointer', transition: 'all 0.15s',
                            display: 'flex', flexDirection: 'column', gap: 10, minHeight: 140,
                          } : {
                            borderLeft: `3px solid ${markerColor}`,
                            padding: '4px 0 4px 16px', cursor: 'pointer',
                            transition: 'transform 0.2s',
                          }}
                          onMouseEnter={e => { if (isModern) { e.currentTarget.style.borderColor = 'var(--ink-ghost)'; e.currentTarget.style.transform = 'translateY(-1px)' } else { e.currentTarget.style.transform = 'translateX(2px)' } }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; if (isModern) e.currentTarget.style.borderColor = 'var(--border)' }}
                        >
                          {isModern && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 3, height: 14, background: markerColor, borderRadius: 2 }} />
                              <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)',
                                letterSpacing: '0.06em', textTransform: 'uppercase',
                              }}>{ann.type === 'highlight' ? 'Highlight' : ann.type === 'note' ? 'Note' : ann.type}</span>
                            </div>
                          )}
                          {ann.selectedText ? (
                            <div style={{
                              fontSize: 13, color: 'var(--ink)', lineHeight: 1.55,
                              flex: isModern ? 1 : undefined, marginBottom: isModern ? 0 : 8,
                              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}>
                              <em style={{ fontStyle: 'italic', color: 'var(--ink-soft)', fontWeight: 400 }}>
                                "{ann.selectedText}"
                              </em>
                            </div>
                          ) : ann.content ? (
                            <div style={{
                              fontSize: 13, color: 'var(--ink)', lineHeight: 1.55,
                              flex: isModern ? 1 : undefined, marginBottom: isModern ? 0 : 8,
                              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}>{ann.content}</div>
                          ) : (
                            <div style={{
                              fontSize: 13, color: 'var(--ink-mute)', fontStyle: 'italic',
                              flex: isModern ? 1 : undefined, marginBottom: isModern ? 0 : 8,
                            }}>
                              {ann.type === 'ink' ? t('library.inkAnnotation') : ann.type}
                            </div>
                          )}
                          {isModern ? (
                            <div style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              paddingTop: 10, borderTop: '1px solid var(--border-soft, var(--border))',
                            }}>
                              <div style={{
                                fontSize: 11, color: 'var(--ink-mute)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
                              }}>
                                <strong style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>{ann.docTitle}</strong>
                              </div>
                              <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)',
                                marginLeft: 8, flexShrink: 0,
                              }}>
                                {ann.page != null ? `P. ${String(ann.page + 1).padStart(2, '0')}` : ''}
                              </span>
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.5 }}>
                                <span style={{ color: 'var(--ink-soft)' }}>{ann.docTitle}</span>
                              </div>
                              <div style={{
                                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)',
                                letterSpacing: '0.08em',
                              }}>
                                {ann.page != null ? `P. ${ann.page + 1}` : ''}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>)}
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
  const { theme: appTheme, setTheme: setAppTheme } = useTheme()
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

      <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>{t('settings.appTheme')}</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        {APP_THEMES.map(th => {
          const active = th.key === appTheme
          const previewColors = th.key === 'minimal'
            ? { bg: '#FAFAF9', titleBar: '#F5F5F4', titleBorder: '#E7E5E4', sidebar: '#FAFAF9', sidebarBorder: '#E7E5E4', heading: '#18181B', sub: '#A1A1AA', line: '#E7E5E4' }
            : th.key === 'notebook'
            ? { bg: '#F3EEE5', titleBar: '#F3EEE5', titleBorder: '#E0D8C8', sidebar: '#F3EEE5', sidebarBorder: '#E0D8C8', heading: '#2C2C2C', sub: '#E8825D', line: '#E0D8C8' }
            : { bg: '#F7F3EA', titleBar: 'linear-gradient(180deg, #EFE8D7, #E8E0CC)', titleBorder: '#E5DCC4', sidebar: '#F7F3EA', sidebarBorder: 'rgba(28,26,23,0.08)', heading: '#1C1A17', sub: '#9A938A', line: '#E5DCC4' }
          return (
            <div
              key={th.key}
              onClick={() => setAppTheme(th.key)}
              style={{
                width: 120, cursor: 'pointer', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              }}
            >
              <div style={{
                width: 100, height: 64, borderRadius: 8, overflow: 'hidden',
                border: active ? '2px solid var(--accent)' : '1px solid var(--border-solid)',
                boxShadow: active ? '0 0 0 2px var(--accent-soft)' : 'none',
                transition: 'all 0.15s ease',
                background: previewColors.bg,
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  height: 10,
                  background: previewColors.titleBar,
                  borderBottom: `1px solid ${previewColors.titleBorder}`,
                }} />
                <div style={{ flex: 1, display: 'flex' }}>
                  <div style={{
                    width: 20,
                    background: previewColors.sidebar,
                    borderRight: `1px solid ${previewColors.sidebarBorder}`,
                  }} />
                  <div style={{ flex: 1, padding: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ height: 4, width: '60%', borderRadius: 1, background: previewColors.heading }} />
                    <div style={{ height: 3, width: '40%', borderRadius: 1, background: previewColors.sub }} />
                    <div style={{ height: 3, width: '80%', borderRadius: 1, background: previewColors.line }} />
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 12, color: active ? 'var(--accent)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>
                {locale === 'zh' ? th.labelZh : th.label}
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
