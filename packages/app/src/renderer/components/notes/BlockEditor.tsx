import React, { useMemo, useCallback, useEffect, useState, useRef, useImperativeHandle, forwardRef } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { SuggestionMenuController, useCreateBlockNote, getDefaultReactSlashMenuItems } from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import type { HeadingItem } from './NoteOutlinePanel.js'
import { AnnotationEmbed } from './blocks/AnnotationEmbed.js'
import { DocumentEmbed } from './blocks/DocumentEmbed.js'
import { NoteEmbed } from './blocks/NoteEmbed.js'
import { NoteLink } from './blocks/NoteLink.js'
import { FileEmbed } from './blocks/FileEmbed.js'
import { MermaidBlock } from './blocks/MermaidBlock.js'
import '@blocknote/mantine/style.css'
import './BlockEditor.css'

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'])
const ATTACHMENT_PREFIX = 'banjuan-attachment://'

function extractAttachmentPaths(blocks: any[]): Set<string> {
  const paths = new Set<string>()
  const walk = (node: any) => {
    if (!node) return
    if (node.type === 'image' && typeof node.props?.url === 'string' && node.props.url.startsWith(ATTACHMENT_PREFIX)) {
      paths.add(node.props.url.slice(ATTACHMENT_PREFIX.length))
    }
    if (node.type === 'fileEmbed' && node.props?.src) {
      paths.add(node.props.src)
    }
    if (Array.isArray(node.content)) node.content.forEach(walk)
    if (Array.isArray(node.children)) node.children.forEach(walk)
  }
  blocks.forEach(walk)
  return paths
}

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    annotationEmbed: AnnotationEmbed,
    documentEmbed: DocumentEmbed,
    noteEmbed: NoteEmbed,
    fileEmbed: FileEmbed,
    mermaidBlock: MermaidBlock,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    noteLink: NoteLink,
  },
})

interface NoteItem {
  id: string
  title: string
}

export interface BlockEditorHandle {
  exportMarkdown: () => Promise<string>
  exportHTML: () => Promise<string>
  getAttachmentPaths: () => string[]
}

interface Props {
  noteId?: string
  initialContent: string
  onChange: (json: string) => void
  readOnly?: boolean
  skipLinkSync?: boolean
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

async function uploadFile(noteId: string, file: File): Promise<{ relativePath: string; isImage: boolean }> {
  const buffer = await file.arrayBuffer()
  const relativePath = await window.electronAPI.attachments.save(noteId, file.name, buffer)
  return { relativePath, isImage: IMAGE_TYPES.has(file.type) }
}

const BlockEditor = forwardRef<BlockEditorHandle, Props>(function BlockEditor({ noteId, initialContent, onChange, readOnly, skipLinkSync, onOpenNote, onHeadingsChange }, ref) {
  const [allNotes, setAllNotes] = useState<NoteItem[]>([])
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
    window.electronAPI.notes.list().then((notes: any[]) => {
      setAllNotes(notes.map((n: any) => ({ id: n.id, title: n.title })))
    })
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const noteId = (e as CustomEvent).detail?.noteId
      if (noteId) openNoteById(noteId)
    }
    document.addEventListener('note-link-click', handler)
    return () => document.removeEventListener('note-link-click', handler)
  }, [openNoteById])

  const parsedContent = useMemo(() => {
    if (!initialContent) return undefined
    try {
      const blocks = JSON.parse(initialContent)
      return Array.isArray(blocks) && blocks.length > 0 ? blocks : undefined
    } catch {
      return undefined
    }
  }, [initialContent])

  const handleUploadFile = useCallback(async (file: File): Promise<string> => {
    if (!noteId) return ''
    const { relativePath, isImage } = await uploadFile(noteId, file)
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

  useImperativeHandle(ref, () => ({
    exportMarkdown: async () => {
      const blocks = editor.document as any[]
      const segments: string[] = []
      let stdBatch: any[] = []

      const flushStd = async () => {
        if (stdBatch.length === 0) return
        try {
          let md = await editor.blocksToMarkdownLossy(stdBatch)
          md = md.replace(/!\[[^\]]*\]\(banjuan-attachment:\/\/attachments\/[^/]+\/([^\s)]+)\)/g,
            (_match, fileName) => `[${decodeURIComponent(fileName)}](attachments/${fileName})`)
          md = md.replace(/banjuan-attachment:\/\/attachments\/[^/]+\/([^\s)]+)/g, 'attachments/$1')
          segments.push(md)
        } catch { /* skip */ }
        stdBatch = []
      }

      for (const block of blocks) {
        const p = block.props || {}
        if (block.type === 'mermaidBlock' && p.code) {
          await flushStd()
          segments.push(`\`\`\`mermaid\n${p.code}\n\`\`\``)
        } else if (block.type === 'noteEmbed') {
          await flushStd()
          segments.push(`> 📝 **${p.noteTitle || 'Untitled'}**`)
        } else if (block.type === 'documentEmbed') {
          await flushStd()
          const parts = [`📄 **${p.docTitle || 'Document'}**`]
          if (p.authors) parts.push(p.authors)
          if (p.pageCount > 0) parts.push(`${p.pageCount} pages`)
          segments.push(`> ${parts.join(' · ')}`)
        } else if (block.type === 'annotationEmbed') {
          await flushStd()
          const lines = [`> 📄 ${p.docTitle || 'Document'}${p.page ? ` p.${p.page}` : ''}`]
          if (p.quote) lines.push(`> "${p.quote}"`)
          if (p.comment) lines.push(`> ${p.comment}`)
          segments.push(lines.join('\n'))
        } else if (block.type === 'fileEmbed' && p.src) {
          await flushStd()
          const fileName = p.fileName || p.src.split('/').pop() || 'attachment'
          const safeName = p.src.split('/').pop() || fileName
          segments.push(`[${fileName}](attachments/${safeName})`)
        } else {
          stdBatch.push(block)
        }
      }
      await flushStd()
      return segments.join('\n\n')
    },
    exportHTML: async () => {
      const blocks = editor.document as any[]
      const segments: string[] = []
      let stdBatch: any[] = []

      const flushStd = async () => {
        if (stdBatch.length === 0) return
        try {
          segments.push(await editor.blocksToHTMLLossy(stdBatch))
        } catch { /* skip */ }
        stdBatch = []
      }

      for (const block of blocks) {
        const p = block.props || {}
        if (block.type === 'mermaidBlock' && p.code) {
          await flushStd()
          try {
            const mermaid = (await import('mermaid')).default
            mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: (p.theme as any) || 'neutral' })
            const id = `mermaid-export-${Date.now()}-${Math.random().toString(36).slice(2)}`
            const w = p.renderWidth || 500
            const tempDiv = document.createElement('div')
            tempDiv.style.width = `${w}px`
            tempDiv.style.position = 'absolute'
            tempDiv.style.left = '-9999px'
            document.body.appendChild(tempDiv)
            const { svg } = await mermaid.render(id, p.code, tempDiv)
            document.body.removeChild(tempDiv)
            segments.push(`<div class="mermaid-diagram">${svg}</div>`)
          } catch {
            segments.push(`<pre><code class="language-mermaid">${p.code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
          }
        } else if (block.type === 'noteEmbed') {
          await flushStd()
          segments.push(`<blockquote><p>📝 <strong>${p.noteTitle || 'Untitled'}</strong></p></blockquote>`)
        } else if (block.type === 'documentEmbed') {
          await flushStd()
          const parts = [`📄 <strong>${p.docTitle || 'Document'}</strong>`]
          if (p.authors) parts.push(p.authors)
          if (p.pageCount > 0) parts.push(`${p.pageCount} pages`)
          segments.push(`<blockquote><p>${parts.join(' · ')}</p></blockquote>`)
        } else if (block.type === 'annotationEmbed') {
          await flushStd()
          let inner = `<p>📄 ${p.docTitle || 'Document'}${p.page ? ` p.${p.page}` : ''}</p>`
          if (p.quote) inner += `<p><em>"${p.quote}"</em></p>`
          if (p.comment) inner += `<p>${p.comment}</p>`
          segments.push(`<blockquote>${inner}</blockquote>`)
        } else if (block.type === 'fileEmbed' && p.src) {
          await flushStd()
          const fileName = p.fileName || p.src.split('/').pop() || 'attachment'
          segments.push(`<p>📎 <strong>${fileName}</strong></p>`)
        } else {
          stdBatch.push(block)
        }
      }
      await flushStd()
      return segments.join('\n')
    },
    getAttachmentPaths: () => {
      return [...extractAttachmentPaths(editor.document)]
    },
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
        const clipFiles = await window.electronAPI.clipboard.readFiles()
        if (clipFiles.length > 0) {
          for (const cf of clipFiles) {
            const buffer = await window.electronAPI.clipboard.readFileBuffer(cf.path)
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
      prevAttachmentsRef.current = extractAttachmentPaths(parsedContent)
      if (noteId && !skipLinkSync) {
        const links = extractNoteLinks(parsedContent)
        window.electronAPI.noteLinks.sync(noteId, links).then(() => {
          document.dispatchEvent(new Event('note-links-synced'))
        })
      }
      onHeadingsChange?.(extractHeadings(parsedContent))
    }
  }, [noteId, parsedContent])

  const handleChange = useCallback(() => {
    const blocks = editor.document
    const json = JSON.stringify(blocks)
    onChange(json)
    if (noteId && !skipLinkSync) {
      const links = extractNoteLinks(blocks)
      window.electronAPI.noteLinks.sync(noteId, links).then(() => {
        document.dispatchEvent(new Event('note-links-synced'))
      })
    }
    const currentAttachments = extractAttachmentPaths(blocks)
    for (const path of prevAttachmentsRef.current) {
      if (!currentAttachments.has(path)) {
        window.electronAPI.attachments.delete(path)
      }
    }
    prevAttachmentsRef.current = currentAttachments
    onHeadingsChange?.(extractHeadings(blocks))
  }, [editor, onChange, noteId, onHeadingsChange])

  const getNoteLinkItems = useCallback(async (query: string) => {
    return filterSuggestionItems(
      allNotes.map(note => ({
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
      })),
      query,
    )
  }, [allNotes, editor])

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
