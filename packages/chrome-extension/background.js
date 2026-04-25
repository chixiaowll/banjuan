const PORT_URL = 'http://127.0.0.1'

async function getApiPort() {
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

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-selection',
    title: '保存到半卷闲书',
    contexts: ['selection'],
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-selection' && tab?.id) {
    const port = await getApiPort()
    if (!port) return

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CHECK_STATUS') {
    getApiPort().then(port => {
      if (!port) { sendResponse({ connected: false }); return }
      checkStatus(port).then(ok => sendResponse({ connected: ok }))
    })
    return true
  }

  if (message.type === 'SAVE_CLIP') {
    getApiPort().then(port => {
      if (!port) { sendResponse({ error: 'API port not configured' }); return }
      sendClip(port, message.data)
        .then(res => sendResponse(res))
        .catch(e => sendResponse({ error: e.message }))
    })
    return true
  }

  if (message.type === 'SET_PORT') {
    chrome.storage.local.set({ apiPort: message.port })
    sendResponse({ ok: true })
    return true
  }
})
