import { ZeroConf, type ZeroConfService } from 'capacitor-zeroconf'
import { parseDiscoveredService, type NearbyShare } from '@banjuan/core'

const SERVICE_TYPE = '_banjuan-sync._tcp.'
const DOMAIN = 'local.'

/**
 * Rank IPv4 addresses so we connect to the real LAN interface, not a proxy's
 * fake-ip (198.18/15) or a self-assigned link-local (169.254/16) address — a
 * host running Clash/Surge advertises all of them and only the private-LAN one
 * is reachable from another device.
 */
function rankIpv4(ip: string): number {
  if (/^169\.254\./.test(ip)) return 3            // link-local, not routable
  if (/^198\.1[89]\./.test(ip)) return 2          // benchmarking range (proxy fake-ip)
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return 0  // private LAN
  return 1                                        // anything else
}

function toShare(s: ZeroConfService): NearbyShare | null {
  const txt = Object.fromEntries(
    Object.entries(s.txtRecord ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  )
  // Reachable-LAN address first, so parseDiscoveredService (takes the first
  // IPv4) doesn't pick a proxy fake-ip or link-local address.
  const rankedIpv4 = [...(s.ipv4Addresses ?? [])].sort((a, b) => rankIpv4(a) - rankIpv4(b))
  let n = parseDiscoveredService({ port: s.port, addresses: rankedIpv4, txt })
  if (!n) {
    // No usable IPv4 — fall back to the .local hostname (iOS resolves it via
    // mDNS) or an IPv6 literal so the host still connects.
    const deviceId = String(txt.deviceid ?? '')
    const host = rankedIpv4[0] || (s.hostname ? s.hostname.replace(/\.$/, '') : '') || (s.ipv6Addresses?.[0] ? `[${s.ipv6Addresses[0]}]` : '')
    if (deviceId && host && s.port) {
      n = {
        deviceId,
        deviceName: String(txt.devicename ?? ''),
        libraryName: String(txt.libraryname ?? ''),
        libraryId: String(txt.libraryid ?? ''),
        url: `http://${host}:${s.port}`,
      }
    }
  }
  return n
}

// A SINGLE, session-long browse. Tearing the watch down and rebuilding it on
// every scan raced: capacitor-zeroconf delivered a `resolved` event to the
// previous scan's already-returned callback, so the current scan saw nothing.
// Instead we watch once and accumulate into this module-level map; each scan
// just waits briefly and reads the current snapshot. `removed` prunes hosts
// that go offline so the list stays fresh.
const discovered = new Map<string, NearbyShare>()
let watchStarted = false

async function ensureWatching(): Promise<void> {
  if (watchStarted) return
  watchStarted = true
  try {
    await ZeroConf.watch({ type: SERVICE_TYPE, domain: DOMAIN }, (result) => {
      const s = result.service
      console.log('[mdns] watch:', result.action, s ? JSON.stringify({
        name: s.name, hostname: s.hostname, port: s.port,
        ipv4: s.ipv4Addresses, ipv6: s.ipv6Addresses, txt: s.txtRecord,
      }) : '(no service)')
      if (!s) return
      if (result.action === 'resolved') {
        const n = toShare(s)
        console.log('[mdns] parsed:', n ? `${n.deviceName} @ ${n.url}` : 'null (dropped)')
        if (n) discovered.set(n.deviceId, n)
      } else if (result.action === 'removed') {
        const id = String((s.txtRecord as Record<string, unknown> | undefined)?.deviceid ?? '')
        if (id) discovered.delete(id)
      }
    })
  } catch (e) {
    watchStarted = false
    console.log('[mdns] watch failed to start:', e instanceof Error ? e.message : String(e))
    throw e
  }
}

/** Browse the LAN for banjuan shares for `timeoutMs`, return a de-duped snapshot. */
export async function scanNearby(timeoutMs = 4000): Promise<NearbyShare[]> {
  await ensureWatching()
  await new Promise((r) => setTimeout(r, timeoutMs))
  return [...discovered.values()]
}
