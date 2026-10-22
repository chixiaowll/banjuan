import { Tag, ChevronDown, ChevronRight } from 'lucide-react'
import { type LibraryTag, TYPE_PILLS, formatDate } from './helpers.js'
import { useLibrary } from './LibraryContext.js'

/** Documents and notes carrying the selected tag. */
export default function LibraryTagResults() {
  const {
    layout, locale, onOpenDoc, onOpenMindmap, onOpenNote, selectedTag, setTagDocSectionExpanded,
    setTagNoteSectionExpanded, t, tagDocSectionExpanded, tagFilteredDocs, tagFilteredNotes,
    tagNoteSectionExpanded, tagsWithCounts,
  } = useLibrary()
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: layout.homePadding }}>
      <div style={{ maxWidth: layout.contentMaxWidth || undefined, margin: layout.centeredContent ? '0 auto' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <Tag size={20} style={{ color: tagsWithCounts.find(t => t.id === selectedTag)?.color || 'var(--ink-soft)' }} />
          <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
            {tagsWithCounts.find(t => t.id === selectedTag)?.name || ''}
          </h1>
          <span style={{ fontSize: 13, color: 'var(--ink-mute)', background: 'var(--hover)', padding: '2px 10px', borderRadius: 11 }}>
            {t('library.itemCount', tagFilteredDocs.length + tagFilteredNotes.length)}
          </span>
        </div>

        {/* Documents section */}
        {tagFilteredDocs.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div
              onClick={() => setTagDocSectionExpanded(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12, userSelect: 'none' }}
            >
              {tagDocSectionExpanded ? <ChevronDown size={16} style={{ color: 'var(--ink-mute)' }} /> : <ChevronRight size={16} style={{ color: 'var(--ink-mute)' }} />}
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-soft)' }}>
                {t('library.documents')}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>({tagFilteredDocs.length})</span>
            </div>
            {tagDocSectionExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {tagFilteredDocs.map(doc => {
                  const pill = TYPE_PILLS[doc.type]
                  const extLabel = doc.type === 'other' || (doc.type === 'txt' && doc.path && !doc.path.endsWith('.txt'))
                    ? (doc.path?.split('.').pop()?.toUpperCase() || (pill?.label ?? doc.type))
                    : (pill?.label ?? doc.type)
                  return (
                    <div
                      key={doc.id}
                      onClick={() => onOpenDoc(doc)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', borderRadius: 8,
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      {pill && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                          padding: '2px 7px', borderRadius: 4,
                          background: pill.bg, color: pill.color,
                        }}>{extLabel}</span>
                      )}
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
                      {doc.authors?.[0] && <span style={{ fontSize: 12, color: 'var(--ink-mute)', flexShrink: 0 }}>{doc.authors[0]}</span>}
                      <span style={{ fontSize: 11, color: 'var(--ink-faint)', flexShrink: 0 }}>{formatDate(doc.updatedAt || doc.createdAt, locale)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Notes section */}
        {tagFilteredNotes.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div
              onClick={() => setTagNoteSectionExpanded(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12, userSelect: 'none' }}
            >
              {tagNoteSectionExpanded ? <ChevronDown size={16} style={{ color: 'var(--ink-mute)' }} /> : <ChevronRight size={16} style={{ color: 'var(--ink-mute)' }} />}
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-soft)' }}>
                {t('library.notes')}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>({tagFilteredNotes.length})</span>
            </div>
            {tagNoteSectionExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {tagFilteredNotes.map(note => {
                  const pill = TYPE_PILLS[note.type]
                  return (
                    <div
                      key={note.id}
                      onClick={() => { if (note.type === 'mindmap') onOpenMindmap(note); else onOpenNote(note) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', borderRadius: 8,
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      {pill && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                          padding: '2px 7px', borderRadius: 4,
                          background: pill.bg, color: pill.color,
                        }}>{pill.label}</span>
                      )}
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink-faint)', flexShrink: 0 }}>{formatDate(note.updatedAt || note.createdAt, locale)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {tagFilteredDocs.length === 0 && tagFilteredNotes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink-mute)' }}>
            <Tag size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div style={{ fontSize: 14 }}>{t('library.tagEmpty')}</div>
          </div>
        )}
      </div>
    </div>
  )
}
