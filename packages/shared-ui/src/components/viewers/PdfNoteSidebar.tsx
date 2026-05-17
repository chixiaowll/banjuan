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
import { useBanjuanAPI } from '../../api.js'

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
  const { sidePanelNodeId, rfNodes, updateNodeData, closeSidePanel, mindmapId } = useMindmapStore()
  const node = rfNodes.find(n => n.id === sidePanelNodeId)
  const [title, setTitle] = useState(node?.data.title ?? '')
  const [height, setHeight] = useState(200)
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)

  useEffect(() => {
    setTitle(node?.data.title ?? '')
  }, [sidePanelNodeId, node?.data.title])

  const handleTitleChange = useCallback((val: string) => {
    setTitle(val)
    if (sidePanelNodeId) updateNodeData(sidePanelNodeId, { title: val })
  }, [sidePanelNodeId, updateNodeData])

  const handleContentChange = useCallback((json: string) => {
    if (sidePanelNodeId) updateNodeData(sidePanelNodeId, { content: json })
  }, [sidePanelNodeId, updateNodeData])

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
          key={sidePanelNodeId}
          noteId={mindmapId ?? undefined}
          initialContent={(node.data.content as string) ?? ''}
          onChange={handleContentChange}
          skipLinkSync
          autoParseMarkdown
        />
      </div>
    </div>
  )
}

function SidebarMindmap({ noteId }: { noteId: string }) {
  const { init } = useMindmapStore()
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
  const saveCurrentPageSnapshot = useHandwritingStore(s => s.saveCurrentPageSnapshot)

  useEffect(() => { init(noteId) }, [noteId, init])

  const currentPage = pages[currentPageIndex]

  const handleSnapshotChange = useCallback((snapshot: any) => {
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
  const api = useBanjuanAPI()
  const t = useT()
  const [note, setNote] = useState<NoteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const noteType = (note?.type ?? 'markdown') as string

  const mindmapStore = useMemo(
    () => noteType === 'mindmap' ? createMindmapStore(api) : null,
    [noteId, noteType],
  )
  const hwStore = useMemo(
    () => noteType === 'handwriting' ? createHandwritingStore(api) : null,
    [noteId, noteType],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.notes.get(noteId).then((n: any) => {
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
      await api.notes.update(noteId, { content: json })
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
