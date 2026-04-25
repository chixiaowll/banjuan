import React, { useEffect, useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { nord } from '@milkdown/theme-nord'
import '@milkdown/theme-nord/style.css'

interface Props {
  initialContent: string
  onChange: (markdown: string) => void
  readOnly?: boolean
}

export default function NoteEditor({ initialContent, onChange, readOnly }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const editorInstance = useRef<Editor | null>(null)

  useEffect(() => {
    if (!editorRef.current) return

    const setupEditor = async () => {
      const editor = await Editor.make()
        .config(nord)
        .config((ctx) => {
          ctx.set(rootCtx, editorRef.current!)
          ctx.set(defaultValueCtx, initialContent)
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onChange(markdown)
          })
        })
        .use(commonmark)
        .use(history)
        .use(listener)
        .create()

      editorInstance.current = editor

      if (readOnly) {
        const view = editor.ctx.get(editorViewCtx)
        view.setProps({ editable: () => false })
      }
    }

    setupEditor()

    return () => {
      editorInstance.current?.destroy()
      editorInstance.current = null
    }
  }, [])

  return (
    <div
      ref={editorRef}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px 24px',
        fontSize: 14,
        lineHeight: 1.7,
      }}
    />
  )
}
