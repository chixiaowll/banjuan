import React, { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { withLocalImages } from './localImages.js'

const BlockEditor = lazy(() => import('../notes/BlockEditor.js'))

interface Props {
  /** The text when the editor opens. */
  initialText: string
  /** Bumped with new text when the file was reloaded from disk. */
  reload: { text: string; version: number } | null
  onChange: (text: string) => void
  onSaveNow: () => void
  readOnly: boolean
  isMarkdown: boolean
  showPreview: boolean
  /** The file's real path: relative image links in the preview resolve against its folder. */
  filePath: string
}

/**
 * Source editing of a Markdown / text file, exactly as written (CodeMirror),
 * with an optional live preview beside it for Markdown.
 */
export default function TextFileEditor({ initialText, reload, onChange, onSaveNow, readOnly, isMarkdown, showPreview, filePath }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onSaveRef = useRef(onSaveNow)
  onSaveRef.current = onSaveNow
  const [preview, setPreview] = useState({ text: initialText, version: 0 })
  const setPreviewText = (text: string) => setPreview(p => ({ text, version: p.version + 1 }))

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          search({ top: true }),
          highlightSelectionMatches(),
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: () => { onSaveRef.current(); return true } },
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
            indentWithTab,
          ]),
          ...(isMarkdown ? [markdown(), syntaxHighlighting(defaultHighlightStyle, { fallback: true })] : []),
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of(update => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)' },
            '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.6' },
            '.cm-content': { padding: '16px 0', caretColor: 'var(--text)' },
            '.cm-gutters': { background: 'var(--bg)', color: 'var(--text-muted)', border: 'none' },
            '.cm-activeLine': { background: 'var(--hover, rgba(0,0,0,0.03))' },
            '.cm-activeLineGutter': { background: 'transparent', color: 'var(--text)' },
            '&.cm-focused': { outline: 'none' },
          }),
        ],
      }),
    })
    viewRef.current = view
    view.focus()
    return () => { view.destroy(); viewRef.current = null }
    // Created once; text changes from outside come through `reload`.
  }, [])

  // The file was reloaded: replace the text, keeping the cursor where it can stay.
  useEffect(() => {
    const view = viewRef.current
    if (!view || !reload) return
    const head = Math.min(view.state.selection.main.head, reload.text.length)
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: reload.text }, selection: { anchor: head } })
    setPreviewText(reload.text)
  }, [reload?.version])

  // The preview follows typing with a short delay (it re-renders the whole document).
  useEffect(() => {
    if (!showPreview) return
    const view = viewRef.current
    let last = view?.state.doc.toString() ?? initialText
    setPreviewText(last)
    const timer = setInterval(() => {
      const now = viewRef.current?.state.doc.toString()
      if (now !== undefined && now !== last) { last = now; setPreviewText(now) }
    }, 400)
    return () => clearInterval(timer)
  }, [showPreview])

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <div ref={hostRef} style={{ flex: 1, minWidth: 0, height: '100%' }} />
      {isMarkdown && showPreview && (
        <div style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'auto', borderLeft: '1px solid var(--border)', padding: '8px 16px' }}>
          <Suspense fallback={null}>
            {/* Remounted per version: the block editor takes its content once. */}
            <BlockEditor key={preview.version} initialContent={withLocalImages(preview.text, filePath)} onChange={() => {}} readOnly autoParseMarkdown skipLinkSync />
          </Suspense>
        </div>
      )}
    </div>
  )
}
