import React, { useCallback, useEffect, useState } from 'react'
import PdfViewer from './PdfViewer.js'
import TextViewer from './TextViewer.js'
import HtmlViewer from './HtmlViewer.js'
import MarkdownViewer from './MarkdownViewer.js'
import ImageViewer from './ImageViewer.js'
import VideoViewer from './VideoViewer.js'
import EpubViewer from './EpubViewer.js'
import DocumentLoadError from './DocumentLoadError.js'
import { useBanjuanAPI } from '../../api.js'
import { useT } from '../../i18n/index.js'
import { toast, errorMessage } from '../feedback.js'

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
  const t = useT()
  const [opened, setOpened] = useState(false)

  const handleOpen = useCallback(() => {
    api.documents.openInSystem(doc.path).then(() => setOpened(true))
      .catch((e: unknown) => toast.error(t('viewer.openInSystemFailed', errorMessage(e))))
  }, [doc.path, t])

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
        {opened ? t('viewer.openedInSystem') : t('viewer.openInSystem')}
      </button>
    </div>
  )
}

export default function DocumentViewer({ doc, onBack, onOpenNote }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileSrc, setFileSrc] = useState<string | null>(null)
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null)
  // Any failure to locate/read the file: show it with a retry instead of
  // leaving the viewer on "Loading…" forever.
  const [loadError, setLoadError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const fail = (where: string) => (err: unknown) => {
      console.error(`[DocViewer] ${where} failed:`, doc.path, err)
      if (!cancelled) setLoadError(err)
    }
    setLoadError(null)
    api.documents.getFilePath(doc.path).then(p => { if (!cancelled) setFilePath(p) }).catch(fail('getFilePath'))
    // Platform-correct URL for <img>/<video>/pdf.js: mobile → convertFileSrc
    // (streamable), desktop → local-file:// (registered protocol).
    if (api.documents.getFileSrc) {
      api.documents.getFileSrc(doc.path).then(src => { if (!cancelled) setFileSrc(src) }).catch(fail('getFileSrc'))
    } else {
      api.documents.getFilePath(doc.path).then(p => { if (!cancelled) setFileSrc(`local-file://${encodeURIComponent(p)}`) }).catch(fail('getFilePath'))
    }
    if (doc.type === 'epub') {
      api.documents.readFileBuffer(doc.path).then((buf: ArrayBuffer | Uint8Array) => {
        if (cancelled) return
        if (buf instanceof Uint8Array) {
          setFileData(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
        } else {
          setFileData(buf as ArrayBuffer)
        }
      }).catch(fail('readFileBuffer'))
    }
    return () => { cancelled = true }
  }, [doc.path, doc.type, attempt])

  if (loadError) return <DocumentLoadError error={loadError} onRetry={() => setAttempt(a => a + 1)} />

  // PDF renders its own shell immediately; other binary types wait for data
  if (doc.type === 'pdf') {
    return (
      <PdfViewer
        filePath={filePath || ''}
        fileSrc={fileSrc}
        docPath={doc.path}
        doc={doc}
        onOpenNote={onOpenNote}
      />
    )
  }

  const isLoading = !fileSrc || (doc.type === 'epub' && !fileData)
  if (isLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      {t('common.loading')}
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
      return <ImageViewer src={fileSrc!} />
    case 'video':
      return <VideoViewer src={fileSrc!} docPath={doc.path} doc={doc} onOpenNote={onOpenNote} />
    default:
      return <UnsupportedViewer doc={doc} />
  }
}
