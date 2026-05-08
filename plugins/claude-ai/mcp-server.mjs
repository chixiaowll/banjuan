#!/usr/bin/env node

import { readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DEBUG = process.argv.includes('--debug')
const LOG = DEBUG ? join(homedir(), '.banjuan', 'mcp-debug.log') : null
function log(msg) {
  if (LOG) appendFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`)
}

function getApiPort() {
  const portArg = process.argv.find(a => a.startsWith('--port='))
  if (portArg) return parseInt(portArg.split('=')[1], 10)
  try {
    return parseInt(readFileSync(join(homedir(), '.banjuan', 'api-port'), 'utf-8').trim(), 10)
  } catch {
    return null
  }
}

const PORT = getApiPort()
const BASE = PORT ? `http://127.0.0.1:${PORT}` : null

async function apiCall(path) {
  if (!BASE) throw new Error('Banjuan app is not running (no api-port found)')
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body}`)
  }
  return res.json()
}

async function apiPost(path, body) {
  if (!BASE) throw new Error('Banjuan app is not running')
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

async function apiPut(path, body) {
  if (!BASE) throw new Error('Banjuan app is not running')
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

function blocksToMarkdown(blocks) {
  if (!Array.isArray(blocks)) return ''
  const lines = []
  for (const block of blocks) {
    const text = inlineToText(block.content)
    switch (block.type) {
      case 'heading': {
        const level = block.props?.level || 1
        lines.push('#'.repeat(level) + ' ' + text)
        break
      }
      case 'bulletListItem':
        lines.push('- ' + text)
        break
      case 'numberedListItem':
        lines.push('1. ' + text)
        break
      case 'checkListItem':
        lines.push((block.props?.checked ? '- [x] ' : '- [ ] ') + text)
        break
      case 'codeBlock':
        lines.push('```' + (block.props?.language || ''))
        lines.push(text)
        lines.push('```')
        break
      case 'table':
        if (block.content?.rows) {
          for (const row of block.content.rows) {
            const cells = row.cells?.map(c => inlineToText(c)) || []
            lines.push('| ' + cells.join(' | ') + ' |')
          }
        }
        break
      case 'image':
        lines.push(`![${block.props?.caption || ''}](${block.props?.url || ''})`)
        break
      default:
        if (text) lines.push(text)
    }
    if (block.children?.length) {
      const childMd = blocksToMarkdown(block.children)
      lines.push(...childMd.split('\n').map(l => '  ' + l))
    }
  }
  return lines.join('\n')
}

function inlineToText(content) {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(c => {
    if (typeof c === 'string') return c
    if (c.type === 'text') {
      let t = c.text || ''
      if (c.styles?.bold) t = `**${t}**`
      if (c.styles?.italic) t = `*${t}*`
      if (c.styles?.code) t = `\`${t}\``
      if (c.styles?.strikethrough) t = `~~${t}~~`
      return t
    }
    if (c.type === 'link') return `[${inlineToText(c.content)}](${c.href || ''})`
    return c.text || ''
  }).join('')
}

function mindmapToOutline(nodes, edges) {
  if (!Array.isArray(nodes) || nodes.length === 0) return '(empty mindmap)'
  const childMap = new Map()
  for (const e of (edges || [])) {
    if (!childMap.has(e.sourceId || e.source)) childMap.set(e.sourceId || e.source, [])
    childMap.get(e.sourceId || e.source).push(e.targetId || e.target)
  }
  const allTargets = new Set()
  for (const e of (edges || [])) allTargets.add(e.targetId || e.target)
  const roots = nodes.filter(n => !allTargets.has(n.id))
  if (roots.length === 0) roots.push(nodes[0])

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const lines = []
  function walk(id, depth) {
    const n = nodeMap.get(id)
    if (!n) return
    const label = n.data?.label || n.title || n.content || n.id
    lines.push('  '.repeat(depth) + '- ' + label)
    const children = childMap.get(id) || []
    for (const cid of children) walk(cid, depth + 1)
  }
  for (const r of roots) walk(r.id, 0)
  return lines.join('\n')
}

const TOOLS = [
  {
    name: 'search',
    description: 'Search notes and documents in the library. Returns matching items with titles and snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query text' },
        type: { type: 'string', enum: ['note', 'document'], description: 'Filter by type (optional)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_notes',
    description: 'List all notes in the library. Returns id, title, type, dates.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['markdown', 'mindmap', 'handwriting'], description: 'Filter by note type' },
        docId: { type: 'string', description: 'Filter notes linked to a specific document' },
        tag: { type: 'string', description: 'Filter by tag name' },
      },
    },
  },
  {
    name: 'read_note',
    description: 'Read a note by ID. For markdown notes, returns readable markdown text. For mindmap notes, returns a text outline of the node tree. For handwriting notes, returns an image. Optionally request a rendered image for any note type.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Note ID' },
        format: { type: 'string', enum: ['auto', 'markdown', 'raw', 'image'], description: 'Output format. auto (default): markdown for text notes, outline for mindmaps, image for handwriting. raw: original JSON. image: rendered screenshot.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_note',
    description: 'Create a new note. Content should be a JSON string of BlockNote editor blocks. For simple text notes, use: [{"type":"paragraph","content":[{"type":"text","text":"Your text here"}]}]',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title' },
        content: { type: 'string', description: 'Note content as JSON string of blocks' },
        docId: { type: 'string', description: 'Link to a document ID (optional)' },
        folder: { type: 'string', description: 'Folder path (optional)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_note',
    description: 'Update an existing note. Can update title and/or content.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Note ID to update' },
        title: { type: 'string', description: 'New title (optional)' },
        content: { type: 'string', description: 'New content as JSON string of blocks (optional)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_documents',
    description: 'List all documents (PDFs, etc.) in the library.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Filter by document type (e.g. pdf)' },
        tag: { type: 'string', description: 'Filter by tag name' },
      },
    },
  },
  {
    name: 'get_document',
    description: 'Get document metadata by ID (title, authors, path, type).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Document ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_annotations',
    description: 'Get all annotations (highlights, notes) for a document.',
    inputSchema: {
      type: 'object',
      properties: {
        docId: { type: 'string', description: 'Document ID' },
        page: { type: 'number', description: 'Filter by page number (optional)' },
      },
      required: ['docId'],
    },
  },
]

async function handleToolCall(name, args) {
  switch (name) {
    case 'search': {
      const params = new URLSearchParams({ q: args.query })
      if (args.type) params.set('type', args.type)
      if (args.limit) params.set('limit', String(args.limit))
      return await apiCall(`/api/search?${params}`)
    }
    case 'list_notes': {
      const params = new URLSearchParams()
      if (args.type) params.set('type', args.type)
      if (args.docId) params.set('docId', args.docId)
      if (args.tag) params.set('tag', args.tag)
      const qs = params.toString()
      return await apiCall(`/api/notes${qs ? '?' + qs : ''}`)
    }
    case 'read_note': {
      const format = args.format || 'auto'
      if (format === 'image') {
        const img = await apiCall(`/api/notes/${encodeURIComponent(args.id)}/render`)
        return { __image: true, noteId: args.id, dataUrl: img.dataUrl }
      }
      const note = await apiCall(`/api/notes/${encodeURIComponent(args.id)}`)
      if (format === 'raw') return note
      const header = `# ${note.title}\nType: ${note.type} | Created: ${note.createdAt}\n\n`
      if (note.type === 'mindmap') {
        let parsed
        try { parsed = JSON.parse(note.content) } catch { return note }
        return { title: note.title, type: note.type, content: header + mindmapToOutline(parsed.nodes, parsed.edges) }
      }
      if (note.type === 'handwriting') {
        const img = await apiCall(`/api/notes/${encodeURIComponent(args.id)}/render`)
        return { __image: true, noteId: args.id, title: note.title, dataUrl: img.dataUrl }
      }
      let parsed
      try { parsed = JSON.parse(note.content) } catch { return { title: note.title, type: note.type, content: header + (note.content || '') } }
      return { title: note.title, type: note.type, content: header + blocksToMarkdown(parsed) }
    }
    case 'create_note':
      return await apiPost('/api/notes', args)
    case 'update_note': {
      const { id, ...updates } = args
      return await apiPut(`/api/notes/${encodeURIComponent(id)}`, updates)
    }
    case 'list_documents': {
      const params = new URLSearchParams()
      if (args.type) params.set('type', args.type)
      if (args.tag) params.set('tag', args.tag)
      const qs = params.toString()
      return await apiCall(`/api/documents${qs ? '?' + qs : ''}`)
    }
    case 'get_document':
      return await apiCall(`/api/documents/${encodeURIComponent(args.id)}`)
    case 'get_annotations': {
      const params = new URLSearchParams({ docId: args.docId })
      if (args.page != null) params.set('page', String(args.page))
      return await apiCall(`/api/annotations?${params}`)
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

function send(msg) {
  const str = JSON.stringify(msg)
  log('Sending: ' + str.slice(0, 200))
  process.stdout.write(str + '\n')
}

let buffer = ''

function processMessage(raw) {
  let msg
  try { msg = JSON.parse(raw) } catch (e) { log('JSON parse error: ' + e.message + ' raw: ' + raw.slice(0, 200)); return }

  log('Received: ' + msg.method + ' id=' + msg.id)

  if (msg.method === 'initialize') {
    log('Sending initialize response')
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'banjuan', version: '1.0.0' },
      },
    })
    return
  }

  if (msg.method === 'notifications/initialized') return

  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    return
  }

  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params
    handleToolCall(name, args || {})
      .then(result => {
        if (result && result.__image && result.dataUrl) {
          const parts = result.dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
          const content = []
          if (result.title) content.push({ type: 'text', text: `Note: ${result.title}` })
          if (parts) {
            content.push({ type: 'image', data: parts[2], mimeType: parts[1] })
          } else {
            content.push({ type: 'text', text: '(Failed to render image)' })
          }
          send({ jsonrpc: '2.0', id: msg.id, result: { content } })
        } else {
          send({
            jsonrpc: '2.0', id: msg.id,
            result: { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] },
          })
        }
      })
      .catch(err => {
        send({
          jsonrpc: '2.0', id: msg.id,
          result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true },
        })
      })
    return
  }

  if (msg.id != null) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } })
  }
}

process.stdin.on('end', () => log('stdin END'))
process.stdin.on('close', () => log('stdin CLOSE'))
process.stdin.on('error', (e) => log('stdin ERROR: ' + e.message))
process.stdout.on('error', (e) => log('stdout ERROR: ' + e.message))

process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk) => {
  log('stdin data: ' + chunk.length + ' bytes')
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('Content-Length:')) continue
    processMessage(trimmed)
  }
})
