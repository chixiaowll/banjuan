import { Bonjour } from 'bonjour-service'
import { parseDiscoveredService, type NearbyShare } from '@banjuan/core'

const SERVICE_TYPE = 'banjuan-sync'   // advertises/browses as _banjuan-sync._tcp

export type { NearbyShare }

export interface AdvertiseOptions {
  port: number
  deviceId: string
  deviceName: string
  libraryId: string
  libraryName: string
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
        const n = parseDiscoveredService(svc as { port?: number; addresses?: string[]; txt?: Record<string, unknown> })
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
