import React, { useEffect, useState, useCallback } from 'react'
import SyncConfigPanel from '../components/sync/SyncConfigPanel.js'

interface Document {
  id: string
  title: string
  type: string
  path: string
  authors: string[]
  hash: string
  createdAt: string
  updatedAt: string
}

interface Tag {
  id: string
  name: string
  color: string
}

interface Props {
  rootPath: string
  onOpenDoc: (doc: Document) => void
  onOpenNote: (note: any) => void
  onOpenMindmap: (mindmap: any) => void
  onOpenGraph: () => void
}

type SidebarSection = 'documents' | 'notes' | 'mindmaps' | 'graph' | 'sync' | 'plugins'

const TYPE_COLORS: Record<string, string> = {
  pdf: '#f38ba8',
  epub: '#a6e3a1',
  txt: '#89b4fa',
  md: '#cba6f7',
  image: '#fab387',
  video: '#f9e2af',
  html: '#94e2d5',
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export default function LibraryView({ rootPath, onOpenDoc, onOpenNote, onOpenMindmap, onOpenGraph }: Props) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [mindmaps, setMindmaps] = useState<any[]>([])
  const [plugins, setPlugins] = useState<any[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedSection, setSelectedSection] = useState<SidebarSection>('documents')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedItemDetail, setSelectedItemDetail] = useState<any>(null)
  const [selectedItemTags, setSelectedItemTags] = useState<Tag[]>([])
  const [docStatuses, setDocStatuses] = useState<Record<string, string>>({})
  const [showSync, setShowSync] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

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

  const loadNotes = async () => {
    const list = await window.electronAPI.notes.list()
    setNotes(list)
  }

  const loadMindmaps = async () => {
    const maps = await window.electronAPI.mindmaps.list()
    setMindmaps(maps)
  }

  const loadTags = async () => {
    try {
      const list = await window.electronAPI.tags.list()
      setTags(list)
    } catch {
      setTags([])
    }
  }

  const loadPlugins = async () => {
    const list = await window.electronAPI.plugins.list()
    setPlugins(list)
  }

  useEffect(() => {
    loadDocuments()
    loadNotes()
    loadMindmaps()
    loadTags()
  }, [])

  const handleImport = async () => {
    const result = await window.electronAPI.documents.import()
    if (result) await loadDocuments()
  }

  const handleCreateNote = async () => {
    const title = prompt('笔记标题:')
    if (!title) return
    const note = await window.electronAPI.notes.create({ title, content: '' })
    await loadNotes()
    onOpenNote(note)
  }

  const handleCreateMindmap = async () => {
    const title = prompt('脑图标题:')
    if (!title) return
    const map = await window.electronAPI.mindmaps.create({ title })
    await loadMindmaps()
    onOpenMindmap(map)
  }

  const handleDelete = async (id: string) => {
    if (selectedSection === 'documents') {
      await window.electronAPI.documents.delete(id)
      await loadDocuments()
    } else if (selectedSection === 'notes') {
      await window.electronAPI.notes.delete(id)
      await loadNotes()
    } else if (selectedSection === 'mindmaps') {
      await window.electronAPI.mindmaps.delete(id)
      await loadMindmaps()
    }
    if (selectedItemId === id) {
      setSelectedItemId(null)
      setSelectedItemDetail(null)
      setSelectedItemTags([])
    }
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

  const handleSelectItem = useCallback(async (id: string, type: 'document' | 'note' | 'mindmap') => {
    setSelectedItemId(id)
    if (type === 'document') {
      try {
        const detail = await window.electronAPI.documents.get(id)
        setSelectedItemDetail(detail)
        const itemTags = await window.electronAPI.tags.forTarget(id, 'document')
        setSelectedItemTags(itemTags)
      } catch {
        setSelectedItemDetail(null)
        setSelectedItemTags([])
      }
    } else {
      setSelectedItemDetail(null)
      setSelectedItemTags([])
    }
  }, [])

  const handleSectionChange = (section: SidebarSection) => {
    if (section === 'sync') {
      setShowSync(true)
      return
    }
    if (section === 'plugins') {
      loadPlugins()
    }
    if (section === 'graph') {
      onOpenGraph()
      return
    }
    setSelectedSection(section)
    setSelectedItemId(null)
    setSelectedItemDetail(null)
    setSelectedItemTags([])
    setShowSync(false)
  }

  // Sidebar items
  const sidebarItems: { key: SidebarSection; label: string }[] = [
    { key: 'documents', label: '文档库' },
    { key: 'notes', label: '笔记' },
    { key: 'mindmaps', label: '脑图' },
    { key: 'graph', label: '知识图谱' },
  ]

  const sidebarUtils: { key: SidebarSection; label: string }[] = [
    { key: 'sync', label: '同步' },
    { key: 'plugins', label: '插件' },
  ]

  // Filtered data for center panel
  const getDisplayItems = () => {
    let items: any[] = []
    if (selectedSection === 'documents') items = documents
    else if (selectedSection === 'notes') items = notes
    else if (selectedSection === 'mindmaps') items = mindmaps
    else if (selectedSection === 'plugins') items = plugins

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter((item: any) =>
        (item.title || item.name || '').toLowerCase().includes(q)
      )
    }
    return items
  }

  const displayItems = getDisplayItems()

  // --- Styles ---
  const sidebarStyle: React.CSSProperties = {
    width: 200,
    minWidth: 200,
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    userSelect: 'none',
  }

  const sidebarItemStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: 13,
    cursor: 'pointer',
    borderRadius: 4,
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--accent)' : 'var(--text)',
    background: active ? 'rgba(137, 180, 250, 0.1)' : 'transparent',
    marginBottom: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  })

  const centerStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  }

  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    borderBottom: '1px solid var(--border)',
    gap: 8,
    flexShrink: 0,
  }

  const detailPanelStyle: React.CSSProperties = {
    width: 280,
    minWidth: 280,
    borderLeft: '1px solid var(--border)',
    background: 'var(--surface)',
    overflow: 'auto',
    padding: '16px',
    flexShrink: 0,
  }

  if (showSync) {
    return (
      <div style={{ display: 'flex', height: '100vh' }}>
        <div style={sidebarStyle}>
          <div style={{ padding: '12px 12px 8px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 1 }}>
              半卷闲书
            </div>
          </div>
          <div style={{ padding: '4px 8px' }}>
            {sidebarItems.map((item) => (
              <div
                key={item.key}
                style={sidebarItemStyle(false)}
                onClick={() => handleSectionChange(item.key)}
              >
                {item.label}
              </div>
            ))}
          </div>
        </div>
        <SyncConfigPanel onClose={() => { setShowSync(false); loadDocuments() }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left Sidebar */}
      <div style={sidebarStyle}>
        <div style={{ padding: '12px 12px 8px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 1 }}>
            半卷闲书
          </div>
        </div>

        {/* Collection tree */}
        <div style={{ padding: '4px 8px' }}>
          {sidebarItems.map((item) => (
            <div
              key={item.key}
              style={sidebarItemStyle(selectedSection === item.key)}
              onClick={() => handleSectionChange(item.key)}
            >
              {item.label}
            </div>
          ))}
        </div>

        <div style={{ margin: '8px 12px', borderTop: '1px solid var(--border)' }} />

        {/* Utility items */}
        <div style={{ padding: '0 8px' }}>
          {sidebarUtils.map((item) => (
            <div
              key={item.key}
              style={sidebarItemStyle(selectedSection === item.key)}
              onClick={() => handleSectionChange(item.key)}
            >
              {item.label}
              {item.key === 'plugins' && plugins.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({plugins.length})</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ margin: '8px 12px', borderTop: '1px solid var(--border)' }} />

        {/* Tags section */}
        <div style={{ padding: '4px 12px', flex: 1, overflow: 'auto' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            标签
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tags.map((tag) => (
              <span
                key={tag.id}
                onClick={() => setSelectedTag(selectedTag === tag.id ? null : tag.id)}
                style={{
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  background: selectedTag === tag.id ? 'rgba(137, 180, 250, 0.2)' : 'rgba(255,255,255,0.05)',
                  color: tag.color || 'var(--text-muted)',
                  border: selectedTag === tag.id ? '1px solid var(--accent)' : '1px solid transparent',
                }}
              >
                {tag.name}
              </span>
            ))}
            {tags.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>无标签</span>
            )}
          </div>
        </div>

        {/* Plugins inline list when selected */}
        {selectedSection === 'plugins' && (
          <div style={{ padding: '4px 12px 12px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>已加载插件</div>
            {plugins.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>无已加载插件</div>
            )}
            {plugins.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12 }}>
                <span>{p.name} <span style={{ color: 'var(--text-muted)' }}>v{p.version}</span></span>
                <span
                  onClick={async () => {
                    await window.electronAPI.plugins.unload(p.id)
                    setPlugins(ps => ps.filter(x => x.id !== p.id))
                  }}
                  style={{ fontSize: 11, cursor: 'pointer', color: '#f38ba8' }}
                >
                  卸载
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Center Panel */}
      <div style={centerStyle}>
        {/* Toolbar */}
        <div style={toolbarStyle}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {selectedSection === 'documents' && (
              <button onClick={handleImport} style={{ fontSize: 12, padding: '4px 10px' }}>
                导入
              </button>
            )}
            {selectedSection === 'notes' && (
              <button onClick={handleCreateNote} style={{ fontSize: 12, padding: '4px 10px' }}>
                新建笔记
              </button>
            )}
            {selectedSection === 'mindmaps' && (
              <button onClick={handleCreateMindmap} style={{ fontSize: 12, padding: '4px 10px' }}>
                新建脑图
              </button>
            )}
          </div>
          <input
            className="library-search"
            type="text"
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: 180,
              fontSize: 12,
              padding: '4px 8px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
        </div>

        {/* Table header */}
        <div style={{
          display: 'flex',
          padding: '0 12px',
          borderBottom: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-muted)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, padding: '6px 4px' }}>标题</div>
          {selectedSection === 'documents' && (
            <div style={{ width: 70, padding: '6px 4px', textAlign: 'center' }}>类型</div>
          )}
          <div style={{ width: 100, padding: '6px 4px', textAlign: 'right' }}>创建时间</div>
        </div>

        {/* Table rows */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {displayItems.length === 0 && (
            <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
              {selectedSection === 'documents' && '还没有文档，点击"导入"开始'}
              {selectedSection === 'notes' && '还没有笔记'}
              {selectedSection === 'mindmaps' && '还没有脑图'}
              {selectedSection === 'plugins' && '无已加载插件'}
            </div>
          )}
          {displayItems.map((item: any, idx: number) => {
            const isSelected = selectedItemId === item.id
            return (
              <div
                key={item.id}
                className={`table-row ${isSelected ? 'table-row-selected' : ''}`}
                style={{
                  display: 'flex',
                  padding: '0 12px',
                  height: 32,
                  alignItems: 'center',
                  cursor: 'pointer',
                  fontSize: 13,
                  background: isSelected
                    ? 'rgba(137, 180, 250, 0.15)'
                    : idx % 2 === 0
                      ? 'transparent'
                      : 'rgba(255, 255, 255, 0.02)',
                }}
                onClick={() => {
                  const type = selectedSection === 'documents' ? 'document'
                    : selectedSection === 'notes' ? 'note' : 'mindmap'
                  handleSelectItem(item.id, type as any)
                }}
                onDoubleClick={() => {
                  if (selectedSection === 'documents') onOpenDoc(item)
                  else if (selectedSection === 'notes') onOpenNote(item)
                  else if (selectedSection === 'mindmaps') onOpenMindmap(item)
                }}
              >
                <div style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  padding: '0 4px',
                }}>
                  {item.title || item.name}
                </div>
                {selectedSection === 'documents' && (
                  <div style={{ width: 70, textAlign: 'center', padding: '0 4px' }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: TYPE_COLORS[item.type] || 'var(--text-muted)',
                      letterSpacing: 0.5,
                    }}>
                      {item.type}
                    </span>
                  </div>
                )}
                <div style={{
                  width: 100,
                  textAlign: 'right',
                  padding: '0 4px',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}>
                  {formatDate(item.createdAt)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right Detail Panel */}
      {selectedItemId && selectedSection === 'documents' && selectedItemDetail && (
        <div style={detailPanelStyle}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            详情
          </div>

          <DetailField label="标题" value={selectedItemDetail.title} />
          <DetailField label="类型" value={
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: TYPE_COLORS[selectedItemDetail.type] || 'var(--text-muted)',
            }}>
              {selectedItemDetail.type}
            </span>
          } />
          <DetailField label="路径" value={
            <span style={{ fontSize: 11, wordBreak: 'break-all' }}>
              {selectedItemDetail.path}
            </span>
          } />
          {selectedItemDetail.hash && (
            <DetailField label="Hash" value={
              <span style={{ fontSize: 11, fontFamily: 'monospace' }}>
                {selectedItemDetail.hash.substring(0, 16)}...
              </span>
            } />
          )}
          {selectedItemDetail.authors && selectedItemDetail.authors.length > 0 && (
            <DetailField label="作者" value={selectedItemDetail.authors.join(', ')} />
          )}
          <DetailField label="创建时间" value={formatDate(selectedItemDetail.createdAt)} />
          <DetailField label="更新时间" value={formatDate(selectedItemDetail.updatedAt)} />

          {/* Sync status */}
          <DetailField label="同步状态" value={
            <span style={{
              fontSize: 11,
              color: docStatuses[selectedItemId] === 'synced' ? '#a6e3a1'
                : docStatuses[selectedItemId] === 'cloud' ? '#89b4fa' : 'var(--text-muted)',
            }}>
              {docStatuses[selectedItemId] === 'synced' ? '已同步'
                : docStatuses[selectedItemId] === 'cloud' ? '云端' : '本地'}
            </span>
          } />

          {/* Tags */}
          {selectedItemTags.length > 0 && (
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>标签</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedItemTags.map((tag) => (
                  <span key={tag.id} style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.05)',
                    color: tag.color || 'var(--text-muted)',
                  }}>
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docStatuses[selectedItemId] === 'cloud' && (
              <button
                onClick={() => handleDownload(selectedItemId)}
                style={{ fontSize: 12, padding: '4px 10px', width: '100%' }}
              >
                下载到本地
              </button>
            )}
            {docStatuses[selectedItemId] === 'local' && (
              <button
                onClick={() => handleUpload(selectedItemId)}
                style={{ fontSize: 12, padding: '4px 10px', width: '100%' }}
              >
                上传到云端
              </button>
            )}
            <button
              onClick={() => handleDelete(selectedItemId)}
              style={{ fontSize: 12, padding: '4px 10px', width: '100%', color: '#f38ba8', borderColor: '#f38ba8' }}
            >
              删除
            </button>
          </div>
        </div>
      )}

      {/* Simplified detail for notes/mindmaps */}
      {selectedItemId && selectedSection !== 'documents' && selectedSection !== 'plugins' && (
        <div style={detailPanelStyle}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            详情
          </div>
          {(() => {
            const items = selectedSection === 'notes' ? notes : mindmaps
            const item = items.find((i: any) => i.id === selectedItemId)
            if (!item) return null
            return (
              <>
                <DetailField label="标题" value={item.title} />
                <DetailField label="创建时间" value={formatDate(item.createdAt)} />
                <div style={{ marginTop: 16 }}>
                  <button
                    onClick={() => handleDelete(selectedItemId)}
                    style={{ fontSize: 12, padding: '4px 10px', width: '100%', color: '#f38ba8', borderColor: '#f38ba8' }}
                  >
                    删除
                  </button>
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  )
}
