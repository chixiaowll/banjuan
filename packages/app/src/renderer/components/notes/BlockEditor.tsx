import React, { useMemo, useCallback } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { AnnotationEmbed } from './blocks/AnnotationEmbed.js'
import { DocumentEmbed } from './blocks/DocumentEmbed.js'
import '@blocknote/mantine/style.css'
import './BlockEditor.css'

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    annotationEmbed: AnnotationEmbed,
    documentEmbed: DocumentEmbed,
  },
})

interface Props {
  initialContent: string
  onChange: (json: string) => void
  readOnly?: boolean
}

export default function BlockEditor({ initialContent, onChange, readOnly }: Props) {
  const parsedContent = useMemo(() => {
    if (!initialContent) return undefined
    try {
      const blocks = JSON.parse(initialContent)
      return Array.isArray(blocks) && blocks.length > 0 ? blocks : undefined
    } catch {
      return undefined
    }
  }, [initialContent])

  const editor = useCreateBlockNote({
    schema,
    initialContent: parsedContent,
  })

  const handleChange = useCallback(() => {
    const blocks = editor.document
    onChange(JSON.stringify(blocks))
  }, [editor, onChange])

  return (
    <div className={readOnly ? 'reading-mode' : ''}>
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        onChange={handleChange}
        theme="light"
      />
    </div>
  )
}
