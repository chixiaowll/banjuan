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
    if (doc.type === 'pdf' || doc.type === 'epub') {
      window.electronAPI.documents.readFileBuffer(doc.path).then((buf: ArrayBuffer) => {
        setFileData(buf)
      }).catch((err: any) => console.error('[DocViewer] readFileBuffer error:', err))
    }
  }, [doc.path, doc.type])

  const isLoading = !filePath || ((doc.type === 'pdf' || doc.type === 'epub') && !fileData)
  if (isLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      Loading...
    </div>
  }

  switch (doc.type) {
    case 'pdf':
      return (
        <PdfViewer
          filePath={filePath!}
          fileData={fileData!}
          doc={doc}
          onOpenNote={onOpenNote}
        />
      )
    case 'epub':
      return <EpubViewer filePath={filePath} />
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
