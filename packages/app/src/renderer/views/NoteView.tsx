import React, { useEffect, useState, useCallback, useRef } from 'react'
import NoteEditor from '../components/notes/NoteEditor.js'

interface NoteInfo {
  id: string
  title: string
  docId: string | null
}

interface Props {
  note: NoteInfo
  onBack: () => void
}

export default function NoteView({ note, onBack }: Props) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.electronAPI.notes.get(note.id).then((full) => {
      if (full) setContent(full.content)
    })
  }, [note.id])

  const saveContent = useCallback((markdown: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await window.electronAPI.notes.update(note.id, { content: markdown })
      setSaving(false)
    }, 800)
  }, [note.id])

  const saveTitle = useCallback(async () => {
    if (title !== note.title) {
      await window.electronAPI.notes.update(note.id, { title })
    }
  }, [note.id, title, note.title])

  if (content === null) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      Loading...
    </div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        <button onClick={onBack}>← 返回</button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          style={{
            flex: 1, fontWeight: 600, fontSize: 16,
            background: 'transparent', border: 'none', color: 'var(--text)',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {saving ? '保存中...' : '已保存'}
        </span>
      </div>
      <NoteEditor initialContent={content} onChange={saveContent} />
    </div>
  )
}
