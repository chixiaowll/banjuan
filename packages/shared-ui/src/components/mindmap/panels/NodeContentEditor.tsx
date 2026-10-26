import React from 'react'
import BlockEditor from '../../notes/BlockEditor.js'
import { useMindmapStore } from '../useMindmapStore.js'
import { useNodeContentEditing } from './useNodeContentEditing.js'
import { useT } from '../../../i18n/index.js'

interface Props {
  nodeId: string
  onClose: () => void
}

export default function NodeContentEditor({ nodeId, onClose }: Props) {
  const t = useT()
  const mindmapId = useMindmapStore(s => s.mindmapId)
  const { node, title, setTitle: handleTitleChange, initialContent, editorKey, onContentChange: handleContentChange } = useNodeContentEditing(nodeId)

  if (!node) return <div style={{ padding: 16 }}>{t('common.loading')}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        padding: '8px 16px', borderBottom: '1px solid var(--border, #e0e0e0)', flexShrink: 0,
      }}>
        <textarea
          value={title}
          onChange={e => handleTitleChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
          }}
          rows={title.split('\n').length}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: 15, fontWeight: 600, flex: 1, color: 'var(--text, #333)',
            resize: 'none', fontFamily: 'inherit', lineHeight: 1.4,
          }}
        />
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted, #999)' }}>×</button>
      </div>
      <div className="node-content-editor-body" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <BlockEditor
          key={editorKey}
          noteId={mindmapId ?? undefined}
          initialContent={initialContent}
          onChange={handleContentChange}
          skipLinkSync
          autoParseMarkdown
        />
      </div>
    </div>
  )
}
