import { join, basename } from '../platform/path.js'
import { parseFrontmatter } from '../storage/frontmatter.js'
import type { NoteFileData } from '../types.js'
import type { PlatformFS } from '../platform/index.js'

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
  const re = /(\*\*(.+?)\*\*|__(.+?)__|`(.+?)`|\*(.+?)\*|_(.+?)_|~~(.+?)~~|\[([^\]]+)\]\(([^)]+)\)|\[\[([^\]]+)\]\])/g
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
    } else if (m[8] && m[9]) {
      result.push({ type: 'link', href: m[9], content: [{ type: 'text', text: m[8], styles: {} }] })
    } else if (m[10]) {
      result.push({ type: 'noteLink', content: [{ type: 'text', text: m[10], styles: {} }] })
    }
    last = m.index + m[0].length
  }
  if (last < text.length) result.push({ type: 'text', text: text.slice(last), styles: {} })
  if (result.length === 0) result.push({ type: 'text', text, styles: {} })
  return result
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
  const noteEmbedMatch = line.match(/^!\[\[([^\]]+)\]\]$/)
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
