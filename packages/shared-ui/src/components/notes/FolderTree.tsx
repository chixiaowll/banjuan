import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronRight, FilePlus, FolderPlus, Pencil, Trash2, Folder, FolderOpen, FileText, Brain, PenTool } from 'lucide-react'
import { useT } from '../../i18n/index.js'
import { useBanjuanAPI } from '../../api.js'

interface NoteInfo {
  id: string
  title: string
  path: string
  type?: string
}

interface TreeNode {
  type: 'dir' | 'file'
  name: string
  path: string
  children?: TreeNode[]
  note?: NoteInfo
}

interface Props {
  onSelectFolder: (folder: string | null) => void
  onOpenNote: (note: NoteInfo) => void
  selectedFolder: string | null
  activeNoteId?: string
}

function buildFileTree(dirs: string[], notes: NoteInfo[]): TreeNode[] {
  const root: Record<string, any> = {}

  for (const dir of dirs) {
    const parts = dir.split('/')
    let current = root
    let pathSoFar = ''
    for (const part of parts) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part
      if (!current[part]) current[part] = { __path: pathSoFar, __type: 'dir' }
      current = current[part]
    }
  }

  for (const note of notes) {
    const parts = (note.path || '').split('/')
    const filename = parts.pop() || note.title
    let current = root
    let pathSoFar = ''
    for (const part of parts) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part
      if (!current[part]) current[part] = { __path: pathSoFar, __type: 'dir' }
      current = current[part]
    }
    const key = `file:${note.id}`
    current[key] = { __path: note.path, __type: 'file', __note: note, __name: filename.replace('.json', '') }
  }

  function toNodes(obj: Record<string, any>): TreeNode[] {
    const nodes: TreeNode[] = []
    for (const k of Object.keys(obj)) {
      if (k.startsWith('__')) continue
      const item = obj[k]
      if (item.__type === 'file') {
        nodes.push({ type: 'file', name: item.__note.title, path: item.__path, note: item.__note })
      } else {
        nodes.push({ type: 'dir', name: k, path: item.__path, children: toNodes(item) })
      }
    }
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })
    return nodes
  }

  return toNodes(root)
}

interface ContextMenuState {
  x: number
  y: number
  node: TreeNode | null
  isRoot: boolean
}

function ContextMenu({ state, onClose, onAction }: {
  state: ContextMenuState
  onClose: () => void
  onAction: (action: string, node: TreeNode | null) => void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const iconMap: Record<string, React.ReactNode> = {
    newNote: <FilePlus size={14} />,
    newDir: <FolderPlus size={14} />,
    rename: <Pencil size={14} />,
    delete: <Trash2 size={14} />,
  }
  const items: Array<{ label: string; action: string }> = []
  const isRoot = state.isRoot || state.node?.path === '__root'
  if (isRoot || state.node?.type === 'dir') {
    items.push({ label: t('folderTree.newNote'), action: 'newNote' })
    items.push({ label: t('folderTree.newFolder'), action: 'newDir' })
  }
  if (state.node && !isRoot) {
    items.push({ label: t('folderTree.rename'), action: 'rename' })
    items.push({ label: t('folderTree.delete'), action: 'delete' })
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', left: state.x, top: state.y, zIndex: 9999,
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 6, padding: '4px 0', minWidth: 140,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      {items.map(item => (
        <div
          key={item.action}
          onClick={() => { onAction(item.action, state.node); onClose() }}
          style={{
            padding: '6px 12px', fontSize: 12, cursor: 'pointer',
            color: item.action === 'delete' ? '#f38ba8' : 'var(--text)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {iconMap[item.action]}{item.label}
        </div>
      ))}
    </div>
  )
}

interface InlineInputState {
  type: 'newDir' | 'newNote' | 'renameDir' | 'renameNote'
  parentDir: string | null
  node?: TreeNode
  defaultValue?: string
}

function InlineInput({ depth, icon, defaultValue, onConfirm, onCancel }: {
  depth: number
  icon: string
  defaultValue: string
  onConfirm: (value: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const val = inputRef.current?.value.trim()
      if (val) onConfirm(val)
      else onCancel()
    }
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div style={{
      height: 30, paddingLeft: 12 + depth * 16, paddingRight: 12,
      marginLeft: 8, marginRight: 8,
      display: 'flex', alignItems: 'center', gap: 7, fontSize: 14,
    }}>
      <span style={{ flexShrink: 0, lineHeight: 1, display: 'inline-flex', color: 'var(--text-muted)' }}>
        {icon === '📁' ? <Folder size={16} /> : <FileText size={16} />}
      </span>
      <input
        ref={inputRef}
        defaultValue={defaultValue}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        style={{
          flex: 1, fontSize: 14, padding: '2px 6px',
          border: '1px solid var(--accent)', borderRadius: 4,
          background: 'var(--bg)', color: 'var(--text)', outline: 'none',
          minWidth: 0,
        }}
      />
    </div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useT()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onConfirm()
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onConfirm, onCancel])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.3)',
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '16px 20px', minWidth: 240,
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontSize: 13, marginBottom: 16 }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '4px 12px', fontSize: 12, border: '1px solid var(--border)',
            borderRadius: 4, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)',
          }}>{t('folderTree.cancel')}</button>
          <button onClick={onConfirm} style={{
            padding: '4px 12px', fontSize: 12, border: 'none',
            borderRadius: 4, background: '#f38ba8', color: '#fff', cursor: 'pointer',
          }}>{t('folderTree.delete')}</button>
        </div>
      </div>
    </div>
  )
}

function TreeItem({ node, depth, expandedSet, onToggle, onOpenNote, onContextMenu, activeNoteId, inlineInput, onInlineConfirm, onInlineCancel, dropTargetPath, onDragStart, onDragOver, onDragLeave, onDrop }: {
  node: TreeNode
  depth: number
  expandedSet: Set<string>
  onToggle: (path: string) => void
  onOpenNote: (note: NoteInfo) => void
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void
  activeNoteId?: string
  inlineInput: InlineInputState | null
  onInlineConfirm: (value: string) => void
  onInlineCancel: () => void
  dropTargetPath: string | null
  onDragStart: (e: React.DragEvent, node: TreeNode) => void
  onDragOver: (e: React.DragEvent, node: TreeNode) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, node: TreeNode) => void
}) {
  const isDir = node.type === 'dir'
  const expanded = expandedSet.has(node.path)
  const isActive = !isDir && node.note?.id === activeNoteId
  const isDropTarget = dropTargetPath === node.path && isDir

  const showInlineHere = inlineInput && (
    (inlineInput.type === 'newDir' || inlineInput.type === 'newNote') &&
    ((inlineInput.parentDir === null && node.path === '__root') ||
     (inlineInput.parentDir === node.path))
  )

  const isRenaming = inlineInput && (
    (inlineInput.type === 'renameDir' || inlineInput.type === 'renameNote') &&
    inlineInput.node?.path === node.path
  )

  return (
    <>
      {isRenaming ? (
        <InlineInput
          depth={depth}
          icon={isDir ? '📁' : '📄'}
          defaultValue={inlineInput!.defaultValue || node.name}
          onConfirm={onInlineConfirm}
          onCancel={onInlineCancel}
        />
      ) : (
        <div
          draggable={!isDir || node.path === '__root' ? (node.type === 'file') : false}
          onDragStart={e => onDragStart(e, node)}
          onDragOver={e => onDragOver(e, node)}
          onDragLeave={onDragLeave}
          onDrop={e => onDrop(e, node)}
          onClick={() => isDir ? onToggle(node.path) : node.note && onOpenNote(node.note)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, node) }}
          title={node.name}
          style={{
            height: 30,
            paddingLeft: 12 + depth * 16,
            paddingRight: 12,
            marginLeft: 8,
            marginRight: 8,
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            background: isDropTarget ? 'rgba(49,130,206,0.1)' : isActive ? 'var(--accent-soft)' : 'transparent',
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            outline: isDropTarget ? '1px dashed #3182ce' : 'none',
            borderRadius: 'var(--radius-sm, 4px)',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => { if (!isActive && !isDropTarget) e.currentTarget.style.background = 'var(--hover)' }}
          onMouseLeave={e => { if (!isActive && !isDropTarget) e.currentTarget.style.background = isActive ? 'var(--accent-soft)' : 'transparent' }}
        >
          <span style={{ flexShrink: 0, lineHeight: 1, display: 'inline-flex', color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
            {isDir ? (expanded ? <FolderOpen size={16} /> : <Folder size={16} />) : (node.note?.type === 'mindmap' ? <Brain size={16} /> : node.note?.type === 'handwriting' ? <PenTool size={16} /> : <FileText size={16} />)}
          </span>
          <span style={{
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontWeight: isActive ? 600 : 400,
          }}>
            {node.name}
          </span>
          {isDir && node.children && node.children.length > 0 && (
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
          )}
        </div>
      )}
      {isDir && expanded && (
        <>
          {showInlineHere && (
            <InlineInput
              depth={depth + 1}
              icon={inlineInput!.type === 'newDir' ? '📁' : '📄'}
              defaultValue={inlineInput!.defaultValue || ''}
              onConfirm={onInlineConfirm}
              onCancel={onInlineCancel}
            />
          )}
          {node.children?.map(child => (
            <TreeItem
              key={child.type + ':' + child.path}
              node={child}
              depth={depth + 1}
              expandedSet={expandedSet}
              onToggle={onToggle}
              onOpenNote={onOpenNote}
              onContextMenu={onContextMenu}
              activeNoteId={activeNoteId}
              inlineInput={inlineInput}
              onInlineConfirm={onInlineConfirm}
              onInlineCancel={onInlineCancel}
              dropTargetPath={dropTargetPath}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            />
          ))}
        </>
      )}
    </>
  )
}

export default function FolderTree({ onSelectFolder, onOpenNote, selectedFolder, activeNoteId }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const [dirs, setDirs] = useState<string[]>([])
  const [notes, setNotes] = useState<NoteInfo[]>([])
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [inlineInput, setInlineInput] = useState<InlineInputState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TreeNode | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const dragNoteRef = useRef<NoteInfo | null>(null)

  const load = useCallback(async () => {
    const [dirList, noteList] = await Promise.all([
      api.notes.listDirs(),
      api.notes.list({ sort: 'updated_at', order: 'desc' }),
    ])
    setDirs(dirList)
    setNotes(noteList as NoteInfo[])
    if (expandedSet.size === 0) {
      setExpandedSet(new Set(['__root', ...dirList]))
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    document.addEventListener('notes-changed', load)
    return () => document.removeEventListener('notes-changed', load)
  }, [load])

  const children = buildFileTree(dirs, notes)
  const rootNode: TreeNode = { type: 'dir', name: 'Notes', path: '__root', children }

  const handleToggle = (path: string) => {
    setExpandedSet(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    setContextMenu({ x: e.clientX, y: e.clientY, node, isRoot: false })
  }

  const handleRootContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, node: null, isRoot: true })
  }

  const getParentDir = (node: TreeNode | null): string | null => {
    if (!node) return null
    const dirPath = node.type === 'dir' ? node.path : (node.path.includes('/') ? node.path.substring(0, node.path.lastIndexOf('/')) : null)
    return dirPath === '__root' ? null : dirPath
  }

  const handleAction = (action: string, node: TreeNode | null) => {
    const parentDir = getParentDir(node)

    if (action === 'newDir') {
      if (node?.type === 'dir') {
        setExpandedSet(prev => new Set([...prev, node.path]))
      }
      setInlineInput({ type: 'newDir', parentDir })
    }

    if (action === 'newNote') {
      if (node?.type === 'dir') {
        setExpandedSet(prev => new Set([...prev, node.path]))
      }
      setInlineInput({ type: 'newNote', parentDir })
    }

    if (action === 'rename') {
      if (!node) return
      if (node.type === 'dir') {
        setInlineInput({ type: 'renameDir', parentDir, node, defaultValue: node.name })
      } else if (node.note) {
        setInlineInput({ type: 'renameNote', parentDir, node, defaultValue: node.note.title })
      }
    }

    if (action === 'delete') {
      if (!node) return
      setConfirmDelete(node)
    }
  }

  const notifyChanged = () => document.dispatchEvent(new Event('notes-changed'))

  const handleInlineConfirm = async (value: string) => {
    if (!inlineInput) return
    const { type, parentDir, node } = inlineInput
    setInlineInput(null)

    if (type === 'newDir') {
      const dirPath = parentDir ? `${parentDir}/${value}` : value
      await api.notes.createDir(dirPath)
      setExpandedSet(prev => new Set([...prev, dirPath]))
      await load()
      notifyChanged()
    }

    if (type === 'newNote') {
      try {
        const newNote = await api.notes.create({
          title: value,
          folder: parentDir ?? undefined,
        })
        await load()
        notifyChanged()
        onOpenNote(newNote)
      } catch (err: any) {
        if (err?.message?.includes('DUPLICATE_TITLE')) {
          alert(t('note.duplicateTitle' as any))
        } else {
          throw err
        }
        return
      }
    }

    if (type === 'renameDir' && node) {
      if (value === node.name) return
      const parts = node.path.split('/')
      parts[parts.length - 1] = value
      const newPath = parts.join('/')
      await api.notes.renameDir(node.path, newPath)
      await load()
      notifyChanged()
    }

    if (type === 'renameNote' && node?.note) {
      if (value === node.note.title) return
      await api.notes.update(node.note.id, { title: value })
      await load()
      notifyChanged()
    }
  }

  const handleDragStart = useCallback((e: React.DragEvent, node: TreeNode) => {
    if (node.type !== 'file' || !node.note) { e.preventDefault(); return }
    dragNoteRef.current = node.note
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', node.note.id)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, node: TreeNode) => {
    if (node.type !== 'dir') return
    const hasFiles = e.dataTransfer.types.includes('Files')
    if (!dragNoteRef.current && !hasFiles) return
    e.preventDefault()
    e.dataTransfer.dropEffect = hasFiles ? 'copy' : 'move'
    setDropTargetPath(node.path)
  }, [])

  const handleDragLeave = useCallback((_e: React.DragEvent) => {
    setDropTargetPath(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, node: TreeNode) => {
    e.preventDefault()
    setDropTargetPath(null)
    if (node.type !== 'dir') return

    const targetFolder = node.path === '__root' ? null : node.path

    // External file drop from Finder
    if (e.dataTransfer.files.length > 0 && !dragNoteRef.current) {
      if (!api.getPathForFile) return
      const paths: string[] = []
      for (const file of Array.from(e.dataTransfer.files)) {
        const p = api.getPathForFile(file)
        if (p) paths.push(p)
      }
      if (paths.length > 0 && api.notes.importMarkdown) {
        const results = await api.notes.importMarkdown(paths, targetFolder)
        const failed = results.filter(r => !r.success && r.error !== 'NOT_MARKDOWN')
        if (failed.length > 0) {
          alert(failed.map(r => `${r.title}: ${r.error}`).join('\n'))
        }
        await load()
        notifyChanged()
      }
      return
    }

    // Internal note move
    const note = dragNoteRef.current
    dragNoteRef.current = null
    if (!note) return

    const noteFolder = note.path.includes('/') ? note.path.substring(0, note.path.lastIndexOf('/')) : null
    if (targetFolder === noteFolder) return

    try {
      await api.notes.move(note.id, targetFolder)
      await load()
      notifyChanged()
    } catch (err: any) {
      if (err?.message?.includes('DUPLICATE_TITLE')) {
        alert(t('note.duplicateTitle' as any))
      }
    }
  }, [load, t])

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return
    const node = confirmDelete
    setConfirmDelete(null)
    if (node.type === 'file' && node.note) {
      await api.notes.delete(node.note.id)
    } else if (node.type === 'dir' && node.path !== '__root' && api.notes.deleteDir) {
      await api.notes.deleteDir(node.path)
    }
    await load()
    notifyChanged()
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onContextMenu={handleRootContextMenu}
    >
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0 80px' }}>
        <TreeItem
          node={rootNode}
          depth={0}
          expandedSet={expandedSet}
          onToggle={handleToggle}
          onOpenNote={onOpenNote}
          onContextMenu={handleContextMenu}
          activeNoteId={activeNoteId}
          inlineInput={inlineInput}
          onInlineConfirm={handleInlineConfirm}
          onInlineCancel={() => setInlineInput(null)}
          dropTargetPath={dropTargetPath}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      </div>

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onAction={handleAction}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={confirmDelete.type === 'dir' ? t('folderTree.confirmDeleteDir', confirmDelete.name) : t('folderTree.confirmDeleteNote', confirmDelete.name)}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
