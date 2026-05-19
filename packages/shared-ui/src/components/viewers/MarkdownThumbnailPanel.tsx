import React, { useMemo } from 'react'
import type { HeadingItem } from '../notes/NoteOutlinePanel.js'

interface Section {
  heading: HeadingItem
  preview: string
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s+/gm, '')
    .trim()
}

function parseSections(content: string, headings: HeadingItem[]): Section[] {
  const headingRegex = /^(#{1,6})\s+(.*)/gm
  const mdHeadings: Array<{ level: number; text: string; start: number; end: number }> = []
  let match: RegExpExecArray | null
  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length
    const text = match[2].replace(/\s*#+\s*$/, '').trim()
    mdHeadings.push({ level, text, start: match.index, end: match.index + match[0].length })
  }

  if (headings.length === 0 && mdHeadings.length === 0) {
    const preview = stripMarkdown(content)
    return preview ? [{
      heading: { id: '__root__', text: '(No headings)', level: 1 },
      preview: preview.slice(0, 200),
    }] : []
  }

  const sections: Section[] = []
  const usedMdIdx = new Set<number>()

  for (const h of headings) {
    let mi = -1
    for (let j = 0; j < mdHeadings.length; j++) {
      if (usedMdIdx.has(j)) continue
      if (mdHeadings[j].text === h.text && mdHeadings[j].level === h.level) {
        mi = j
        break
      }
    }
    if (mi < 0) {
      for (let j = 0; j < mdHeadings.length; j++) {
        if (usedMdIdx.has(j)) continue
        if (mdHeadings[j].text === h.text) {
          mi = j
          break
        }
      }
    }

    let preview = ''
    if (mi >= 0) {
      usedMdIdx.add(mi)
      const bodyStart = mdHeadings[mi].end
      const bodyEnd = mi + 1 < mdHeadings.length ? mdHeadings[mi + 1].start : content.length
      const body = content.slice(bodyStart, bodyEnd)
      const lines = body.split('\n')
        .filter(l => !l.match(/^#{1,6}\s/) && l.trim())
      preview = stripMarkdown(lines.join(' ')).slice(0, 200)
    }

    sections.push({ heading: h, preview })
  }

  return sections
}

interface Props {
  content: string
  headings: HeadingItem[]
  onSectionClick: (heading: HeadingItem) => void
}

export default function MarkdownThumbnailPanel({ content, headings, onSectionClick }: Props) {
  const sections = useMemo(() => parseSections(content, headings), [content, headings])

  if (sections.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>
        暂无章节
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 8px 80px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', height: '100%' }}>
      {sections.map((section, idx) => (
        <div
          key={section.heading.id || idx}
          onClick={() => onSectionClick(section.heading)}
          style={{
            padding: '10px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
        >
          <div style={{
            fontSize: section.heading.level <= 1 ? 13 : 12,
            fontWeight: section.heading.level <= 2 ? 600 : 500,
            color: 'var(--text)',
            marginBottom: section.preview ? 4 : 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {section.heading.level > 1 && (
              <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 4 }}>
                {'H' + section.heading.level}
              </span>
            )}
            {section.heading.text || '(空标题)'}
          </div>
          {section.preview && (
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-all',
            }}>
              {section.preview}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
