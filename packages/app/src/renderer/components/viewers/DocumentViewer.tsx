import React, { useEffect, useState } from 'react'
import PdfViewer from './PdfViewer.js'
import TextViewer from './TextViewer.js'
import MarkdownViewer from './MarkdownViewer.js'
import ImageViewer from './ImageViewer.js'
import VideoViewer from './VideoViewer.js'
import EpubViewer from './EpubViewer.js'

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

export default function DocumentViewer({ doc, onBack, onOpenNote }: Props) {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null)

  useEffect(() => {
    window.electronAPI.documents.getFilePath(doc.path).then(setFilePath)
    if (doc.type === 'epub') {
      window.electronAPI.documents.readFileBuffer(doc.path).then((buf: ArrayBuffer | Uint8Array) => {
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
    case 'html':
      return <TextViewer docPath={doc.path} />
    case 'md':
      return <MarkdownViewer docPath={doc.path} />
    case 'image':
      return <ImageViewer filePath={filePath} />
    case 'video':
      return <VideoViewer filePath={filePath} />
    default:
      return <div style={{ padding: 24 }}>Unsupported document type: {doc.type}</div>
  }
}
