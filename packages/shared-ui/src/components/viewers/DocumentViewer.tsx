import React, { useCallback, useEffect, useState } from 'react'
import PdfViewer from './PdfViewer.js'
import TextViewer from './TextViewer.js'
import HtmlViewer from './HtmlViewer.js'
import MarkdownViewer from './MarkdownViewer.js'
import ImageViewer from './ImageViewer.js'
import VideoViewer from './VideoViewer.js'
import EpubViewer from './EpubViewer.js'
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
  doc: DocInfo
  onBack: () => void
  onOpenNote?: (note: any) => void
}

function UnsupportedViewer({ doc }: { doc: DocInfo }) {
  const api = useBanjuanAPI()
  const [opened, setOpened] = useState(false)

  const handleOpen = useCallback(() => {
    api.documents.openInSystem(doc.path).then(() => setOpened(true))
  }, [doc.path])

  const ext = doc.path.split('.').pop()?.toUpperCase() || doc.type.toUpperCase()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 16, color: 'var(--text-muted)',
    }}>
      <div style={{ fontSize: 48, opacity: 0.3 }}>
        {ext}
      </div>
      <div style={{ fontSize: 13 }}>
        {doc.title}
      </div>
      <button
        onClick={handleOpen}
        style={{
          padding: '8px 20px', fontSize: 13, cursor: 'pointer',
          border: '1px solid var(--border)', borderRadius: 6,
          background: opened ? 'var(--surface)' : 'var(--accent)',
          color: opened ? 'var(--text-muted)' : '#fff',
        }}
      >
        {opened ? '已用系统应用打开' : '用系统默认应用打开'}
      </button>
    </div>
  )
}

export default function DocumentViewer({ doc, onBack, onOpenNote }: Props) {
  const api = useBanjuanAPI()
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null)

  useEffect(() => {
    api.documents.getFilePath(doc.path).then(setFilePath)
    if (doc.type === 'epub') {
      api.documents.readFileBuffer(doc.path).then((buf: ArrayBuffer | Uint8Array) => {
        if (buf instanceof Uint8Array) {
          setFileData(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
        } else {
          setFileData(buf as ArrayBuffer)
        }
      }).catch((err: any) => console.error('[DocViewer] readFileBuffer error:', err))
    }
  }, [doc.path, doc.type])

  // PDF renders its own shell immediately; other binary types wait for data
  if (doc.type === 'pdf') {
    return (
      <PdfViewer
        filePath={filePath || ''}
        docPath={doc.path}
        doc={doc}
        onOpenNote={onOpenNote}
      />
    )
  }

  const isLoading = !filePath || (doc.type === 'epub' && !fileData)
  if (isLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      Loading...
    </div>
  }

  switch (doc.type) {
    case 'epub':
      return <EpubViewer data={fileData!} doc={doc} onOpenNote={onOpenNote} />
    case 'txt':
      return <TextViewer docPath={doc.path} />
    case 'html':
      return <HtmlViewer docPath={doc.path} />
    case 'md':
      return <MarkdownViewer docPath={doc.path} doc={doc} onOpenNote={onOpenNote} />
    case 'image':
      return <ImageViewer filePath={filePath} />
    case 'video':
      return <VideoViewer filePath={filePath} docPath={doc.path} doc={doc} onOpenNote={onOpenNote} />
    default:
      return <UnsupportedViewer doc={doc} />
  }
}
