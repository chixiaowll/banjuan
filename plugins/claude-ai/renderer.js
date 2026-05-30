const CLAUDE_LOGO_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fill-rule="nonzero"/></svg>`
const CLAUDE_STAR_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fill-rule="nonzero"/></svg>`

const MODEL_LABELS = {
  '': 'Default',
  sonnet: 'Sonnet 4.6',
  opus: 'Opus',
  haiku: 'Haiku',
}

export function activate(api) {
  const el = api.containerEl
  // Ordered conversation items so the whole trace (text, thinking, tool calls)
  // is shown live AND preserved after completion:
  //   { role:'user'|'assistant'|'thinking', content, streaming? }
  //   { role:'tool', id, name, input, result, isError }
  let messages = []
  let isStreaming = false
  let settingsOpen = false
  let sessionsOpen = false
  let modelDropdownOpen = false
  let sessionInfo = null
  let sessionsList = []
  let settings = { model: '', claudePath: '' }

  api.rpc('getSettings').then(s => { if (s) settings = s })
  api.rpc('getActiveSession').then(s => {
    if (s && s.messages && s.messages.length > 0) {
      messages = s.messages
      render()
    }
  })

  function getModelLabel() {
    if (sessionInfo?.model) return sessionInfo.model
    return MODEL_LABELS[settings.model] || 'Default'
  }

  function render() {
    el.innerHTML = ''
    el.className = 'claude-chat-root'

    // Header
    const header = document.createElement('div')
    header.className = 'claude-chat-header'
    header.innerHTML = `
      <div class="claude-chat-title">
        <span class="claude-chat-logo">${CLAUDE_STAR_SVG}</span>
        <span>Claude</span>
      </div>
      <div class="claude-chat-actions">
        <button class="claude-btn-icon" data-action="new" title="New conversation">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="claude-btn-icon" data-action="sessions" title="History">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
        </button>
        <button class="claude-btn-icon" data-action="settings" title="Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
    `
    header.querySelector('[data-action="new"]').addEventListener('click', async () => {
      messages = []
      sessionInfo = null
      isStreaming = false
      await api.rpc('newSession')
      sessionsOpen = false
      render()
    })
    header.querySelector('[data-action="sessions"]').addEventListener('click', async () => {
      settingsOpen = false
      modelDropdownOpen = false
      sessionsOpen = !sessionsOpen
      if (sessionsOpen) {
        sessionsList = await api.rpc('getSessions') || []
      }
      render()
    })
    header.querySelector('[data-action="settings"]').addEventListener('click', () => {
      sessionsOpen = false
      modelDropdownOpen = false
      settingsOpen = !settingsOpen
      render()
    })
    el.appendChild(header)

    // Model selector row
    const modelRow = document.createElement('div')
    modelRow.className = 'claude-model-row'
    modelRow.innerHTML = `
      <button class="claude-model-select">
        <span>${escapeHtml(getModelLabel())}</span>
        <span class="claude-model-chevron">\u25BE</span>
      </button>
      <div class="claude-header-tools">
        <button class="claude-btn-icon" data-action="context" title="Add context">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </button>
      </div>
    `
    const modelBtn = modelRow.querySelector('.claude-model-select')
    modelBtn.addEventListener('click', () => {
      modelDropdownOpen = !modelDropdownOpen
      renderModelDropdown(modelRow)
    })
    el.appendChild(modelRow)

    if (settingsOpen) {
      renderSettings()
      return
    }

    if (sessionsOpen) {
      renderSessions()
      return
    }

    // Messages
    const messageArea = document.createElement('div')
    messageArea.className = 'claude-chat-messages'

    if (messages.length === 0 && !isStreaming) {
      messageArea.innerHTML = `
        <div class="claude-chat-empty">
          <div class="claude-chat-empty-icon">${CLAUDE_STAR_SVG.replace('20', '48').replace('20', '48')}</div>
          <div class="claude-chat-empty-title">How can I help you?</div>
          <div class="claude-chat-empty-desc">Ask questions about your documents, write notes, analyze content, and more.</div>
        </div>
      `
    } else {
      renderItems(messageArea)
    }
    el.appendChild(messageArea)

    // Input area
    const inputArea = document.createElement('div')
    inputArea.className = 'claude-chat-input-area'
    inputArea.innerHTML = `
      <div class="claude-chat-input-row">
        <textarea class="claude-chat-input" placeholder="Type / for commands" rows="1"></textarea>
        ${isStreaming
          ? '<button class="claude-chat-stop" title="Stop"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg></button>'
          : '<button class="claude-chat-send" title="Send"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>'
        }
      </div>
      <div class="claude-chat-footer">Claude can make mistakes. Please double-check responses.</div>
    `
    el.appendChild(inputArea)

    const textarea = inputArea.querySelector('textarea')
    const actionBtn = inputArea.querySelector('.claude-chat-send, .claude-chat-stop')

    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px'
    })

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (!isStreaming) sendMessage(textarea.value.trim())
      }
    })

    if (isStreaming) {
      actionBtn.addEventListener('click', () => api.rpc('stop'))
    } else {
      actionBtn.addEventListener('click', () => sendMessage(textarea.value.trim()))
    }

    requestAnimationFrame(() => {
      messageArea.scrollTop = messageArea.scrollHeight
      if (!isStreaming) textarea.focus()
    })
  }

  function renderModelDropdown(container) {
    const existing = container.querySelector('.claude-model-dropdown')
    if (existing) { existing.remove(); modelDropdownOpen = false; return }
    if (!modelDropdownOpen) return

    const dropdown = document.createElement('div')
    dropdown.className = 'claude-model-dropdown'
    const models = [
      { value: '', label: 'Default' },
      { value: 'sonnet', label: 'Sonnet 4.6' },
      { value: 'opus', label: 'Opus' },
      { value: 'haiku', label: 'Haiku' },
    ]
    for (const m of models) {
      const opt = document.createElement('button')
      opt.className = 'claude-model-option' + (settings.model === m.value ? ' claude-model-option-active' : '')
      opt.innerHTML = `<span>${m.label}</span>${settings.model === m.value ? '<span class="claude-model-check">\u2713</span>' : ''}`
      opt.addEventListener('click', async () => {
        settings.model = m.value
        await api.rpc('saveSettings', settings)
        modelDropdownOpen = false
        render()
      })
      dropdown.appendChild(opt)
    }
    container.style.position = 'relative'
    container.appendChild(dropdown)

    setTimeout(() => {
      const close = (e) => {
        if (!dropdown.contains(e.target)) {
          modelDropdownOpen = false
          dropdown.remove()
          document.removeEventListener('click', close)
        }
      }
      document.addEventListener('click', close)
    }, 0)
  }

  function renderSessions() {
    const panel = document.createElement('div')
    panel.className = 'claude-settings-panel'
    if (sessionsList.length === 0) {
      panel.innerHTML = `
        <div style="text-align:center;padding:40px 0;color:var(--text-muted,#666)">
          <div style="font-size:13px">No saved conversations</div>
        </div>
      `
    } else {
      const list = document.createElement('div')
      list.className = 'claude-sessions-list'
      for (const s of sessionsList) {
        const item = document.createElement('div')
        item.className = 'claude-session-item' + (s.active ? ' claude-session-active' : '')
        item.innerHTML = `
          <div class="claude-session-info">
            <div class="claude-session-title">${escapeHtml(s.title)}</div>
            <div class="claude-session-meta">${s.messageCount} messages${s.updatedAt ? ' \u00b7 ' + formatTime(s.updatedAt) : ''}</div>
          </div>
          <button class="claude-btn-icon claude-session-delete" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        `
        item.querySelector('.claude-session-info').addEventListener('click', async () => {
          const result = await api.rpc('switchSession', s.idx)
          if (result) {
            messages = result.messages || []
            sessionsOpen = false
            render()
          }
        })
        item.querySelector('.claude-session-delete').addEventListener('click', async (e) => {
          e.stopPropagation()
          await api.rpc('deleteSession', s.idx)
          sessionsList = await api.rpc('getSessions') || []
          render()
        })
        list.appendChild(item)
      }
      panel.appendChild(list)
    }
    el.appendChild(panel)
  }

  function renderSettings() {
    const panel = document.createElement('div')
    panel.className = 'claude-settings-panel'
    panel.innerHTML = `
      <div class="claude-settings-group">
        <label class="claude-settings-label">Model</label>
        <select class="claude-settings-input" data-field="model">
          <option value="" ${!settings.model ? 'selected' : ''}>Default (from Claude Code config)</option>
          <option value="sonnet" ${settings.model === 'sonnet' ? 'selected' : ''}>Claude Sonnet</option>
          <option value="opus" ${settings.model === 'opus' ? 'selected' : ''}>Claude Opus</option>
          <option value="haiku" ${settings.model === 'haiku' ? 'selected' : ''}>Claude Haiku</option>
        </select>
      </div>
      <div class="claude-settings-group">
        <label class="claude-settings-label">Claude CLI Path</label>
        <input type="text" class="claude-settings-input" placeholder="auto-detect" value="${escapeHtml(settings.claudePath || '')}" data-field="claudePath" />
        <div class="claude-settings-hint">Leave empty to auto-detect.</div>
      </div>
      <button class="claude-settings-save">Save</button>
    `
    panel.querySelector('.claude-settings-save').addEventListener('click', async () => {
      const model = panel.querySelector('[data-field="model"]').value
      const claudePath = panel.querySelector('[data-field="claudePath"]').value.trim()
      settings = { model, claudePath }
      await api.rpc('saveSettings', settings)
      settingsOpen = false
      render()
    })
    el.appendChild(panel)
  }

  // Render all conversation items (text / thinking / tool) in order into msgArea.
  function renderItems(msgArea) {
    msgArea.innerHTML = ''
    for (const item of messages) {
      if (item.role === 'tool') {
        msgArea.appendChild(createToolCallEl(item))
      } else if (item.role === 'thinking') {
        msgArea.appendChild(createThinkingEl(item.content, item.streaming))
      } else {
        msgArea.appendChild(createMessageEl(item.role, item.content, item.streaming))
      }
    }
    // "Working…" dots only while waiting with nothing in-flight to show.
    const last = messages[messages.length - 1]
    if (isStreaming && (!last || (last.role !== 'assistant' && last.role !== 'thinking') || !last.streaming)) {
      if (!last || last.role !== 'tool' || last.result != null) {
        const working = document.createElement('div')
        working.className = 'claude-message claude-message-assistant'
        working.innerHTML = '<div class="claude-message-bubble claude-thinking"><span class="claude-thinking-dot"></span><span class="claude-thinking-dot"></span><span class="claude-thinking-dot"></span></div>'
        msgArea.appendChild(working)
      }
    }
    msgArea.scrollTop = msgArea.scrollHeight
  }

  function createThinkingEl(content, streaming = false) {
    const wrapper = document.createElement('div')
    wrapper.className = 'claude-tool-call claude-thinking-block'
    wrapper.style.cssText = 'flex-shrink:0;margin:6px 0;border:1px solid rgba(120,90,60,0.28);border-radius:8px;overflow:hidden;background:rgba(128,110,90,0.04)'
    const header = document.createElement('div')
    header.className = 'claude-tool-header'
    header.innerHTML = `<span class="claude-tool-icon">💭</span><span class="claude-tool-name">Thinking${streaming ? '…' : ''}</span>`
    wrapper.appendChild(header)
    const body = document.createElement('div')
    body.className = 'claude-tool-detail claude-thinking-text'
    body.innerHTML = renderMarkdown(content)
    if (streaming) { const c = document.createElement('span'); c.className = 'claude-cursor'; body.appendChild(c) }
    wrapper.appendChild(body)
    // Collapsible once finished.
    if (!streaming) {
      body.classList.add('claude-tool-hidden')
      header.style.cursor = 'pointer'
      header.addEventListener('click', () => body.classList.toggle('claude-tool-hidden'))
    }
    return wrapper
  }

  function createMessageEl(role, content, streaming = false) {
    const msgEl = document.createElement('div')
    msgEl.className = `claude-message claude-message-${role}`

    const bubble = document.createElement('div')
    bubble.className = 'claude-message-bubble'
    bubble.innerHTML = renderMarkdown(content)
    if (streaming) {
      const cursor = document.createElement('span')
      cursor.className = 'claude-cursor'
      bubble.appendChild(cursor)
    }
    msgEl.appendChild(bubble)

    if (role === 'assistant' && !streaming) {
      const actions = document.createElement('div')
      actions.className = 'claude-message-actions'
      actions.innerHTML = `<button class="claude-action-btn" data-action="copy">Copy</button>`
      actions.querySelector('[data-action="copy"]').addEventListener('click', () => {
        navigator.clipboard.writeText(content)
        const btn = actions.querySelector('[data-action="copy"]')
        btn.textContent = 'Copied!'
        setTimeout(() => { btn.textContent = 'Copy' }, 1500)
      })
      msgEl.appendChild(actions)
    }
    return msgEl
  }

  // Friendly action label + icon for a tool name (banjuan MCP tools, web tools).
  function toolLabel(rawName) {
    const name = String(rawName || '').replace(/^mcp__banjuan__/, '')
    const MAP = {
      search: ['🔍', 'Searching library'],
      list_notes: ['📝', 'Listing notes'], read_note: ['📖', 'Reading note'],
      create_note: ['✏️', 'Creating note'], update_note: ['✏️', 'Updating note'],
      list_documents: ['📚', 'Listing documents'], get_document: ['📄', 'Getting document info'],
      read_document: ['📖', 'Reading document'], get_annotations: ['🖍️', 'Reading annotations'],
      get_mindmap: ['🧠', 'Reading mindmap'], create_mindmap: ['🧠', 'Creating mindmap'],
      add_mindmap_node: ['🧠', 'Adding mindmap node'], update_mindmap_node: ['🧠', 'Updating mindmap node'],
      delete_mindmap_node: ['🧠', 'Deleting mindmap node'],
      list_tags: ['🏷️', 'Listing tags'], assign_tags: ['🏷️', 'Tagging'], unassign_tag: ['🏷️', 'Removing tag'],
      list_note_folders: ['📁', 'Listing folders'], create_note_folder: ['📁', 'Creating folder'], move_note: ['📁', 'Moving note'],
      delete_note: ['🗑️', 'Deleting note'], delete_document: ['🗑️', 'Deleting document'], delete_tag: ['🗑️', 'Deleting tag'],
      WebSearch: ['🌐', 'Web search'], WebFetch: ['🌐', 'Fetching page'],
    }
    const [icon, label] = MAP[name] || ['🔧', name]
    return { icon, label, name }
  }

  // One-line summary of the most salient input fields, shown without expanding.
  function inputSummary(input) {
    if (!input || typeof input !== 'object') return ''
    const keys = ['query', 'q', 'title', 'name', 'tagName', 'id', 'noteId', 'mindmapId', 'docId', 'folder', 'path', 'url']
    for (const k of keys) {
      if (input[k]) return `${k}: ${String(input[k]).slice(0, 80)}`
    }
    if (input.fromPage) return `pages ${input.fromPage}${input.toPage ? '–' + input.toPage : ''}`
    if (Array.isArray(input.tags)) return `tags: ${input.tags.join(', ').slice(0, 80)}`
    const first = Object.entries(input)[0]
    return first ? `${first[0]}: ${String(first[1]).slice(0, 80)}` : ''
  }

  function createToolCallEl(tc) {
    const wrapper = document.createElement('div')
    wrapper.className = 'claude-tool-call'
    // flex-shrink:0 is the critical bit: the message list is a flex column, and a
    // flex item with overflow:hidden gets min-size 0, so it collapsed to a thin
    // line when the column overflowed. Inline styles also avoid CSS-reload issues.
    wrapper.style.cssText = 'flex-shrink:0;margin:6px 0;border:1px solid rgba(120,90,60,0.38);border-radius:8px;overflow:hidden;font-size:12px;background:rgba(128,110,90,0.06);box-shadow:0 1px 2px rgba(60,40,20,0.06)'
    const isRunning = tc.result == null
    const statusIcon = isRunning
      ? '<span class="claude-tool-spinner"></span>'
      : tc.isError
        ? '<span class="claude-tool-icon claude-tool-error">✕</span>'
        : '<span class="claude-tool-icon claude-tool-ok">✓</span>'
    const { icon, label, name } = toolLabel(tc.name)
    const header = document.createElement('div')
    header.className = 'claude-tool-header'
    header.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 10px;font-size:12px;color:#3a2a1a;background:rgba(120,90,60,0.10);border-bottom:1px solid rgba(120,90,60,0.18);user-select:none'
    header.innerHTML = `${statusIcon}<span style="font-size:13px">${icon}</span><span style="font-weight:600">${escapeHtml(label)}</span><span style="margin-left:auto;font-size:10px;opacity:0.55;font-family:monospace">${escapeHtml(name)}</span>`
    wrapper.appendChild(header)

    // Always-visible summary line: what it's doing + (when done) a result peek.
    const summary = inputSummary(tc.input)
    if (summary) {
      const sub = document.createElement('div')
      sub.style.cssText = 'padding:4px 10px;font-size:11.5px;color:#6b5a48;word-break:break-word'
      sub.textContent = summary
      wrapper.appendChild(sub)
    }
    if (tc.result != null) {
      const preview = document.createElement('div')
      preview.style.cssText = 'padding:0 10px 6px;font-size:11.5px;color:#5a4a38;word-break:break-word'
      const oneLine = String(tc.result).replace(/\s+/g, ' ').trim()
      preview.textContent = (tc.isError ? '⚠ ' : '→ ') + (oneLine.length > 160 ? oneLine.slice(0, 160) + '…' : oneLine)
      wrapper.appendChild(preview)
    }

    if ((tc.input && Object.keys(tc.input).length > 0) || tc.result != null) {
      if (tc.input && Object.keys(tc.input).length > 0) {
        const inputEl = document.createElement('div')
        inputEl.className = 'claude-tool-detail claude-tool-hidden'
        inputEl.innerHTML = '<div class="claude-tool-detail-label">Input</div>'
        const inputPre = document.createElement('pre')
        inputPre.className = 'claude-tool-json'
        inputPre.textContent = JSON.stringify(tc.input, null, 2)
        inputEl.appendChild(inputPre)
        wrapper.appendChild(inputEl)
      }
      if (tc.result != null) {
        const resultEl = document.createElement('div')
        resultEl.className = 'claude-tool-detail claude-tool-hidden'
        resultEl.innerHTML = '<div class="claude-tool-detail-label">Result</div>'
        const resultPre = document.createElement('pre')
        resultPre.className = 'claude-tool-json'
        const resultText = tc.result.length > 4000 ? tc.result.slice(0, 4000) + '\n…(truncated)' : tc.result
        resultPre.textContent = resultText
        resultEl.appendChild(resultPre)
        wrapper.appendChild(resultEl)
      }
      header.style.cursor = 'pointer'
      header.title = 'Click to show full input / result'
      header.addEventListener('click', () => {
        wrapper.querySelectorAll('.claude-tool-detail').forEach(d => d.classList.toggle('claude-tool-hidden'))
      })
    }
    return wrapper
  }

  function sendMessage(text) {
    if (!text || isStreaming) return
    messages.push({ role: 'user', content: text })
    isStreaming = true
    render()
    const context = api.getContext()
    api.rpc('chat', text, context)
    if (context.selectedText) {
      document.dispatchEvent(new CustomEvent('banjuan:context-update', {
        detail: { selectedText: null, selectedPage: null }
      }))
    }
  }

  function renderMarkdown(text) {
    if (!text) return ''
    let html = escapeHtml(text)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="claude-code-block"><code class="lang-${lang}">${code}</code></pre>`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>')
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>')
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>')
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    html = html.replace(/<\/ul>\s*<ul>/g, '')
    html = html.replace(/\n/g, '<br>')
    return html
  }

  function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  function formatTime(isoStr) {
    try {
      const d = new Date(isoStr)
      const now = new Date()
      const diff = now - d
      if (diff < 60000) return 'just now'
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
      return d.toLocaleDateString()
    } catch { return '' }
  }

  // Event handlers
  const getMsgArea = () => el.querySelector('.claude-chat-messages')
  const finalizeStreaming = () => { for (const m of messages) if (m.streaming) m.streaming = false }

  // Append streamed text to the current streaming item of `role` (assistant or
  // thinking), creating a new item when the stream was interrupted (e.g. a tool
  // call). Updates the live bubble incrementally; full re-render when structure
  // changes so nothing is lost.
  function streamInto(role, text) {
    const last = messages[messages.length - 1]
    let item, isNew = false
    if (last && last.role === role && last.streaming) {
      item = last; item.content += text
    } else {
      finalizeStreaming()
      item = { role, content: text, streaming: true }
      messages.push(item); isNew = true
    }
    const msgArea = getMsgArea()
    if (!msgArea) return
    if (isNew) { renderItems(msgArea); return }
    const lastEl = msgArea.lastElementChild
    const bubble = lastEl && lastEl.querySelector(role === 'thinking' ? '.claude-thinking-text' : '.claude-message-bubble')
    if (bubble) {
      bubble.innerHTML = renderMarkdown(item.content)
      const c = document.createElement('span'); c.className = 'claude-cursor'; bubble.appendChild(c)
      msgArea.scrollTop = msgArea.scrollHeight
    } else {
      renderItems(msgArea)
    }
  }

  const unsub1 = api.onMessage('chat:start', () => { isStreaming = true })

  const unsubThink = api.onMessage('chat:thinking', ({ text }) => streamInto('thinking', text))

  const unsub2 = api.onMessage('chat:delta', ({ text }) => streamInto('assistant', text))

  const unsub3 = api.onMessage('chat:result', ({ text }) => {
    finalizeStreaming()
    if (text) {
      const lastUser = messages.map(m => m.role).lastIndexOf('user')
      const hasAsst = messages.slice(lastUser + 1).some(m => m.role === 'assistant')
      if (!hasAsst) messages.push({ role: 'assistant', content: text })
    }
    isStreaming = false
    render()
  })

  const unsub4 = api.onMessage('chat:error', ({ error }) => {
    finalizeStreaming()
    isStreaming = false
    messages.push({ role: 'assistant', content: `\u26a0\ufe0f ${error}` })
    render()
  })

  const unsub5 = api.onMessage('chat:end', () => {
    if (isStreaming) {
      finalizeStreaming()
      isStreaming = false
      render()
    }
  })

  const unsub6 = api.onMessage('chat:session', (info) => {
    sessionInfo = info
    const modelEl = el.querySelector('.claude-model-select span:first-child')
    if (modelEl) modelEl.textContent = getModelLabel()
  })

  const unsub7 = api.onMessage('chat:tool_use', ({ id, name, input }) => {
    finalizeStreaming()
    messages.push({ role: 'tool', id, name, input, result: null, isError: false })
    const msgArea = getMsgArea()
    if (msgArea) renderItems(msgArea)
  })

  const unsub8 = api.onMessage('chat:tool_result', ({ toolUseId, content, isError }) => {
    const tc = [...messages].reverse().find(m => m.role === 'tool' && m.id === toolUseId)
    if (tc) { tc.result = content; tc.isError = isError }
    const msgArea = getMsgArea()
    if (msgArea) renderItems(msgArea)
  })

  render()

  return {
    cleanup() { unsub1(); unsubThink(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); unsub8() },
  }
}
