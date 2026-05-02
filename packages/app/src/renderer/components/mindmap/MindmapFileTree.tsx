import React, { useState, useEffect, useCallback, useRef } from 'react'

interface MindmapInfo {
  id: string
  title: string
  path: string
}

interface TreeNode {
  type: 'dir' | 'file'
  name: string
  path: string
  children?: TreeNode[]
  mindmap?: MindmapInfo
}

interface Props {
  onOpenMindmap: (mm: MindmapInfo) => void
  activeMindmapId?: string
}

function buildFileTree(dirs: string[], mindmaps: MindmapInfo[]): TreeNode[] {
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

  for (const mm of mindmaps) {
    const parts = (mm.path || '').split('/')
    const filename = parts.pop() || mm.title
    let current = root
    let pathSoFar = ''
    for (const part of parts) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part
      if (!current[part]) current[part] = { __path: pathSoFar, __type: 'dir' }
      current = current[part]
    }
    const key = `file:${mm.id}`
    current[key] = { __path: mm.path, __type: 'file', __mm: mm, __name: filename.replace('.json', '') }
  }

  function toNodes(obj: Record<string, any>): TreeNode[] {
    const nodes: TreeNode[] = []
    for (const k of Object.keys(obj)) {
      if (k.startsWith('__')) continue
      const item = obj[k]
      if (item.__type === 'file') {
        nodes.push({ type: 'file', name: item.__mm.title, path: item.__path, mindmap: item.__mm })
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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const items: Array<{ label: string; action: string }> = []
  const isRoot = state.isRoot || state.node?.path === '__root'
  if (isRoot || state.node?.type === 'dir') {
    items.push({ label: '新建思维导图', action: 'newMindmap' })
    items.push({ label: '新建文件夹', action: 'newDir' })
  }
  if (state.node && !isRoot) {
    items.push({ label: '重命名', action: 'rename' })
    items.push({ label: '删除', action: 'delete' })
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
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}

interface InlineInputState {
  type: 'newDir' | 'newMindmap' | 'renameDir' | 'renameMindmap'
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
      padding: '2px 8px', paddingLeft: 12 + depth * 16,
      display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
    }}>
      <span style={{ width: 14, flexShrink: 0 }} />
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <input
        ref={inputRef}
        defaultValue={defaultValue}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        style={{
          flex: 1, fontSize: 12, padding: '1px 4px',
          border: '1px solid var(--accent)', borderRadius: 3,
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
          }}>取消</button>
          <button onClick={onConfirm} style={{
            padding: '4px 12px', fontSize: 12, border: 'none',
            borderRadius: 4, background: '#f38ba8', color: '#fff', cursor: 'pointer',
          }}>删除</button>
        </div>
      </div>
    </div>
  )
}

function TreeItem({ node, depth, expandedSet, onToggle, onOpenMindmap, onContextMenu, activeMindmapId, inlineInput, onInlineConfirm, onInlineCancel }: {
  node: TreeNode
  depth: number
  expandedSet: Set<string>
  onToggle: (path: string) => void
  onOpenMindmap: (mm: MindmapInfo) => void
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void
  activeMindmapId?: string
  inlineInput: InlineInputState | null
  onInlineConfirm: (value: string) => void
  onInlineCancel: () => void
}) {
  const isDir = node.type === 'dir'
  const expanded = expandedSet.has(node.path)
  const isActive = !isDir && node.mindmap?.id === activeMindmapId

  const showInlineHere = inlineInput && (
    (inlineInput.type === 'newDir' || inlineInput.type === 'newMindmap') &&
    ((inlineInput.parentDir === null && node.path === '__root') ||
     (inlineInput.parentDir === node.path))
  )

  const isRenaming = inlineInput && (
    (inlineInput.type === 'renameDir' || inlineInput.type === 'renameMindmap') &&
    inlineInput.node?.path === node.path
  )

  return (
    <>
      {isRenaming ? (
        <InlineInput
          depth={depth}
          icon={isDir ? '📁' : '🧠'}
          defaultValue={inlineInput!.defaultValue || node.name}
          onConfirm={onInlineConfirm}
          onCancel={onInlineCancel}
        />
      ) : (
        <div
          onClick={() => isDir ? onToggle(node.path) : node.mindmap && onOpenMindmap(node.mindmap)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, node) }}
          title={node.name}
          style={{
            padding: '3px 8px',
            paddingLeft: 12 + depth * 16,
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: isActive ? 'var(--selected)' : 'transparent',
          }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--hover)' }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
        >
          {isDir ? (
            <span style={{ width: 14, fontSize: 10, textAlign: 'center', flexShrink: 0 }}>
              {expanded ? '▾' : '▸'}
            </span>
          ) : (
            <span style={{ width: 14, flexShrink: 0 }} />
          )}
          <span style={{ flexShrink: 0 }}>{isDir ? (expanded ? '📂' : '📁') : '🧠'}</span>
          <span style={{
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontWeight: isActive ? 600 : 400,
          }}>
            {node.name}
          </span>
        </div>
      )}
      {isDir && expanded && (
        <>
          {showInlineHere && (
            <InlineInput
              depth={depth + 1}
              icon={inlineInput!.type === 'newDir' ? '📁' : '🧠'}
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
              onOpenMindmap={onOpenMindmap}
              onContextMenu={onContextMenu}
              activeMindmapId={activeMindmapId}
              inlineInput={inlineInput}
              onInlineConfirm={onInlineConfirm}
              onInlineCancel={onInlineCancel}
            />
          ))}
        </>
      )}
    </>
  )
}

export default function MindmapFileTree({ onOpenMindmap, activeMindmapId }: Props) {
  const [dirs, setDirs] = useState<string[]>([])
  const [mindmaps, setMindmaps] = useState<MindmapInfo[]>([])
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [inlineInput, setInlineInput] = useState<InlineInputState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TreeNode | null>(null)

  const load = useCallback(async () => {
    const [dirList, mmList] = await Promise.all([
      window.electronAPI.notes.listDirs(),
      window.electronAPI.notes.list({ type: 'mindmap' }),
    ])
    setDirs(dirList)
    setMindmaps(mmList as MindmapInfo[])
    if (expandedSet.size === 0) {
      setExpandedSet(new Set(['__root', ...dirList]))
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    document.addEventListener('notes-changed', load)
    return () => document.removeEventListener('notes-changed', load)
  }, [load])

  const children = buildFileTree(dirs, mindmaps)
  const rootNode: TreeNode = { type: 'dir', name: 'Mindmaps', path: '__root', children }

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

    if (action === 'newMindmap') {
      if (node?.type === 'dir') {
        setExpandedSet(prev => new Set([...prev, node.path]))
      }
      setInlineInput({ type: 'newMindmap', parentDir })
    }

    if (action === 'rename') {
      if (!node) return
      if (node.type === 'dir') {
        setInlineInput({ type: 'renameDir', parentDir, node, defaultValue: node.name })
      } else if (node.mindmap) {
        setInlineInput({ type: 'renameMindmap', parentDir, node, defaultValue: node.mindmap.title })
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
      await window.electronAPI.notes.createDir(dirPath)
      setExpandedSet(prev => new Set([...prev, dirPath]))
      await load()
      notifyChanged()
    }

    if (type === 'newMindmap') {
      const newMm = await window.electronAPI.notes.create({
        title: value,
        type: 'mindmap',
        folder: parentDir ?? undefined,
      })
      await load()
      notifyChanged()
      onOpenMindmap(newMm)
    }

    if (type === 'renameDir' && node) {
      if (value === node.name) return
      const parts = node.path.split('/')
      parts[parts.length - 1] = value
      const newPath = parts.join('/')
      await window.electronAPI.notes.renameDir(node.path, newPath)
      await load()
      notifyChanged()
    }

    if (type === 'renameMindmap' && node?.mindmap) {
      if (value === node.mindmap.title) return
      await window.electronAPI.notes.update(node.mindmap.id, { title: value })
      await load()
      notifyChanged()
    }
  }

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return
    const node = confirmDelete
    setConfirmDelete(null)
    if (node.type === 'file' && node.mindmap) {
      await window.electronAPI.notes.delete(node.mindmap.id)
    }
    await load()
    notifyChanged()
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onContextMenu={handleRootContextMenu}
    >
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        <TreeItem
          node={rootNode}
          depth={0}
          expandedSet={expandedSet}
          onToggle={handleToggle}
          onOpenMindmap={onOpenMindmap}
          onContextMenu={handleContextMenu}
          activeMindmapId={activeMindmapId}
          inlineInput={inlineInput}
          onInlineConfirm={handleInlineConfirm}
          onInlineCancel={() => setInlineInput(null)}
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
          message={`确定删除${confirmDelete.type === 'dir' ? `文件夹「${confirmDelete.name}」` : `思维导图「${confirmDelete.name}」`}？`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
