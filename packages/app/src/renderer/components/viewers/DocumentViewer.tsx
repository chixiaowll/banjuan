import React, { useEffect, useState, useCallback } from 'react'
import PdfViewer from './PdfViewer.js'
import TextViewer from './TextViewer.js'
import MarkdownViewer from './MarkdownViewer.js'
import ImageViewer from './ImageViewer.js'
import VideoViewer from './VideoViewer.js'
import EpubViewer from './EpubViewer.js'
import AnnotationSidebar from '../annotations/AnnotationSidebar.js'
import SelectionToolbar from '../annotations/SelectionToolbar.js'
import { useAnnotations } from '../../hooks/useAnnotations.js'

interface DocInfo {
  id: string
  title: string
  type: string
  path: string
}

interface Props {
  doc: DocInfo
  onBack: () => void
  onOpenNote?: (note: any) => void
}

interface SelectionInfo {
  page: number
  rects: Array<{ x: number; y: number; w: number; h: number }>
  text: string
  clientRect: DOMRect
}

export default function DocumentViewer({ doc, onBack, onOpenNote }: Props) {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const { annotations, create, update, remove } = useAnnotations(doc.id)

  useEffect(() => {
    window.electronAPI.documents.getFilePath(doc.path).then(setFilePath)
  }, [doc.path])

  const handleTextSelect = useCallback((info: SelectionInfo) => {
    setSelection(info)
  }, [])

  const handleHighlight = useCallback(async (color: string) => {
    if (!selection) return
    await create({
      type: 'highlight',
      page: selection.page,
      position: { type: 'pdf', page: selection.page, rects: selection.rects, text: selection.text },
      selectedText: selection.text,
      color,
    })
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [selection, create])

  const handleNote = useCallback(async () => {
    if (!selection) return
    const ann = await create({
      type: 'highlight',
      page: selection.page,
      position: { type: 'pdf', page: selection.page, rects: selection.rects, text: selection.text },
      selectedText: selection.text,
      color: '#fde68a',
    })
    const title = `${doc.title} — 笔记`
    const content = `> ${selection.text}\n\n`
    const note = await window.electronAPI.notes.create({
      title,
      docId: doc.id,
      annotationIds: [ann.id],
      content,
    })
    setSelection(null)
    window.getSelection()?.removeAllRanges()
    onOpenNote?.(note)
  }, [selection, create, doc, onOpenNote])

  if (!filePath) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      Loading...
    </div>
  }

  const renderViewer = () => {
    switch (doc.type) {
      case 'pdf':
        return (
          <PdfViewer
            filePath={filePath}
            docId={doc.id}
            annotations={annotations}
            onTextSelect={handleTextSelect}
            onHighlightClick={() => setShowSidebar(true)}
          />
        )
      case 'txt':
        return <TextViewer docPath={doc.path} />
      case 'md':
        return <MarkdownViewer docPath={doc.path} />
      case 'html':
        return <TextViewer docPath={doc.path} />
      case 'image':
        return <ImageViewer filePath={filePath} />
      case 'video':
        return <VideoViewer filePath={filePath} />
      case 'epub':
        return <EpubViewer filePath={filePath} />
      default:
        return <div style={{ padding: 24 }}>Unsupported document type: {doc.type}</div>
    }
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
        <span style={{ fontWeight: 500 }}>{doc.title}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{doc.type.toUpperCase()}</span>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => setShowSidebar(s => !s)}>
            {showSidebar ? '隐藏标注' : '标注'}
            {annotations.length > 0 && ` (${annotations.length})`}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {renderViewer()}
        </div>
        {showSidebar && (
          <AnnotationSidebar
            annotations={annotations}
            onAnnotationClick={() => {}}
            onAnnotationDelete={remove}
            onAnnotationUpdate={update}
          />
        )}
      </div>

      {selection && (
        <SelectionToolbar
          position={{
            x: selection.clientRect.left + selection.clientRect.width / 2 - 100,
            y: selection.clientRect.top - 50,
          }}
          onHighlight={handleHighlight}
          onNote={handleNote}
          onDismiss={() => setSelection(null)}
        />
      )}
    </div>
  )
}
