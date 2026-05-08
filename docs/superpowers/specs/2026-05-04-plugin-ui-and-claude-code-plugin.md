# Plugin UI Extension & Claude Code Plugin Design

## Goal

Extend Banjuan's plugin system from headless (commands + events only) to full UI capability, following Obsidian's proven architecture. Then build a "Claude AI Assistant" plugin to validate the system.

## Part 1: Plugin UI Framework (Obsidian-inspired)

### Architecture Overview

Adopt Obsidian's core patterns, adapted for Banjuan's Electron + React stack:

1. **Component lifecycle with deterministic cleanup** — `register*` family on base class
2. **View registry + factory** — `registerView(type, factory)`, workspace instantiates on demand
3. **Raw DOM containerEl** — each view gets an `HTMLElement`, render anything inside
4. **Event-driven extension points** — menus, toolbars emit events, plugins inject items
5. **CSS injection** — `styles.css` auto-loaded from plugin directory
6. **JSON config** — `loadData()` / `saveData()` for plugin settings

### Key Difference from Obsidian

Obsidian uses raw DOM everywhere (no React). Banjuan uses React. Solution: the app provides a `PluginViewHost` React component that creates a `div` ref and passes it to the plugin view as `containerEl`. Plugins can use raw DOM, or mount their own React root inside it.

### 1.1 Enhanced BanjuanPlugin Base Class

```typescript
abstract class BanjuanPlugin {
  readonly id: string
  readonly app: BanjuanApp           // NEW: replaces raw library + bus
  private commands: PluginCommand[] = []
  private listeners: DisposeFn[] = []  // Generalized cleanup

  constructor(id: string, app: BanjuanApp)
  abstract onload(): Promise<void>
  abstract onunload(): Promise<void>

  // === Commands (existing, unchanged) ===
  addCommand(cmd: { id: string; name: string; callback: () => Promise<void> }): void

  // === Events (existing, enhanced) ===
  on<E extends BanjuanEvent>(event: E, handler: (data: BanjuanEventMap[E]) => void): void

  // === NEW: Deterministic Cleanup (Obsidian Component pattern) ===
  register(cb: () => void): void              // Generic cleanup callback
  registerDomEvent(el: EventTarget, type: string, cb: EventListener): void
  registerInterval(id: ReturnType<typeof setInterval>): void

  // === NEW: View Registration ===
  registerView(viewType: string, factory: (containerEl: HTMLElement) => PluginView): void

  // === NEW: UI Injection ===
  addRibbonAction(icon: string, title: string, callback: () => void): void
  addStatusBarItem(): HTMLElement

  // === NEW: RPC (main ↔ renderer) ===
  addRpcHandler(method: string, handler: (...args: any[]) => Promise<any>): void
  sendToRenderer(channel: string, data: any): void

  // === NEW: Config Persistence ===
  loadData(): Promise<any>             // Reads config.json from plugin dir
  saveData(data: any): Promise<void>   // Writes config.json

  // === Internal (called by PluginManager) ===
  _cleanup(): void   // Runs all registered cleanup + existing event cleanup
}
```

### 1.2 BanjuanApp Interface

Replaces passing raw `Library` + `EventBus`. Provides a structured API surface:

```typescript
interface BanjuanApp {
  // Data services (same as Library)
  documents: DocumentService
  notes: NoteService
  annotations: AnnotationService
  tags: TagService
  folders: FolderService
  search: SearchService
  templates: TemplateService
  attachments: AttachmentService
  mindmaps: MindmapService

  // Workspace (NEW — controls UI layout)
  workspace: {
    // Open a registered plugin view as a tab
    openView(viewType: string, options?: { singleton?: boolean }): void
    // Get info about the currently active tab
    getActiveTab(): { type: string; id: string; title: string; data?: any } | null
    // Listen for active tab changes
    onActiveTabChange(cb: (tab: { type: string; id: string } | null) => void): DisposeFn
    // Close views of a given type
    closeViews(viewType: string): void
  }

  // Events
  events: EventBus

  // Vault / file system (library root path)
  rootPath: string
}
```

### 1.3 PluginView Interface

The view that plugins create. Gets a raw `containerEl` — framework-agnostic:

```typescript
interface PluginView {
  containerEl: HTMLElement    // Set by the factory, managed by app
  onOpen(): Promise<void> | void     // Called when view becomes visible
  onClose(): Promise<void> | void    // Called when view is closed
  getDisplayText(): string            // Tab title
  getIcon?(): string                  // Tab icon (emoji or lucide name)
}
```

**Example usage:**
```javascript
// Plugin registers a view in onload()
this.registerView('claude-chat', (containerEl) => {
  return {
    containerEl,
    onOpen() {
      // Mount React, or use raw DOM:
      containerEl.innerHTML = '<div id="chat-root"></div>'
      // ReactDOM.createRoot(containerEl).render(<ChatPanel />)
    },
    onClose() {
      // Cleanup
      containerEl.innerHTML = ''
    },
    getDisplayText() { return 'Claude AI' },
    getIcon() { return '✦' },
  }
})

// Then open it:
this.app.workspace.openView('claude-chat', { singleton: true })
```

### 1.4 Event-Driven Extension Points

Instead of fixed `addContextMenuItem()` API, the app emits events at key UI locations. Plugins listen and inject:

```typescript
// New events added to BanjuanEventMap:
'ui:context-menu:document': { menu: MenuBuilder; docId: string }
'ui:context-menu:note': { menu: MenuBuilder; noteId: string }
'ui:context-menu:annotation': { menu: MenuBuilder; annotationId: string; docId: string }
'ui:toolbar:pdf': { toolbar: ToolbarBuilder; docId: string }
'ui:toolbar:note': { toolbar: ToolbarBuilder; noteId: string }
'ui:selection:text': { text: string; docId?: string; noteId?: string }

// MenuBuilder — passed in the event, plugins call addItem on it
interface MenuBuilder {
  addItem(item: { label: string; icon?: string; onClick: () => void }): void
  addSeparator(): void
}

// ToolbarBuilder — same pattern for toolbars
interface ToolbarBuilder {
  addAction(action: { icon: string; title: string; onClick: () => void }): void
}
```

**Plugin usage:**
```javascript
this.on('ui:context-menu:document', ({ menu, docId }) => {
  menu.addItem({
    label: 'Ask Claude about this',
    icon: '✦',
    onClick: () => this.askAboutDoc(docId),
  })
})

this.on('ui:selection:text', ({ text, docId }) => {
  // Store for context when user opens chat
  this.lastSelection = { text, docId }
})
```

### 1.5 CSS Injection

If a `styles.css` file exists in the plugin directory, the app auto-loads it into the renderer when the plugin loads, and removes it on unload.

### 1.6 Config Persistence

```typescript
// In plugin:
async onload() {
  this.settings = Object.assign({ apiKey: '', model: 'claude-sonnet-4-20250514' }, await this.loadData())
}

async saveSettings() {
  await this.saveData(this.settings)
}
```

Stored as `.banjuan/plugins/{id}/config.json`.

### 1.7 PluginManager Changes

```typescript
class PluginManager {
  // Existing
  async loadAll(): Promise<void>
  async load(pluginDirName: string): Promise<void>
  async unload(pluginId: string): Promise<void>
  list(): PluginInfo[]
  getCommands(): PluginCommand[]
  async runCommand(commandId: string): Promise<void>

  // NEW
  getViews(): PluginViewInfo[]                    // All registered views across plugins
  createView(viewType: string, containerEl: HTMLElement): PluginView | null
  async handleRpc(pluginId: string, method: string, args: any[]): Promise<any>
  setWebContents(wc: Electron.WebContents): void  // For sendToRenderer
  getPluginCssPath(pluginId: string): string | null  // For styles.css loading
}
```

### 1.8 IPC Layer Additions

```typescript
// New IPC handlers in ipc.ts:
'plugins:getViews'          // → PluginViewInfo[]
'plugins:createView'        // (viewType, containerElId) → view metadata
'plugins:rpc'               // (pluginId, method, args) → result
'plugins:loadData'          // (pluginId) → data
'plugins:saveData'          // (pluginId, data) → void
'plugins:getCssPath'        // (pluginId) → path | null

// Main → Renderer push channel (via webContents.send):
'plugin:message'            // { pluginId, channel, data }
```

### 1.9 Renderer Integration

**PluginViewHost component:**
```tsx
function PluginViewHost({ viewType }: { viewType: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    // Ask main process to create the view with this container
    let cleanup: (() => void) | undefined
    window.electronAPI.plugins.createView(viewType).then(viewMeta => {
      // The main process has the PluginView instance
      // But the DOM container is here in the renderer
      // Communication happens via RPC + message channels
    })
    return () => { cleanup?.() }
  }, [viewType])

  return <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }} />
}
```

**Wait — architectural problem.** Plugins run in main process, but views need to render in the renderer. Obsidian doesn't have this split because everything runs in one process. 

**Solution: Plugin renderer scripts.** 

Each plugin can include a `renderer.js` that runs in the renderer process. The view factory runs in the renderer, not the main process. The main-process plugin handles data/API logic; the renderer script handles UI.

```
Plugin directory:
  manifest.json
  index.js        ← main process: commands, events, RPC handlers, data logic
  renderer.js     ← renderer process: view factories, DOM rendering
  styles.css      ← auto-loaded CSS
  config.json     ← persisted settings (managed by loadData/saveData)
```

**Renderer script contract:**
```javascript
// renderer.js — loaded into renderer process
export function activate(api) {
  // api = PluginRendererApi (subset of BanjuanPlugin focused on UI)
  api.registerView('claude-chat', (containerEl) => ({
    containerEl,
    onOpen() {
      containerEl.innerHTML = `<div class="chat-panel">...</div>`
      // Set up UI, event listeners, etc.
    },
    onClose() {
      containerEl.innerHTML = ''
    },
    getDisplayText() { return 'Claude AI' },
    getIcon() { return '✦' },
  }))
}

export function deactivate() {
  // Cleanup
}
```

**PluginRendererApi:**
```typescript
interface PluginRendererApi {
  pluginId: string
  registerView(type: string, factory: (containerEl: HTMLElement) => PluginView): void
  // Call RPC handler registered in main process index.js
  rpc(method: string, ...args: any[]): Promise<any>
  // Receive messages from main process
  onMessage(channel: string, handler: (data: any) => void): DisposeFn
  // App workspace
  workspace: {
    openView(viewType: string, options?: { singleton?: boolean }): void
    getActiveContext(): Promise<{ type: string; id: string; title: string } | null>
  }
  // i18n
  t(key: string): string
}
```

### 1.10 Loading Sequence

```
1. Main process: PluginManager.load('claude-code')
   → reads manifest.json
   → imports index.js → new PluginClass(id, app)
   → calls plugin.onload() (registers commands, events, RPC handlers)

2. Renderer process: on plugins:loadAll complete
   → for each loaded plugin with renderer.js:
     → dynamically import renderer.js
     → call activate(api) (registers views)
     → inject styles.css if exists

3. User clicks plugin panel in sidebar:
   → TabManager.openPluginView(viewType)
   → creates tab with PluginViewHost component
   → PluginViewHost creates containerEl div
   → calls view factory → view.onOpen()
   → plugin renders UI into containerEl

4. Plugin UI calls api.rpc('chat', { message })
   → IPC to main process → plugin's RPC handler
   → handler uses this.library.* for data access
   → handler calls this.sendToRenderer('chat:chunk', { text })
   → renderer receives via api.onMessage → updates UI
```

### 1.11 Core Changes Summary

| Layer | File | Changes |
|-------|------|---------|
| Core | `plugins/base.ts` | Add `register*`, `addRpcHandler`, `sendToRenderer`, `registerView`, `loadData`/`saveData` |
| Core | `plugins/manager.ts` | Track views, route RPC, manage renderer scripts, CSS paths |
| Core | `types.ts` | Add `PluginView`, `PluginViewInfo`, `PluginRendererApi`, UI event types, `MenuBuilder`, `ToolbarBuilder` |
| App | `main/ipc.ts` | Add `plugins:getViews`, `plugins:rpc`, `plugins:loadData/saveData`, `plugins:getCssPath` |
| App | `preload/index.ts` | Expose new plugin APIs + `onMessage` listener |
| App | `electron.d.ts` | Type declarations |
| App | `renderer/TitleBar.tsx` | Add `'plugin'` to Tab type |
| App | `renderer/TabManager.tsx` | Add `PluginViewHost`, `openPluginView()`, renderer script loading |
| App | `renderer/LibraryView.tsx` | Show plugin views in sidebar |

---

## Part 2: Claude AI Assistant Plugin

### Overview

First-party plugin that validates the UI framework. Provides a chat panel for AI-assisted document understanding.

### Plugin Structure

```
.banjuan/plugins/claude-ai/
├── manifest.json
├── index.js          # Main: Claude API calls, RPC handlers
├── renderer.js       # Renderer: Chat UI (raw DOM, no React dependency)
├── styles.css        # Chat panel styles
└── config.json       # API key, model (auto-managed)
```

### manifest.json

```json
{
  "id": "claude-ai",
  "name": "Claude AI Assistant",
  "version": "1.0.0",
  "description": "AI-powered document understanding — ask questions, summarize, generate notes",
  "apiVersion": "1"
}
```

### Main Process (`index.js`)

```javascript
export default class ClaudeAIPlugin extends BanjuanPlugin {
  settings = { apiKey: '', model: 'claude-sonnet-4-20250514' }

  async onload() {
    this.settings = Object.assign(this.settings, await this.loadData())

    // RPC: chat with streaming
    this.addRpcHandler('chat', async ({ message, context }) => {
      const systemPrompt = await this.buildContext(context)
      await this.streamChat(systemPrompt, message)
    })

    // RPC: list documents for @-mention picker
    this.addRpcHandler('listDocuments', async () => {
      return this.app.documents.list()
    })

    // RPC: list notes for @-mention picker
    this.addRpcHandler('listNotes', async () => {
      return this.app.notes.list({})
    })

    // RPC: get document text for context
    this.addRpcHandler('getDocumentText', async ({ docId }) => {
      return this.app.documents.getText(docId)
    })

    // RPC: create note from AI response
    this.addRpcHandler('createNote', async ({ title, content }) => {
      return this.app.notes.create({ title, content })
    })

    // RPC: get/set settings
    this.addRpcHandler('getSettings', async () => this.settings)
    this.addRpcHandler('saveSettings', async (newSettings) => {
      this.settings = { ...this.settings, ...newSettings }
      await this.saveData(this.settings)
    })

    // Command
    this.addCommand({
      id: 'open-chat',
      name: 'Open Claude AI Chat',
      callback: async () => {
        this.app.workspace.openView('claude-ai:chat', { singleton: true })
      },
    })

    // Context menu: Ask Claude about document
    this.on('ui:context-menu:document', ({ menu, docId }) => {
      menu.addItem({
        label: 'Ask Claude about this',
        icon: '✦',
        onClick: () => this.app.workspace.openView('claude-ai:chat', { singleton: true }),
      })
    })
  }

  private async buildContext(context) {
    const parts = []
    if (context.docId) {
      const doc = await this.app.documents.get(context.docId)
      if (doc) parts.push(`Document: ${doc.title}`)
      const text = await this.app.documents.getText(context.docId)
      if (text) parts.push(`Content (first 3000 chars):\n${text.slice(0, 3000)}`)
      const annotations = await this.app.annotations.forDocument(context.docId)
      if (annotations.length > 0) {
        parts.push(`Annotations:\n${annotations.map(a => `- "${a.text}"`).join('\n')}`)
      }
    }
    if (context.selectedText) {
      parts.push(`Selected text: "${context.selectedText}"`)
    }
    return parts.join('\n\n')
  }

  private async streamChat(systemPrompt, userMessage) {
    // Use fetch to call Anthropic API with streaming
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.settings.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.settings.model,
        max_tokens: 4096,
        system: systemPrompt || 'You are a helpful research assistant.',
        messages: [{ role: 'user', content: userMessage }],
        stream: true,
      }),
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      // Parse SSE events, extract text deltas
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'content_block_delta' && event.delta?.text) {
              fullText += event.delta.text
              this.sendToRenderer('chat:chunk', { text: event.delta.text })
            }
          } catch {}
        }
      }
    }
    this.sendToRenderer('chat:done', { fullText })
  }

  async onunload() {}
}
```

### Renderer (`renderer.js`)

```javascript
export function activate(api) {
  api.registerView('claude-ai:chat', (containerEl) => {
    let messages = []
    let currentStream = ''

    function render() {
      // Build chat UI with raw DOM
      // Messages list + input area + action buttons
    }

    // Listen for streaming chunks
    const unsub1 = api.onMessage('chat:chunk', ({ text }) => {
      currentStream += text
      updateLastMessage(currentStream)
    })

    const unsub2 = api.onMessage('chat:done', ({ fullText }) => {
      messages.push({ role: 'assistant', content: fullText })
      currentStream = ''
      render()
    })

    return {
      containerEl,
      onOpen() { render() },
      onClose() { unsub1(); unsub2(); containerEl.innerHTML = '' },
      getDisplayText() { return 'Claude AI' },
      getIcon() { return '✦' },
    }
  })
}

export function deactivate() {}
```

### Chat Panel Layout

```
┌──────────────────────────────────┐
│ Claude AI                    [⚙] │  ← settings gear
├──────────────────────────────────┤
│ Context: 📄 paper.pdf           │  ← auto-detected from active tab
│                                  │
│  User: Summarize key findings    │
│                                  │
│  Claude: The paper presents...   │
│  1. Finding A                    │
│  2. Finding B                    │
│  [Insert into note] [New note]   │  ← action buttons per response
│                                  │
├──────────────────────────────────┤
│ Ask about your documents...      │
│ [@doc] [@note]            [Send] │
└──────────────────────────────────┘
```

### Features

- **Streaming responses** — tokens appear as they arrive via `sendToRenderer`
- **Auto-context** — reads active tab info via `workspace.getActiveContext()`
- **@-mentions** — `@doc`/`@note` opens picker (calls `listDocuments`/`listNotes` RPC)
- **Action buttons** — "Insert into note" (appends to active note), "New note" (creates via RPC), "Copy"
- **Settings panel** — API key input, model dropdown, accessible via gear icon
- **Markdown rendering** — render AI responses with basic markdown (bold, lists, headers, code)

---

## Implementation Phases

### Phase 1: Plugin UI Framework Core
1. Enhance `BanjuanPlugin` with `register*`, `addRpcHandler`, `sendToRenderer`, `registerView`, `loadData`/`saveData`
2. Update `PluginManager` — view registry, RPC routing, renderer script management, CSS injection
3. Add new types to `types.ts`
4. IPC layer — new handlers for views, RPC, config, CSS
5. Preload — expose new APIs
6. `PluginViewHost` React component in renderer
7. Tab integration — `'plugin'` tab type, `openPluginView()`
8. Renderer script loading — dynamic import of plugin `renderer.js`
9. Sidebar — show plugin panels in LibraryView

### Phase 2: Claude AI Plugin — Chat
1. Plugin skeleton (manifest, index.js, renderer.js, styles.css)
2. Main: RPC handlers (chat, listDocuments, listNotes, settings)
3. Main: Anthropic API streaming
4. Renderer: Chat UI (message list, input, send)
5. Renderer: Markdown rendering for responses
6. Renderer: Settings panel (API key, model)

### Phase 3: Context & Actions
1. Auto-context from active tab
2. @-mention pickers
3. Action buttons (insert, new note, copy)
4. PDF selection event → Ask Claude
5. Context menu integration

## i18n Keys

```
plugin.openPanel: "Open" / "打开"
plugin.panels: "Plugin Views" / "插件视图"
claude.title: "Claude AI" / "Claude AI"
claude.placeholder: "Ask about your documents..." / "向 Claude 提问..."
claude.send: "Send" / "发送"
claude.context: "Context" / "上下文"
claude.insertIntoNote: "Insert into note" / "插入到笔记"
claude.newNote: "New note" / "新建笔记"
claude.copy: "Copy" / "复制"
claude.settings: "Settings" / "设置"
claude.apiKey: "API Key" / "API 密钥"
claude.model: "Model" / "模型"
claude.clearChat: "Clear chat" / "清空对话"
```
