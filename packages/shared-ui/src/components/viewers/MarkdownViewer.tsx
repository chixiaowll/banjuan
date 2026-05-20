import React, { useEffect, useState, useCallback, useRef } from 'react'
import { MarkdownViewerProvider, useMarkdownViewer } from './MarkdownViewerContext.js'
import MarkdownToolbar from './MarkdownToolbar.js'
import MarkdownLeftSidebar from './MarkdownLeftSidebar.js'
import MarkdownContentArea from './MarkdownContentArea.js'
import MarkdownInkOverlay from './MarkdownInkOverlay.js'
import PdfNoteSidebar from './PdfNoteSidebar.js'
import { useAnnotations } from '../../hooks/useAnnotations.js'
import type { HeadingItem } from '../notes/NoteOutlinePanel.js'
import { useResizable, ResizeHandle } from '../ResizeHandle.js'
import { useT } from '../../i18n/index.js'
import { useBanjuanAPI } from '../../api.js'

interface DocInfo {
  id: string
  title: string
  authors: string[]
  type: string
  path: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface Props {
  docPath: string
  doc: DocInfo
  onOpenNote?: (note: any) => void
}

function MarkdownViewerInner({ docPath, doc: initialDoc, onOpenNote }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const ctx = useMarkdownViewer()
  const leftResize = useResizable(240, 160, 480, 'left')
  const rightResize = useResizable(280, 200, 600, 'right')

  const [doc, setDoc] = useState<DocInfo>(initialDoc)
  const [content, setContent] = useState<string | null>(null)
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [sidebarNoteId, setSidebarNoteId] = useState<string | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { annotations, create, update, remove, reload } = useAnnotations(initialDoc.id)

  useEffect(() => {
    api.documents.readContent(docPath).then(setContent)
  }, [docPath])

  const handleHighlightCreated = useCallback(async (startOffset: number, endOffset: number, text: string) => {
    await create({
      type: 'highlight',
      position: { type: 'text', startOffset, endOffset, text },
      selectedText: text,
      color: ctx.activeColor,
    })
  }, [create, ctx.activeColor])

  const handleNoteCreated = useCallback(async (startOffset: number, endOffset: number, text: string, noteContent: string) => {
    await create({
      type: 'note',
      position: { type: 'text', startOffset, endOffset, text },
      selectedText: text,
      content: noteContent,
      color: ctx.activeColor,
    })
  }, [create, ctx.activeColor])

  const handleAnnotationClick = useCallback((annotation: any) => {
    if (!annotation.position) return
    if (annotation.position.type === 'text') {
      const el = document.querySelector(`mark[data-ann-id="${annotation.id}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (annotation.position.type === 'ink' && annotation.position.bounds) {
      const container = scrollContainerRef.current
      if (container) {
        const targetY = annotation.position.bounds.y
        container.scrollTo({ top: Math.max(0, targetY - container.clientHeight / 3), behavior: 'smooth' })
      }
    }
  }, [])

  const handleAnnotationDelete = useCallback(async (id: string) => {
    await remove(id)
  }, [remove])

  const handleAnnotationUpdate = useCallback(async (id: string, updates: any) => {
    await update(id, updates)
  }, [update])

  const handleCreateNote = useCallback(async () => {
    let title = t('note.defaultTitle' as any, doc.title)
    let note: any
    for (let i = 0; i < 100; i++) {
      try {
        note = await api.notes.create({
          title: i === 0 ? title : `${title} (${i + 1})`,
          docId: doc.id,
          content: '',
        })
        break
      } catch (err: any) {
        if (!err?.message?.includes('DUPLICATE_TITLE')) throw err
      }
    }
    if (note) setSidebarNoteId(note.id)
  }, [doc, t])

  const handleOpenNote = useCallback((note: any) => {
    setSidebarNoteId(note.id)
  }, [])

  const handleCloseNoteSidebar = useCallback(() => {
    setSidebarNoteId(null)
  }, [])

  const handleDocUpdated = useCallback((updated: DocInfo) => {
    setDoc(updated)
  }, [])

  const handleClearAllInk = useCallback(async () => {
    const inkAnns = annotations.filter((a: any) => a.type === 'ink')
    for (const ann of inkAnns) await remove(ann.id)
  }, [annotations, remove])

  if (content === null) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>
      {t('common.loading')}
    </div>
  }

  const showRightPanel = sidebarNoteId || ctx.rightSidebarOpen

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <MarkdownToolbar docId={doc.id} metadata={doc.metadata} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <MarkdownLeftSidebar
          docId={doc.id}
          headings={headings}
          annotations={annotations}
          onAnnotationClick={handleAnnotationClick}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationUpdate={handleAnnotationUpdate}
          onOpenNote={handleOpenNote}
          onCreateNote={handleCreateNote}
          onDeleteNote={(noteId) => { if (sidebarNoteId === noteId) setSidebarNoteId(null) }}
          width={leftResize.width}
        />
        {ctx.leftSidebarOpen && <ResizeHandle onPointerDown={leftResize.onPointerDown} />}
        <MarkdownContentArea
          content={content}
          docId={doc.id}
          annotations={annotations}
          onHighlightCreated={handleHighlightCreated}
          onNoteCreated={handleNoteCreated}
          onAnnotationClick={handleAnnotationClick}
          onHeadingsChange={setHeadings}
          onInkCreated={reload}
          onClearAllInk={handleClearAllInk}
          scrollContainerRef={scrollContainerRef}
        />
        {showRightPanel && <ResizeHandle onPointerDown={rightResize.onPointerDown} />}
        {sidebarNoteId ? (
          <PdfNoteSidebar
            noteId={sidebarNoteId}
            onClose={handleCloseNoteSidebar}
            onOpenNote={handleOpenNote}
            width={rightResize.width}
          />
        ) : (
          <MarkdownInfoSidebar doc={doc} onDocUpdated={handleDocUpdated} width={rightResize.width} />
        )}
      </div>
    </div>
  )
}

function EditableField({ label, value, readOnly, onSave }: {
  label: string; value: string; readOnly?: boolean; onSave?: (val: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(value)

  useEffect(() => { setEditVal(value) }, [value])

  if (readOnly || !onSave) {
    return (
      <div style={{ display: 'flex', padding: '4px 12px', fontSize: 12, gap: 8 }}>
        <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
        <span style={{ color: 'var(--text)', wordBreak: 'break-all' }} title={value}>{value}</span>
      </div>
    )
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', padding: '4px 12px', fontSize: 12, gap: 8 }}>
        <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
        <input
          autoFocus
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => { onSave(editVal); setEditing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { onSave(editVal); setEditing(false) } }}
          style={{
            flex: 1, fontSize: 12, border: '1px solid var(--border)',
            borderRadius: 3, padding: '1px 4px', color: 'var(--text)',
          }}
        />
      </div>
    )
  }

  return (
    <div
      style={{ display: 'flex', padding: '4px 12px', fontSize: 12, gap: 8, cursor: 'pointer' }}
      onClick={() => setEditing(true)}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{value || '—'}</span>
    </div>
  )
}

function MarkdownInfoSidebar({ doc, onDocUpdated, width = 280 }: {
  doc: DocInfo; onDocUpdated: (doc: DocInfo) => void; width?: number
}) {
  const api = useBanjuanAPI()
  const { rightSidebarOpen } = useMarkdownViewer()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveDoc = useCallback((updates: { title?: string; authors?: string[] }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const result = await api.documents.update(doc.id, updates)
      if (result) onDocUpdated(result)
    }, 500)
  }, [doc.id, onDocUpdated])

  if (!rightSidebarOpen) return null

  return (
    <div style={{
      width, borderLeft: 'none',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      background: 'var(--bg)', overflow: 'auto', paddingBottom: 80,
    }}>
      <div style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>
        {doc.title}
      </div>
      <div style={{ padding: '8px 0' }}>
        <EditableField label="Title" value={doc.title} onSave={(val) => saveDoc({ title: val })} />
        <EditableField label="Authors" value={doc.authors.join(', ')} onSave={(val) => saveDoc({ authors: val.split(',').map(a => a.trim()).filter(Boolean) })} />
        <EditableField label="Type" value={doc.type.toUpperCase()} readOnly />
        <EditableField label="Path" value={doc.path} readOnly />
        <EditableField label="Created" value={new Date(doc.createdAt).toLocaleString()} readOnly />
        <EditableField label="Updated" value={new Date(doc.updatedAt).toLocaleString()} readOnly />
      </div>
    </div>
  )
}

export default function MarkdownViewer({ docPath, doc, onOpenNote }: Props) {
  return (
    <MarkdownViewerProvider>
      <MarkdownViewerInner docPath={docPath} doc={doc} onOpenNote={onOpenNote} />
    </MarkdownViewerProvider>
  )
}
