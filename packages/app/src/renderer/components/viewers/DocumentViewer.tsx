import React, { useEffect, useState } from 'react'
import PdfViewer from './PdfViewer.js'
import TextViewer from './TextViewer.js'
import MarkdownViewer from './MarkdownViewer.js'
import ImageViewer from './ImageViewer.js'
import VideoViewer from './VideoViewer.js'

interface DocInfo {
  id: string
  title: string
  type: string
  path: string
}

interface Props {
  doc: DocInfo
  onBack: () => void
}

export default function DocumentViewer({ doc, onBack }: Props) {
  const [filePath, setFilePath] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.documents.getFilePath(doc.path).then(setFilePath)
  }, [doc.path])

  if (!filePath) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      Loading...
    </div>
  }

  const renderViewer = () => {
    switch (doc.type) {
      case 'pdf':
        return <PdfViewer filePath={filePath} />
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
        return <div style={{ padding: 24, color: 'var(--text-muted)' }}>EPUB viewer coming soon...</div>
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
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {renderViewer()}
      </div>
    </div>
  )
}
