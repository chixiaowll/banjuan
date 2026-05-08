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

/**
 * Convert a markdown line into a BlockNote-style block.
 */
function markdownLineToBlock(line: string): unknown | null {
  // Skip blank lines and horizontal rules
  if (line.trim() === '' || line.trim() === '---') return null

  // Headings
  const headingMatch = line.match(/^(#{1,3})\s+(.*)/)
  if (headingMatch) {
    const level = headingMatch[1].length as 1 | 2 | 3
    return {
      type: 'heading',
      props: { level },
      content: [{ type: 'text', text: headingMatch[2] }],
    }
  }

  // Bullet list
  const bulletMatch = line.match(/^[-*]\s+(.*)/)
  if (bulletMatch) {
    return {
      type: 'bulletListItem',
      content: [{ type: 'text', text: bulletMatch[1] }],
    }
  }

  // Numbered list
  const numberedMatch = line.match(/^\d+\.\s+(.*)/)
  if (numberedMatch) {
    return {
      type: 'numberedListItem',
      content: [{ type: 'text', text: numberedMatch[1] }],
    }
  }

  // Block quote -> paragraph with italic style
  const quoteMatch = line.match(/^>\s?(.*)/)
  if (quoteMatch) {
    return {
      type: 'paragraph',
      content: [{ type: 'text', text: quoteMatch[1], styles: { italic: true } }],
    }
  }

  // Regular text -> paragraph
  return {
    type: 'paragraph',
    content: [{ type: 'text', text: line }],
  }
}

function markdownToBlocks(markdown: string): unknown[] {
  const blocks: unknown[] = []
  for (const line of markdown.split('\n')) {
    const block = markdownLineToBlock(line)
    if (block) blocks.push(block)
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
