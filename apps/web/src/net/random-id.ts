/** Just the parts of Web Crypto this needs; `randomUUID` is missing outside secure contexts. */
export type RandomSource = Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>>;

/**
 * A v4 UUID. `crypto.randomUUID` only exists in secure contexts (HTTPS or localhost), so a phone that
 * opens http://192.168.x.x (`pnpm dev:lan`) gets one built from `crypto.getRandomValues`, which exists
 * everywhere and is just as random.
 */
export function randomUuid(source: RandomSource = globalThis.crypto): string {
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  // RFC 9562: version 4 in the high nibble of byte 6, variant 10xx in the high bits of byte 8.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
