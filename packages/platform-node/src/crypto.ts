import { createHash } from 'node:crypto'
import type { PlatformCrypto } from '@banjuan/core'

export class NodeCrypto implements PlatformCrypto {
  async sha256(data: Uint8Array): Promise<string> {
    return createHash('sha256').update(data).digest('hex')
  }
}
