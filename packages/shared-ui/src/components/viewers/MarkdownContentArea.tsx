import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useMarkdownViewer } from './MarkdownViewerContext.js'
import MarkdownInkOverlay from './MarkdownInkOverlay.js'
import MarkdownInkLassoTool from './MarkdownInkLassoTool.js'
import MarkdownInkToolbar from './MarkdownInkToolbar.js'
import BlockEditor from '../notes/BlockEditor.js'
import type { HeadingItem } from '../notes/NoteOutlinePanel.js'

interface AnnotationData {
  id: string
  position: any
  color: string
  type: string
  selectedText: string | null
}

interface SelectionPopup {
  text: string
  startOffset: number
  endOffset: number
  x: number
  y: number
}

interface NotePopup {
  text: string
  startOffset: number
  endOffset: number
  x: number
  y: number
}

interface Props {
  content: string
  docId: string
  annotations: AnnotationData[]
  onHighlightCreated: (startOffset: number, endOffset: number, text: string) => void
  onNoteCreated: (startOffset: number, endOffset: number, text: string, noteContent: string) => void
  onAnnotationClick?: (annotation: AnnotationData) => void
  onHeadingsChange: (headings: HeadingItem[]) => void
  onInkCreated: () => void
  onClearAllInk: () => void
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
}

function getEditorEl(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.bn-editor')
}

function getTextOffset(root: Node, targetNode: Node, targetOffset: number): number {
  let offset = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    if (node === targetNode) return offset + targetOffset
    offset += node.textContent?.length ?? 0
  }
  return offset
}

function collectTextNodes(root: Node, start: number, end: number): Array<{ node: Text; from: number; to: number }> {
  const result: Array<{ node: Text; from: number; to: number }> = []
  let offset = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    const len = node.textContent?.length ?? 0
    const nodeStart = offset
    const nodeEnd = offset + len
    if (nodeEnd > start && nodeStart < end) {
      result.push({
        node,
        from: Math.max(0, start - nodeStart),
        to: Math.min(len, end - nodeStart),
      })
    }
    if (nodeEnd >= end) break
    offset += len
  }
  return result
}

function clearHighlightMarks(container: HTMLElement) {
  const editor = getEditorEl(container)
  if (!editor) return
  editor.querySelectorAll('mark[data-ann-id]').forEach(mark => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  })
}

function applyHighlightMarks(container: HTMLElement, annotations: AnnotationData[]) {
  const editor = getEditorEl(container)
  if (!editor) return

  const filtered = annotations
    .filter(a => (a.type === 'highlight' || a.type === 'note') && a.position?.type === 'text')
    .sort((a, b) => (b.position.startOffset ?? 0) - (a.position.startOffset ?? 0))

  for (const ann of filtered) {
    const segments = collectTextNodes(editor, ann.position.startOffset, ann.position.endOffset)
    for (let i = segments.length - 1; i >= 0; i--) {
      const { node, from, to } = segments[i]
      if (from >= to) continue
      const range = document.createRange()
      range.setStart(node, from)
      range.setEnd(node, to)
      const mark = document.createElement('mark')
      mark.setAttribute('data-ann-id', ann.id)
      mark.style.backgroundColor = ann.color
      mark.style.opacity = '0.35'
      mark.style.borderRadius = '2px'
      mark.style.padding = '0'
      mark.style.cursor = 'pointer'
      range.surroundContents(mark)
    }
  }
}

export default function MarkdownContentArea({ content, docId, annotations, onHighlightCreated, onNoteCreated, onAnnotationClick, onHeadingsChange, onInkCreated, onClearAllInk, scrollContainerRef }: Props) {
  const ctx = useMarkdownViewer()
  const containerRef = useRef<HTMLDivElement>(null)
  const undoRef = useRef<(() => void) | null>(null)
  const redoRef = useRef<(() => void) | null>(null)
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopup | null>(null)
  const [notePopup, setNotePopup] = useState<NotePopup | null>(null)
  const [noteText, setNoteText] = useState('')
  const noteInputRef = useRef<HTMLTextAreaElement>(null)
  const appliedRef = useRef<string>('')
  const [headings, setHeadings] = useState<HeadingItem[]>([])

  const handleHeadingsChange = useCallback((h: HeadingItem[]) => {
    setHeadings(h)
    onHeadingsChange(h)
  }, [onHeadingsChange])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const key = annotations.map(a => a.id).sort().join(',')
    if (key === appliedRef.current) return
    requestAnimationFrame(() => {
      clearHighlightMarks(el)
      applyHighlightMarks(el, annotations)
      appliedRef.current = key
    })
  }, [annotations])

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !containerRef.current) return

    const text = sel.toString().trim()
    if (!text) return

    const range = sel.getRangeAt(0)
    if (!containerRef.current.contains(range.commonAncestorContainer)) return

    const editorEl = getEditorEl(containerRef.current)
    if (!editorEl) return

    const startOffset = getTextOffset(editorEl, range.startContainer, range.startOffset)
    const endOffset = getTextOffset(editorEl, range.endContainer, range.endOffset)

    const rect = range.getBoundingClientRect()
    setSelectionPopup({
      text,
      startOffset,
      endOffset,
      x: rect.left + rect.width / 2,
      y: rect.top,
    })
    setNotePopup(null)
  }, [])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  const dismissSelection = useCallback(() => {
    setSelectionPopup(null)
  }, [])

  useEffect(() => {
    if (!selectionPopup) return
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-selection-toolbar]')) return
      dismissSelection()
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
  }, [selectionPopup, dismissSelection])

  const handleHighlight = useCallback(() => {
    if (!selectionPopup) return
    onHighlightCreated(selectionPopup.startOffset, selectionPopup.endOffset, selectionPopup.text)
    window.getSelection()?.removeAllRanges()
    setSelectionPopup(null)
  }, [selectionPopup, onHighlightCreated])

  const handleShowNote = useCallback(() => {
    if (!selectionPopup) return
    setNotePopup({
      text: selectionPopup.text,
      startOffset: selectionPopup.startOffset,
      endOffset: selectionPopup.endOffset,
      x: selectionPopup.x,
      y: selectionPopup.y + 40,
    })
    window.getSelection()?.removeAllRanges()
    setSelectionPopup(null)
    setNoteText('')
  }, [selectionPopup])

  useEffect(() => {
    if (notePopup && noteInputRef.current) noteInputRef.current.focus()
  }, [notePopup])

  const handleNoteSubmit = useCallback(() => {
    if (!notePopup || !noteText.trim()) return
    onNoteCreated(notePopup.startOffset, notePopup.endOffset, notePopup.text, noteText.trim())
    setNotePopup(null)
    setNoteText('')
  }, [notePopup, noteText, onNoteCreated])

  const handleNoteCancel = useCallback(() => {
    setNotePopup(null)
    setNoteText('')
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      const mark = (e.target as HTMLElement).closest('mark[data-ann-id]')
      if (!mark) return
      const annId = mark.getAttribute('data-ann-id')
      const ann = annotations.find(a => a.id === annId)
      if (ann && onAnnotationClick) onAnnotationClick(ann)
    }
    el.addEventListener('click', handler)
    return () => el.removeEventListener('click', handler)
  }, [annotations, onAnnotationClick])

  const toolbarBtnStyle: React.CSSProperties = {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: 16,
    borderRadius: 4,
    color: 'var(--text)',
    lineHeight: 1,
  }

  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
    <div ref={(el) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
      if (scrollContainerRef) (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    }} style={{ width: '100%', height: '100%', overflow: 'auto', position: 'relative' }}>
      <div
        className="reading-mode"
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '24px 32px',
          fontSize: `${ctx.fontSize}%`,
        }}
      >
        <BlockEditor
          initialContent={content}
          onChange={() => {}}
          readOnly
          autoParseMarkdown
          skipLinkSync
          onHeadingsChange={handleHeadingsChange}
        />
      </div>

      {ctx.activeTool !== 'lasso' && (
        <MarkdownInkOverlay
          docId={docId}
          annotations={annotations}
          headings={headings}
          scrollContainer={containerRef.current}
          onCreated={onInkCreated}
          onUndoRef={undoRef}
          onRedoRef={redoRef}
        />
      )}
      <MarkdownInkLassoTool
        docId={docId}
        annotations={annotations}
        scrollContainer={containerRef.current}
        onUpdated={onInkCreated}
      />

      {selectionPopup && (
        <div
          data-selection-toolbar
          style={{
            position: 'fixed',
            left: selectionPopup.x,
            top: selectionPopup.y - 40,
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '2px 4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            display: 'flex',
            gap: 2,
          }}
        >
          <button
            style={toolbarBtnStyle}
            onClick={handleHighlight}
            title="Highlight"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            🖍
          </button>
          <button
            style={toolbarBtnStyle}
            onClick={handleShowNote}
            title="Add note"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            📌
          </button>
        </div>
      )}

      {notePopup && (
        <div style={{
          position: 'fixed',
          left: notePopup.x,
          top: notePopup.y,
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          width: 260,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            "{notePopup.text.slice(0, 60)}{notePopup.text.length > 60 ? '…' : ''}"
          </div>
          <textarea
            ref={noteInputRef}
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleNoteSubmit()
              if (e.key === 'Escape') handleNoteCancel()
            }}
            placeholder="Add note..."
            style={{
              width: '100%',
              height: 60,
              resize: 'vertical',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: 6,
              fontSize: 12,
              background: 'var(--surface)',
              color: 'var(--text)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
            <button
              onClick={handleNoteCancel}
              style={{
                border: '1px solid var(--border)', background: 'none', borderRadius: 4,
                padding: '3px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--text)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleNoteSubmit}
              disabled={!noteText.trim()}
              style={{
                border: 'none', background: 'var(--accent)', color: '#fff', borderRadius: 4,
                padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                opacity: noteText.trim() ? 1 : 0.5,
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>

    {(ctx.activeTool === 'ink' || ctx.activeTool === 'eraser' || ctx.activeTool === 'lasso') && (
      <MarkdownInkToolbar
        onUndo={() => undoRef.current?.()}
        onRedo={() => redoRef.current?.()}
        canUndo={ctx.inkUndoStack.length > 0}
        canRedo={ctx.inkRedoStack.length > 0}
        onClearAll={onClearAllInk}
      />
    )}
    </div>
  )
}
