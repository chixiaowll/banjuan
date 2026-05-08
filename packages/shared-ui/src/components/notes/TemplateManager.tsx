import React, { useState, useEffect, useCallback } from 'react'
import BlockEditor from './BlockEditor.js'
import { useBanjuanAPI } from '../../api.js'

interface Template {
  id: string
  name: string
  description: string
  content: string
  isBuiltin: boolean
}

interface Props {
  onClose: () => void
}

export default function TemplateManager({ onClose }: Props) {
  const api = useBanjuanAPI()
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Template | null>(null)

  const load = useCallback(async () => {
    const list = await api.templates.list()
    setTemplates(list)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const name = prompt('模板名称:')
    if (!name) return
    const tpl = await api.templates.create({ name, content: '[]' })
    await load()
    setEditing(tpl)
  }

  const handleDelete = async (id: string) => {
    await api.templates.delete(id)
    if (editing?.id === id) setEditing(null)
    await load()
  }

  const handleSaveContent = async (content: string) => {
    if (!editing) return
    await api.templates.update(editing.id, { content })
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 240, borderRight: '1px solid var(--border)', overflow: 'auto' }}>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>模板管理</h3>
          <button onClick={onClose} style={{ fontSize: 12 }}>关闭</button>
        </div>
        {templates.map(tpl => (
          <div key={tpl.id}
            onClick={() => setEditing(tpl)}
            style={{
              padding: '8px 12px', cursor: 'pointer', fontSize: 13,
              background: editing?.id === tpl.id ? 'var(--hover)' : 'transparent',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
            <span>{tpl.name} {tpl.isBuiltin && '(内置)'}</span>
            {!tpl.isBuiltin && (
              <button onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id) }}
                style={{ fontSize: 10, color: '#f38ba8' }}>删除</button>
            )}
          </div>
        ))}
        <div style={{ padding: 8 }}>
          <button onClick={handleCreate} style={{ width: '100%', fontSize: 12 }}>+ 新建模板</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {editing ? (
          <BlockEditor
            key={editing.id}
            initialContent={editing.content}
            onChange={handleSaveContent}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            选择一个模板进行编辑
          </div>
        )}
      </div>
    </div>
  )
}
