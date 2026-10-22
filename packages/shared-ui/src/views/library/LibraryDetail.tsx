import { createPortal } from 'react-dom'
import { PanelRightClose, Download, Upload, Trash2 } from 'lucide-react'
import TagInput from '../../components/tags/TagInput.js'
import { confirmDialog } from '../../components/feedback.js'
import DetailField from './DetailField.js'
import { TYPE_PILLS, formatDate } from './helpers.js'
import { useLibrary } from './LibraryContext.js'

/** The selected item's details, portaled into the right inspector that TabManager owns. */
export default function LibraryDetail() {
  const {
    detailCollapseBtnStyle, detailEmptyState, detailHeaderStyle, detailOpen, detailPortalTarget,
    docStatuses, downloadProgress, handleDelete, handleDownload, handleUpload, locale, notes,
    onToggleDetail, selectedItemDetail, selectedItemId, selectedSection, t,
  } = useLibrary()
  return (
    <>
      {detailOpen && detailPortalTarget && createPortal(
        <>
          <div style={detailHeaderStyle}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('detail.title')}</span>
            <button onClick={onToggleDetail} title={t('detail.collapse')} style={detailCollapseBtnStyle}><PanelRightClose size={15} /></button>
          </div>
          {selectedSection === 'documents' ? (
          !(selectedItemId && selectedItemDetail) ? detailEmptyState : (<>
          {selectedItemDetail.metadata?.fileMissing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 12, borderRadius: 8, background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.25)', color: '#c0392b', fontSize: 12, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700 }}>{t('detail.fileMissing')}</span>
              <span style={{ color: 'var(--ink-mute)' }}>{t('detail.fileMissingDesc')}</span>
            </div>
          )}
          <DetailField label={t('detail.docTitle')} value={selectedItemDetail.title} />
          <DetailField label={t('detail.type')} value={(() => {
            const pill = TYPE_PILLS[selectedItemDetail.type]
            const label = selectedItemDetail.type === 'other' || (selectedItemDetail.type === 'txt' && selectedItemDetail.path && !selectedItemDetail.path.endsWith('.txt'))
              ? (selectedItemDetail.path?.split('.').pop()?.toUpperCase() || (pill?.label ?? selectedItemDetail.type))
              : pill?.label ?? selectedItemDetail.type
            return <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, padding: '2px 8px', borderRadius: 9999, background: pill?.bg ?? '#edeef0', color: pill?.color ?? '#737a84' }}>{label}</span>
          })()} />
          <DetailField label={t('detail.path')} value={<span style={{ fontSize: 11, wordBreak: 'break-all' }}>{selectedItemDetail.path}</span>} />
          {selectedItemDetail.hash && (
            <DetailField label={t('detail.hash')} value={<span style={{ fontSize: 11, fontFamily: 'monospace' }}>{selectedItemDetail.hash.substring(0, 16)}...</span>} />
          )}
          {selectedItemDetail.authors && selectedItemDetail.authors.length > 0 && (
            <DetailField label={t('detail.authors')} value={selectedItemDetail.authors.join(', ')} />
          )}
          <DetailField label={t('detail.createdAt')} value={formatDate(selectedItemDetail.createdAt, locale)} />
          <DetailField label={t('detail.updatedAt')} value={formatDate(selectedItemDetail.updatedAt, locale)} />
          <DetailField label={t('detail.syncStatus')} value={
            <span style={{ fontSize: 11, color: docStatuses[selectedItemId] === 'synced' ? '#34c759' : docStatuses[selectedItemId] === 'cloud' ? 'var(--accent)' : 'var(--text-muted)' }}>
              {docStatuses[selectedItemId] === 'synced' ? t('detail.synced') : docStatuses[selectedItemId] === 'cloud' ? t('detail.cloud') : t('detail.local')}
            </span>
          } />
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('library.tags')}</div>
            <TagInput targetId={selectedItemId!} targetType={selectedSection === 'documents' ? 'document' : 'note'} />
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docStatuses[selectedItemId] === 'cloud' && (() => {
              const prog = downloadProgress[selectedItemId]
              const downloading = !!prog
              const pct = prog && prog.total > 0 ? Math.round((prog.loaded / prog.total) * 100) : 0
              const sizeStr = prog && prog.total > 0 ? `${(prog.loaded / 1024 / 1024).toFixed(1)}/${(prog.total / 1024 / 1024).toFixed(1)} MB` : ''
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button onClick={() => handleDownload(selectedItemId)} disabled={downloading}
                    style={{ fontSize: 12, padding: '4px 10px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: downloading ? 0.6 : 1 }}>
                    <Download size={14} />{downloading ? `${pct}% ${sizeStr}` : t('detail.download')}
                  </button>
                  {downloading && (
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--border, #e0e0e0)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: 'var(--accent, #5856d6)', width: `${pct}%`, transition: 'width 0.2s ease' }} />
                    </div>
                  )}
                </div>
              )
            })()}
            {docStatuses[selectedItemId] === 'local' && (
              <button onClick={() => handleUpload(selectedItemId)} style={{ fontSize: 12, padding: '4px 10px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Upload size={14} />{t('detail.upload')}</button>
            )}
          </div>
          </>)
          ) : selectedSection === 'notes' ? (
          (() => {
            const item = notes.find((i: any) => i.id === selectedItemId)
            if (!selectedItemId || !item) return detailEmptyState
            return (
              <>
                <DetailField label={t('detail.docTitle')} value={item.title} />
                <DetailField label={t('detail.createdAt')} value={formatDate(item.createdAt, locale)} />
                <div style={{ marginTop: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('library.tags')}</div>
                  <TagInput targetId={selectedItemId!} targetType={item.type === 'mindmap' ? 'mindmap' : 'note'} />
                </div>
                <div style={{ marginTop: 16 }}>
                  <button onClick={async () => {
                    if (await confirmDialog({ message: t('folderTree.confirmDeleteNote', item.title), danger: true, confirmText: t('common.delete') })) handleDelete(selectedItemId)
                  }} style={{ fontSize: 12, padding: '4px 10px', width: '100%', color: '#ff3b30', borderColor: 'rgba(255,59,48,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Trash2 size={14} />{t('common.delete')}</button>
                </div>
              </>
            )
          })()
          ) : detailEmptyState}
        </>,
        detailPortalTarget
      )}
    </>
  )
}
