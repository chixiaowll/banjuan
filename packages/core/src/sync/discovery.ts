// Preferred fixed ports the LAN host tries before falling back to an ephemeral
// one. A stable port lets a client probe known addresses (e.g. 127.0.0.1 on the
// iOS simulator, where mDNS browsing is unreliable) instead of relying solely
// on Bonjour discovery.
export const LAN_PREFERRED_PORTS = [48710, 48711, 48712, 48713, 48714] as const

export interface NearbyShare {
  deviceId: string
  deviceName: string
  libraryName: string
  libraryId: string
  url: string                          // e.g. "http://192.168.1.20:51234"
}

// Minimal shape of a discovered mDNS service (bonjour-service or a Capacitor
// zeroconf plugin both normalize to this).
export interface DiscoveredService {
  port?: number
  addresses?: string[]
  txt?: Record<string, unknown>
}

const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

/** Map a discovered mDNS service to a NearbyShare, or null if unusable. */
export function parseDiscoveredService(svc: DiscoveredService): NearbyShare | null {
  const txt = svc.txt ?? {}
  const deviceId = String(txt.deviceid ?? '')
  if (!deviceId) return null
  const ipv4 = (svc.addresses ?? []).find(a => IPV4.test(a))
  if (!ipv4 || !svc.port) return null
  return {
    deviceId,
    deviceName: String(txt.devicename ?? ''),
    libraryName: String(txt.libraryname ?? ''),
    libraryId: String(txt.libraryid ?? ''),
    url: `http://${ipv4}:${svc.port}`,
  }
}
