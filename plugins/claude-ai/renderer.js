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
  let messages = []
  let currentStream = ''
  let toolCalls = []
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
      currentStream = ''
      sessionInfo = null
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
      for (const msg of messages) {
        messageArea.appendChild(createMessageEl(msg.role, msg.content))
      }
      if (isStreaming) {
        if (toolCalls.length > 0) {
          for (const tc of toolCalls) {
            messageArea.appendChild(createToolCallEl(tc))
          }
        }
        if (currentStream) {
          messageArea.appendChild(createMessageEl('assistant', currentStream, true))
        } else if (toolCalls.length === 0 || toolCalls[toolCalls.length - 1].result != null) {
          const thinking = document.createElement('div')
          thinking.className = 'claude-message claude-message-assistant'
          thinking.innerHTML = '<div class="claude-message-bubble claude-thinking"><span class="claude-thinking-dot"></span><span class="claude-thinking-dot"></span><span class="claude-thinking-dot"></span></div>'
          messageArea.appendChild(thinking)
        }
      }
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

  function createToolCallEl(tc) {
    const wrapper = document.createElement('div')
    wrapper.className = 'claude-tool-call'
    const isRunning = tc.result == null
    const statusIcon = isRunning
      ? '<span class="claude-tool-spinner"></span>'
      : tc.isError
        ? '<span class="claude-tool-icon claude-tool-error">✕</span>'
        : '<span class="claude-tool-icon claude-tool-ok">✓</span>'
    const header = document.createElement('div')
    header.className = 'claude-tool-header'
    header.innerHTML = `${statusIcon}<span class="claude-tool-name">${escapeHtml(tc.name)}</span>`
    wrapper.appendChild(header)

    if (tc.input && Object.keys(tc.input).length > 0) {
      const inputEl = document.createElement('div')
      inputEl.className = 'claude-tool-detail claude-tool-hidden'
      const inputLabel = document.createElement('div')
      inputLabel.className = 'claude-tool-detail-label'
      inputLabel.textContent = 'Input'
      inputEl.appendChild(inputLabel)
      const inputPre = document.createElement('pre')
      inputPre.className = 'claude-tool-json'
      inputPre.textContent = JSON.stringify(tc.input, null, 2)
      inputEl.appendChild(inputPre)
      wrapper.appendChild(inputEl)

      if (tc.result != null) {
        const resultEl = document.createElement('div')
        resultEl.className = 'claude-tool-detail claude-tool-hidden'
        const resultLabel = document.createElement('div')
        resultLabel.className = 'claude-tool-detail-label'
        resultLabel.textContent = 'Result'
        resultEl.appendChild(resultLabel)
        const resultPre = document.createElement('pre')
        resultPre.className = 'claude-tool-json'
        const resultText = tc.result.length > 2000 ? tc.result.slice(0, 2000) + '\n...(truncated)' : tc.result
        resultPre.textContent = resultText
        resultEl.appendChild(resultPre)
        wrapper.appendChild(resultEl)
      }

      header.style.cursor = 'pointer'
      header.addEventListener('click', () => {
        wrapper.querySelectorAll('.claude-tool-detail').forEach(d => d.classList.toggle('claude-tool-hidden'))
      })
    }
    return wrapper
  }

  function sendMessage(text) {
    if (!text || isStreaming) return
    messages.push({ role: 'user', content: text })
    currentStream = ''
    toolCalls = []
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
  const unsub1 = api.onMessage('chat:start', () => {
    isStreaming = true
    currentStream = ''
    toolCalls = []
  })

  const unsub2 = api.onMessage('chat:delta', ({ text }) => {
    currentStream += text
    const msgArea = el.querySelector('.claude-chat-messages')
    if (!msgArea) return
    const thinking = msgArea.querySelector('.claude-thinking')
    if (thinking) thinking.closest('.claude-message').remove()
    const hasCursor = msgArea.querySelector('.claude-cursor')
    if (!hasCursor) {
      msgArea.appendChild(createMessageEl('assistant', currentStream, true))
    } else {
      const streamingBubble = msgArea.querySelector('.claude-message-assistant:last-child .claude-message-bubble')
      if (streamingBubble) {
        streamingBubble.innerHTML = renderMarkdown(currentStream)
        const cursor = document.createElement('span')
        cursor.className = 'claude-cursor'
        streamingBubble.appendChild(cursor)
      }
    }
    msgArea.scrollTop = msgArea.scrollHeight
  })

  const unsub3 = api.onMessage('chat:result', ({ text }) => {
    if (currentStream) {
      messages.push({ role: 'assistant', content: currentStream })
    } else if (text && (messages.length === 0 || messages[messages.length - 1].content !== text)) {
      messages.push({ role: 'assistant', content: text })
    }
    currentStream = ''
    toolCalls = []
    isStreaming = false
    render()
  })

  const unsub4 = api.onMessage('chat:error', ({ error }) => {
    isStreaming = false
    currentStream = ''
    messages.push({ role: 'assistant', content: `\u26a0\ufe0f ${error}` })
    render()
  })

  const unsub5 = api.onMessage('chat:end', () => {
    if (isStreaming) {
      if (currentStream) messages.push({ role: 'assistant', content: currentStream })
      currentStream = ''
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
    if (currentStream) {
      messages.push({ role: 'assistant', content: currentStream })
      currentStream = ''
    }
    toolCalls.push({ id, name, input, result: null, isError: false })
    const msgArea = el.querySelector('.claude-chat-messages')
    if (!msgArea) return
    const thinking = msgArea.querySelector('.claude-thinking')
    if (thinking) thinking.closest('.claude-message').remove()
    const streamMsg = msgArea.querySelector('.claude-cursor')
    if (streamMsg) streamMsg.closest('.claude-message').remove()
    if (currentStream === '' && messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      msgArea.appendChild(createMessageEl('assistant', messages[messages.length - 1].content))
    }
    msgArea.appendChild(createToolCallEl(toolCalls[toolCalls.length - 1]))
    msgArea.scrollTop = msgArea.scrollHeight
  })

  const unsub8 = api.onMessage('chat:tool_result', ({ toolUseId, content, isError }) => {
    const tc = toolCalls.find(t => t.id === toolUseId)
    if (tc) {
      tc.result = content
      tc.isError = isError
    }
    const msgArea = el.querySelector('.claude-chat-messages')
    if (!msgArea) return
    const toolEls = msgArea.querySelectorAll('.claude-tool-call')
    const lastEl = toolEls[toolEls.length - 1]
    if (lastEl && tc) {
      lastEl.replaceWith(createToolCallEl(tc))
    }
    msgArea.scrollTop = msgArea.scrollHeight
  })

  render()

  return {
    cleanup() { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); unsub8() },
  }
}
