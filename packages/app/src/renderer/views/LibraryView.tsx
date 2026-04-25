import React, { useEffect, useState } from 'react'
import NoteList from '../components/notes/NoteList.js'
import SyncConfigPanel from '../components/sync/SyncConfigPanel.js'

interface Document {
  id: string
  title: string
  type: string
  path: string
  createdAt: string
}

interface Props {
  rootPath: string
  onOpenDoc: (doc: Document) => void
  onOpenNote: (note: any) => void
  onOpenMindmap: (mindmap: any) => void
  onOpenGraph: () => void
}

export default function LibraryView({ rootPath, onOpenDoc, onOpenNote, onOpenMindmap, onOpenGraph }: Props) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [mindmaps, setMindmaps] = useState<any[]>([])
  const [plugins, setPlugins] = useState<any[]>([])
  const [showPlugins, setShowPlugins] = useState(false)
  const [showSync, setShowSync] = useState(false)
  const [docStatuses, setDocStatuses] = useState<Record<string, string>>({})

  const loadDocStatuses = async (docs: Document[]) => {
    const statuses: Record<string, string> = {}
    for (const doc of docs) {
      try {
        statuses[doc.id] = await window.electronAPI.sync.getDocStatus(doc.id)
      } catch {
        statuses[doc.id] = 'local'
      }
    }
    setDocStatuses(statuses)
  }

  const loadDocuments = async () => {
    const docs = await window.electronAPI.documents.list()
    setDocuments(docs)
    loadDocStatuses(docs)
  }

  const loadMindmaps = async () => {
    const maps = await window.electronAPI.mindmaps.list()
    setMindmaps(maps)
  }

  useEffect(() => { loadDocuments(); loadMindmaps() }, [])

  const handleImport = async () => {
    const result = await window.electronAPI.documents.import()
    if (result) await loadDocuments()
  }

  const handleCreateMindmap = async () => {
    const title = prompt('脑图标题：')
    if (!title) return
    const map = await window.electronAPI.mindmaps.create({ title })
    await loadMindmaps()
    onOpenMindmap(map)
  }

  const loadPlugins = async () => {
    const list = await window.electronAPI.plugins.list()
    setPlugins(list)
  }

  const handleDelete = async (id: string) => {
    await window.electronAPI.documents.delete(id)
    await loadDocuments()
  }

  const handleDownload = async (docId: string) => {
    try {
      await window.electronAPI.sync.stubDownload(docId)
      await loadDocuments()
    } catch (err: any) {
      alert(`下载失败: ${err.message}`)
    }
  }

  const handleUpload = async (docId: string) => {
    try {
      await window.electronAPI.sync.stubUpload(docId)
      await loadDocuments()
    } catch (err: any) {
      alert(`上传失败: ${err.message}`)
    }
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
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>脑图</span>
            <button onClick={handleCreateMindmap} style={{ fontSize: 12 }}>+ 新建</button>
          </div>
          {mindmaps.map((m) => (
            <div key={m.id} onClick={() => onOpenMindmap(m)}
              style={{ padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginBottom: 2 }}>
              {m.title}
            </div>
          ))}
        </div>
        <button onClick={onOpenGraph} style={{ marginTop: 16, width: '100%' }}>
          知识图谱
        </button>
        <button onClick={() => { setShowPlugins(s => !s); if (!showPlugins) loadPlugins() }} style={{ marginTop: 8, width: '100%' }}>
          插件 {plugins.length > 0 && `(${plugins.length})`}
        </button>
        {showPlugins && (
          <div style={{ marginTop: 8, fontSize: 12 }}>
            {plugins.length === 0 && <div style={{ color: 'var(--text-muted)', padding: '4px 0' }}>无已加载插件</div>}
            {plugins.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <span>{p.name} <span style={{ color: 'var(--text-muted)' }}>v{p.version}</span></span>
                <button onClick={async () => {
                  await window.electronAPI.plugins.unload(p.id)
                  setPlugins(ps => ps.filter(x => x.id !== p.id))
                }} style={{ fontSize: 11 }}>卸载</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setShowSync(s => !s)} style={{ marginTop: 8, width: '100%' }}>
          同步
        </button>
      </div>

      {showSync ? (
        <SyncConfigPanel onClose={() => { setShowSync(false); loadDocuments() }} />
      ) : (
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
                    {docStatuses[doc.id] === 'cloud' && (
                      <span style={{ fontSize: 11, color: '#89b4fa', marginLeft: 8 }}>云端</span>
                    )}
                    {docStatuses[doc.id] === 'synced' && (
                      <span style={{ fontSize: 11, color: '#a6e3a1', marginLeft: 8 }}>已同步</span>
                    )}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                    {doc.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {new Date(doc.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: 4 }}>
                    {docStatuses[doc.id] === 'cloud' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(doc.id) }}
                        style={{ fontSize: '12px' }}
                      >
                        下载
                      </button>
                    )}
                    {docStatuses[doc.id] === 'local' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUpload(doc.id) }}
                        style={{ fontSize: '12px' }}
                      >
                        上传
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc.id) }}
                      style={{ fontSize: '12px', color: '#f38ba8', borderColor: '#f38ba8' }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
