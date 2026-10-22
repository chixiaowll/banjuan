/**
 * Finding the running app. Its local API listens on the first free port of
 * PREFERRED_PORTS (keep in sync with API_PREFERRED_PORTS in
 * packages/app/src/main/api-server.ts), so we probe those — plus a port the
 * user typed in the settings, for setups where all of them were taken.
 */

export const PREFERRED_PORTS = [48720, 48721, 48722, 48723, 48724]

async function probe(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return null
    const data = await res.json()
    // Older app versions don't send `app`; they still have `libraryOpen`.
    if (data?.status !== 'ok' || (data.app !== 'banjuan' && !('libraryOpen' in data))) return null
    return { port, libraryOpen: !!data.libraryOpen, libraryName: data.libraryName || libraryName(data.activeLibrary || data.libraryPath) }
  } catch {
    return null
  }
}

/** The app to send clips to (one with a library open, if several run), or null. */
export async function findApp() {
  const { apiPort } = await chrome.storage.local.get('apiPort')
  const ports = [...new Set([Number(apiPort) || 0, ...PREFERRED_PORTS].filter(Boolean))]
  const found = (await Promise.all(ports.map(probe))).filter(Boolean)
  return found.find((f) => f.libraryOpen) || found[0] || null
}

export async function postClip(port, data) {
  const res = await fetch(`http://127.0.0.1:${port}/api/clip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

/** Last path segment of a library folder (older apps send the path, not the name). */
function libraryName(path) {
  if (!path) return ''
  const parts = String(path).split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}
