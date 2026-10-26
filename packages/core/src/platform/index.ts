import type { PlatformFS } from './fs.js'
import type { DatabaseFactory } from './database.js'
import type { PlatformCrypto } from './crypto.js'

export type { PlatformFS } from './fs.js'
export type { PlatformDatabase, DatabaseFactory } from './database.js'
export type { PlatformCrypto } from './crypto.js'
export * from './path.js'

export interface PlatformDeps {
  fs: PlatformFS
  dbFactory: DatabaseFactory
  crypto: PlatformCrypto
  /**
   * Optional global plugins directory (e.g. ~/.banjuan/plugins), shared across
   * all libraries — the install location for built-in/global plugins. Loaded in
   * addition to each library's local .banjuan/plugins.
   */
  globalPluginsDir?: string
  /**
   * Optional OS-backed secret storage (desktop: the system keychain through
   * Electron safeStorage). When present, the WebDAV password in the library's
   * device-local sync.json is stored sealed instead of in plain text.
   */
  secrets?: SecretBox
}

export interface SecretBox {
  /** Opaque text that only this user on this machine can open. Throws when unavailable. */
  seal(plain: string): string
  /** Throws when it can't (sealed elsewhere, keychain unavailable). */
  open(sealed: string): string
}
