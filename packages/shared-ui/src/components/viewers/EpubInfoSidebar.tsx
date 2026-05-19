import React, { useState, useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import { useEpubViewer } from './EpubViewerContext.js'
import { useT } from '../../i18n/index.js'
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
  onDocUpdated: (doc: DocInfo) => void
  width?: number
}

function EditableField({ label, value, readOnly, onSave }: {
  label: string; value: string; readOnly?: boolean; onSave?: (val: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(value)

  useEffect(() => { setEditVal(value) }, [value])

  if (readOnly || !onSave) {
    return (
      <div style={{ display: 'flex', padding: '4px 12px', fontSize: 12, gap: 8 }}>
        <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
        <span style={{ color: 'var(--text)', wordBreak: 'break-all' }} title={value}>{value}</span>
      </div>
    )
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', padding: '4px 12px', fontSize: 12, gap: 8 }}>
        <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
        <input
          autoFocus
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => { onSave(editVal); setEditing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { onSave(editVal); setEditing(false) } }}
          style={{
            flex: 1, fontSize: 12, border: '1px solid var(--border)',
            borderRadius: 3, padding: '1px 4px', color: 'var(--text)',
          }}
        />
      </div>
    )
  }

  return (
    <div
      style={{ display: 'flex', padding: '4px 12px', fontSize: 12, gap: 8, cursor: 'pointer' }}
      onClick={() => setEditing(true)}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ width: 80, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{value || '—'}</span>
    </div>
  )
}

export default function EpubInfoSidebar({ doc, onDocUpdated, width = 280 }: Props) {
  const api = useBanjuanAPI()
  const t = useT()
  const { rightSidebarOpen } = useEpubViewer()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [metadata, setMetadata] = useState<Array<{ key: string; value: string }>>(
    Object.entries(doc.metadata).map(([k, v]) => ({ key: k, value: String(v) }))
  )

  useEffect(() => {
    setMetadata(Object.entries(doc.metadata).map(([k, v]) => ({ key: k, value: String(v) })))
  }, [doc.metadata])

  const saveDoc = useCallback((updates: { title?: string; authors?: string[]; metadata?: Record<string, unknown> }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const result = await api.documents.update(doc.id, updates)
      if (result) onDocUpdated(result)
    }, 500)
  }, [doc.id, onDocUpdated])

  const saveMetadata = useCallback((entries: Array<{ key: string; value: string }>) => {
    const obj: Record<string, unknown> = {}
    for (const { key, value } of entries) {
      if (key.trim()) obj[key.trim()] = value
    }
    saveDoc({ metadata: obj })
  }, [saveDoc])

  const updateMetaRow = (index: number, field: 'key' | 'value', val: string) => {
    const next = [...metadata]
    next[index] = { ...next[index], [field]: val }
    setMetadata(next)
    saveMetadata(next)
  }

  const removeMetaRow = (index: number) => {
    const next = metadata.filter((_, i) => i !== index)
    setMetadata(next)
    saveMetadata(next)
  }

  const addMetaRow = () => {
    setMetadata(prev => [...prev, { key: '', value: '' }])
  }

  if (!rightSidebarOpen) return null

  return (
    <div style={{
      width, borderLeft: 'none',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      background: 'var(--bg)', overflow: 'auto', paddingBottom: 80,
    }}>
      <div style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>
        {doc.title}
      </div>
      <div style={{ padding: '8px 0' }}>
        <EditableField label="Title" value={doc.title} onSave={(val) => saveDoc({ title: val })} />
        <EditableField label="Authors" value={doc.authors.join(', ')} onSave={(val) => saveDoc({ authors: val.split(',').map(a => a.trim()).filter(Boolean) })} />
        <EditableField label="Type" value={doc.type.toUpperCase()} readOnly />
        <EditableField label="Path" value={doc.path} readOnly />
        <EditableField label="Created" value={new Date(doc.createdAt).toLocaleString()} readOnly />
        <EditableField label="Updated" value={new Date(doc.updatedAt).toLocaleString()} readOnly />
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
        <div style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
          Metadata
        </div>
        {metadata.map((entry, i) => (
          <div key={i} style={{ display: 'flex', padding: '2px 12px', fontSize: 12, gap: 4, alignItems: 'center' }}>
            <input value={entry.key} onChange={(e) => updateMetaRow(i, 'key', e.target.value)} placeholder="key"
              style={{ width: 70, fontSize: 11, border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px', color: 'var(--text-muted)' }} />
            <input value={entry.value} onChange={(e) => updateMetaRow(i, 'value', e.target.value)} placeholder="value"
              style={{ flex: 1, fontSize: 11, border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px', color: 'var(--text)' }} />
            <button onClick={() => removeMetaRow(i)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 2px', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
          </div>
        ))}
        <button onClick={addMetaRow}
          style={{ margin: '6px 12px', fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {t('info.addField' as any)}
        </button>
      </div>
    </div>
  )
}
