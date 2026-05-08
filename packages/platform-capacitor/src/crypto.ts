import type { PlatformCrypto } from '@banjuan/core'

export class WebCrypto implements PlatformCrypto {
  async sha256(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>)
    const bytes = new Uint8Array(hash)
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  }
}
