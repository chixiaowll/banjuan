import React, { useEffect, useState, useCallback, useRef } from 'react'
import BlockEditor from '../components/notes/BlockEditor.js'
import FolderTree from '../components/notes/FolderTree.js'
import BacklinksPanel from '../components/notes/BacklinksPanel.js'
import TemplatePicker from '../components/notes/TemplatePicker.js'
import { useT } from '../i18n/index.js'

interface NoteInfo {
  id: string
  title: string
  docId?: string | null
  folderId?: string | null
}

interface Props {
  note: NoteInfo
  onBack: () => void
  onOpenNote: (note: NoteInfo) => void
}

export default function NoteView({ note, onBack, onOpenNote }: Props) {
  const t = useT()
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState<string | null>(null)
  const [docId, setDocId] = useState<string | null>(note.docId ?? null)
  const [saving, setSaving] = useState(false)
  const [readingMode, setReadingMode] = useState(false)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(note.folderId ?? null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.electronAPI.notes.get(note.id).then((full: any) => {
      if (full) {
        setContent(full.content)
        setDocId(full.docId)
      }
    })
  }, [note.id])

  const saveContent = useCallback((json: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await window.electronAPI.notes.update(note.id, { content: json })
      setSaving(false)
    }, 800)
  }, [note.id])

  const saveTitle = useCallback(async () => {
    if (title !== note.title) {
      await window.electronAPI.notes.update(note.id, { title })
    }
  }, [note.id, title, note.title])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        setReadingMode(r => !r)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  const handleCreateNote = async () => {
    setShowTemplatePicker(true)
  }

  const handleTemplateSelect = async (templateId: string | null) => {
    setShowTemplatePicker(false)
    const titleInput = prompt(t('prompt.noteTitle') || 'Note title:')
    if (!titleInput) return
    const newNote = await window.electronAPI.notes.create({
      title: titleInput,
      folderId: selectedFolderId ?? undefined,
      templateId: templateId ?? undefined,
    })
    onOpenNote(newNote)
  }

  if (content === null) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      {t('common.loading')}
    </div>
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left Sidebar — Folder Tree */}
      {leftSidebarOpen && (
        <div style={{ width: 240, borderRight: '1px solid var(--border)', flexShrink: 0, overflow: 'hidden' }}>
          <FolderTree
            onSelectFolder={setSelectedFolderId}
            onOpenNote={onOpenNote}
            selectedFolderId={selectedFolderId}
          />
        </div>
      )}

      {/* Center — Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{
          padding: '8px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <button onClick={() => setLeftSidebarOpen(v => !v)} style={{ fontSize: 12 }}>☰</button>
          <button onClick={onBack} style={{ fontSize: 12 }}>{t('common.back')}</button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            style={{
              flex: 1, fontWeight: 600, fontSize: 16,
              background: 'transparent', border: 'none', color: 'var(--text)', outline: 'none',
            }}
            readOnly={readingMode}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {saving ? t('note.saving') : t('note.saved')}
          </span>
          <button onClick={() => setReadingMode(r => !r)}
            style={{ fontSize: 12, fontWeight: readingMode ? 600 : 400 }}>
            {readingMode ? '编辑' : '阅读'}
          </button>
          <button onClick={() => setRightSidebarOpen(v => !v)} style={{ fontSize: 12 }}>≡</button>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <BlockEditor
            key={note.id}
            initialContent={content}
            onChange={saveContent}
            readOnly={readingMode}
          />
        </div>
      </div>

      {/* Right Sidebar — Backlinks */}
      {rightSidebarOpen && (
        <div style={{ width: 260, borderLeft: '1px solid var(--border)', flexShrink: 0, overflow: 'hidden' }}>
          <BacklinksPanel noteId={note.id} docId={docId} onOpenNote={onOpenNote} />
        </div>
      )}

      {showTemplatePicker && (
        <TemplatePicker
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </div>
  )
}
