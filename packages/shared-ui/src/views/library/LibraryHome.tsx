import { useEffect, useState } from 'react'
import { Upload, Plus, ChevronRight } from 'lucide-react'
import { PoetryCard } from '../../components/PoetryCard.js'
import { requestDocPage } from '../../utils/docNavigation.js'
import { type Document, TYPE_PILLS, formatDate, readingProgress } from './helpers.js'
import DocCover, { CoverImage } from './DocCover.js'
import { useLibrary } from './LibraryContext.js'

// Placeholder covers while (or when) a document has no thumbnail.
const HOME_COVER_COLORS = ['#E8DCC8', '#B85C4A', '#5B8C6B', '#8B7E9B', '#6B8EA0']
const NOTE_COVER_COLORS = ['#5B8C6B', '#B85C4A', '#6B8EA0', '#8B7E9B', '#E07856']
function stableIndex(text: string, n: number): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0
  return Math.abs(h) % n
}

/** Home: the library's title and counts, today's card, recent documents, notes and annotations. */
export default function LibraryHome() {
  const {
    api, countLabel, documents, handleSectionChange, layout, libraryName, loadDocuments, locale,
    notes, onOpenDoc, onOpenMindmap, onOpenNote, recentAnnotations, rootPath, setRenameInputValue,
    setRenameTarget, setShowNotePicker, setShowRenameInput, showAllAnnotations, t,
    toggleAllAnnotations,
  } = useLibrary()
  // Only when sync is actually set up (WebDAV, or a paired device on the LAN) —
  // this used to say "Synced" whether or not anything was ever synced.
  const [syncOn, setSyncOn] = useState(false)
  useEffect(() => {
    if (!layout.home.showSyncBadge) return
    let alive = true
    void Promise.all([
      api.sync?.getConfig().catch(() => null),
      api.lan?.listPairedDevices().catch(() => []),
    ]).then(([config, peers]) => { if (alive) setSyncOn(!!config?.url || (peers?.length ?? 0) > 0) })
    return () => { alive = false }
  }, [api, layout.home.showSyncBadge])
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
    <div style={{ padding: layout.homePadding, maxWidth: layout.contentMaxWidth ?? undefined, margin: layout.centeredContent ? '0 auto' : undefined }}>
      {/* Breadcrumb */}
      {layout.home.showPathBreadcrumb && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)',
          marginBottom: 24,
        }}>
          {rootPath.split('/').filter(Boolean).map((part, i, arr) => (
            <span key={i}>
              {i > 0 && <span style={{ color: 'var(--ink-ghost)', margin: '0 2px' }}>/</span>}
              <span style={i === arr.length - 1 ? { color: 'var(--ink)' } : undefined}>{part}</span>
            </span>
          ))}
        </div>
      )}

      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: layout.home.headerAlign, justifyContent: 'space-between',
        paddingBottom: layout.home.headerPaddingBottom, marginBottom: layout.home.headerMarginBottom,
        borderBottom: layout.home.headerBorderBottom,
        position: 'relative',
      }}>
        {layout.home.showSealChar && <div style={{
          position: 'absolute', bottom: -1, left: 0, width: 64, height: 1,
          background: 'var(--vermilion)',
        }} />}
        <div style={{ minWidth: 0 }}>
          {layout.home.showSealChar && <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <h1 style={{
              fontFamily: layout.home.titleFont, fontWeight: layout.home.titleFontWeight, fontSize: layout.home.titleFontSize,
              color: 'var(--ink)', letterSpacing: layout.home.titleLetterSpacing, lineHeight: 1, margin: 0, cursor: 'default',
            }} onDoubleClick={() => { setRenameTarget({ type: 'library' }); setRenameInputValue(libraryName); setShowRenameInput(true) }}>
              {libraryName}
            </h1>
            <span style={{
              width: 26, height: 26, background: 'var(--seal)', color: '#FBE9D8',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600,
              borderRadius: 3, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
              transform: 'rotate(-2deg)',
            }}>
              {t('library.sealChar')}
            </span>
          </div>}
          {!layout.home.showSealChar && <h1 style={{
            fontSize: layout.home.titleFontSize, fontWeight: layout.home.titleFontWeight, color: 'var(--ink)',
            letterSpacing: layout.home.titleLetterSpacing, lineHeight: 1.2, margin: 0,
            display: 'inline-flex', alignItems: 'center', gap: 14, cursor: 'default',
          }} onDoubleClick={() => { setRenameTarget({ type: 'library' }); setRenameInputValue(libraryName); setShowRenameInput(true) }}>{libraryName}
            {layout.home.showSyncBadge && syncOn && <span onClick={() => handleSectionChange('sync')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 12,
              background: '#E8F1FB', color: '#4A90E2',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}><span style={{ width: 6, height: 6, background: '#4A90E2', borderRadius: '50%' }} />{t('home.syncOn')}</span>}
          </h1>}
          {layout.home.showSealChar && <div style={{
            marginTop: 8, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)',
            fontSize: 11, letterSpacing: '0.02em',
          }}>
            {rootPath.split('/').map((part, i, arr) => (
              <span key={i}>
                {i > 0 && <span style={{ color: 'var(--ink-ghost)', margin: '0 2px' }}>/</span>}
                <span style={i === arr.length - 1 ? { color: 'var(--vermilion)' } : undefined}>{part}</span>
              </span>
            ))}
          </div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={async () => { if (api.documents.importFilesDialog) { await api.documents.importFilesDialog() } else { await api.documents.import() }; await loadDocuments() }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: layout.home.buttonHeight,
              padding: layout.home.buttonPadding, borderRadius: layout.home.buttonRadius,
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
              color: 'var(--ink-soft)', border: '1px solid var(--border-solid)',
              background: layout.home.importButtonBg,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = layout.home.importButtonBg }}
          >
            <Upload size={14} />
            {t('library.import')}
          </button>
          <button
            onClick={() => setShowNotePicker(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: layout.home.buttonHeight,
              padding: layout.home.buttonPadding, borderRadius: layout.home.buttonRadius,
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
              background: layout.home.primaryButtonBg, color: '#fff', border: 'none',
              cursor: 'pointer', boxShadow: layout.home.primaryButtonShadow,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = layout.home.primaryButtonHoverBg }}
            onMouseLeave={e => { e.currentTarget.style.background = layout.home.primaryButtonBg }}
          >
            <Plus size={14} />
            {t('library.newNote')}
          </button>
        </div>
      </div>

      {/* Stats line */}
      {!layout.home.showSealChar && (
        <div style={{
          fontSize: 13, color: 'var(--ink-mute)', marginBottom: layout.home.statsMarginBottom,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span>{countLabel('library.docCount', documents.length)}</span>
          <span style={{ color: 'var(--ink-ghost)' }}>·</span>
          <span>{countLabel('library.noteCount', notes.length)}</span>
          <span style={{ color: 'var(--ink-ghost)' }}>·</span>
          <span>{countLabel('home.annotationCount', recentAnnotations.length)}</span>
        </div>
      )}

      {/* Poetry / Quote section */}
      {layout.home.showDailyPick && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
            <span style={{ fontSize: 18 }}>📅</span>
            {t('home.dailyPick')}
          </div>
        </div>
      )}
      <div style={{ marginBottom: layout.home.poetryMarginBottom, paddingBottom: layout.home.poetryPaddingBottom, borderBottom: layout.home.poetryBorderBottom }}>
        <PoetryCard locale={locale} />
      </div>

      {layout.home.sectionCardStyle === 'card' ? (<>
        {/* ── Card-style layout ── */}

        {/* Recent documents as cover cards */}
        {documents.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>📚</span>
                  {t('library.recentDocs')}
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-mute)', background: '#fff', padding: '2px 10px', borderRadius: 11, border: '1px solid var(--paper-edge, #F0EBE0)' }}>{t('library.docCount', documents.length)}</span>
              </div>
              <span onClick={() => handleSectionChange('documents')} style={{ fontSize: 13, color: layout.home.linkColor, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 500 }}>{t('library.viewAll')}<ChevronRight size={11} /></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 18 }}>
              {[...documents].sort((a, b) => ((b as any).lastReadAt || b.updatedAt || b.createdAt || '').localeCompare((a as any).lastReadAt || a.updatedAt || a.createdAt || '')).slice(0, 6).map(doc => {
                const pill = TYPE_PILLS[doc.type]
                // Per document, not per position: a book keeps its colour as the order changes.
                const coverBg = HOME_COVER_COLORS[stableIndex(doc.title, HOME_COVER_COLORS.length)]
                const isLight = coverBg === HOME_COVER_COLORS[0]
                const extLabel = doc.type === 'other' || (doc.type === 'txt' && doc.path && !doc.path.endsWith('.txt'))
                  ? (doc.path?.split('.').pop()?.toUpperCase() || (pill?.label ?? doc.type))
                  : (pill?.label ?? doc.type)
                const progress = readingProgress(doc)
                return (
                  <div key={doc.id} onClick={() => onOpenDoc(doc)} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
                  >
                    <DocCover doc={doc}>{cover => (
                    <div style={{
                      aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden', position: 'relative',
                      background: cover ? 'var(--paper, #fff)' : coverBg, padding: 16,
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
                    }}>
                      {/* The first page (PDF), the book's cover (EPUB), … */}
                      {cover && <CoverImage src={cover} />}
                      {/* Binding lines */}
                      <div style={{ position: 'absolute', left: 12, top: 0, bottom: 0, width: 2, background: 'rgba(0,0,0,0.08)' }} />
                      <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,0.05)' }} />
                      {/* Type badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 600, letterSpacing: '0.05em',
                          padding: '2px 6px', borderRadius: 3,
                          background: cover ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.25)',
                          color: cover || !isLight ? '#fff' : 'var(--ink-soft)',
                        }}>{extLabel}</span>
                      </div>
                      {/* Title (the thumbnail already shows it) */}
                      {!cover && <div style={{ marginTop: 'auto' }}>
                        <div style={{
                          fontSize: 14, fontWeight: 600, lineHeight: 1.3,
                          color: isLight ? 'var(--ink)' : '#fff',
                          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>{doc.title}</div>
                        {doc.authors?.[0] && <div style={{
                          fontSize: 11, color: isLight ? 'var(--ink-mute)' : 'rgba(255,255,255,0.7)',
                          marginTop: 4,
                        }}>{doc.authors[0]}</div>}
                      </div>}
                      {/* Reading progress along the bottom edge */}
                      {progress > 0 && (
                        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: 'rgba(0,0,0,0.12)' }}>
                          <div style={{ height: '100%', width: `${progress}%`, background: progress >= 100 ? '#7AAE7E' : 'linear-gradient(90deg, #F0A858, #E07856)' }} />
                        </div>
                      )}
                    </div>
                    )}</DocCover>
                    {/* Card footer */}
                    <div style={{ padding: '8px 2px 0', fontSize: 12, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{doc.title}</div>
                    <div style={{ padding: '2px 2px 0', fontSize: 11, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.authors?.[0] && <>{doc.authors[0]} · </>}
                      {formatDate((doc as any).lastReadAt || doc.updatedAt || doc.createdAt, locale)}
                      {progress > 0 && <> · {progress >= 100 ? t('library.progressDone') : `${progress}%`}</>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Notes as cover cards */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>✎</span>
                {t('home.myNotes')}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-mute)', background: '#fff', padding: '2px 10px', borderRadius: 11, border: '1px solid var(--paper-edge, #F0EBE0)' }}>{t('library.noteCount', notes.length)}</span>
            </div>
            <span onClick={() => handleSectionChange('notes')} style={{ fontSize: 13, color: layout.home.linkColor, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 500 }}>{t('library.viewAll')}<ChevronRight size={11} /></span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 18 }}>
            {[...notes].sort((a, b) => ((b.updatedAt || b.createdAt) || '').localeCompare((a.updatedAt || a.createdAt) || '')).slice(0, 5).map(note => {
              const pill = TYPE_PILLS[note.type]
              const coverBg = NOTE_COVER_COLORS[stableIndex(note.title || '', NOTE_COVER_COLORS.length)]
              return (
                <div key={note.id} onClick={() => { if (note.type === 'mindmap') onOpenMindmap(note); else onOpenNote(note) }}
                  style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
                >
                  <div style={{
                    aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden', position: 'relative',
                    background: coverBg, padding: 16,
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
                  }}>
                    <div style={{ position: 'absolute', left: 12, top: 0, bottom: 0, width: 2, background: 'rgba(0,0,0,0.08)' }} />
                    <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,0.05)' }} />
                    <span style={{
                      fontSize: 9, fontWeight: 600, letterSpacing: '0.05em',
                      padding: '2px 6px', borderRadius: 3, alignSelf: 'flex-start',
                      background: 'rgba(255,255,255,0.25)', color: '#fff',
                    }}>{pill?.label ?? note.type.toUpperCase()}</span>
                    <div style={{ marginTop: 'auto' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: '#fff',
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>{note.title}</div>
                      {note.excerpt && <div style={{ fontSize: 11, lineHeight: 1.45, color: 'rgba(255,255,255,0.72)', marginTop: 6,
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>{note.excerpt}</div>}
                    </div>
                  </div>
                  <div style={{ padding: '8px 2px 0', fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</div>
                  <div style={{ padding: '2px 2px 0', fontSize: 11, color: 'var(--ink-faint)' }}>{formatDate(note.updatedAt || note.createdAt, locale)}</div>
                </div>
              )
            })}
            {/* New note card */}
            <div onClick={() => setShowNotePicker(true)} style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
            >
              <div style={{
                aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden',
                border: '2px dashed var(--border-solid)', background: 'var(--surface-raised)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <Plus size={24} style={{ color: 'var(--ink-faint)' }} />
                <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>{t('library.newNote')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Annotations as sticky notes */}
        {recentAnnotations.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🏷</span>
                  {t('library.recentAnnotations')}
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-mute)', background: '#fff', padding: '2px 10px', borderRadius: 11, border: '1px solid var(--paper-edge, #F0EBE0)' }}>{recentAnnotations.length > 3 ? `3 / ${recentAnnotations.length}` : recentAnnotations.length}</span>
              </div>
              <span onClick={toggleAllAnnotations} style={{ fontSize: 13, color: layout.home.linkColor, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 500 }}>{showAllAnnotations ? t('detail.collapse') : t('library.viewAll')}<ChevronRight size={11} /></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {(showAllAnnotations ? recentAnnotations : recentAnnotations.slice(0, 8)).map((ann, i) => {
                const stickyColors = ['#FFFDF0', '#FFF0F2', '#F0F6FE']
                const tapeColors = ['rgba(255,225,150,0.65)', 'rgba(240,190,200,0.45)', 'rgba(180,210,240,0.45)']
                const stickyBg = stickyColors[i % stickyColors.length]
                const tapeBg = tapeColors[i % tapeColors.length]
                return (
                  <div key={ann.id}
                    onClick={() => { const doc = documents.find(d => d.id === ann.docId); if (doc) { requestDocPage(doc.id, ann.page); onOpenDoc(doc) } }}
                    style={{
                      position: 'relative', cursor: 'pointer', transition: 'transform 0.15s',
                      paddingTop: 12,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) rotate(-0.5deg)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
                  >
                    {/* Tape decoration */}
                    <div style={{
                      position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%) rotate(-2deg)',
                      width: 48, height: 16, background: tapeBg, borderRadius: 2, zIndex: 1,
                    }} />
                    <div style={{
                      background: stickyBg, borderRadius: 8, padding: '16px 18px', minHeight: 180,
                      boxShadow: '0 4px 12px rgba(60,40,20,0.08), 0 2px 4px rgba(60,40,20,0.04)',
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ann.color || '#4CAF50' }} />
                        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)' }}>
                          {ann.type === 'highlight' ? t('annotation.highlight') : ann.type === 'note' ? t('annotation.note') : ann.type.toUpperCase()}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 13, color: 'rgba(0,0,0,0.75)', lineHeight: 1.5, flex: 1,
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {ann.selectedText ? `"${ann.selectedText}"` : ann.content || (ann.type === 'ink' ? t('library.inkAnnotation') : ann.type)}
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        borderTop: '1px dashed rgba(0,0,0,0.10)', paddingTop: 10, marginTop: 'auto',
                      }}>
                        <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ann.docTitle}</span>
                        <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', flexShrink: 0, marginLeft: 6 }}>
                          {ann.page != null ? t('home.pageShort', String(ann.page + 1).padStart(2, '0')) : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </>) : (<>
        {/* ── List-style layout ── */}

        {/* Content sections — two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: notes.length > 0 && documents.length > 0 ? (!layout.home.showSealChar ? '1fr 1.4fr' : '1fr 1fr') : '1fr', gap: !layout.home.showSealChar ? 48 : 24, marginBottom: !layout.home.showSealChar ? 48 : 28 }}>

          {/* Recent notes */}
          {notes.length > 0 && (
            <div style={layout.home.sectionBg ? {
              background: layout.home.sectionBg, border: layout.home.sectionBorder,
              borderRadius: layout.home.sectionRadius, padding: layout.home.sectionPadding,
            } : {}}>
              <div style={{
                display: 'flex', alignItems: layout.home.sectionBg ? 'center' : 'baseline', justifyContent: 'space-between',
                marginBottom: layout.home.sectionBg ? 18 : 14,
                paddingBottom: layout.home.sectionBg ? 14 : 0,
                borderBottom: layout.home.sectionBg ? '1px solid rgba(28,26,23,0.08)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                    letterSpacing: layout.home.sectionTitleLetterSpacing,
                    fontFamily: layout.home.sectionTitleFont,
                  }}>
                    {t('library.recentNotes')}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 400,
                    color: 'var(--ink-faint)',
                  }}>{notes.length}</span>
                </div>
                <span onClick={() => handleSectionChange('notes')}
                  style={{
                    fontSize: 12, color: 'var(--ink-mute)', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                  }}>
                  {t('library.viewAll')}
                  <ChevronRight size={11} />
                </span>
              </div>
              <div>
                {[...notes].sort((a, b) => ((b.updatedAt || b.createdAt) || '').localeCompare((a.updatedAt || a.createdAt) || '')).slice(0, 5).map(note => {
                  const pill = TYPE_PILLS[note.type]
                  return (
                    <div key={note.id}
                      onClick={() => { if (note.type === 'mindmap') onOpenMindmap(note); else onOpenNote(note) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 0',
                        borderBottom: layout.home.listItemBorderBottom,
                        borderRadius: layout.home.sectionBg ? 4 : 0, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (layout.home.listHoverStyle === 'expand') { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.margin = '0 -8px'; e.currentTarget.style.padding = '10px 8px'; e.currentTarget.style.borderRadius = '5px' } else { e.currentTarget.style.background = 'rgba(255,255,255,0.6)' } }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; if (layout.home.listHoverStyle === 'expand') { e.currentTarget.style.margin = '0'; e.currentTarget.style.padding = '10px 0'; e.currentTarget.style.borderRadius = '0' } }}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        height: 18, minWidth: 38, padding: '0 6px', borderRadius: 3,
                        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500,
                        letterSpacing: '0.02em',
                        background: pill?.bg ?? 'var(--tag-txt-bg)', color: pill?.color ?? 'var(--tag-txt-color)',
                      }}>{pill?.label ?? note.type.toUpperCase()}</span>
                      <span style={{
                        flex: 1, fontSize: 13, color: 'var(--ink)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {note.title}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)',
                        flexShrink: 0,
                      }}>
                        {formatDate(note.updatedAt || note.createdAt, locale)}
                      </span>
                    </div>
                  )
                })}
                {notes.length === 0 && (
                  <div style={{
                    padding: '32px 0', textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12,
                  }}>
                    {t('library.emptyNotesPoetic')} · <span
                      onClick={() => setShowNotePicker(true)}
                      style={{ color: 'var(--ink)', cursor: 'pointer', borderBottom: '1px solid var(--ink-ghost)', paddingBottom: 1 }}
                    >{t('library.createNote')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent documents */}
          {documents.length > 0 && (
            <div style={layout.home.sectionBg ? {
              background: layout.home.sectionBg, border: layout.home.sectionBorder,
              borderRadius: layout.home.sectionRadius, padding: layout.home.sectionPadding,
            } : {}}>
              <div style={{
                display: 'flex', alignItems: layout.home.sectionBg ? 'center' : 'baseline', justifyContent: 'space-between',
                marginBottom: layout.home.sectionBg ? 18 : 14,
                paddingBottom: layout.home.sectionBg ? 14 : 0,
                borderBottom: layout.home.sectionBg ? '1px solid rgba(28,26,23,0.08)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                    letterSpacing: layout.home.sectionTitleLetterSpacing,
                    fontFamily: layout.home.sectionTitleFont,
                  }}>
                    {t('library.recentDocs')}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 400,
                    color: 'var(--ink-faint)',
                  }}>{documents.length}</span>
                </div>
                <span onClick={() => handleSectionChange('documents')}
                  style={{
                    fontSize: 12, color: 'var(--ink-mute)', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                  }}>
                  {t('library.viewAll')}
                  <ChevronRight size={11} />
                </span>
              </div>
              <div>
              {[...documents].sort((a, b) => ((b as any).lastReadAt || b.updatedAt || b.createdAt || '').localeCompare((a as any).lastReadAt || a.updatedAt || a.createdAt || '')).slice(0, 5).map(doc => {
                const pill = TYPE_PILLS[doc.type]
                const extLabel = doc.type === 'other' || (doc.type === 'txt' && doc.path && !doc.path.endsWith('.txt'))
                  ? (doc.path?.split('.').pop()?.toUpperCase() || (pill?.label ?? doc.type))
                  : (pill?.label ?? doc.type)
                return (
                  <div key={doc.id}
                    onClick={() => onOpenDoc(doc)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 0',
                      borderBottom: layout.home.listItemBorderBottom,
                      borderRadius: layout.home.sectionBg ? 4 : 0, cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (layout.home.listHoverStyle === 'expand') { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.margin = '0 -8px'; e.currentTarget.style.padding = '10px 8px'; e.currentTarget.style.borderRadius = '5px' } else { e.currentTarget.style.background = 'rgba(255,255,255,0.6)' } }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; if (layout.home.listHoverStyle === 'expand') { e.currentTarget.style.margin = '0'; e.currentTarget.style.padding = '10px 0'; e.currentTarget.style.borderRadius = '0' } }}
                  >
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      height: 18, minWidth: 38, padding: '0 6px', borderRadius: 3,
                      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500,
                      letterSpacing: '0.02em',
                      background: pill?.bg ?? 'var(--tag-txt-bg)', color: pill?.color ?? 'var(--tag-txt-color)',
                    }}>{extLabel}</span>
                    <span style={{
                      flex: 1, fontSize: 13, color: 'var(--ink)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {doc.title}
                    </span>
                    {(doc.metadata as any)?.fileMissing && <span style={{
                      flexShrink: 0, fontSize: 10, fontWeight: 600, color: '#c0392b',
                      border: '1px solid #c0392b', borderRadius: 3, padding: '0 5px', lineHeight: '16px',
                    }}>{t('library.missing')}</span>}
                    {!layout.home.showSealChar && (doc as any).author && <span style={{
                      color: 'var(--ink-faint)', fontSize: 12, flexShrink: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140,
                    }}>{(doc as any).author}</span>}
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)',
                      flexShrink: 0, width: 64, textAlign: 'right',
                    }}>
                      {formatDate((doc as any).lastReadAt || doc.updatedAt || doc.createdAt, locale)}
                    </span>
                  </div>
                )
              })}
              </div>
            </div>
          )}
        </div>

        {/* Annotations section */}
        {recentAnnotations.length > 0 && (
          <div style={layout.home.sectionBg ? {
            background: layout.home.sectionBg, border: layout.home.sectionBorder,
            borderRadius: layout.home.sectionRadius, padding: layout.home.sectionPadding,
          } : { marginBottom: 40 }}>
            <div style={{
              display: 'flex', alignItems: layout.home.sectionBg ? 'center' : 'baseline', justifyContent: 'space-between',
              marginBottom: layout.home.sectionBg ? 20 : 14,
              paddingBottom: layout.home.sectionBg ? 14 : 0,
              borderBottom: layout.home.sectionBg ? '1px solid rgba(28,26,23,0.08)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                  letterSpacing: layout.home.sectionTitleLetterSpacing,
                  fontFamily: layout.home.sectionTitleFont,
                }}>
                  {t('library.recentAnnotations')}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 400,
                  color: 'var(--ink-faint)',
                }}>{recentAnnotations.slice(0, 6).length} / {recentAnnotations.length}</span>
              </div>
              <span onClick={toggleAllAnnotations}
                style={{
                  fontSize: 12, color: 'var(--ink-mute)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>
                {showAllAnnotations ? t('detail.collapse') : t('library.viewAll')}
                <ChevronRight size={11} />
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: layout.home.annotationGridColumns,
              gap: layout.home.annotationLayout === 'grid-card' ? 16 : 20,
            }}>
              {(showAllAnnotations ? recentAnnotations : recentAnnotations.slice(0, layout.home.annotationSlice)).map((ann, i) => {
                const markerColors = ['var(--ink)', '#10B981', '#F59E0B', '#3B82F6']
                const markerColor = ann.color || markerColors[i % markerColors.length]
                return (
                  <div key={ann.id}
                    onClick={() => { const doc = documents.find(d => d.id === ann.docId); if (doc) { requestDocPage(doc.id, ann.page); onOpenDoc(doc) } }}
                    style={layout.home.annotationLayout === 'grid-card' ? {
                      background: 'var(--surface-raised)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: 16, cursor: 'pointer', transition: 'all 0.15s',
                      display: 'flex', flexDirection: 'column', gap: 10, minHeight: 140,
                    } : {
                      borderLeft: `3px solid ${markerColor}`,
                      padding: '4px 0 4px 16px', cursor: 'pointer',
                      transition: 'transform 0.2s',
                    }}
                    onMouseEnter={e => { if (layout.home.annotationLayout === 'grid-card') { e.currentTarget.style.borderColor = 'var(--ink-ghost)'; e.currentTarget.style.transform = 'translateY(-1px)' } else { e.currentTarget.style.transform = 'translateX(2px)' } }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; if (layout.home.annotationLayout === 'grid-card') e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    {layout.home.annotationLayout === 'grid-card' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 3, height: 14, background: markerColor, borderRadius: 2 }} />
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)',
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>{ann.type === 'highlight' ? t('annotation.highlight') : ann.type === 'note' ? t('annotation.note') : ann.type}</span>
                      </div>
                    )}
                    {ann.selectedText ? (
                      <div style={{
                        fontSize: 13, color: 'var(--ink)', lineHeight: 1.55,
                        flex: layout.home.annotationLayout === 'grid-card' ? 1 : undefined, marginBottom: layout.home.annotationLayout === 'grid-card' ? 0 : 8,
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        <em style={{ fontStyle: 'italic', color: 'var(--ink-soft)', fontWeight: 400 }}>
                          "{ann.selectedText}"
                        </em>
                      </div>
                    ) : ann.content ? (
                      <div style={{
                        fontSize: 13, color: 'var(--ink)', lineHeight: 1.55,
                        flex: layout.home.annotationLayout === 'grid-card' ? 1 : undefined, marginBottom: layout.home.annotationLayout === 'grid-card' ? 0 : 8,
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>{ann.content}</div>
                    ) : (
                      <div style={{
                        fontSize: 13, color: 'var(--ink-mute)', fontStyle: 'italic',
                        flex: layout.home.annotationLayout === 'grid-card' ? 1 : undefined, marginBottom: layout.home.annotationLayout === 'grid-card' ? 0 : 8,
                      }}>
                        {ann.type === 'ink' ? t('library.inkAnnotation') : ann.type}
                      </div>
                    )}
                    {layout.home.annotationLayout === 'grid-card' ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        paddingTop: 10, borderTop: '1px solid var(--border-soft, var(--border))',
                      }}>
                        <div style={{
                          fontSize: 11, color: 'var(--ink-mute)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
                        }}>
                          <strong style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>{ann.docTitle}</strong>
                        </div>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)',
                          marginLeft: 8, flexShrink: 0,
                        }}>
                          {ann.page != null ? t('home.pageShort', String(ann.page + 1).padStart(2, '0')) : ''}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.5 }}>
                          <span style={{ color: 'var(--ink-soft)' }}>{ann.docTitle}</span>
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)',
                          letterSpacing: '0.08em',
                        }}>
                          {ann.page != null ? t('home.pageShort', ann.page + 1) : ''}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </>)}
      </div>
      </div>
  )
}
