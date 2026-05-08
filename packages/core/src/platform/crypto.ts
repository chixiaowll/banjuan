export interface PlatformCrypto {
  sha256(data: Uint8Array): Promise<string>
}
