import type { Annotation } from '@banjuan/core'
import type { BanjuanAPI } from '../api.js'
import type { MessageKey } from '../i18n/index.js'

type T = (key: MessageKey, ...args: Array<string | number>) => string

/** Annotations that carry text worth collecting (ink strokes don't). */
const hasText = (a: Annotation) => a.type !== 'ink' && !!(a.selectedText?.trim() || a.content?.trim())

const topOf = (a: Annotation): number => {
  const rects = (a.position as any)?.rects
  return Array.isArray(rects) && rects.length ? Number(rects[0]?.y) || 0 : 0
}

/**
 * Blocks of a reading note: the document, then the annotations grouped by
 * page in reading order (page, then position on the page), each as an
 * annotation embed (quote + comment, click jumps back to the page).
 */
export function buildReadingNoteBlocks(
  doc: { id: string; title: string; authors?: string[] },
  annotations: Annotation[],
  t: T,
): unknown[] {
  const items = annotations.filter(hasText).sort((a, b) =>
    (a.page ?? Infinity) - (b.page ?? Infinity) || topOf(a) - topOf(b) || a.createdAt.localeCompare(b.createdAt))
  const blocks: unknown[] = [
    { type: 'documentEmbed', props: { docId: doc.id, docTitle: doc.title, authors: (doc.authors ?? []).join(', '), pageCount: 0 } },
  ]
  let section: string | null = null
  for (const a of items) {
    const heading = a.page ? t('pdf.page', a.page) : t('readingNote.annotations')
    if (heading !== section) {
      blocks.push({ type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: heading }] })
      section = heading
    }
    blocks.push({
      type: 'annotationEmbed',
      props: { docId: doc.id, annotationId: a.id, quote: a.selectedText ?? '', comment: a.content ?? '', docTitle: doc.title, page: a.page ?? 0 },
    })
  }
  return blocks
}

/**
 * Create a reading note for a document from its annotations, attached to the
 * document (it shows in the reader's notes panel). Returns null when the
 * document has no text annotations yet.
 */
export async function createReadingNote(api: BanjuanAPI, docId: string, t: T): Promise<{ note: any; count: number } | null> {
  const doc = await api.documents.get(docId)
  if (!doc) return null
  const annotations = await api.annotations.list({ docId })
  const count = annotations.filter(hasText).length
  if (count === 0) return null
  const content = JSON.stringify(buildReadingNoteBlocks(doc, annotations, t))
  const base = t('readingNote.title', doc.title)
  for (let i = 1; i < 100; i++) {
    try {
      const note = await api.notes.create({ title: i === 1 ? base : `${base} (${i})`, docId, content })
      return { note, count }
    } catch (e: any) {
      if (!String(e?.message).includes('DUPLICATE_TITLE')) throw e
    }
  }
  return null
}
