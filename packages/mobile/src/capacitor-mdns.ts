import { ZeroConf } from 'capacitor-zeroconf'
import { parseDiscoveredService, type NearbyShare } from '@banjuan/core'

const SERVICE_TYPE = '_banjuan-sync._tcp.'
const DOMAIN = 'local.'

/** Browse the LAN for banjuan shares for `timeoutMs`, return a de-duped snapshot. */
export async function scanNearby(timeoutMs = 2000): Promise<NearbyShare[]> {
  const found = new Map<string, NearbyShare>()
  await ZeroConf.watch({ type: SERVICE_TYPE, domain: DOMAIN }, (result) => {
    if (result.action !== 'resolved' || !result.service) return
    const s = result.service
    const n = parseDiscoveredService({
      port: s.port,
      addresses: s.ipv4Addresses ?? [],
      txt: Object.fromEntries(
        Object.entries(s.txtRecord ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
      ),
    })
    if (n) found.set(n.deviceId, n)
  })
  await new Promise((r) => setTimeout(r, timeoutMs))
  try {
    await ZeroConf.unwatch({ type: SERVICE_TYPE, domain: DOMAIN })
  } catch {
    /* ignore */
  }
  try {
    await ZeroConf.close()
  } catch {
    /* ignore */
  }
  return [...found.values()]
}
