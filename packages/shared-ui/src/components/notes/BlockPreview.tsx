import React, { useMemo, useEffect } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { schema } from './blockSchema.js'
import ErrorBoundary from '../ErrorBoundary.js'
import { migrateRawMarkdownBlocks, parseTextToBlocks } from '../mindmap/parseMarkdownBlocks.js'

interface Props {
  content: string
  compact?: boolean
  style?: React.CSSProperties
}

function BlockPreviewInner({ content, compact, style }: Props) {
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

/** Read-only rendering of note blocks; content it can't render shows as plain text instead of crashing the canvas. */
export default function BlockPreview(props: Props) {
  return (
    <ErrorBoundary resetKey={props.content} fallback={() => <PlainText content={props.content} style={props.style} />}>
      <BlockPreviewInner {...props} />
    </ErrorBoundary>
  )
}

function PlainText({ content, style }: { content: string; style?: React.CSSProperties }) {
  const text = useMemo(() => {
    try {
      const out: string[] = []
      const walk = (x: any) => {
        if (Array.isArray(x)) x.forEach(walk)
        else if (x && typeof x === 'object') { if (typeof x.text === 'string') out.push(x.text); walk(x.content); walk(x.children) }
      }
      walk(JSON.parse(content))
      return out.join(' ')
    } catch { return content }
  }, [content])
  return text ? <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, ...style }}>{text}</div> : null
}
