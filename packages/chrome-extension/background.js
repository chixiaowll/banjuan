import { clipTab, errorText } from './lib/clip.js'

const t = (key, subs) => chrome.i18n.getMessage(key, subs)

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'clip-selection', title: t('menuClipSelection'), contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'clip-page', title: t('menuClipPage'), contexts: ['page'] })
  })
})

// Right-click clips have no popup, so the toolbar badge tells how it went
// (… saving, ✓ saved, ! failed — the reason is in the button's tooltip).
async function badge(tabId, text, color) {
  try {
    await chrome.action.setBadgeText({ tabId, text })
    if (color) await chrome.action.setBadgeBackgroundColor({ tabId, color })
  } catch { /* the tab may be gone */ }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return
  const tabId = tab.id
  const mode = info.menuItemId === 'clip-selection' ? 'selection' : 'article'
  await badge(tabId, '…', '#888888')
  try {
    const res = await clipTab(tabId, mode)
    await badge(tabId, '✓', '#2e7d32')
    await chrome.action.setTitle({ tabId, title: t('saved', [res.title || '']) })
  } catch (e) {
    console.error('Clip failed:', e)
    await badge(tabId, '!', '#c62828')
    await chrome.action.setTitle({ tabId, title: errorText(e) })
  }
  setTimeout(() => {
    badge(tabId, '')
    chrome.action.setTitle({ tabId, title: t('extName') }).catch(() => {})
  }, 5000)
})
