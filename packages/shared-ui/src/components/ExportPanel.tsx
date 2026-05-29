import React from 'react'
import { useExportManagerStore, type ExportItemStatus } from '../stores/useExportManagerStore.js'
import { X, Minus, ChevronUp, CheckCircle2, AlertCircle, Loader2, Clock, FolderOpen, Trash2 } from 'lucide-react'

const STATUS_ICON: Record<ExportItemStatus, React.ReactNode> = {
  pending: <Clock size={14} style={{ color: 'var(--text-muted, #999)' }} />,
  exporting: <Loader2 size={14} style={{ color: '#4A90D9', animation: 'spin 1s linear infinite' }} />,
  done: <CheckCircle2 size={14} style={{ color: '#27ae60' }} />,
  error: <AlertCircle size={14} style={{ color: '#e74c3c' }} />,
}

const STATUS_LABEL: Record<ExportItemStatus, string> = {
  pending: '等待中',
  exporting: '导出中...',
  done: '已完成',
  error: '失败',
}

export default function ExportPanel() {
  const { items, outputDir, format, isRunning, panelVisible, panelMinimized,
    minimizePanel, restorePanel, dismiss, clearDone } = useExportManagerStore()

  if (!panelVisible) return null

  const doneCount = items.filter(i => i.status === 'done').length
  const errorCount = items.filter(i => i.status === 'error').length
  const total = items.length
  const progress = total > 0 ? doneCount / total : 0

  if (panelMinimized) {
    return (
      <div
        onClick={restorePanel}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 2000,
          background: 'var(--surface, #fff)', border: '1px solid var(--border, #e0e0e0)',
          borderRadius: 10, padding: '8px 16px', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
        }}
      >
        <FolderOpen size={14} />
        <span>导出 {doneCount}/{total}</span>
        <div style={{
          width: 60, height: 4, background: 'var(--border, #e0e0e0)', borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{ width: `${progress * 100}%`, height: '100%', background: '#4A90D9', borderRadius: 2, transition: 'width 0.3s' }} />
        </div>
        <ChevronUp size={14} />
        {!isRunning && (
          <button
            onClick={(e) => { e.stopPropagation(); dismiss() }}
            title="关闭"
            style={{ ...headerBtnStyle, marginLeft: 2 }}
          >
            <X size={13} />
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 2000,
        width: 380, maxHeight: 420,
        background: 'var(--surface, #fff)', border: '1px solid var(--border, #e0e0e0)',
        borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border, #e0e0e0)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <FolderOpen size={15} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
            导出 {format === 'markdown' ? 'Markdown' : format.toUpperCase()}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {doneCount}/{total}
            {errorCount > 0 && <span style={{ color: '#e74c3c' }}> ({errorCount} 失败)</span>}
          </span>
          <button onClick={minimizePanel} title="收起" style={headerBtnStyle}><Minus size={14} /></button>
          {!isRunning && (
            <button onClick={dismiss} title="关闭" style={headerBtnStyle}><X size={14} /></button>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ padding: '0 16px', flexShrink: 0 }}>
          <div style={{
            height: 3, background: 'var(--border, #e0e0e0)', borderRadius: 2,
            marginTop: 8, overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress * 100}%`, height: '100%',
              background: isRunning ? '#4A90D9' : (errorCount > 0 ? '#e74c3c' : '#27ae60'),
              borderRadius: 2, transition: 'width 0.3s',
            }} />
          </div>
        </div>

        {/* File list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {items.map(item => (
            <div key={item.id} style={{
              padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: item.status === 'done' ? 'var(--text-muted, #999)' : 'var(--text, #333)',
            }}>
              {STATUS_ICON[item.status]}
              <span style={{
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.subPath ? `${item.subPath}/` : ''}{item.title}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                {STATUS_LABEL[item.status]}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        {!isRunning && doneCount > 0 && (
          <div style={{
            padding: '8px 16px', borderTop: '1px solid var(--border, #e0e0e0)',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <button onClick={clearDone} style={{
              fontSize: 12, padding: '4px 10px', border: 'none', borderRadius: 6,
              background: 'var(--surface-raised, #f0f0f0)', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Trash2 size={12} />清除已完成
            </button>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
              {outputDir}
            </span>
          </div>
        )}
      </div>
    </>
  )
}

const headerBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 4, cursor: 'pointer',
  color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center',
  borderRadius: 4,
}
