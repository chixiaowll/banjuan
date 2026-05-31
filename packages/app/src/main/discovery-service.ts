import { Bonjour } from 'bonjour-service'

const SERVICE_TYPE = 'banjuan-sync'   // advertises/browses as _banjuan-sync._tcp

export interface NearbyShare {
  deviceId: string
  deviceName: string
  libraryName: string
  libraryId: string
  url: string                          // e.g. "http://192.168.1.20:51234"
}

export interface AdvertiseOptions {
  port: number
  deviceId: string
  deviceName: string
  libraryId: string
  libraryName: string
}

// Shape of the subset of a bonjour Service we read (kept loose for testability).
interface BonjourServiceLike {
  port?: number
  addresses?: string[]
  txt?: Record<string, unknown>
}

const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

/** Map a discovered bonjour service to a NearbyShare, or null if unusable. */
export function parseNearbyService(svc: BonjourServiceLike): NearbyShare | null {
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

/** mDNS advertise (when hosting) + browse (when scanning). Desktop/Node only. */
export class DiscoveryService {
  private bonjour = new Bonjour()
  private published: { stop: (cb?: () => void) => void } | null = null

  advertise(opts: AdvertiseOptions): void {
    this.stopAdvertise()
    this.published = this.bonjour.publish({
      name: `banjuan-${opts.deviceId.slice(0, 8)}`,
      type: SERVICE_TYPE,
      port: opts.port,
      // DNS-SD TXT keys are case-insensitive — publish lowercase, read lowercase.
      txt: {
        deviceid: opts.deviceId,
        devicename: opts.deviceName,
        libraryid: opts.libraryId,
        libraryname: opts.libraryName,
      },
    }) as unknown as { stop: (cb?: () => void) => void }
  }

  stopAdvertise(): void {
    if (this.published) {
      try { this.published.stop() } catch { /* ignore */ }
      this.published = null
    }
  }

  /** Browse for nearby shares for `timeoutMs`, then resolve a de-duped snapshot. */
  scan(timeoutMs = 1500): Promise<NearbyShare[]> {
    return new Promise((resolve) => {
      const found = new Map<string, NearbyShare>()
      const browser = this.bonjour.find({ type: SERVICE_TYPE }, (svc) => {
        const n = parseNearbyService(svc as BonjourServiceLike)
        if (n) found.set(n.deviceId, n)   // one entry per device (a host may advertise on several interfaces)
      })
      setTimeout(() => {
        try { browser.stop() } catch { /* ignore */ }
        resolve([...found.values()])
      }, timeoutMs)
    })
  }

  destroy(): void {
    this.stopAdvertise()
    try { this.bonjour.destroy() } catch { /* ignore */ }
  }
}
