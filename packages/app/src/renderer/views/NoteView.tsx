import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import BlockEditor, { type BlockEditorHandle } from '../components/notes/BlockEditor.js'
import FolderTree from '../components/notes/FolderTree.js'
import NoteOutlinePanel, { type HeadingItem } from '../components/notes/NoteOutlinePanel.js'
import BacklinksPanel from '../components/notes/BacklinksPanel.js'
import TemplatePicker from '../components/notes/TemplatePicker.js'
import MindmapCanvas from '../components/mindmap/MindmapCanvas.js'
import MindmapToolbar from '../components/mindmap/MindmapToolbar.js'
import MindmapContextMenu from '../components/mindmap/MindmapContextMenu.js'
import MindmapSearch from '../components/mindmap/MindmapSearch.js'
import NodePropertyPanel from '../components/mindmap/panels/NodePropertyPanel.js'
import NodeContentEditor from '../components/mindmap/panels/NodeContentEditor.js'
import ThemePanel from '../components/mindmap/panels/ThemePanel.js'
import { useMindmapStore, createMindmapStore, MindmapStoreContext } from '../components/mindmap/useMindmapStore.js'
import { useKeyboardShortcuts } from '../components/mindmap/useKeyboardShortcuts.js'
import HandwritingCenterContent from '../components/handwriting/HandwritingCenterContent.js'
import PageListPanel from '../components/handwriting/PageListPanel.js'
import { createHandwritingStore, HandwritingStoreContext } from '../components/handwriting/useHandwritingStore.js'
import { useT } from '../i18n/index.js'

interface NoteInfo {
  id: string
  title: string
  path?: string
  type?: string
  docId?: string | null
  folderId?: string | null
}

interface Props {
  note: NoteInfo
  onBack: () => void
  onOpenNote: (note: NoteInfo) => void
}

function useResizable(initialWidth: number, minWidth: number, maxWidth: number, side: 'left' | 'right') {
  const [width, setWidth] = useState(initialWidth)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = side === 'left' ? ev.clientX - startX.current : startX.current - ev.clientX
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta))
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width, minWidth, maxWidth, side])

  return { width, onMouseDown }
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 4, flexShrink: 0, cursor: 'col-resize',
        background: 'var(--border)', transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--border)'}
    />
  )
}

// --- Mindmap center content (inside MindmapStoreContext) ---

function MindmapCenterContent({ noteId, onToggleLeftSidebar, onToggleRightSidebar }: {
  noteId: string
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
}) {
  const { init } = useMindmapStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  useKeyboardShortcuts()

  useEffect(() => {
    init(noteId)
  }, [noteId, init])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const target = (e.target as HTMLElement).closest('.react-flow__node')
    if (!target) return
    const nodeId = target.getAttribute('data-id')
    if (nodeId) setContextMenu({ x: e.clientX, y: e.clientY, nodeId })
  }, [])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <MindmapToolbar
        onToggleLeftSidebar={onToggleLeftSidebar}
        onToggleRightSidebar={onToggleRightSidebar}
      />
      <div style={{ flex: 1, position: 'relative' }} onContextMenu={handleContextMenu}>
        <MindmapCanvas />
        {searchOpen && <MindmapSearch onClose={() => setSearchOpen(false)} />}
      </div>
      {contextMenu && (
        <MindmapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

// --- Mindmap right sidebar panels ---

function MindmapPanels() {
  const t = useT()
  const { sidePanelNodeId, closeSidePanel } = useMindmapStore()

  if (!sidePanelNodeId) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
        {t('mindmap.selectNodeHint')}
      </div>
    )
  }

  return <NodeContentEditor key={sidePanelNodeId} nodeId={sidePanelNodeId} onClose={closeSidePanel} />
}

function MindmapRightSidebar({ noteId, onOpenNote, rightPanel }: {
  noteId: string
  onOpenNote: (note: NoteInfo) => void
  rightPanel: { width: number; onMouseDown: (e: React.MouseEvent) => void }
}) {
  const t = useT()
  const { sidePanelNodeId } = useMindmapStore()
  const [rightTab, setRightTab] = useState<'backlinks' | 'properties'>('properties')

  useEffect(() => {
    if (sidePanelNodeId) setRightTab('properties')
  }, [sidePanelNodeId])

  const tabs: [string, string][] = [
    ['properties', t('note.properties')],
    ['backlinks', t('note.backlinks')],
  ]

  return (
    <>
      <ResizeHandle onMouseDown={rightPanel.onMouseDown} />
      <div style={{ width: rightPanel.width, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', height: 40, alignItems: 'stretch', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setRightTab(id as any)}
              style={{
                flex: 1, border: 'none', fontSize: 12,
                background: 'transparent',
                borderBottom: rightTab === id ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                color: rightTab === id ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: rightTab === id ? 500 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {rightTab === 'properties' && <MindmapPanels />}
          {rightTab === 'backlinks' && (
            <BacklinksPanel noteId={noteId} docId={null} onOpenNote={onOpenNote} onOpenMindmap={onOpenNote} />
          )}
        </div>
      </div>
    </>
  )
}

// --- Main NoteView ---

function NoteViewInner({ note, onBack, onOpenNote }: Props) {
  const t = useT()
  const isMindmap = (note.type ?? 'markdown') === 'mindmap'
  const isHandwriting = (note.type ?? 'markdown') === 'handwriting'

  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState<string | null>(null)
  const [docId, setDocId] = useState<string | null>(note.docId ?? null)
  const [saving, setSaving] = useState(false)
  const [readingMode, setReadingMode] = useState(false)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const noteFolder = note.path?.includes('/') ? note.path.substring(0, note.path.lastIndexOf('/')) : null
  const [selectedFolder, setSelectedFolder] = useState<string | null>(noteFolder)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [leftTab, setLeftTab] = useState<'files' | 'outline'>('files')
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const editorRef = useRef<BlockEditorHandle>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leftPanel = useResizable(240, 160, 480, 'left')
  const rightPanel = useResizable(260, 180, 720, 'right')

  useEffect(() => {
    if (isMindmap || isHandwriting) {
      setContent('')
      return
    }
    window.electronAPI.notes.get(note.id).then((full: any) => {
      if (full) {
        setContent(full.content ?? '')
        setDocId(full.docId)
      } else {
        setContent('')
      }
    }).catch((err: any) => {
      console.error('[NoteView] failed to load note:', err)
      setContent('')
    })
  }, [note.id, isMindmap, isHandwriting])

  useEffect(() => {
    const syncTitle = () => {
      window.electronAPI.notes.get(note.id).then((full: any) => {
        if (full && full.title !== title) {
          setTitle(full.title)
        }
      })
    }
    document.addEventListener('notes-changed', syncTitle)
    return () => document.removeEventListener('notes-changed', syncTitle)
  }, [note.id, title])

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
      document.dispatchEvent(new Event('notes-changed'))
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

  useEffect(() => {
    if (!exportMenuOpen) return
    const close = () => setExportMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [exportMenuOpen])

  const handleTemplateSelect = async (templateId: string | null, title: string) => {
    setShowTemplatePicker(false)
    const newNote = await window.electronAPI.notes.create({
      title,
      folder: selectedFolder ?? undefined,
      templateId: templateId ?? undefined,
    })
    onOpenNote(newNote)
  }

  if (!isMindmap && !isHandwriting && content === null) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      {t('common.loading')}
    </div>
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left Sidebar */}
      {leftSidebarOpen && (
        <>
          <div style={{ width: leftPanel.width, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', height: 40, alignItems: 'stretch', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              {([
                ['files', t('note.notes')],
                ...(!isMindmap && !isHandwriting ? [['outline', t('note.outline')]] : []),
                ...(isHandwriting ? [['pages', t('handwriting.pages')]] : []),
              ] as [string, string][]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setLeftTab(id as any)}
                  style={{
                    flex: 1, border: 'none', fontSize: 12,
                    background: 'transparent',
                    borderBottom: leftTab === id ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                    color: leftTab === id ? 'var(--text)' : 'var(--text-muted)',
                    fontWeight: leftTab === id ? 500 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {leftTab === 'files' && (
                <FolderTree
                  onSelectFolder={setSelectedFolder}
                  onOpenNote={onOpenNote}
                  selectedFolder={selectedFolder}
                  activeNoteId={note.id}
                />
              )}
              {leftTab === 'outline' && !isMindmap && !isHandwriting && <NoteOutlinePanel headings={headings} />}
              {leftTab === 'pages' && isHandwriting && <PageListPanel />}
            </div>
          </div>
          <ResizeHandle onMouseDown={leftPanel.onMouseDown} />
        </>
      )}

      {/* Center */}
      {isHandwriting ? (
        <HandwritingCenterContent
          noteId={note.id}
          title={title}
          onBack={onBack}
          onToggleLeftSidebar={() => setLeftSidebarOpen(v => !v)}
          onToggleRightSidebar={() => setRightSidebarOpen(v => !v)}
        />
      ) : isMindmap ? (
        <MindmapCenterContent
          noteId={note.id}
          onToggleLeftSidebar={() => setLeftSidebarOpen(v => !v)}
          onToggleRightSidebar={() => setRightSidebarOpen(v => !v)}
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Toolbar */}
          <div style={{
            height: 40, padding: '0 12px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <button onClick={() => setLeftSidebarOpen(v => !v)}
              style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
              ☰
            </button>
            <button onClick={onBack}
              style={{ background: 'none', border: 'none', fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px' }}>
              {t('common.back')}
            </button>
            <span style={{
              flex: 1, fontWeight: 600, fontSize: 15, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {title}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {saving ? t('note.saving') : t('note.saved')}
            </span>
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setExportMenuOpen(v => !v)}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                  fontSize: 12, cursor: 'pointer', padding: '3px 8px', color: 'var(--text-muted)',
                }}
              >
                {t('note.export')}
              </button>
              {exportMenuOpen && (
                <div
                  style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 100, minWidth: 140, padding: '4px 0',
                  }}
                >
                  <button
                    onClick={async () => {
                      setExportMenuOpen(false)
                      if (!editorRef.current) return
                      const markdown = await editorRef.current.exportMarkdown()
                      const attachments = editorRef.current.getAttachmentPaths()
                      await window.electronAPI.export.markdown({ title, markdown, attachments })
                    }}
                    style={{
                      display: 'block', width: '100%', padding: '8px 16px', border: 'none',
                      background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer',
                      color: 'var(--text)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    Markdown
                  </button>
                  <button
                    onClick={async () => {
                      setExportMenuOpen(false)
                      if (!editorRef.current) return
                      const html = await editorRef.current.exportHTML()
                      const attachments = editorRef.current.getAttachmentPaths()
                      await window.electronAPI.export.pdf({ title, html, attachments })
                    }}
                    style={{
                      display: 'block', width: '100%', padding: '8px 16px', border: 'none',
                      background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer',
                      color: 'var(--text)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    PDF
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => setReadingMode(r => !r)}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                fontSize: 12, cursor: 'pointer', padding: '3px 8px',
                color: readingMode ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: readingMode ? 500 : 400,
              }}>
              {readingMode ? t('note.editMode') : t('note.readMode')}
            </button>
            <button onClick={() => setRightSidebarOpen(v => !v)}
              style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
              ≡
            </button>
          </div>

          {/* Editor */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <BlockEditor
              ref={editorRef}
              key={note.id}
              noteId={note.id}
              initialContent={content!}
              onChange={saveContent}
              readOnly={readingMode}
              onOpenNote={onOpenNote}
              onHeadingsChange={setHeadings}
            />
          </div>
        </div>
      )}

      {/* Right Sidebar */}
      {rightSidebarOpen && (
        isMindmap ? (
          <MindmapRightSidebar noteId={note.id} onOpenNote={onOpenNote} rightPanel={rightPanel} />
        ) : (
          <>
            <ResizeHandle onMouseDown={rightPanel.onMouseDown} />
            <div style={{ width: rightPanel.width, flexShrink: 0, overflow: 'hidden' }}>
              <BacklinksPanel noteId={note.id} docId={docId} onOpenNote={onOpenNote} onOpenMindmap={onOpenNote} />
            </div>
          </>
        )
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

export default function NoteView(props: Props) {
  const isMindmap = (props.note.type ?? 'markdown') === 'mindmap'
  const isHandwriting = (props.note.type ?? 'markdown') === 'handwriting'
  const store = useMemo(() => isMindmap ? createMindmapStore() : null, [props.note.id])
  const hwStore = useMemo(() => isHandwriting ? createHandwritingStore() : null, [props.note.id])

  if (isHandwriting && hwStore) {
    return (
      <HandwritingStoreContext.Provider value={hwStore}>
        <NoteViewInner {...props} />
      </HandwritingStoreContext.Provider>
    )
  }

  if (isMindmap && store) {
    return (
      <MindmapStoreContext.Provider value={store}>
        <ReactFlowProvider>
          <NoteViewInner {...props} />
        </ReactFlowProvider>
      </MindmapStoreContext.Provider>
    )
  }

  return <NoteViewInner {...props} />
}
