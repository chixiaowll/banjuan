import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Library } from '@banjuan/core'

interface ClipInput {
  url: string
  title: string
  html: string
  selectedText?: string
  tags?: string[]
}

export async function saveClip(library: Library, input: ClipInput): Promise<{ id: string; title: string }> {
  const date = new Date().toISOString().slice(0, 10)
  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
  const dirName = `${date}-${slug}`
  const clipDir = join(library.rootPath, 'documents', 'web-clips', dirName)
  mkdirSync(clipDir, { recursive: true })

  writeFileSync(join(clipDir, 'index.html'), input.html, 'utf-8')
  writeFileSync(join(clipDir, 'metadata.json'), JSON.stringify({
    url: input.url,
    title: input.title,
    savedAt: new Date().toISOString(),
    selectedText: input.selectedText ?? null,
  }, null, 2), 'utf-8')

  const htmlPath = join(clipDir, 'index.html')
  const doc = await library.documents.import(htmlPath, { title: input.title })

  if (input.tags?.length) {
    for (const tag of input.tags) {
      const existing = (await library.tags.list()).find(t => t.name === tag)
      if (!existing) await library.tags.create({ name: tag })
    }
    await library.tags.assign(doc.id, 'document', input.tags)
  }

  return { id: doc.id, title: doc.title }
}
