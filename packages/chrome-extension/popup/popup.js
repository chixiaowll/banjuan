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
      resultEl.textContent = '失败：' + response.error
    } else {
      resultEl.className = 'result success'
      resultEl.textContent = '✓ 已保存：' + (response?.title || '成功')
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
