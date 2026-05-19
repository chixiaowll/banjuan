const { BanjuanPlugin } = globalThis
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'

export default class ClaudeAIPlugin extends BanjuanPlugin {
  async onload() {
    const data = await this.loadData()
    this.settings = Object.assign(
      { model: '', claudePath: '' },
      data,
    )
    this.sessions = data.sessions || []
    this.activeSessionIdx = data.activeSessionIdx ?? -1
    this.sessionId = null
    this.messages = []
    this.activeProcess = null

    if (this.activeSessionIdx >= 0 && this.sessions[this.activeSessionIdx]) {
      const s = this.sessions[this.activeSessionIdx]
      this.sessionId = s.sessionId
      this.messages = s.messages || []
    }

    this.addRpcHandler('chat', async (message, context) => {
      this.messages.push({ role: 'user', content: message })
      await this.runClaude(message, context)
    })

    this.addRpcHandler('clearChat', async () => {
      this.killActiveProcess()
      this.sessionId = null
      this.messages = []
      this.activeSessionIdx = -1
      await this.persist()
    })

    this.addRpcHandler('stop', async () => {
      this.killActiveProcess()
    })

    this.addRpcHandler('getSettings', async () => this.settings)

    this.addRpcHandler('saveSettings', async (newSettings) => {
      this.settings = { ...this.settings, ...newSettings }
      await this.persist()
    })

    this.addRpcHandler('getSessionId', async () => this.sessionId)

    this.addRpcHandler('getActiveSession', async () => ({
      sessionId: this.sessionId,
      messages: this.messages,
      activeSessionIdx: this.activeSessionIdx,
    }))

    this.addRpcHandler('getSessions', async () =>
      this.sessions.map((s, i) => ({
        idx: i,
        sessionId: s.sessionId,
        title: s.title || 'Untitled',
        messageCount: (s.messages || []).length,
        updatedAt: s.updatedAt || null,
        active: i === this.activeSessionIdx,
      }))
    )

    this.addRpcHandler('switchSession', async (idx) => {
      await this.saveCurrentSession()
      if (idx >= 0 && idx < this.sessions.length) {
        this.activeSessionIdx = idx
        const s = this.sessions[idx]
        this.sessionId = s.sessionId
        this.messages = s.messages || []
      }
      await this.persist()
      return { sessionId: this.sessionId, messages: this.messages }
    })

    this.addRpcHandler('newSession', async () => {
      await this.saveCurrentSession()
      this.sessionId = null
      this.messages = []
      this.activeSessionIdx = -1
      await this.persist()
    })

    this.addRpcHandler('deleteSession', async (idx) => {
      if (idx >= 0 && idx < this.sessions.length) {
        this.sessions.splice(idx, 1)
        if (this.activeSessionIdx === idx) {
          this.activeSessionIdx = -1
          this.sessionId = null
          this.messages = []
        } else if (this.activeSessionIdx > idx) {
          this.activeSessionIdx--
        }
        await this.persist()
      }
    })

    this.registerView({
      viewType: 'chat',
      displayText: 'Claude Code',
      icon: '<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fill-rule="nonzero"/></svg>',
      singleton: true,
    })

    this.addCommand({
      id: 'open-chat',
      name: 'Open Claude Code',
      callback: async () => {},
    })
  }

  findClaude() {
    if (this.settings.claudePath && existsSync(this.settings.claudePath)) {
      return this.settings.claudePath
    }
    const candidates = [
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      join(process.env.HOME || '', '.npm-global/bin/claude'),
      join(process.env.HOME || '', '.nvm/current/bin/claude'),
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    return 'claude'
  }

  getApiPort() {
    try {
      return readFileSync(join(homedir(), '.banjuan', 'api-port'), 'utf-8').trim()
    } catch {
      return null
    }
  }

  buildMcpConfig() {
    const configDir = join(this.getPluginPath(), '.runtime')
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
    const configPath = join(configDir, 'mcp-config.json')
    const mcpServerPath = join(this.getPluginPath(), 'mcp-server.mjs')
    const port = this.getApiPort()
    const config = {
      mcpServers: {
        banjuan: {
          command: 'node',
          args: port ? [mcpServerPath, `--port=${port}`] : [mcpServerPath],
        },
      },
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2))
    return configPath
  }

  async persist() {
    await this.saveData({
      ...this.settings,
      sessions: this.sessions,
      activeSessionIdx: this.activeSessionIdx,
    })
  }

  async saveCurrentSession() {
    if (!this.sessionId || this.messages.length === 0) return
    const existing = this.sessions.findIndex(s => s.sessionId === this.sessionId)
    const entry = {
      sessionId: this.sessionId,
      title: this.messages[0]?.content?.slice(0, 50) || 'Untitled',
      messages: this.messages,
      updatedAt: new Date().toISOString(),
    }
    if (existing >= 0) {
      this.sessions[existing] = entry
      this.activeSessionIdx = existing
    } else {
      this.sessions.push(entry)
      this.activeSessionIdx = this.sessions.length - 1
    }
  }

  killActiveProcess() {
    if (this.activeProcess) {
      try { this.activeProcess.kill('SIGTERM') } catch {}
      this.activeProcess = null
    }
  }

  buildContextPrefix(context) {
    if (!context || Object.keys(context).length === 0) return ''
    const parts = []
    if (context.view) parts.push(`Current view: ${context.view}`)
    if (context.document) {
      const d = context.document
      parts.push(`Open document: "${d.title}"${d.authors?.length ? ` by ${d.authors.join(', ')}` : ''} (${d.type})`)
    }
    if (context.note) {
      const n = context.note
      parts.push(`Open note: "${n.title}" (type: ${n.type || 'markdown'})`)
    }
    if (context.currentPage) {
      parts.push(`Current page: ${context.currentPage}${context.totalPages ? ` of ${context.totalPages}` : ''}`)
    }
    if (context.selectedText) {
      parts.push(`Selected text: "${context.selectedText}"`)
    }
    if (parts.length === 0) return ''
    return `[App context: ${parts.join(' | ')}]\n\n`
  }

  async runClaude(message, context) {
    this.killActiveProcess()

    const claudePath = this.findClaude()
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
    ]

    if (this.settings.model) {
      args.push('--model', this.settings.model)
    }

    const mcpConfigPath = this.buildMcpConfig()
    args.push('--mcp-config', mcpConfigPath)
    args.push('--allowedTools', 'mcp__banjuan__*')

    if (this.sessionId) {
      args.push('--resume', this.sessionId)
    }

    const systemPrompt = [
      'You are an AI assistant integrated into Banjuan, a document reading and note-taking app.',
      'You have access to MCP tools (prefixed with mcp__banjuan__) that let you interact with the user\'s library:',
      '- search: Search notes and documents by keyword',
      '- list_notes / read_note: Browse and read the user\'s notes',
      '- create_note / update_note: Create new notes or edit existing ones',
      '- list_documents / get_document: Browse the document library',
      '- get_annotations: Read highlights and annotations on documents',
      'Use these tools proactively when the user asks about their documents, notes, or wants you to create/edit content.',
      'When creating notes, format content as BlockNote JSON blocks.',
      'Simple paragraph: [{"type":"paragraph","content":[{"type":"text","text":"Your text"}]}]',
      'Heading: [{"type":"heading","props":{"level":2},"content":[{"type":"text","text":"Title"}]}]',
      'Bullet list: [{"type":"bulletListItem","content":[{"type":"text","text":"Item"}]}]',
    ].join('\n')
    args.push('--system-prompt', systemPrompt)

    const contextPrefix = this.buildContextPrefix(context)
    args.push(contextPrefix + message)

    const env = { ...process.env }
    // Ensure PATH includes common locations
    if (!env.PATH?.includes('/opt/homebrew/bin')) {
      env.PATH = `/opt/homebrew/bin:/usr/local/bin:${env.PATH}`
    }

    this.sendToRenderer('chat:start', {})

    const proc = spawn(claudePath, args, {
      cwd: this.library.rootPath,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.activeProcess = proc

    let buffer = ''
    let lastText = ''
    let seenToolUseIds = new Set()

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          this.handleStreamEvent(event, lastText)

          if (event.type === 'assistant' && event.message?.content) {
            const blocks = event.message.content

            const texts = blocks.filter(c => c.type === 'text').map(c => c.text).join('')
            if (texts.length > lastText.length) {
              const delta = texts.slice(lastText.length)
              this.sendToRenderer('chat:delta', { text: delta })
              lastText = texts
            }

            for (const block of blocks) {
              if (block.type === 'tool_use' && !seenToolUseIds.has(block.id)) {
                seenToolUseIds.add(block.id)
                this.sendToRenderer('chat:tool_use', {
                  id: block.id,
                  name: block.name,
                  input: block.input,
                })
              }
              if (block.type === 'tool_result' && block.tool_use_id) {
                this.sendToRenderer('chat:tool_result', {
                  toolUseId: block.tool_use_id,
                  content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
                  isError: block.is_error || false,
                })
              }
            }
          }

          if (event.type === 'tool' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.tool_use_id) {
                this.sendToRenderer('chat:tool_result', {
                  toolUseId: block.tool_use_id,
                  content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
                  isError: block.is_error || false,
                })
              }
            }
            lastText = ''
          }
        } catch {}
      }
    })

    let stderrBuf = ''
    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString()
    })

    proc.on('close', (code) => {
      this.activeProcess = null
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer)
          this.handleStreamEvent(event, lastText)
        } catch {}
      }

      if (code !== 0 && stderrBuf) {
        this.sendToRenderer('chat:error', { error: stderrBuf.trim() })
      }
      this.sendToRenderer('chat:end', {})
    })

    proc.on('error', (err) => {
      this.activeProcess = null
      this.sendToRenderer('chat:error', {
        error: `Failed to start claude: ${err.message}. Is Claude Code installed?`
      })
      this.sendToRenderer('chat:end', {})
    })
  }

  handleStreamEvent(event) {
    if (event.type === 'system' && event.subtype === 'init') {
      this.sessionId = event.session_id
      this.sendToRenderer('chat:session', {
        sessionId: event.session_id,
        model: event.model,
        tools: event.tools,
      })
    }

    if (event.type === 'result') {
      const text = event.result || ''
      if (text) {
        this.messages.push({ role: 'assistant', content: text })
      }
      this.saveCurrentSession().then(() => this.persist())
      this.sendToRenderer('chat:result', {
        text,
        sessionId: event.session_id,
        cost: event.total_cost_usd,
        duration: event.duration_ms,
        numTurns: event.num_turns,
      })
    }
  }

  async onunload() {
    this.killActiveProcess()
  }
}
