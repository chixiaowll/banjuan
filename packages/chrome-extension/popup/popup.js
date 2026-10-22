import { findApp } from '../lib/connection.js'
import { clipTab, errorText } from '../lib/clip.js'

const t = (key, subs) => chrome.i18n.getMessage(key, subs)
const $ = (id) => document.getElementById(id)

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n)
for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder)
document.documentElement.lang = chrome.i18n.getUILanguage()

let tab = null

async function init() {
  const stored = await chrome.storage.local.get('apiPort')
  if (stored.apiPort) $('port-input').value = stored.apiPort

  const app = await findApp()
  const status = $('status')
  if (!app) {
    status.textContent = t('statusNotRunning')
    status.className = 'status disconnected'
    $('clip-section').style.display = 'none'
    return
  }
  if (!app.libraryOpen) {
    status.textContent = t('statusNoLibrary')
    status.className = 'status disconnected'
    $('clip-section').style.display = 'none'
    return
  }
  status.textContent = t('statusConnected', [app.libraryName || ''])
  status.className = 'status connected'
  $('clip-section').style.display = 'block'
  await loadPageInfo()
}

async function loadPageInfo() {
  ;[tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  $('page-title').textContent = tab.title || t('untitled')
  $('page-url').textContent = tab.url || ''

  let selected = ''
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection()?.toString() || '' })
    selected = (res?.result || '').trim()
  } catch { /* not scriptable; saving will say so */ }

  const radio = $('mode-selection')
  radio.disabled = !selected
  $('mode-selection-label').classList.toggle('disabled', !selected)
  if (selected) {
    radio.checked = true
    $('selected-text').textContent = selected.length > 200 ? selected.slice(0, 200) + '…' : selected
    $('selected-text').style.display = 'block'
  }
}

$('clip-btn').addEventListener('click', async () => {
  if (!tab?.id) return
  const btn = $('clip-btn')
  const result = $('result')
  btn.disabled = true
  btn.textContent = t('saving')
  result.style.display = 'none'
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'article'
  const tags = $('tags-input').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  try {
    const res = await clipTab(tab.id, mode, tags)
    result.className = 'result success'
    result.textContent = t('saved', [res.title || ''])
  } catch (e) {
    result.className = 'result error'
    result.textContent = errorText(e)
  } finally {
    btn.disabled = false
    btn.textContent = t('save')
    result.style.display = 'block'
  }
})

$('save-port').addEventListener('click', async () => {
  const port = parseInt($('port-input').value, 10)
  if (port > 0 && port < 65536) await chrome.storage.local.set({ apiPort: port })
  else await chrome.storage.local.remove('apiPort')
  $('settings-section').style.display = 'none'
  init()
})

$('toggle-settings').addEventListener('click', () => {
  const s = $('settings-section')
  s.style.display = s.style.display === 'none' ? 'block' : 'none'
})

init()
