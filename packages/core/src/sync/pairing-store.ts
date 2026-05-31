import type { PlatformFS } from '../platform/index.js'
import { join } from '../platform/path.js'

export interface PairedDevice {
  peerDeviceId: string
  peerDeviceName: string
  peerLibraryId: string
  token: string         // shared durable secret used for Basic auth in both directions
  linkedAt: string      // ISO timestamp
}

// Input to addOrUpdate — linkedAt is stamped by the store.
export type PairingInput = Omit<PairedDevice, 'linkedAt'>

/** Per-library, device-local store of linked peer devices (never synced). */
export class PairingStore {
  private readonly path: string
  constructor(rootPath: string, private fs: PlatformFS) {
    this.path = join(rootPath, '.banjuan', 'paired-devices.json')
  }

  async list(): Promise<PairedDevice[]> {
    if (!(await this.fs.exists(this.path))) return []
    try {
      const data = JSON.parse(await this.fs.readTextFile(this.path))
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  async findByDeviceId(peerDeviceId: string): Promise<PairedDevice | undefined> {
    return (await this.list()).find(d => d.peerDeviceId === peerDeviceId)
  }

  async hasToken(token: string): Promise<boolean> {
    if (!token) return false
    return (await this.list()).some(d => d.token === token)
  }

  /** Add a pairing, or replace the existing one for the same peerDeviceId. */
  async addOrUpdate(input: PairingInput): Promise<void> {
    const list = (await this.list()).filter(d => d.peerDeviceId !== input.peerDeviceId)
    list.push({ ...input, linkedAt: new Date().toISOString() })
    await this.fs.writeTextFile(this.path, JSON.stringify(list, null, 2))
  }

  async removeByDeviceId(peerDeviceId: string): Promise<void> {
    const list = (await this.list()).filter(d => d.peerDeviceId !== peerDeviceId)
    await this.fs.writeTextFile(this.path, JSON.stringify(list, null, 2))
  }
}
