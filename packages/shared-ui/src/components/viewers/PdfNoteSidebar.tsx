import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { X, FileText, Brain, PenTool, ExternalLink } from 'lucide-react'
import { ReactFlowProvider } from '@xyflow/react'
import BlockEditor from '../notes/BlockEditor.js'
import MindmapCanvas from '../mindmap/MindmapCanvas.js'
import { MindmapTitleBar, MindmapFloatingToolbar } from '../mindmap/MindmapToolbar.js'
import { useKeyboardShortcuts } from '../mindmap/useKeyboardShortcuts.js'
import { createMindmapStore, MindmapStoreContext, useMindmapStore, useMindmapLabels } from '../mindmap/useMindmapStore.js'
import HandwritingEditor from '../handwriting/HandwritingEditor.js'
import { createHandwritingStore, HandwritingStoreContext, useHandwritingStore } from '../handwriting/useHandwritingStore.js'
import type { CanvasSnapshot } from '@banjuan/core'
import { useT } from '../../i18n/index.js'
import { useBanjuanAPI } from '../../api.js'
import { emitLinksSynced } from '../../utils/linkEvents.js'
import { useDebouncedSaver } from '../../utils/debouncedSaver.js'
import { useNodeContentEditing } from '../mindmap/panels/useNodeContentEditing.js'
import { useNoteContentSync, useNoteChangedElsewhere } from '../../utils/noteChanges.js'
import { registerFlushUntilWritten } from '../../utils/flushRegistry.js'
import { toast, errorMessage } from '../feedback.js'
import { useShallow } from 'zustand/react/shallow'

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

function SidebarMindmapNodeEditor({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const sidePanelNodeId = useMindmapStore(s => s.sidePanelNodeId)
  const closeSidePanel = useMindmapStore(s => s.closeSidePanel)
  const mindmapId = useMindmapStore(s => s.mindmapId)
  const { node, title, setTitle: handleTitleChange, initialContent, editorKey, onContentChange: handleContentChange } = useNodeContentEditing(sidePanelNodeId)
  const [height, setHeight] = useState(200)
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startH.current = height
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const containerH = containerRef.current?.clientHeight ?? 600
      const maxH = containerH - 80
      const newH = Math.max(100, Math.min(maxH, startH.current + (startY.current - ev.clientY)))
      setHeight(newH)
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [height, containerRef])

  if (!sidePanelNodeId || !node) return null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height, flexShrink: 0,
    }}>
      <div
        onPointerDown={onPointerDown}
        style={{
          height: 6, flexShrink: 0, cursor: 'row-resize',
          background: 'var(--border, #e0e0e0)',
          position: 'relative',
        }}
      >
        <div style={{
          position: 'absolute', left: '50%', top: 1, transform: 'translateX(-50%)',
          width: 32, height: 4, borderRadius: 2,
          background: 'var(--text-muted, #999)', opacity: 0.4,
        }} />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 8px', borderBottom: '1px solid var(--border, #e0e0e0)', flexShrink: 0,
      }}>
        <input
          value={title}
          onChange={e => handleTitleChange(e.target.value)}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13, fontWeight: 600, color: 'var(--text, #333)',
            fontFamily: 'inherit', padding: '2px 4px',
          }}
        />
        <button
          onClick={closeSidePanel}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted, #999)', padding: '0 4px', lineHeight: 1 }}
        >×</button>
      </div>
      <div className="node-content-editor-body" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <BlockEditor
          key={`${sidePanelNodeId}:${editorKey}`}
          noteId={mindmapId ?? undefined}
          initialContent={initialContent}
          onChange={handleContentChange}
          skipLinkSync
          autoParseMarkdown
        />
      </div>
    </div>
  )
}

function SidebarMindmap({ noteId }: { noteId: string }) {
  const { init } = useMindmapStore(useShallow(s => ({ init: s.init })))
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => { init(noteId) }, [noteId, init])
  useKeyboardShortcuts()
  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <MindmapTitleBar />
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <MindmapCanvas />
        <MindmapFloatingToolbar />
      </div>
      <SidebarMindmapNodeEditor containerRef={containerRef} />
    </div>
  )
}

function SidebarHandwriting({ noteId }: { noteId: string }) {
  const init = useHandwritingStore(s => s.init)
  const pages = useHandwritingStore(s => s.pages)
  const currentPageIndex = useHandwritingStore(s => s.currentPageIndex)
  const pageSize = useHandwritingStore(s => s.pageSize)
  const savePageSnapshot = useHandwritingStore(s => s.savePageSnapshot)
  const externalVersion = useHandwritingStore(s => s.externalVersion)
  const changeSource = useHandwritingStore(s => s.changeSource)
  const reloadIfChanged = useHandwritingStore(s => s.reloadIfChanged)
  // Follow saves from another editor of this note (tab ↔ PDF side panel) and syncs.
  useNoteChangedElsewhere(noteId, changeSource, () => { void reloadIfChanged() })

  useEffect(() => { init(noteId) }, [noteId, init])

  const currentPage = pages[currentPageIndex]

  const handleSnapshotChange = useCallback((snapshot: CanvasSnapshot, pageId: string) => {
    savePageSnapshot(pageId, snapshot)
  }, [savePageSnapshot])

  if (!currentPage) return null

  return (
    <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
      <HandwritingEditor
        pageId={currentPage.id}
        reloadToken={externalVersion}
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
  const api = useBanjuanAPI()
  const t = useT()
  const [note, setNote] = useState<NoteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saver = useDebouncedSaver(800, noteId)   // flushes on unmount / window close, never drops the last edit
  const savesInFlight = useRef(0)
  // The same note may be open in a tab too: follow its saves (and syncs) while clean here.
  const contentSync = useNoteContentSync(noteId, {
    isDirty: () => saver.hasPending || savesInFlight.current > 0,
    apply: (content) => setNote(n => n ? { ...n, content } : n),
  })

  const noteType = (note?.type ?? 'markdown') as string

  const mindmapLabels = useMindmapLabels()
  const mindmapStore = useMemo(
    () => noteType === 'mindmap' ? createMindmapStore(api, mindmapLabels) : null,
    [noteId, noteType],
  )
  const hwStore = useMemo(
    () => noteType === 'handwriting' ? createHandwritingStore(api) : null,
    [noteId, noteType],
  )
  useEffect(() => mindmapStore ? registerFlushUntilWritten(() => mindmapStore.getState().flushPersist()) : undefined, [mindmapStore])
  useEffect(() => hwStore ? registerFlushUntilWritten(() => hwStore.getState().flushPendingSave()) : undefined, [hwStore])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.notes.get(noteId).then((n: any) => {
      if (cancelled) return
      setNote(n)
      if (n) contentSync.known(n.content ?? '')
      setLoading(false)
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [noteId])

  const handleChange = useCallback((json: string) => {
    const id = noteId
    setSaving(true)
    saver.schedule(async () => {
      savesInFlight.current++
      try {
        await api.notes.update(id, { content: json })
        setSaveError(null)
        contentSync.known(json)
        contentSync.announceSaved()
        emitLinksSynced()
      } catch (e) {
        console.error('[PdfNoteSidebar] save failed', id, e)
        setSaveError(errorMessage(e))
        toast.error(t('note.saveFailedDetail', errorMessage(e)), { key: 'note-save' })
      } finally {
        savesInFlight.current--
        setSaving(false)
      }
    })
  }, [noteId, saver, t, contentSync.known, contentSync.announceSaved])

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
          key={`${note.id}:${contentSync.reloadKey}`}
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
        {!saving && saveError && <span title={saveError} style={{ fontSize: 10, color: '#c0392b' }}>{t('note.saveFailed')}</span>}
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
