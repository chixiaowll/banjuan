import React, { useState, useEffect, useCallback, useRef } from 'react'
import { PanelLeft, PanelRight, ArrowLeft, FileDown, FileImage } from 'lucide-react'
import HandwritingEditor from './HandwritingEditor.js'
import { useHandwritingStore } from './useHandwritingStore.js'
import { generateThumbnailDataUrl } from './renderStrokes.js'
import { useT } from '../../i18n/index.js'

interface Props {
  noteId: string
  title: string
  onBack: () => void
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
}

export default function HandwritingCenterContent({ noteId, title, onBack, onToggleLeftSidebar, onToggleRightSidebar }: Props) {
  const t = useT()
  const pages = useHandwritingStore(s => s.pages)
  const currentPageIndex = useHandwritingStore(s => s.currentPageIndex)
  const pageSize = useHandwritingStore(s => s.pageSize)
  const saving = useHandwritingStore(s => s.saving)
  const init = useHandwritingStore(s => s.init)
  const saveCurrentPageSnapshot = useHandwritingStore(s => s.saveCurrentPageSnapshot)
  const updateThumbnail = useHandwritingStore(s => s.updateThumbnail)

  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const thumbsInitRef = useRef<string | null>(null)

  useEffect(() => {
    thumbsInitRef.current = null
    init(noteId)
  }, [noteId, init])

  // Generate thumbnails for all pages once after init loads them
  useEffect(() => {
    if (pages.length === 0 || thumbsInitRef.current === noteId) return
    thumbsInitRef.current = noteId
    for (const page of pages) {
      if (page.snapshot.strokes.length > 0) {
        const url = generateThumbnailDataUrl(page.snapshot.strokes, pageSize.width, pageSize.height)
        if (url) updateThumbnail(page.id, url)
      }
    }
  }, [noteId, pages, pageSize, updateThumbnail])

  const currentPage = pages[currentPageIndex]

  const handleSnapshotChange = useCallback((snapshot: any) => {
    saveCurrentPageSnapshot(snapshot)
  }, [saveCurrentPageSnapshot])

  const handleThumbnailGenerated = useCallback((dataUrl: string) => {
    if (currentPage) {
      updateThumbnail(currentPage.id, dataUrl)
    }
  }, [currentPage, updateThumbnail])

  if (!currentPage) return null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Row 1: Nav toolbar */}
      <div style={{
        height: 40, padding: '0 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <button onClick={onToggleLeftSidebar} title={t('common.toggleSidebar')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'inline-flex', alignItems: 'center' }}>
          <PanelLeft size={16} />
        </button>
        <button onClick={onBack} title={t('common.back')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'inline-flex', alignItems: 'center' }}>
          <ArrowLeft size={16} />
        </button>
        <span style={{
          flex: 1, fontWeight: 600, fontSize: 15, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {saving ? t('note.saving') : t('note.saved')}
        </span>
        <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setExportMenuOpen(v => !v)}
            title={t('note.export')}
            style={{
              background: 'none', border: 'none', borderRadius: 4,
              cursor: 'pointer', padding: '4px', color: 'var(--text-muted)',
              display: 'inline-flex', alignItems: 'center',
            }}
          >
            <FileDown size={16} />
          </button>
          {exportMenuOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 100, minWidth: 160, padding: '4px 0',
            }}>
              <button
                onClick={() => setExportMenuOpen(false)}
                style={{
                  display: 'flex', width: '100%', padding: '8px 16px', border: 'none',
                  background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: 'var(--text)',
                  alignItems: 'center', gap: 6,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <FileImage size={14} />{t('handwriting.exportPdf')}
              </button>
              <button
                onClick={() => setExportMenuOpen(false)}
                style={{
                  display: 'flex', width: '100%', padding: '8px 16px', border: 'none',
                  background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: 'var(--text)',
                  alignItems: 'center', gap: 6,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <FileImage size={14} />{t('handwriting.exportPng')}
              </button>
            </div>
          )}
        </div>
        <button onClick={onToggleRightSidebar} title={t('common.toggleSidebar')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'inline-flex', alignItems: 'center' }}>
          <PanelRight size={16} />
        </button>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <HandwritingEditor
          pageId={currentPage.id}
          snapshot={currentPage.snapshot}
          template={currentPage.template}
          pageWidth={pageSize.width}
          pageHeight={pageSize.height}
          onSnapshotChange={handleSnapshotChange}
          onThumbnailGenerated={handleThumbnailGenerated}
        />
      </div>
    </div>
  )
}
