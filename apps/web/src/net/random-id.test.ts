import { PlayerIdSchema } from '@preguntica/shared';
import { describe, expect, it, vi } from 'vitest';
import { randomUuid, type RandomSource } from './random-id.js';

/** What a page served over plain HTTP (e.g. http://192.168.x.x) has: getRandomValues, no randomUUID. */
const insecureCrypto: RandomSource = { getRandomValues: crypto.getRandomValues.bind(crypto) };

/** Random bytes that are all `byte`, to check the version and variant bits. */
function fixedBytes(byte: number): RandomSource {
  return {
    getRandomValues: (array) => {
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(byte);
      return array;
    },
  };
}

describe('randomUuid: works outside secure contexts (pnpm dev:lan)', () => {
  it('without crypto.randomUUID it still returns a valid v4 UUID', () => {
    const id = randomUuid(insecureCrypto);
    expect(PlayerIdSchema.safeParse(id).success).toBe(true);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('the fallback does not repeat ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => randomUuid(insecureCrypto)));
    expect(ids.size).toBe(1000);
  });

  it('the fallback sets the version and variant bits whatever the random bytes', () => {
    expect(randomUuid(fixedBytes(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(randomUuid(fixedBytes(0x00))).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('uses crypto.randomUUID when the context has it', () => {
    const randomUUID = vi.fn(() => '0b9e4d2a-7c1f-4e3b-8a5d-1c2e3f4a5b6c' as const);
    expect(randomUuid({ ...insecureCrypto, randomUUID })).toBe('0b9e4d2a-7c1f-4e3b-8a5d-1c2e3f4a5b6c');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('defaults to the global crypto', () => {
    expect(PlayerIdSchema.safeParse(randomUuid()).success).toBe(true);
  });
});
