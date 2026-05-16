import React, { useMemo, useCallback, useEffect, useState, useRef, useImperativeHandle, forwardRef } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { SuggestionMenuController, useCreateBlockNote, getDefaultReactSlashMenuItems } from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu, createCodeBlockSpec } from '@blocknote/core'
import type { HeadingItem } from './NoteOutlinePanel.js'
import { AnnotationEmbed } from './blocks/AnnotationEmbed.js'
import { DocumentEmbed } from './blocks/DocumentEmbed.js'
import { NoteEmbed } from './blocks/NoteEmbed.js'
import { NoteLink } from './blocks/NoteLink.js'
import { DocumentLink } from './blocks/DocumentLink.js'
import { FileEmbed } from './blocks/FileEmbed.js'
import { MermaidBlock } from './blocks/MermaidBlock.js'
import { renderAllStrokes } from '../handwriting/renderStrokes.js'
import '@blocknote/mantine/style.css'
import './BlockEditor.css'
import { useBanjuanAPI } from '../../api.js'
import type { BanjuanAPI } from '../../api.js'

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

const schema = BlockNoteSchema.create({
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

function buildMindmapTree(nodes: any[]): { root: any | null; childrenMap: Map<string, any[]> } {
  const childrenMap = new Map<string, any[]>()
  let root: any = null
  for (const n of nodes) {
    if (!n.parentId) root = n
    else {
      const siblings = childrenMap.get(n.parentId) ?? []
      siblings.push(n)
      childrenMap.set(n.parentId, siblings)
    }
  }
  for (const children of childrenMap.values()) {
    children.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }
  return { root, childrenMap }
}

function renderMindmapTreeMd(title: string, nodes: any[]): string {
  const { root, childrenMap } = buildMindmapTree(nodes)
  if (!root) return `> 🧠 **${title}**`
  const lines = [`🧠 **${title}**`, '']
  const walk = (nodeId: string, depth: number) => {
    const children = childrenMap.get(nodeId) ?? []
    for (const child of children) {
      lines.push(`${'  '.repeat(depth)}- ${child.title || 'Untitled'}`)
      walk(child.id, depth + 1)
    }
  }
  lines.push(`- ${root.title || title}`)
  walk(root.id, 1)
  return lines.join('\n')
}

function renderMindmapTreeHtml(title: string, nodes: any[]): string {
  const { root, childrenMap } = buildMindmapTree(nodes)
  if (!root) return `<blockquote><p>🧠 <strong>${title}</strong></p></blockquote>`
  const renderList = (nodeId: string): string => {
    const children = childrenMap.get(nodeId) ?? []
    if (children.length === 0) return ''
    const items = children.map(c =>
      `<li>${c.title || 'Untitled'}${renderList(c.id)}</li>`
    ).join('')
    return `<ul>${items}</ul>`
  }
  return `<div class="mindmap-export"><p>🧠 <strong>${title}</strong></p><ul><li>${root.title || title}${renderList(root.id)}</li></ul></div>`
}

async function screenshotMindmapEmbed(noteId: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 5000)
    const detail = {
      noteId,
      resolve: (result: string | null) => {
        clearTimeout(timeout)
        resolve(result)
      },
    }
    document.dispatchEvent(new CustomEvent('mindmap-screenshot-request', { detail }))
  })
}

async function screenshotHandwritingEmbed(api: BanjuanAPI, noteId: string, pageIndex?: number): Promise<string | null> {
  try {
    const note = await api.notes.get(noteId)
    if (!note || note.type !== 'handwriting') return null
    const parsed = JSON.parse(note.content)
    const pages = parsed.pages ?? []
    if (pages.length === 0) return null
    const pi = pageIndex != null && pageIndex >= 0 && pageIndex < pages.length ? pageIndex : 0
    const page = pages[pi]
    const typeMeta = note.typeMeta ?? {}
    const pageSize = (typeMeta as any).pageSize ?? { width: 1024, height: 768 }
    const dpr = 2
    const canvas = document.createElement('canvas')
    canvas.width = pageSize.width * dpr
    canvas.height = pageSize.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)
    renderAllStrokes(ctx, page.snapshot?.strokes ?? [], pageSize.width, pageSize.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
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
      } catch {}
    })()
  }, [editor, rawMarkdown])

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
          const noteTitle = p.noteTitle || 'Untitled'
          if (p.noteId) {
            try {
              const note = await api.notes.get(p.noteId)
              if (note?.type === 'mindmap') {
                const imgDataUrl = await screenshotMindmapEmbed(p.noteId)
                if (imgDataUrl) {
                  segments.push(`🧠 **${noteTitle}**\n\n![${noteTitle}](${imgDataUrl})`)
                } else {
                  const nodes = await api.mindmaps.getNodes(p.noteId)
                  segments.push(renderMindmapTreeMd(noteTitle, nodes))
                }
              } else if (note?.type === 'handwriting') {
                const pi = p.pageIndex !== '' && p.pageIndex != null ? parseInt(p.pageIndex, 10) : undefined
                const imgDataUrl = await screenshotHandwritingEmbed(api, p.noteId, pi)
                if (imgDataUrl) {
                  segments.push(`✏️ **${noteTitle}**\n\n![${noteTitle}](${imgDataUrl})`)
                } else {
                  segments.push(`> ✏️ **${noteTitle}**`)
                }
              } else {
                segments.push(`> 📝 **${noteTitle}**`)
              }
            } catch {
              segments.push(`> 📝 **${noteTitle}**`)
            }
          } else {
            segments.push(`> 📝 **${noteTitle}**`)
          }
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
          const noteTitle = p.noteTitle || 'Untitled'
          if (p.noteId) {
            try {
              const note = await api.notes.get(p.noteId)
              if (note?.type === 'mindmap') {
                const imgDataUrl = await screenshotMindmapEmbed(p.noteId)
                if (imgDataUrl) {
                  segments.push(`<div class="mindmap-export"><p>🧠 <strong>${noteTitle}</strong></p><img src="${imgDataUrl}" style="max-width:100%" /></div>`)
                } else {
                  const nodes = await api.mindmaps.getNodes(p.noteId)
                  segments.push(renderMindmapTreeHtml(noteTitle, nodes))
                }
              } else if (note?.type === 'handwriting') {
                const pi = p.pageIndex !== '' && p.pageIndex != null ? parseInt(p.pageIndex, 10) : undefined
                const imgDataUrl = await screenshotHandwritingEmbed(api, p.noteId, pi)
                if (imgDataUrl) {
                  segments.push(`<div class="handwriting-export"><p>✏️ <strong>${noteTitle}</strong></p><img src="${imgDataUrl}" style="max-width:100%" /></div>`)
                } else {
                  segments.push(`<blockquote><p>✏️ <strong>${noteTitle}</strong></p></blockquote>`)
                }
              } else {
                segments.push(`<blockquote><p>📝 <strong>${noteTitle}</strong></p></blockquote>`)
              }
            } catch {
              segments.push(`<blockquote><p>📝 <strong>${noteTitle}</strong></p></blockquote>`)
            }
          } else {
            segments.push(`<blockquote><p>📝 <strong>${noteTitle}</strong></p></blockquote>`)
          }
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
      prevAttachmentsRef.current = extractAttachmentPaths(parsedContent)
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
      onHeadingsChange?.(extractHeadings(parsedContent))
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
    const currentAttachments = extractAttachmentPaths(blocks)
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
