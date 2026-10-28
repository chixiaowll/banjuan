import { join, basename } from '../platform/path.js'
import { parseFrontmatter } from '../storage/frontmatter.js'
import type { NoteFileData } from '../types.js'
import type { PlatformFS } from '../platform/index.js'
import { parseLink, linkPage, type ParsedLink } from './links.js'

interface NoteJsonFile {
  meta: NoteFileData
  blocks: unknown[]
}

interface MigrationResult {
  migrated: number
  errors: string[]
}

function parseInline(text: string): unknown[] {
  const result: unknown[] = []
  // noteLink branch uses lazy (.+?) rather than [^\]]+ so titles containing
  // brackets (e.g. "[3] P4 冷启动聚合 · 技术方案") still parse; it must sit
  // before the md-link branch so "[[x]](y)"-free inputs never misbind.
  const re = /(\*\*(.+?)\*\*|__(.+?)__|`(.+?)`|\*(.+?)\*|_(.+?)_|~~(.+?)~~|\[\[(.+?)\]\]|\[((?:\\.|[^\]\\])+)\]\(([^)]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) result.push({ type: 'text', text: text.slice(last, m.index), styles: {} })
    if (m[2] || m[3]) {
      result.push({ type: 'text', text: m[2] || m[3], styles: { bold: true } })
    } else if (m[4]) {
      result.push({ type: 'text', text: m[4], styles: { code: true } })
    } else if (m[5] || m[6]) {
      result.push({ type: 'text', text: m[5] || m[6], styles: { italic: true } })
    } else if (m[7]) {
      result.push({ type: 'text', text: m[7], styles: { strikethrough: true } })
    } else if (m[8]) {
      // [[Title]] — atomic note reference; title carried in props (id resolved by
      // title at click time, since this pure parser has no notes list).
      result.push({ type: 'noteLink', props: { noteId: '', title: m[8] } })
    } else if (m[9] && m[10]) {
      // banjuan:// links to a note / document (written so by blocksToMarkdown
      // for AI tools) are note / document links again; one to a page stays a link.
      const label = unescapeLinkText(m[9])
      const target = parseLink(m[10])
      if (target?.kind === 'note' && Object.keys(target.query).length === 0) {
        result.push({ type: 'noteLink', props: { noteId: target.id, title: label } })
      } else if (target?.kind === 'doc' && Object.keys(target.query).length === 0) {
        result.push({ type: 'documentLink', props: { docId: target.id, title: label } })
      } else {
        result.push({ type: 'link', href: m[10], content: [{ type: 'text', text: label, styles: {} }] })
      }
    }
    last = m.index + m[0].length
  }
  if (last < text.length) result.push({ type: 'text', text: text.slice(last), styles: {} })
  if (result.length === 0) result.push({ type: 'text', text, styles: {} })
  return result
}

const unescapeLinkText = (s: string) => s.replace(/\\(.)/g, '$1')

/** A quote whose first line is just a banjuan:// link: an embed (see blocksToMarkdown). */
const EMBED_LINE = /^>\s?\[((?:\\.|[^\]\\])*)\]\((banjuan:\/\/[^)\s]+)\)\s*$/

function embedBlock(link: ParsedLink, text: string, rest: string[]): unknown {
  const label = unescapeLinkText(text).replace(/^(📄|📘|📝)\s?/u, '')
  const q = link.query
  if (link.kind === 'note') {
    return { type: 'noteEmbed', props: { noteId: link.id, noteTitle: label, pageIndex: q.pageIndex ?? '' }, children: [] }
  }
  if (link.kind === 'doc' && (q.embed || rest.length === 0)) {
    return { type: 'documentEmbed', props: { docId: link.id, docTitle: label, authors: q.authors ?? '', pageCount: Number(q.pageCount) || 0 }, children: [] }
  }
  // An annotation quote: "the quoted text" (one line or several), then the comment.
  let quote = ''
  let i = 0
  if (rest[0]?.startsWith('"')) {
    const lines: string[] = []
    let closed = false
    for (; i < rest.length && !closed; i++) {
      lines.push(rest[i])
      closed = rest[i].endsWith('"') && (i > 0 || rest[i].length > 1)
    }
    const all = lines.join('\n')
    quote = closed ? all.slice(1, -1) : all.slice(1)
  }
  const page = linkPage(q) ?? 0
  return {
    type: 'annotationEmbed',
    props: {
      docId: link.kind === 'annotation' ? (q.doc ?? '') : link.id,
      annotationId: link.kind === 'annotation' ? link.id : '',
      quote,
      comment: rest.slice(i).join('\n'),
      docTitle: page ? label.replace(new RegExp(`\\s*p\\.${page}$`), '') : label,
      page,
    },
    children: [],
  }
}

function parseTableLines(lines: string[]): unknown {
  const rows = lines
    .filter(l => !l.match(/^\|[\s-:|]+\|$/))
    .map(l => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()))
  const colCount = rows.length > 0 ? rows[0].length : 0
  return {
    type: 'table',
    props: { textColor: 'default' },
    content: {
      type: 'tableContent',
      columnWidths: Array(colCount).fill(null),
      headerRows: 1,
      rows: rows.map(r => ({
        cells: r.map(c => ({ type: 'tableCell', content: parseInline(c) })),
      })),
    },
    children: [],
  }
}

function markdownLineToBlock(line: string): unknown | null {
  if (line.trim() === '' || line.trim() === '---') return null

  const headingMatch = line.match(/^(#{1,6})\s+(.*)/)
  if (headingMatch) {
    const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3
    return { type: 'heading', props: { level }, content: parseInline(headingMatch[2]), children: [] }
  }

  const checkMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)/)
  if (checkMatch) {
    return { type: 'checkListItem', props: { checked: checkMatch[1] !== ' ' }, content: parseInline(checkMatch[2]), children: [] }
  }

  const bulletMatch = line.match(/^[-*]\s+(.*)/)
  if (bulletMatch) {
    return { type: 'bulletListItem', content: parseInline(bulletMatch[1]), children: [] }
  }

  const numberedMatch = line.match(/^\d+[.)]\s+(.*)/)
  if (numberedMatch) {
    return { type: 'numberedListItem', content: parseInline(numberedMatch[1]), children: [] }
  }

  // ![[noteTitle]] — note embed
  const noteEmbedMatch = line.match(/^!\[\[(.+?)\]\]$/)
  if (noteEmbedMatch) {
    return { type: 'noteEmbed', props: { noteTitle: noteEmbedMatch[1] }, content: undefined, children: [] }
  }

  // ![alt](url) — image (standalone line)
  const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
  if (imageMatch) {
    return { type: 'image', props: { url: imageMatch[2], caption: imageMatch[1] || '' }, children: [] }
  }

  const quoteMatch = line.match(/^>\s?(.*)/)
  if (quoteMatch) {
    return { type: 'paragraph', content: [{ type: 'text', text: quoteMatch[1], styles: { italic: true } }], children: [] }
  }

  return { type: 'paragraph', content: parseInline(line), children: [] }
}

export function markdownToBlocks(markdown: string): unknown[] {
  const lines = markdown.split('\n')
  const blocks: unknown[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Code block
    const codeMatch = line.match(/^```(.*)/)
    if (codeMatch) {
      const lang = codeMatch[1].trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      if (lang === 'mermaid') {
        blocks.push({
          type: 'mermaidBlock',
          props: { code: codeLines.join('\n'), theme: 'neutral' },
          children: [],
        })
      } else {
        blocks.push({
          type: 'codeBlock',
          props: { language: lang || undefined },
          content: [{ type: 'text', text: codeLines.join('\n'), styles: {} }],
          children: [],
        })
      }
      continue
    }

    const embed = EMBED_LINE.exec(line)
    const target = embed ? parseLink(embed[2]) : null
    if (embed && target) {
      const rest: string[] = []
      i++
      while (i < lines.length && lines[i].startsWith('>')) {
        rest.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push(embedBlock(target, embed[1], rest))
      continue
    }

    // Table (starts with |)
    if (line.trimStart().startsWith('|')) {
      const tableLines: string[] = [line]
      i++
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      blocks.push(parseTableLines(tableLines))
      continue
    }

    const block = markdownLineToBlock(line)
    if (block) blocks.push(block)
    i++
  }
  return blocks
}

/** `content` as a JSON list of BlockNote blocks, or null when it is something else (Markdown). */
export function parseBlockList(content: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(content)
    if (Array.isArray(parsed) && parsed.every(b => !!b && typeof b === 'object' && typeof (b as { type?: unknown }).type === 'string')) {
      return parsed
    }
  } catch { /* Markdown */ }
  return null
}

/**
 * Note content handed in from outside (API, CLI, MCP): a JSON list of
 * BlockNote blocks is taken as is, anything else is Markdown.
 */
export function contentToBlocks(content: string): unknown[] {
  return parseBlockList(content) ?? markdownToBlocks(content)
}

/**
 * Migrate markdown (.md) note files in `notesDir` to JSON format.
 *
 * For each .md file:
 * 1. Parse YAML frontmatter as NoteFileData
 * 2. Convert body markdown to BlockNote blocks
 * 3. Write {id}.json with { meta, blocks }
 * 4. Move original .md to backup/ subdirectory
 *
 * Already-migrated files (where .json already exists) are skipped.
 */
export function migrateNotesToJson(notesDir: string, fs?: PlatformFS): MigrationResult {
  // Note: This function remains synchronous for backwards compatibility when
  // called without fs parameter. When PlatformFS is provided, the caller
  // should use migrateNotesToJsonAsync instead.
  const result: MigrationResult = { migrated: 0, errors: [] }
  // Without a PlatformFS instance we cannot do anything - return empty result
  if (!fs) return result
  return result
}

/**
 * Async version of migrateNotesToJson that uses PlatformFS.
 */
export async function migrateNotesToJsonAsync(notesDir: string, fs: PlatformFS): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: 0, errors: [] }

  if (!(await fs.exists(notesDir))) {
    return result
  }

  const allFiles = await fs.readdir(notesDir)
  const files = allFiles.filter((f) => f.endsWith('.md'))

  for (const file of files) {
    try {
      const mdPath = join(notesDir, file)
      const id = basename(file, '.md')
      const jsonPath = join(notesDir, `${id}.json`)

      // Skip if already migrated
      if (await fs.exists(jsonPath)) continue

      const raw = await fs.readTextFile(mdPath)
      const { data, content } = parseFrontmatter<Partial<NoteFileData>>(raw)

      const now = new Date().toISOString()

      const meta: NoteFileData = {
        id: data.id ?? id,
        title: data.title ?? id,
        type: data.type ?? 'markdown',
        docId: data.docId ?? null,
        folderId: data.folderId ?? null,
        annotationIds: data.annotationIds ?? [],
        tags: data.tags ?? [],
        contentFormat: 'json',
        typeMeta: data.typeMeta ?? null,
        createdAt: data.createdAt ?? now,
        updatedAt: now,
      }

      const blocks = markdownToBlocks(content)

      const jsonFile: NoteJsonFile = { meta, blocks }
      await fs.writeTextFile(jsonPath, JSON.stringify(jsonFile, null, 2))

      // Move original to backup/
      const backupDir = join(notesDir, 'backup')
      await fs.mkdir(backupDir, { recursive: true })
      await fs.rename(mdPath, join(backupDir, file))

      result.migrated++
    } catch (err) {
      result.errors.push(`Failed to migrate ${file}: ${(err as Error).message}`)
    }
  }

  return result
}
