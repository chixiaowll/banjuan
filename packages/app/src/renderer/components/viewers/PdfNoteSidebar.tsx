import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { X, FileText, Brain, PenTool, ExternalLink } from 'lucide-react'
import { ReactFlowProvider } from '@xyflow/react'
import BlockEditor from '../notes/BlockEditor.js'
import MindmapCanvas from '../mindmap/MindmapCanvas.js'
import { MindmapTitleBar, MindmapFloatingToolbar } from '../mindmap/MindmapToolbar.js'
import { useKeyboardShortcuts } from '../mindmap/useKeyboardShortcuts.js'
import { createMindmapStore, MindmapStoreContext, useMindmapStore } from '../mindmap/useMindmapStore.js'
import HandwritingEditor from '../handwriting/HandwritingEditor.js'
import { createHandwritingStore, HandwritingStoreContext, useHandwritingStore } from '../handwriting/useHandwritingStore.js'
import { useT } from '../../i18n/index.js'

interface NoteInfo {
  id: string
  title: string
  type?: string
  content?: string
}

interface Props {
  noteId: string
  onClose: () => void
  onOpenNote?: (note: { id: string; title: string }) => void
  width?: number
}

function SidebarMindmap({ noteId }: { noteId: string }) {
  const { init } = useMindmapStore()
  useEffect(() => { init(noteId) }, [noteId, init])
  useKeyboardShortcuts()
  return (
    <>
      <MindmapTitleBar />
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <MindmapCanvas />
        <MindmapFloatingToolbar />
      </div>
    </>
  )
}

function SidebarHandwriting({ noteId }: { noteId: string }) {
  const init = useHandwritingStore(s => s.init)
  const pages = useHandwritingStore(s => s.pages)
  const currentPageIndex = useHandwritingStore(s => s.currentPageIndex)
  const pageSize = useHandwritingStore(s => s.pageSize)
  const saveCurrentPageSnapshot = useHandwritingStore(s => s.saveCurrentPageSnapshot)

  useEffect(() => { init(noteId) }, [noteId, init])

  const currentPage = pages[currentPageIndex]

  const handleSnapshotChange = useCallback((snapshot: unknown) => {
    saveCurrentPageSnapshot(snapshot)
  }, [saveCurrentPageSnapshot])

  if (!currentPage) return null

  return (
    <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
      <HandwritingEditor
        pageId={currentPage.id}
        snapshot={currentPage.snapshot}
        template={currentPage.template}
        pageWidth={pageSize.width}
        pageHeight={pageSize.height}
        onSnapshotChange={handleSnapshotChange}
        onThumbnailGenerated={() => {}}
      />
    </div>
  )
}

export default function PdfNoteSidebar({ noteId, onClose, onOpenNote, width = 400 }: Props) {
  const t = useT()
  const [note, setNote] = useState<NoteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const noteType = (note?.type ?? 'markdown') as string

  const mindmapStore = useMemo(
    () => noteType === 'mindmap' ? createMindmapStore() : null,
    [noteId, noteType],
  )
  const hwStore = useMemo(
    () => noteType === 'handwriting' ? createHandwritingStore() : null,
    [noteId, noteType],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.electronAPI.notes.get(noteId).then((n: any) => {
      if (cancelled) return
      setNote(n)
      setLoading(false)
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [noteId])

  const handleChange = useCallback((json: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaving(true)
    saveTimer.current = setTimeout(async () => {
      await window.electronAPI.notes.update(noteId, { content: json })
      setSaving(false)
    }, 800)
  }, [noteId])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  if (loading) {
    return (
      <div style={{
        width, borderLeft: 'none',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        background: 'var(--bg)', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: 12,
      }}>
        {t('common.loading')}
      </div>
    )
  }

  if (!note) return null

  const icon = noteType === 'mindmap' ? <Brain size={14} />
    : noteType === 'handwriting' ? <PenTool size={14} />
    : <FileText size={14} />

  const renderContent = () => {
    if (noteType === 'mindmap' && mindmapStore) {
      return (
        <MindmapStoreContext.Provider value={mindmapStore}>
          <ReactFlowProvider>
            <SidebarMindmap noteId={note.id} />
          </ReactFlowProvider>
        </MindmapStoreContext.Provider>
      )
    }
    if (noteType === 'handwriting' && hwStore) {
      return (
        <HandwritingStoreContext.Provider value={hwStore}>
          <SidebarHandwriting noteId={note.id} />
        </HandwritingStoreContext.Provider>
      )
    }
    return (
      <div className="sidebar-editor" style={{ flex: 1, overflow: 'auto' }}>
        <BlockEditor
          noteId={note.id}
          initialContent={note.content || ''}
          onChange={handleChange}
          onOpenNote={onOpenNote}
        />
      </div>
    )
  }

  return (
    <div style={{
      width, borderLeft: 'none',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      background: 'var(--bg)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'flex' }}>{icon}</span>
        <span
          style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={note.title}
        >
          {note.title}
        </span>
        {saving && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('note.saving')}</span>}
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}
        >
          <X size={16} />
        </button>
      </div>
      {renderContent()}
    </div>
  )
}
