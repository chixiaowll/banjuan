import React, { useState, useEffect, useCallback } from 'react'
import { useT } from '../../i18n/index.js'

interface Folder {
  id: string
  name: string
  parentId: string | null
  children?: Folder[]
}

interface NoteInfo {
  id: string
  title: string
  folderId: string | null
}

interface Props {
  onSelectFolder: (folderId: string | null) => void
  onOpenNote: (note: NoteInfo) => void
  selectedFolderId: string | null
}

function FolderItem({ folder, depth, selectedId, onSelect, onRename, onDelete }: {
  folder: Folder
  depth: number
  selectedId: string | null
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [contextMenu, setContextMenu] = useState(false)
  const hasChildren = folder.children && folder.children.length > 0

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu(true)
  }

  return (
    <div>
      <div
        onClick={() => onSelect(folder.id)}
        onContextMenu={handleContextMenu}
        style={{
          padding: '4px 8px',
          paddingLeft: 8 + depth * 16,
          cursor: 'pointer',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: selectedId === folder.id ? 'var(--hover)' : 'transparent',
          borderRadius: 4,
        }}
      >
        <span
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          style={{ width: 16, textAlign: 'center', opacity: hasChildren ? 1 : 0 }}
        >
          {expanded ? '▾' : '▸'}
        </span>
        <span>📁</span>
        <span style={{ flex: 1 }}>{folder.name}</span>
      </div>
      {contextMenu && (
        <div style={{
          position: 'absolute', background: 'white', border: '1px solid #e5e7eb',
          borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 100, fontSize: 12,
        }}>
          <div style={{ padding: '6px 12px', cursor: 'pointer' }}
            onClick={() => { const name = prompt('Rename:', folder.name); if (name) onRename(folder.id, name); setContextMenu(false) }}>
            重命名
          </div>
          <div style={{ padding: '6px 12px', cursor: 'pointer', color: '#f38ba8' }}
            onClick={() => { onDelete(folder.id); setContextMenu(false) }}>
            删除
          </div>
        </div>
      )}
      {expanded && folder.children?.map(child => (
        <FolderItem key={child.id} folder={child} depth={depth + 1}
          selectedId={selectedId} onSelect={onSelect} onRename={onRename} onDelete={onDelete} />
      ))}
    </div>
  )
}

export default function FolderTree({ onSelectFolder, onOpenNote, selectedFolderId }: Props) {
  const t = useT()
  const [folders, setFolders] = useState<Folder[]>([])
  const [filter, setFilter] = useState<'all' | 'recent' | 'folder'>('all')
  const [notes, setNotes] = useState<NoteInfo[]>([])

  const loadFolders = useCallback(async () => {
    const tree = await window.electronAPI.folders.getTree()
    setFolders(tree)
  }, [])

  const loadNotes = useCallback(async () => {
    const opts: Record<string, unknown> = {}
    if (filter === 'folder' && selectedFolderId) {
      opts.folderId = selectedFolderId
    }
    if (filter === 'recent') {
      opts.sort = 'updated_at'
      opts.order = 'desc'
    }
    const list = await window.electronAPI.notes.list(opts as any)
    setNotes(list)
  }, [filter, selectedFolderId])

  useEffect(() => { loadFolders() }, [loadFolders])
  useEffect(() => { loadNotes() }, [loadNotes])

  const handleCreateFolder = async () => {
    const name = prompt(t('prompt.folderName') || 'Folder name:')
    if (!name) return
    await window.electronAPI.folders.create({ name, parentId: selectedFolderId ?? undefined })
    await loadFolders()
  }

  const handleRenameFolder = async (id: string, name: string) => {
    await window.electronAPI.folders.update(id, { name })
    await loadFolders()
  }

  const handleDeleteFolder = async (id: string) => {
    await window.electronAPI.folders.delete(id)
    await loadFolders()
    await loadNotes()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 4, padding: '8px 8px 4px', flexShrink: 0 }}>
        <button onClick={() => { setFilter('all'); onSelectFolder(null) }}
          style={{ fontSize: 11, fontWeight: filter === 'all' ? 600 : 400 }}>
          {t('library.allNotes') || '全部'}
        </button>
        <button onClick={() => setFilter('recent')}
          style={{ fontSize: 11, fontWeight: filter === 'recent' ? 600 : 400 }}>
          {t('library.recentNotes') || '最近'}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {folders.map(folder => (
          <FolderItem key={folder.id} folder={folder} depth={0}
            selectedId={selectedFolderId}
            onSelect={(id) => { setFilter('folder'); onSelectFolder(id) }}
            onRename={handleRenameFolder}
            onDelete={handleDeleteFolder} />
        ))}

        <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {notes.map(note => (
            <div key={note.id} onClick={() => onOpenNote(note)}
              style={{ padding: '6px 8px', cursor: 'pointer', borderRadius: 4 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              📄 {note.title}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 8, borderTop: '1px solid var(--border)', display: 'flex', gap: 4, flexShrink: 0 }}>
        <button onClick={handleCreateFolder} style={{ fontSize: 11, flex: 1 }}>+ 文件夹</button>
      </div>
    </div>
  )
}
