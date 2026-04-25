# Phase 9: Chrome Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Chrome extension for clipping web pages into the Banjuan library. The Electron app runs a local HTTP API server; the extension sends clips to it. Supports full-page HTML snapshots and selected-text clips.

**Architecture:** Two components — (1) HTTP API server embedded in Electron main process, listens on localhost, writes port to `~/.banjuan/api-port`; (2) Manifest V3 Chrome extension with popup UI for clipping.

**Tech Stack:** Node.js `http` module (in Electron), Chrome Extension Manifest V3, vanilla JS/HTML popup

---

## File Structure

```
packages/app/src/main/
├── api-server.ts           # Local HTTP API server
├── clip-service.ts         # Web clip save logic
├── index.ts                # Start API server on app ready
├── ipc.ts                  # (unchanged)

packages/chrome-extension/
├── manifest.json           # Manifest V3
├── popup/
│   ├── popup.html          # Extension popup UI
│   ├── popup.css           # Styles
│   └── popup.js            # Popup logic
├── background.js           # Service worker
├── content.js              # Content script for text selection
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Task 1: Local HTTP API Server

**Files:**
- Create: `packages/app/src/main/clip-service.ts`
- Create: `packages/app/src/main/api-server.ts`
- Modify: `packages/app/src/main/index.ts`
- Modify: `packages/app/src/main/ipc.ts`

- [ ] **Step 1: Create clip-service.ts**

Create `packages/app/src/main/clip-service.ts` — handles saving web clips:

```typescript
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Library } from '@banjuan/core'

interface ClipInput {
  url: string
  title: string
  html: string
  selectedText?: string
  tags?: string[]
}

export async function saveClip(library: Library, input: ClipInput): Promise<{ id: string; title: string }> {
  const date = new Date().toISOString().slice(0, 10)
  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
  const dirName = `${date}-${slug}`
  const clipDir = join(library.rootPath, 'documents', 'web-clips', dirName)
  mkdirSync(clipDir, { recursive: true })

  writeFileSync(join(clipDir, 'index.html'), input.html, 'utf-8')
  writeFileSync(join(clipDir, 'metadata.json'), JSON.stringify({
    url: input.url,
    title: input.title,
    savedAt: new Date().toISOString(),
    selectedText: input.selectedText ?? null,
  }, null, 2), 'utf-8')

  const htmlPath = join(clipDir, 'index.html')
  const doc = await library.documents.import(htmlPath, { title: input.title })

  if (input.tags?.length) {
    for (const tag of input.tags) {
      const existing = (await library.tags.list()).find(t => t.name === tag)
      if (!existing) await library.tags.create({ name: tag })
    }
    await library.tags.assign(doc.id, 'document', input.tags)
  }

  return { id: doc.id, title: doc.title }
}
```

- [ ] **Step 2: Create api-server.ts**

Create `packages/app/src/main/api-server.ts`:

```typescript
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Library } from '@banjuan/core'
import { saveClip } from './clip-service.js'

let server: ReturnType<typeof createServer> | null = null
let portFilePath: string

function getLibrary(): Library | null {
  // Will be set by ipc.ts via setLibraryGetter
  return libraryGetter()
}

let libraryGetter: () => Library | null = () => null

export function setLibraryGetter(getter: () => Library | null): void {
  libraryGetter = getter
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    json(res, 204, null)
    return
  }

  const url = req.url ?? ''

  if (url === '/api/status' && req.method === 'GET') {
    const lib = getLibrary()
    json(res, 200, {
      status: 'ok',
      libraryOpen: lib !== null,
      libraryPath: lib?.rootPath ?? null,
    })
    return
  }

  if (url === '/api/clip' && req.method === 'POST') {
    const lib = getLibrary()
    if (!lib) {
      json(res, 503, { error: '书房未打开' })
      return
    }
    try {
      const body = JSON.parse(await readBody(req))
      const result = await saveClip(lib, body)
      json(res, 200, { status: 'ok', ...result })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
    return
  }

  json(res, 404, { error: 'Not found' })
}

export function startApiServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      handleRequest(req, res).catch(() => {
        json(res, 500, { error: 'Internal error' })
      })
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to start API server'))
        return
      }
      const port = addr.port

      const banjuanDir = join(homedir(), '.banjuan')
      mkdirSync(banjuanDir, { recursive: true })
      portFilePath = join(banjuanDir, 'api-port')
      writeFileSync(portFilePath, String(port), 'utf-8')

      console.log(`API server listening on http://127.0.0.1:${port}`)
      resolve(port)
    })

    server.on('error', reject)
  })
}

export function stopApiServer(): void {
  if (server) {
    server.close()
    server = null
  }
  if (portFilePath && existsSync(portFilePath)) {
    unlinkSync(portFilePath)
  }
}
```

- [ ] **Step 3: Wire into ipc.ts**

In `packages/app/src/main/ipc.ts`:
1. Import `setLibraryGetter` from `./api-server.js`
2. At the end of `registerIpcHandlers()`, call:
```typescript
setLibraryGetter(() => library)
```

- [ ] **Step 4: Wire into index.ts**

In `packages/app/src/main/index.ts`:
1. Import `startApiServer` and `stopApiServer`
2. In the `app.whenReady().then(...)` block, after `registerIpcHandlers()`, add:
```typescript
startApiServer().catch(console.error)
```
3. In `app.on('window-all-closed', ...)`, before `app.quit()`, add:
```typescript
stopApiServer()
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(app): local HTTP API server for Chrome extension"
```

---

## Task 2: Chrome Extension — Manifest + Background

**Files:**
- Create: `packages/chrome-extension/manifest.json`
- Create: `packages/chrome-extension/background.js`

- [ ] **Step 1: Create manifest.json**

Create `packages/chrome-extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "半卷闲书 Web Clipper",
  "version": "0.1.0",
  "description": "Save web pages and selections to your Banjuan library",
  "permissions": ["activeTab", "contextMenus"],
  "host_permissions": ["http://127.0.0.1/"],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: Create background.js**

Create `packages/chrome-extension/background.js`:

```javascript
const PORT_URL = 'http://127.0.0.1'

async function getApiPort() {
  // Try common port range; in practice, extension reads from a known location or tries discovery
  // For simplicity, we try the port file approach via the status endpoint on a range
  // Better approach: use native messaging or a fixed port. For MVP: try port from storage.
  const stored = await chrome.storage.local.get('apiPort')
  return stored.apiPort || null
}

async function checkStatus(port) {
  try {
    const res = await fetch(`${PORT_URL}:${port}/api/status`)
    if (res.ok) {
      const data = await res.json()
      return data.status === 'ok'
    }
  } catch {}
  return false
}

async function sendClip(port, data) {
  const res = await fetch(`${PORT_URL}:${port}/api/clip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

// Context menu for selected text
chrome.contextMenus.create({
  id: 'save-selection',
  title: '保存到半卷闲书',
  contexts: ['selection'],
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-selection' && tab?.id) {
    const port = await getApiPort()
    if (!port) {
      console.error('API port not configured')
      return
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        url: window.location.href,
        title: document.title,
        html: document.documentElement.outerHTML,
        selectedText: window.getSelection()?.toString() || '',
      }),
    })

    if (result?.result) {
      try {
        await sendClip(port, result.result)
      } catch (e) {
        console.error('Failed to save clip:', e)
      }
    }
  }
})

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CHECK_STATUS') {
    getApiPort().then(port => {
      if (!port) {
        sendResponse({ connected: false })
        return
      }
      checkStatus(port).then(ok => sendResponse({ connected: ok }))
    })
    return true
  }

  if (message.type === 'SAVE_CLIP') {
    getApiPort().then(port => {
      if (!port) {
        sendResponse({ error: 'API port not configured' })
        return
      }
      sendClip(port, message.data).then(res => sendResponse(res)).catch(e => sendResponse({ error: e.message }))
    })
    return true
  }

  if (message.type === 'SET_PORT') {
    chrome.storage.local.set({ apiPort: message.port })
    sendResponse({ ok: true })
    return true
  }
})
```

- [ ] **Step 3: Create placeholder icons**

Create simple SVG-based PNG placeholders. For MVP, create minimal text files that note icons are needed:

```bash
mkdir -p packages/chrome-extension/icons
```

Generate simple 16x16, 48x48, 128x128 PNG icons. Since we can't generate real images, create a README:

Create `packages/chrome-extension/icons/README.md`:
```
Place icon files here:
- icon16.png (16x16)
- icon48.png (48x48)
- icon128.png (128x128)
```

For the extension to load without errors, create minimal 1x1 PNG files or use the extension without icons during development.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(chrome-extension): manifest v3 and background service worker"
```

---

## Task 3: Chrome Extension — Popup + Content Script

**Files:**
- Create: `packages/chrome-extension/popup/popup.html`
- Create: `packages/chrome-extension/popup/popup.css`
- Create: `packages/chrome-extension/popup/popup.js`
- Create: `packages/chrome-extension/content.js`

- [ ] **Step 1: Create popup.html**

Create `packages/chrome-extension/popup/popup.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <h1>半卷闲书</h1>
    <div id="status" class="status disconnected">检查连接中...</div>

    <div id="settings-section" style="display:none">
      <label>API 端口：
        <input type="number" id="port-input" placeholder="端口号">
      </label>
      <button id="save-port">保存</button>
    </div>

    <div id="clip-section" style="display:none">
      <div class="page-info">
        <div id="page-title" class="page-title"></div>
        <div id="page-url" class="page-url"></div>
      </div>

      <div id="selection-info" style="display:none">
        <label>选中文本：</label>
        <div id="selected-text" class="selected-text"></div>
      </div>

      <label>标签（逗号分隔）：
        <input type="text" id="tags-input" placeholder="标签1, 标签2">
      </label>

      <button id="clip-btn" class="primary">保存到书房</button>
      <div id="result" class="result" style="display:none"></div>
    </div>

    <button id="toggle-settings" class="link-btn">设置</button>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup.css**

Create `packages/chrome-extension/popup/popup.css`:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 320px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; color: #cdd6f4; background: #1e1e2e; }
.container { padding: 16px; }
h1 { font-size: 16px; margin-bottom: 12px; color: #cdd6f4; }
.status { padding: 8px; border-radius: 6px; margin-bottom: 12px; font-size: 12px; }
.status.connected { background: #1e3a2f; color: #a6e3a1; }
.status.disconnected { background: #3a1e1e; color: #f38ba8; }
.page-info { margin-bottom: 12px; }
.page-title { font-weight: 600; margin-bottom: 4px; }
.page-url { font-size: 11px; color: #a6adc8; word-break: break-all; }
.selected-text { background: #313244; padding: 8px; border-radius: 4px; margin: 4px 0 12px; font-size: 12px; max-height: 60px; overflow: auto; }
label { display: block; margin-bottom: 4px; color: #a6adc8; font-size: 12px; }
input { width: 100%; padding: 6px 8px; border: 1px solid #45475a; border-radius: 4px; background: #313244; color: #cdd6f4; margin-bottom: 12px; font-size: 13px; }
button { width: 100%; padding: 8px; border: 1px solid #45475a; border-radius: 6px; background: #313244; color: #cdd6f4; cursor: pointer; font-size: 13px; }
button:hover { background: #45475a; }
button.primary { background: #89b4fa; color: #1e1e2e; border-color: #89b4fa; font-weight: 600; }
button.primary:hover { background: #74c7ec; }
.link-btn { background: none; border: none; color: #a6adc8; font-size: 11px; margin-top: 12px; text-decoration: underline; }
.result { margin-top: 8px; padding: 8px; border-radius: 4px; font-size: 12px; }
.result.success { background: #1e3a2f; color: #a6e3a1; }
.result.error { background: #3a1e1e; color: #f38ba8; }
```

- [ ] **Step 3: Create popup.js**

Create `packages/chrome-extension/popup/popup.js`:

```javascript
const statusEl = document.getElementById('status')
const clipSection = document.getElementById('clip-section')
const settingsSection = document.getElementById('settings-section')
const pageTitleEl = document.getElementById('page-title')
const pageUrlEl = document.getElementById('page-url')
const selectionInfo = document.getElementById('selection-info')
const selectedTextEl = document.getElementById('selected-text')
const tagsInput = document.getElementById('tags-input')
const clipBtn = document.getElementById('clip-btn')
const resultEl = document.getElementById('result')
const portInput = document.getElementById('port-input')
const savePortBtn = document.getElementById('save-port')
const toggleSettingsBtn = document.getElementById('toggle-settings')

let pageData = null

async function init() {
  // Check connection
  chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }, (response) => {
    if (response?.connected) {
      statusEl.textContent = '已连接'
      statusEl.className = 'status connected'
      clipSection.style.display = 'block'
      loadPageInfo()
    } else {
      statusEl.textContent = '未连接 — 请确保半卷闲书已启动，并在设置中配置端口'
      statusEl.className = 'status disconnected'
    }
  })

  // Load saved port
  const stored = await chrome.storage.local.get('apiPort')
  if (stored.apiPort) portInput.value = stored.apiPort
}

async function loadPageInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return

  pageTitleEl.textContent = tab.title || '(无标题)'
  pageUrlEl.textContent = tab.url || ''

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      url: window.location.href,
      title: document.title,
      html: document.documentElement.outerHTML,
      selectedText: window.getSelection()?.toString() || '',
    }),
  })

  if (result?.result) {
    pageData = result.result
    if (pageData.selectedText) {
      selectionInfo.style.display = 'block'
      selectedTextEl.textContent = pageData.selectedText.slice(0, 200)
    }
  }
}

clipBtn.addEventListener('click', async () => {
  if (!pageData) return

  clipBtn.disabled = true
  clipBtn.textContent = '保存中...'
  resultEl.style.display = 'none'

  const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean)

  chrome.runtime.sendMessage({
    type: 'SAVE_CLIP',
    data: { ...pageData, tags },
  }, (response) => {
    clipBtn.disabled = false
    clipBtn.textContent = '保存到书房'
    resultEl.style.display = 'block'

    if (response?.error) {
      resultEl.className = 'result error'
      resultEl.textContent = `失败：${response.error}`
    } else {
      resultEl.className = 'result success'
      resultEl.textContent = `✓ 已保存：${response?.title || '成功'}`
    }
  })
})

savePortBtn.addEventListener('click', () => {
  const port = parseInt(portInput.value)
  if (!port) return
  chrome.runtime.sendMessage({ type: 'SET_PORT', port }, () => {
    settingsSection.style.display = 'none'
    init()
  })
})

toggleSettingsBtn.addEventListener('click', () => {
  settingsSection.style.display = settingsSection.style.display === 'none' ? 'block' : 'none'
})

init()
```

- [ ] **Step 4: Create content.js**

Create `packages/chrome-extension/content.js`:

```javascript
// Content script — captures selected text when requested by popup/background
// Currently a no-op; selection capture is done via chrome.scripting.executeScript
// This file exists for future enhancements (e.g., highlight overlay on page)
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(chrome-extension): popup UI, content script, and web clipper"
```

---

## Task 4: Final Integration + Verification

- [ ] **Step 1: Verify TypeScript for app**

```bash
pnpm --filter @banjuan/app exec tsc --noEmit
```

- [ ] **Step 2: Run core tests**

```bash
pnpm --filter @banjuan/core test
```

- [ ] **Step 3: Verify CLI builds**

```bash
pnpm --filter @banjuan/cli build
```

- [ ] **Step 4: Verify extension manifest is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/chrome-extension/manifest.json','utf8')); console.log('Valid')"
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: Phase 9 complete — Chrome extension web clipper"
```
