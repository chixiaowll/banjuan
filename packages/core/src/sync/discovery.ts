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
