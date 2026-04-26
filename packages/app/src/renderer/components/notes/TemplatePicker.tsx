import React, { useState, useEffect } from 'react'

interface Template {
  id: string
  name: string
  description: string
  isBuiltin: boolean
}

interface Props {
  onSelect: (templateId: string | null) => void
  onClose: () => void
}

export default function TemplatePicker({ onSelect, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])

  useEffect(() => {
    window.electronAPI.templates.list().then(setTemplates)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 24, width: 400, maxHeight: 480,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>选择模板</h3>

        <div
          onClick={() => onSelect(null)}
          style={{
            padding: '12px 16px', marginBottom: 8, borderRadius: 8,
            border: '1px solid var(--border)', cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f8f9fb'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <div style={{ fontWeight: 500 }}>空白笔记</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>从空白开始</div>
        </div>

        {templates.map(tpl => (
          <div key={tpl.id}
            onClick={() => onSelect(tpl.id)}
            style={{
              padding: '12px 16px', marginBottom: 8, borderRadius: 8,
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f8f9fb'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ fontWeight: 500 }}>
              {tpl.name}
              {tpl.isBuiltin && <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 8 }}>内置</span>}
            </div>
            {tpl.description && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{tpl.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
