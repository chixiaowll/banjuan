import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Info } from 'lucide-react'
import type { NoteType } from '../../components/notes/TemplatePicker.js'
import { useResizable } from '../../components/ResizeHandle.js'
import { useI18n } from '../../i18n/index.js'
import { useTheme, useThemeLayout } from '../../theme/index.js'
import { useBanjuanAPI } from '../../api.js'
import { notifyDocumentsChanged, notifyNotesChanged } from '../../utils/libraryEvents.js'
import { announceAllNotesChanged } from '../../utils/noteChanges.js'
import { toast, errorMessage } from '../../components/feedback.js'
import { useEscapeKey } from '../../utils/useEscapeKey.js'
import { useFitInViewport } from '../../utils/useFitInViewport.js'
import { type LibraryViewProps, type Document, type LibraryTag, type SidebarSection, buildDirTree, type DirNode, groupByDate } from './helpers.js'

/**
 * LibraryView's state, effects and actions. Everything it declares is returned,
 * and the view's parts read it through useLibrary() (LibraryContext.tsx).
 */
export function useLibraryState(props: LibraryViewProps) {
  const { rootPath, libraryName, onOpenDoc, onOpenNote, onOpenMindmap, onOpenPluginView, detailOpen = false, onToggleDetail, detailPortalTarget, onSwitchLibrary, onLibraryRenamed } = props
  const api = useBanjuanAPI()
  const { t, locale, setLocale } = useI18n()
  const { theme: appTheme } = useTheme()
  const layout = useThemeLayout()
  const isMinimal = appTheme === 'minimal'
  const isNotebook = appTheme === 'notebook'
  const isModern = isMinimal || isNotebook
  const [documents, setDocuments] = useState<Document[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [plugins, setPlugins] = useState<any[]>([])
  const [tags, setTags] = useState<LibraryTag[]>([])
  const [selectedSection, setSelectedSection] = useState<SidebarSection>('home')
  const [selectedDir, setSelectedDir] = useState<string | null>(null)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedItemDetail, setSelectedItemDetail] = useState<any>(null)
  const [selectedItemTags, setSelectedItemTags] = useState<LibraryTag[]>([])
  const [docStatuses, setDocStatuses] = useState<Record<string, string>>({})
  const [downloadProgress, setDownloadProgress] = useState<Record<string, { loaded: number; total: number } | null>>({})
  // Filter state (free-text search + the MD/MIND/HAND type pills) is remembered
  // per folder, not globally — see filterScope below. The type filter matches
  // actual item.type, kept separate from search so a "mindmap" title doesn't
  // match the MIND pill.
  const [searchQueryMap, setSearchQueryMap] = useState<Record<string, string>>({})
  const [typeFilterMap, setTypeFilterMap] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState<'type' | 'title' | 'createdAt' | 'updatedAt' | null>('updatedAt')
  const [sortAsc, setSortAsc] = useState(false)   // newest first
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [showNotePicker, setShowNotePicker] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: string; dirPath?: string; noteId?: string; noteTitle?: string; docId?: string; docTitle?: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useFitInViewport(menuRef)
  const [moveDocDialog, setMoveDocDialog] = useState<{ docId: string; docTitle: string } | null>(null)
  const [docDirs, setDocDirs] = useState<string[]>([])
  const [showDocFolderInput, setShowDocFolderInput] = useState(false)
  const [showFolderInput, setShowFolderInput] = useState(false)
  const [showRenameInput, setShowRenameInput] = useState(false)
  const [renameInputValue, setRenameInputValue] = useState('')
  const renameInputElRef = useRef<HTMLInputElement>(null)
  const [renameTarget, setRenameTarget] = useState<{ type: 'dir' | 'docDir' | 'note' | 'library'; dirPath?: string; noteId?: string } | null>(null)
  const [noteDirs, setNoteDirs] = useState<string[]>([])
  const [selectedNoteDir, setSelectedNoteDir] = useState<string | null>(null)

  // Filters are scoped to the current section + folder, so each folder keeps its
  // own search/type selection. A folder not visited before defaults to "全部"
  // (empty), and switching folders never carries the previous folder's filter.
  const filterScope = `${selectedSection}:${selectedSection === 'documents' ? (selectedDir ?? '') : (selectedNoteDir ?? '')}`
  const searchQuery = searchQueryMap[filterScope] ?? ''
  const setSearchQuery = useCallback((q: string) => setSearchQueryMap(m => ({ ...m, [filterScope]: q })), [filterScope])
  const typeFilter = typeFilterMap[filterScope] ?? ''
  const setTypeFilter = useCallback((tp: string) => setTypeFilterMap(m => ({ ...m, [filterScope]: tp })), [filterScope])
  const [expandedNoteDirs, setExpandedNoteDirs] = useState<Set<string>>(new Set())
  const [docSectionExpanded, setDocSectionExpanded] = useState(true)
  const [noteSectionExpanded, setNoteSectionExpanded] = useState(true)
  const [tagDocSectionExpanded, setTagDocSectionExpanded] = useState(true)
  const [tagNoteSectionExpanded, setTagNoteSectionExpanded] = useState(true)
  const [tagsWithCounts, setTagsWithCounts] = useState<Array<{ id: string; name: string; color: string | null; count: number }>>([])
  const [noteDragOver, setNoteDragOver] = useState(false)
  const [exportDirPath, setExportDirPath] = useState<string | null>(null)
  const [showExportDialog, setShowExportDialog] = useState(false)
  // Esc closes the topmost overlay (see useEscapeKey).
  useEscapeKey(!!contextMenu, () => setContextMenu(null))
  useEscapeKey(showFolderInput, () => setShowFolderInput(false))
  useEscapeKey(showDocFolderInput, () => setShowDocFolderInput(false))
  useEscapeKey(showRenameInput, () => setShowRenameInput(false))
  useEscapeKey(showExportDialog, () => setShowExportDialog(false))
  useEscapeKey(!!moveDocDialog, () => setMoveDocDialog(null))
  const composingRef = useRef(false)
  const [tagSearch, setTagSearch] = useState('')
  const [showAllTags, setShowAllTags] = useState(false)
  const [tagFilteredItems, setTagFilteredItems] = useState<any[] | null>(null)
  const [tagFilteredDocs, setTagFilteredDocs] = useState<any[]>([])
  const [tagFilteredNotes, setTagFilteredNotes] = useState<any[]>([])
  const [pluginViews, setPluginViews] = useState<Array<{ viewType: string; pluginId: string; displayText: string; icon?: string; singleton?: boolean }>>([])
  const pluginIconCache = useRef<Map<string, string>>(new Map())
  const [recentAnnotations, setRecentAnnotations] = useState<Array<{ id: string; docId: string; type: string; selectedText: string | null; content: string | null; color: string; page: number | null; createdAt: string; docTitle?: string }>>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => appTheme !== 'minimal' && appTheme !== 'notebook')
  const leftResize = useResizable(220, 160, 400, 'left')
  // detailOpen / onToggleDetail are controlled by the window-level right rail
  // in TabManager so the detail panel and plugin views stay mutually exclusive.
  const detailEmptyState = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '0 12px' }}>
      <Info size={28} style={{ opacity: 0.3 }} />
      <div style={{ fontSize: 13 }}>{t('detail.empty')}</div>
    </div>
  )

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
    const dirCounts: Record<string, number> = {}
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
    for (const note of notes) {
      const parts = note.path.split('/')
      if (parts.length <= 1) continue
      let pathSoFar = ''
      for (let i = 0; i < parts.length - 1; i++) {
        pathSoFar = pathSoFar ? pathSoFar + '/' + parts[i] : parts[i]
        dirCounts[pathSoFar] = (dirCounts[pathSoFar] || 0) + 1
      }
    }
    function toNodes(obj: Record<string, any>): DirNode[] {
      return Object.keys(obj)
        .filter(k => k !== '__path')
        .sort((a, b) => a.localeCompare(b, 'zh-CN'))
        .map(k => ({ name: k, path: obj[k].__path, children: toNodes(obj[k]), count: dirCounts[obj[k].__path] }))
    }
    return toNodes(root)
  }, [noteDirs, notes])

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const loadDocuments = async () => {
    const docs = await api.documents.list()
    try {
      if (api.tags.namesByTarget) {
        // One call for every document's tags (was one IPC + query per document).
        const byId = await api.tags.namesByTarget('document')
        docs.forEach((d: any) => { d.tags = byId[d.id] ?? [] })
      } else {
        const tagResults = await Promise.all(docs.map(d => api.tags.forTarget(d.id, 'document').catch(() => [])))
        docs.forEach((d: any, i) => { d.tags = tagResults[i].map((t: any) => t.name) })
      }
    } catch {}
    setDocuments(docs)
    try { const dirs = await api.documents.listDirs(); setDocExtraDirs(dirs) } catch {}
  }

  // Sync status is shown only for the selected document, so fetch just that one
  // (it used to be fetched serially for every document on each library load).
  useEffect(() => {
    if (selectedSection !== 'documents' || !selectedItemId) return
    let cancelled = false
    api.sync.getDocStatus(selectedItemId)
      .then(s => { if (!cancelled) setDocStatuses(prev => ({ ...prev, [selectedItemId]: s })) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedSection, selectedItemId])

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

  // "View all" expands the home list in place (there is no separate annotations
  // page); the limit lives in a ref so background reloads keep the expansion.
  const [showAllAnnotations, setShowAllAnnotations] = useState(false)
  const annotationLimitRef = useRef(8)
  const toggleAllAnnotations = () => {
    const next = !showAllAnnotations
    setShowAllAnnotations(next)
    annotationLimitRef.current = next ? 100 : 8
    if (next) void loadRecentAnnotations()
  }

  const loadRecentAnnotations = async () => {
    try {
      const list = await api.annotations.listRecent?.(annotationLimitRef.current) ?? []
      setRecentAnnotations(list as any)
    } catch { setRecentAnnotations([]) }
  }

  const loadPlugins = async () => {
    if (!api.plugins) return
    const list = await api.plugins.listAll()
    setPlugins(list)
    try {
      const views = await api.plugins.getViews()
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

  // Added from outside this window — CLI, web clipper, scripts via the local API.
  useEffect(() => api.library.onExternalChange?.((kind) => {
    if (kind !== 'notes') { loadDocuments(); loadRecentAnnotations(); notifyDocumentsChanged() }
    if (kind !== 'documents') { notifyNotesChanged(); announceAllNotesChanged() }   // open editors follow too
    loadTags()
  }), [])

  useEffect(() => {
    document.addEventListener('tags-changed', loadTags)
    return () => document.removeEventListener('tags-changed', loadTags)
  }, [])

  useEffect(() => {
    if (!selectedTag) {
      setTagFilteredItems(null)
      setTagFilteredDocs([])
      setTagFilteredNotes([])
      return
    }
    const tagName = tagsWithCounts.find(t => t.id === selectedTag)?.name
    if (!tagName) { setTagFilteredItems(null); setTagFilteredDocs([]); setTagFilteredNotes([]); return }
    const load = async () => {
      const [docs, noteList] = await Promise.all([
        api.documents.list({ tag: tagName }),
        api.notes.list({ tag: tagName }),
      ])
      setTagFilteredDocs(docs)
      setTagFilteredNotes(noteList)
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
    setShowFolderInput(true)
  }

  const handleFolderInputConfirm = async (name: string) => {
    setShowFolderInput(false)
    if (!name) return
    const dirPath = selectedNoteDir ? `${selectedNoteDir}/${name}` : name
    await api.notes.createDir(dirPath)
    await loadNoteDirs()
  }

  const handleRenameDir = () => {
    if (!contextMenu?.dirPath) return
    const dirName = contextMenu.dirPath.split('/').pop() || ''
    // Document folders live in the library root, note folders under .banjuan/notes.
    setRenameTarget({ type: contextMenu.type === 'docDir' ? 'docDir' : 'dir', dirPath: contextMenu.dirPath })
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
    const name = (renameInputElRef.current?.value ?? renameInputValue).trim()
    setShowRenameInput(false)
    if (!name || !renameTarget) return
    if ((renameTarget.type === 'dir' || renameTarget.type === 'docDir') && renameTarget.dirPath) {
      const oldPath = renameTarget.dirPath
      const parts = oldPath.split('/')
      parts[parts.length - 1] = name
      const newPath = parts.join('/')
      if (newPath !== oldPath) {
        // Keep the folder being browsed selected under its new name.
        const follow = (p: string | null) => p === oldPath || p?.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p
        try {
          if (renameTarget.type === 'docDir') {
            if (!api.documents.renameDir) return
            await api.documents.renameDir(oldPath, newPath)
            setSelectedDir(follow(selectedDir))
            await loadDocuments()
            notifyDocumentsChanged()
          } else {
            await api.notes.renameDir(oldPath, newPath)
            setSelectedNoteDir(follow(selectedNoteDir))
            await loadNoteDirs()
            await loadNotes()
            notifyNotesChanged()
          }
        } catch (e) {
          toast.error(errorMessage(e) === 'DIR_EXISTS' ? t('library.folderExists', name) : t('library.renameFailed', errorMessage(e)))
        }
      }
    } else if (renameTarget.type === 'note' && renameTarget.noteId) {
      await api.notes.update(renameTarget.noteId, { title: name })
      await loadNotes()
    } else if (renameTarget.type === 'library') {
      await api.library.rename?.(name)
      onLibraryRenamed?.(name)
    }
    setRenameTarget(null)
  }

  const [notePickerError, setNotePickerError] = useState<string | null>(null)

  const handleNoteTemplateSelect = async (templateId: string | null, title: string, type: NoteType, content?: string) => {
    try {
      const note = await api.notes.create({
        title,
        folder: selectedNoteDir ?? undefined,
        ...(type !== 'markdown' ? { type } : content ? { content } : { templateId: templateId ?? undefined }),
      })
      setNotePickerError(null)
      setShowNotePicker(false)
      await loadNotes()
      await loadNoteDirs()
      if (type === 'mindmap') onOpenMindmap(note)
      else onOpenNote(note)
    } catch (err: any) {
      if (err?.message?.includes('DUPLICATE_TITLE')) {
        setNotePickerError(t('note.duplicateTitle'))
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

  const handleDocFolderInputConfirm = async (name: string) => {
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
      notifyDocumentsChanged()
    } else if (selectedSection === 'notes') {
      await api.notes.delete(id)
      await loadNotes()
      notifyNotesChanged()
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
      toast.error(t('detail.downloadFailedReason', err.message))
    } finally {
      setDownloadProgress(prev => ({ ...prev, [docId]: null }))
    }
  }

  const handleUpload = async (docId: string) => {
    try { await api.sync.stubUpload(docId); await loadDocuments() }
    catch (err: any) { toast.error(t('detail.uploadFailedReason', err.message)) }
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

    if (typeFilter) {
      items = items.filter((item: any) => item.type === typeFilter)
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
        const cmp = va.localeCompare(vb, 'zh-CN') ||
          (a.title || a.name || '').localeCompare(b.title || b.name || '', 'zh-CN')
        return sortAsc ? cmp : -cmp
      })
    }

    return items
  }

  const displayItems = getDisplayItems()
  // The folder being browsed in this section — shown in the breadcrumb and as the page title.
  const currentDir = selectedSection === 'documents' ? selectedDir : selectedSection === 'notes' ? selectedNoteDir : null
  const dirSegments = currentDir ? currentDir.split('/').filter(Boolean) : []
  const sectionLabel = selectedSection === 'documents' ? t('library.documents') : t('library.notes')
  const setCurrentDir = (dir: string | null) => {
    if (selectedSection === 'documents') setSelectedDir(dir); else setSelectedNoteDir(dir)
    setSelectedItemId(null)
    setSelectedItemDetail(null)
  }
  // Day headers only make sense when sorted by a date; title/type sorts are one flat list.
  const groupItems = (items: any[]) =>
    sortKey === 'title' || sortKey === 'type'
      ? [{ label: '', items }]
      : groupByDate(items, locale, sortKey === 'createdAt' ? 'createdAt' : 'updatedAt')
  // "{0} notes" with the number emphasised, whatever the word order of the locale.
  const countLabel = (key: 'library.docCount' | 'library.noteCount' | 'library.totalCount' | 'home.annotationCount', n: number) => {
    const [pre, post] = t(key, '\u0000').split('\u0000')
    return <>{pre}<strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{n}</strong>{post}</>
  }

  const sb = layout.sidebar
  const sidebarStyle: React.CSSProperties = {
    width: sidebarCollapsed ? sb.collapsedWidth : (layout.sidebarResizable ? leftResize.width : sb.width),
    minWidth: sidebarCollapsed ? sb.collapsedWidth : sb.minWidth,
    background: sb.background,
    borderRight: `1px solid ${sb.borderColor}`, display: 'flex',
    flexDirection: 'column', overflow: 'hidden', userSelect: 'none',
    transition: 'width 0.2s ease, min-width 0.2s ease',
    padding: sb.padding && !sidebarCollapsed ? sb.padding : undefined,
  }

  const sidebarItemStyle = (active: boolean): React.CSSProperties => ({
    width: sidebarCollapsed ? sb.collapsedItemSize : 'auto',
    height: sidebarCollapsed ? sb.collapsedItemSize : sb.itemHeight,
    display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 10,
    padding: sidebarCollapsed ? '0' : sb.itemPadding,
    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
    margin: sidebarCollapsed ? '3px auto' : sb.itemMargin,
    fontSize: sb.itemFontSize, cursor: 'pointer',
    fontFamily: sb.fontFamily,
    fontWeight: active ? 500 : 400,
    color: active ? sb.activeColor : sb.inactiveColor,
    background: active ? sb.activeBackground : 'transparent',
    borderRadius: sidebarCollapsed ? sb.collapsedRadius : sb.itemRadius,
    boxShadow: active ? sb.activeShadow : 'none',
    transition: 'all 0.12s ease',
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
    padding: layout.toolbar.padding,
    borderBottom: layout.toolbar.showBorder ? '1px solid var(--border)' : 'none',
    gap: layout.toolbar.gap, flexShrink: 0,
    overflow: 'hidden',
  }

  const detailHeaderStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  }
  const detailCollapseBtnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, padding: 0, border: 'none', background: 'transparent',
    color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 6,
  }

  return {
    rootPath, libraryName, onOpenDoc, onOpenNote, onOpenMindmap, onOpenPluginView, detailOpen,
    onToggleDetail, detailPortalTarget, onSwitchLibrary, onLibraryRenamed, api, t, locale,
    setLocale, appTheme, layout, isMinimal, isNotebook, isModern, documents, setDocuments, notes,
    setNotes, plugins, setPlugins, tags, setTags, selectedSection, setSelectedSection, selectedDir,
    setSelectedDir, expandedDirs, setExpandedDirs, selectedItemId, setSelectedItemId,
    selectedItemDetail, setSelectedItemDetail, selectedItemTags, setSelectedItemTags, docStatuses,
    setDocStatuses, downloadProgress, setDownloadProgress, searchQueryMap, setSearchQueryMap,
    typeFilterMap, setTypeFilterMap, sortKey, setSortKey, sortAsc, setSortAsc, selectedTag,
    setSelectedTag, showNotePicker, setShowNotePicker, contextMenu, setContextMenu, menuRef,
    moveDocDialog, setMoveDocDialog, docDirs, setDocDirs, showDocFolderInput,
    setShowDocFolderInput, showFolderInput, setShowFolderInput, showRenameInput,
    setShowRenameInput, renameInputValue, setRenameInputValue, renameInputElRef, renameTarget,
    setRenameTarget, noteDirs, setNoteDirs, selectedNoteDir, setSelectedNoteDir, filterScope,
    searchQuery, setSearchQuery, typeFilter, setTypeFilter, expandedNoteDirs, setExpandedNoteDirs,
    docSectionExpanded, setDocSectionExpanded, noteSectionExpanded, setNoteSectionExpanded,
    tagDocSectionExpanded, setTagDocSectionExpanded, tagNoteSectionExpanded,
    setTagNoteSectionExpanded, tagsWithCounts, setTagsWithCounts, noteDragOver, setNoteDragOver,
    exportDirPath, setExportDirPath, showExportDialog, setShowExportDialog, composingRef,
    tagSearch, setTagSearch, showAllTags, setShowAllTags, tagFilteredItems, setTagFilteredItems,
    tagFilteredDocs, setTagFilteredDocs, tagFilteredNotes, setTagFilteredNotes, pluginViews,
    setPluginViews, pluginIconCache, recentAnnotations, setRecentAnnotations, sidebarCollapsed,
    setSidebarCollapsed, leftResize, detailEmptyState, docExtraDirs, setDocExtraDirs, dirTree,
    noteDirTree, toggleDir, loadDocuments, loadNotes, loadTags, loadNoteDirs, showAllAnnotations,
    setShowAllAnnotations, annotationLimitRef, toggleAllAnnotations, loadRecentAnnotations,
    loadPlugins, handleCreateNote, handleCreateFolder, handleFolderInputConfirm, handleRenameDir,
    handleRenameNote, handleRenameConfirm, notePickerError, setNotePickerError,
    handleNoteTemplateSelect, handleSidebarContextMenu, handleNoteItemContextMenu,
    handleDocFolderInputConfirm, handleDocItemContextMenu, handleDelete, handleDownload,
    handleUpload, handleSelectItem, handleSectionChange, getDisplayItems, displayItems, currentDir,
    dirSegments, sectionLabel, setCurrentDir, groupItems, countLabel, sb, sidebarStyle,
    sidebarItemStyle, ctxItemStyle, centerStyle, toolbarStyle, detailHeaderStyle,
    detailCollapseBtnStyle,
  }
}

export type LibraryState = ReturnType<typeof useLibraryState>
