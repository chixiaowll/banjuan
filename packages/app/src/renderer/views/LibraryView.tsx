import React, { useEffect, useState } from 'react'
import NoteList from '../components/notes/NoteList.js'

interface Document {
  id: string
  title: string
  type: string
  createdAt: string
}

interface Props {
  rootPath: string
  onOpenDoc: (doc: Document) => void
  onOpenNote: (note: any) => void
}

export default function LibraryView({ rootPath, onOpenDoc, onOpenNote }: Props) {
  const [documents, setDocuments] = useState<Document[]>([])

  const loadDocuments = async () => {
    const docs = await window.electronAPI.documents.list()
    setDocuments(docs)
  }

  useEffect(() => { loadDocuments() }, [])

  const handleImport = async () => {
    const result = await window.electronAPI.documents.import()
    if (result) await loadDocuments()
  }

  const handleDelete = async (id: string) => {
    await window.electronAPI.documents.delete(id)
    await loadDocuments()
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{
        width: '240px', borderRight: '1px solid var(--border)',
        padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px',
      }}>
        <h2 style={{ fontSize: '16px', marginBottom: '8px' }}>半卷闲书</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{rootPath}</p>
        <button className="primary" onClick={handleImport} style={{ marginTop: '16px' }}>
          导入文档
        </button>
        <div style={{ marginTop: 24 }}><NoteList onOpenNote={onOpenNote} /></div>
      </div>

      <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
        <h2 style={{ marginBottom: '16px' }}>文档库</h2>
        {documents.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>还没有文档，点击"导入文档"开始</p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '16px',
          }}>
            {documents.map((doc) => (
              <div key={doc.id} style={{
                background: 'var(--surface)', borderRadius: '8px',
                padding: '16px', border: '1px solid var(--border)',
                cursor: 'pointer',
              }} onClick={() => onOpenDoc(doc)}>
                <div style={{ fontSize: '12px', color: 'var(--accent)', marginBottom: '8px' }}>
                  {doc.type.toUpperCase()}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                  {doc.title}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {new Date(doc.createdAt).toLocaleDateString('zh-CN')}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(doc.id) }}
                  style={{ marginTop: '8px', fontSize: '12px', color: '#f38ba8', borderColor: '#f38ba8' }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
