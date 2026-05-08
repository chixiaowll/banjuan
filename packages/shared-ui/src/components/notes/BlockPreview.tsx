import React, { useMemo, useEffect } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core'
import { AnnotationEmbed } from './blocks/AnnotationEmbed.js'
import { DocumentEmbed } from './blocks/DocumentEmbed.js'
import { NoteEmbed } from './blocks/NoteEmbed.js'
import { NoteLink } from './blocks/NoteLink.js'
import { FileEmbed } from './blocks/FileEmbed.js'
import { migrateRawMarkdownBlocks, parseTextToBlocks } from '../mindmap/parseMarkdownBlocks.js'

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    annotationEmbed: AnnotationEmbed,
    documentEmbed: DocumentEmbed,
    noteEmbed: NoteEmbed,
    fileEmbed: FileEmbed,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    noteLink: NoteLink,
  },
})

interface Props {
  content: string
  compact?: boolean
  style?: React.CSSProperties
}

export default function BlockPreview({ content, compact, style }: Props) {
  const parsed = useMemo(() => {
    try {
      const blocks = JSON.parse(content)
      if (!Array.isArray(blocks) || blocks.length === 0) return undefined
      return migrateRawMarkdownBlocks(blocks)
    } catch {
      if (content.trim()) return parseTextToBlocks(content)
      return undefined
    }
  }, [content])

  const editor = useCreateBlockNote({
    schema,
    initialContent: parsed,
  })

  useEffect(() => {
    if (parsed && editor) {
      editor.replaceBlocks(editor.document, parsed)
    }
  }, [parsed, editor])

  if (!parsed) return null

  return (
    <div className={`reading-mode${compact ? ' block-preview-compact' : ''}`} style={style}>
      <BlockNoteView editor={editor} editable={false} theme="light" />
    </div>
  )
}
