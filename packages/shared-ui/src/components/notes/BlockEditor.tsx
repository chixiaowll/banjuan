import React, { useMemo, useCallback, useEffect, useState, useRef, useImperativeHandle, forwardRef } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { SuggestionMenuController, useCreateBlockNote, getDefaultReactSlashMenuItems } from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu, createCodeBlockSpec } from '@blocknote/core'
import './noteThemes.js'
import type { HeadingItem } from './NoteOutlinePanel.js'
import { AnnotationEmbed } from './blocks/AnnotationEmbed.js'
import { DocumentEmbed } from './blocks/DocumentEmbed.js'
import { NoteEmbed } from './blocks/NoteEmbed.js'
import { NoteLink } from './blocks/NoteLink.js'
import { DocumentLink } from './blocks/DocumentLink.js'
import { FileEmbed } from './blocks/FileEmbed.js'
import { MermaidBlock } from './blocks/MermaidBlock.js'
import '@blocknote/mantine/style.css'
import './BlockEditor.css'
import { useBanjuanAPI } from '../../api.js'
import type { BanjuanAPI } from '../../api.js'
import {
  exportBlocksToMarkdown, exportBlocksToHTML,
  extractExportAttachmentPaths,
  screenshotMindmapEmbed, screenshotHandwritingEmbed,
  renderMindmapTreeMd, renderMindmapTreeHtml,
} from '../../utils/noteExport.js'

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'])

const supportedLanguages = {
  text: { name: 'Plain Text', aliases: ['plaintext', 'txt'] },
  javascript: { name: 'JavaScript', aliases: ['js'] },
  typescript: { name: 'TypeScript', aliases: ['ts'] },
  python: { name: 'Python', aliases: ['py'] },
  java: { name: 'Java', aliases: [] },
  c: { name: 'C', aliases: [] },
  cpp: { name: 'C++', aliases: ['c++'] },
  csharp: { name: 'C#', aliases: ['c#', 'cs'] },
  go: { name: 'Go', aliases: ['golang'] },
  rust: { name: 'Rust', aliases: ['rs'] },
  swift: { name: 'Swift', aliases: [] },
  kotlin: { name: 'Kotlin', aliases: ['kt'] },
  ruby: { name: 'Ruby', aliases: ['rb'] },
  php: { name: 'PHP', aliases: [] },
  html: { name: 'HTML', aliases: [] },
  css: { name: 'CSS', aliases: [] },
  json: { name: 'JSON', aliases: [] },
  yaml: { name: 'YAML', aliases: ['yml'] },
  xml: { name: 'XML', aliases: [] },
  sql: { name: 'SQL', aliases: [] },
  bash: { name: 'Bash', aliases: ['sh', 'shell', 'zsh'] },
  markdown: { name: 'Markdown', aliases: ['md'] },
  latex: { name: 'LaTeX', aliases: ['tex'] },
  r: { name: 'R', aliases: [] },
  matlab: { name: 'MATLAB', aliases: [] },
  lua: { name: 'Lua', aliases: [] },
  dart: { name: 'Dart', aliases: [] },
  scala: { name: 'Scala', aliases: [] },
  jsx: { name: 'JSX', aliases: [] },
  tsx: { name: 'TSX', aliases: [] },
}

const codeBlock = createCodeBlockSpec({
  supportedLanguages,
  createHighlighter: () => import('shiki').then(m => m.createHighlighter({ themes: ['github-light', 'github-dark'], langs: Object.keys(supportedLanguages) })),
})

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock,
    annotationEmbed: AnnotationEmbed,
    documentEmbed: DocumentEmbed,
    noteEmbed: NoteEmbed,
    fileEmbed: FileEmbed,
    mermaidBlock: MermaidBlock,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    noteLink: NoteLink,
    documentLink: DocumentLink,
  },
})

interface NoteItem {
  id: string
  title: string
}

export interface BlockEditorHandle {
  exportMarkdown: () => Promise<{ markdown: string; files: Array<{ name: string; dataUrl: string }> }>
  exportHTML: () => Promise<string>
  getAttachmentPaths: () => string[]
}

interface Props {
  noteId?: string
  initialContent: string
  onChange: (json: string) => void
  readOnly?: boolean
  skipLinkSync?: boolean
  autoParseMarkdown?: boolean
  onOpenNote?: (note: NoteItem) => void
  onHeadingsChange?: (headings: HeadingItem[]) => void
}

function extractHeadings(blocks: any[]): HeadingItem[] {
  const headings: HeadingItem[] = []
  for (const block of blocks) {
    if (block.type === 'heading' && block.id) {
      const text = Array.isArray(block.content)
        ? block.content.map((c: any) => (typeof c === 'string' ? c : c.text || '')).join('')
        : ''
      headings.push({ id: block.id, text, level: block.props?.level ?? 1 })
    }
  }
  return headings
}

function extractNoteLinks(blocks: any[]): Array<{ targetId: string; context: string }> {
  const links: Array<{ targetId: string; context: string }> = []
  const walk = (node: any) => {
    if (!node) return
    if (node.type === 'noteLink' && node.props?.noteId) {
      const text = Array.isArray(node.content)
        ? node.content.map((c: any) => (typeof c === 'string' ? c : c.text || '')).join('')
        : ''
      links.push({ targetId: node.props.noteId, context: text })
    }
    if (node.type === 'noteEmbed' && node.props?.noteId) {
      links.push({ targetId: node.props.noteId, context: node.props.noteTitle || '' })
    }
    if (Array.isArray(node.content)) node.content.forEach(walk)
    if (Array.isArray(node.children)) node.children.forEach(walk)
  }
  blocks.forEach(walk)
  return links
}

function extractDocumentLinks(blocks: any[]): Array<{ targetId: string; context: string }> {
  const links: Array<{ targetId: string; context: string }> = []
  const walk = (node: any) => {
    if (!node) return
    if (node.type === 'documentLink' && node.props?.docId) {
      const text = Array.isArray(node.content)
        ? node.content.map((c: any) => (typeof c === 'string' ? c : c.text || '')).join('')
        : ''
      links.push({ targetId: node.props.docId, context: text })
    }
    if (node.type === 'documentEmbed' && node.props?.docId) {
      links.push({ targetId: node.props.docId, context: node.props.docTitle || '' })
    }
    if (Array.isArray(node.content)) node.content.forEach(walk)
    if (Array.isArray(node.children)) node.children.forEach(walk)
  }
  blocks.forEach(walk)
  return links
}

function getMermaidSlashItem(editor: any) {
  return {
    title: 'Mermaid Diagram',
    subtext: 'Insert a Mermaid diagram',
    group: 'Media',
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, {
        type: 'mermaidBlock' as any,
      })
    },
    aliases: ['mermaid', 'diagram', 'flowchart', 'chart'],
  }
}

async function uploadFile(api: BanjuanAPI, noteId: string, file: File): Promise<{ relativePath: string; isImage: boolean }> {
  const buffer = await file.arrayBuffer()
  const relativePath = await api.attachments.save(noteId, file.name, buffer)
  return { relativePath, isImage: IMAGE_TYPES.has(file.type) }
}

const BlockEditor = forwardRef<BlockEditorHandle, Props>(function BlockEditor({ noteId, initialContent, onChange, readOnly, skipLinkSync, autoParseMarkdown, onOpenNote, onHeadingsChange }, ref) {
  const api = useBanjuanAPI()
  const [allNotes, setAllNotes] = useState<NoteItem[]>([])
  const [allDocs, setAllDocs] = useState<Array<{ id: string; title: string }>>([])
  const onOpenNoteRef = useRef(onOpenNote)
  const allNotesRef = useRef(allNotes)
  const editorRef = useRef<any>(null)
  const prevAttachmentsRef = useRef<Set<string>>(new Set())
  onOpenNoteRef.current = onOpenNote
  allNotesRef.current = allNotes

  const openNoteById = useCallback((noteId: string) => {
    const note = allNotesRef.current.find(n => n.id === noteId)
    if (note && onOpenNoteRef.current) onOpenNoteRef.current(note)
  }, [])

  useEffect(() => {
    api.notes.list().then((notes: any[]) => {
      setAllNotes(notes.map((n: any) => ({ id: n.id, title: n.title })))
    })
    api.documents.list().then((docs: any[]) => {
      setAllDocs(docs.map((d: any) => ({ id: d.id, title: d.title })))
    })
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const noteId = (e as CustomEvent).detail?.noteId
      if (noteId) openNoteById(noteId)
    }
    const docHandler = (e: Event) => {
      const docId = (e as CustomEvent).detail?.docId
      if (docId) {
        document.dispatchEvent(new CustomEvent('banjuan:open-document', { detail: { docId } }))
      }
    }
    document.addEventListener('note-link-click', handler)
    document.addEventListener('document-link-click', docHandler)
    return () => {
      document.removeEventListener('note-link-click', handler)
      document.removeEventListener('document-link-click', docHandler)
    }
  }, [openNoteById])

  const { parsedContent, rawMarkdown } = useMemo(() => {
    if (!initialContent) return { parsedContent: undefined, rawMarkdown: null }
    try {
      const blocks = JSON.parse(initialContent)
      if (Array.isArray(blocks) && blocks.length > 0) return { parsedContent: blocks, rawMarkdown: null }
      return { parsedContent: undefined, rawMarkdown: null }
    } catch {
      if (autoParseMarkdown && initialContent.trim()) {
        return { parsedContent: undefined, rawMarkdown: initialContent }
      }
      return { parsedContent: undefined, rawMarkdown: null }
    }
  }, [initialContent, autoParseMarkdown])

  const handleUploadFile = useCallback(async (file: File): Promise<string> => {
    if (!noteId) return ''
    const { relativePath, isImage } = await uploadFile(api, noteId, file)
    if (!isImage) {
      const editor = editorRef.current
      if (editor) {
        const currentBlock = editor.getTextCursorPosition().block
        editor.insertBlocks(
          [{
            type: 'fileEmbed' as any,
            props: { src: relativePath, fileName: file.name },
          }],
          currentBlock,
          'after',
        )
      }
      return ''
    }
    return `banjuan-attachment://${relativePath}`
  }, [noteId])

  const editor = useCreateBlockNote({
    schema,
    initialContent: parsedContent,
    uploadFile: handleUploadFile,
  })
  editorRef.current = editor

  const markdownParsedRef = useRef(false)
  useEffect(() => {
    if (!rawMarkdown || markdownParsedRef.current) return
    markdownParsedRef.current = true
    ;(async () => {
      try {
        const blocks = await (editor as any).tryParseMarkdownToBlocks(rawMarkdown)
        editor.replaceBlocks(editor.document, blocks)
        onHeadingsChange?.(extractHeadings(editor.document))
      } catch {}
    })()
  }, [editor, rawMarkdown])

  useImperativeHandle(ref, () => ({
    exportMarkdown: () => exportBlocksToMarkdown(editor, editor.document as any[], api),
    exportHTML: () => exportBlocksToHTML(editor, editor.document as any[], api),
    getAttachmentPaths: () => extractExportAttachmentPaths(editor.document as any[]),
  }), [editor])

  const handleUploadFileRef = useRef(handleUploadFile)
  handleUploadFileRef.current = handleUploadFile

  useEffect(() => {
    if (readOnly || !noteId) return
    const container = document.querySelector('.bn-editor')
    if (!container) return
    const onPasteCapture = (e: Event) => {
      const ce = e as ClipboardEvent
      const hasFiles = ce.clipboardData?.files?.length
      if (!hasFiles) return
      const savedFiles = Array.from(ce.clipboardData!.files)
      e.preventDefault()
      e.stopImmediatePropagation()
      const insertFile = async (file: File) => {
        const url = await handleUploadFileRef.current(file)
        if (url) {
          const ed = editorRef.current
          if (ed) {
            const currentBlock = ed.getTextCursorPosition().block
            ed.insertBlocks(
              [{ type: 'image' as any, props: { url } }],
              currentBlock,
              'after',
            )
          }
        }
      }
      ;(async () => {
        const clipFiles = await api.clipboard!.readFiles()
        if (clipFiles.length > 0) {
          for (const cf of clipFiles) {
            const buffer = await api.clipboard!.readFileBuffer(cf.path)
            const ext = cf.name.split('.').pop()?.toLowerCase() ?? ''
            const mimeMap: Record<string, string> = {
              png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
              gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
              pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              mp4: 'video/mp4', mov: 'video/quicktime',
            }
            const mime = mimeMap[ext] || 'application/octet-stream'
            const file = new File([buffer], cf.name, { type: mime })
            await insertFile(file)
          }
        } else {
          for (const file of savedFiles) {
            await insertFile(file)
          }
        }
      })()
    }
    container.addEventListener('paste', onPasteCapture, true)
    return () => container.removeEventListener('paste', onPasteCapture, true)
  }, [readOnly, noteId, editor])

  useEffect(() => {
    if (parsedContent) {
      prevAttachmentsRef.current = new Set(extractExportAttachmentPaths(parsedContent))
      if (noteId && !skipLinkSync) {
        const links = extractNoteLinks(parsedContent)
        api.noteLinks.sync(noteId, links).then(() => {
          document.dispatchEvent(new Event('note-links-synced'))
        })
        const docLinks = extractDocumentLinks(parsedContent)
        api.docLinks.sync(noteId, docLinks).then(() => {
          document.dispatchEvent(new Event('doc-links-synced'))
        })
      }
      onHeadingsChange?.(extractHeadings(editor.document))
    }
  }, [noteId, parsedContent])

  const handleChange = useCallback(() => {
    const blocks = editor.document
    const json = JSON.stringify(blocks)
    onChange(json)
    if (noteId && !skipLinkSync) {
      const links = extractNoteLinks(blocks)
      api.noteLinks.sync(noteId, links).then(() => {
        document.dispatchEvent(new Event('note-links-synced'))
      })
      const docLinks = extractDocumentLinks(blocks)
      api.docLinks.sync(noteId, docLinks)
    }
    const currentAttachments = new Set(extractExportAttachmentPaths(blocks))
    for (const path of prevAttachmentsRef.current) {
      if (!currentAttachments.has(path)) {
        api.attachments.delete(path)
      }
    }
    prevAttachmentsRef.current = currentAttachments
    onHeadingsChange?.(extractHeadings(blocks))
  }, [editor, onChange, noteId, onHeadingsChange])

  const getNoteLinkItems = useCallback(async (query: string) => {
    const noteItems = allNotes.map(note => ({
      title: note.title,
      aliases: [] as string[],
      group: 'Notes',
      onItemClick: () => {
        editor.insertInlineContent([
          {
            type: 'noteLink' as any,
            props: { noteId: note.id },
            content: note.title,
          },
          ' ',
        ])
      },
    }))
    const docItems = allDocs.map(doc => ({
      title: doc.title,
      aliases: [] as string[],
      group: 'Documents',
      onItemClick: () => {
        editor.insertInlineContent([
          {
            type: 'documentLink' as any,
            props: { docId: doc.id },
            content: doc.title,
          },
          ' ',
        ])
      },
    }))
    return filterSuggestionItems([...noteItems, ...docItems], query)
  }, [allNotes, allDocs, editor])

  const getNoteEmbedItems = useCallback(async (query: string) => {
    return filterSuggestionItems(
      allNotes.map(note => ({
        title: note.title,
        aliases: [] as string[],
        group: 'Notes',
        onItemClick: () => {
          const currentBlock = editor.getTextCursorPosition().block
          editor.insertBlocks(
            [{
              type: 'noteEmbed' as any,
              props: { noteId: note.id, noteTitle: note.title },
            }],
            currentBlock,
            'after',
          )
        },
      })),
      query,
    )
  }, [allNotes, editor])

  const getSlashMenuItems = useCallback(async (query: string) => {
    const defaultItems = getDefaultReactSlashMenuItems(editor)
    const mermaidItem = getMermaidSlashItem(editor)
    return filterSuggestionItems([...defaultItems, mermaidItem], query)
  }, [editor])

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      const item = target.closest('.bn-suggestion-menu-item') as HTMLElement | null
      if (item) {
        e.preventDefault()
        e.stopImmediatePropagation()
        item.click()
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [])

  return (
    <div className={readOnly ? 'reading-mode' : ''}>
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        onChange={handleChange}
        theme="light"
      >
        {!readOnly && (
          <>
            <SuggestionMenuController
              triggerCharacter="[["
              getItems={getNoteLinkItems}
              minQueryLength={0}
            />
            <SuggestionMenuController
              triggerCharacter="![["
              getItems={getNoteEmbedItems}
              minQueryLength={0}
            />
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={getSlashMenuItems}
            />
          </>
        )}
      </BlockNoteView>
    </div>
  )
})

export default BlockEditor
