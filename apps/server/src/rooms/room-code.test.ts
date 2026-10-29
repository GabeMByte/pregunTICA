import { describe, expect, it, vi } from 'vitest';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, RoomCodeSchema } from '@preguntica/shared';
import { generateRoomCode } from './room-code.js';

const N = ROOM_CODE_ALPHABET.length;
const LAST_CHAR = ROOM_CODE_ALPHABET.charAt(N - 1);
/** Largest double below 1. */
const ALMOST_ONE = 1 - Number.EPSILON / 2;

/** random() that returns the given values in order (cycling). */
function sequence(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i % values.length];
    i++;
    if (value === undefined) throw new Error('empty sequence');
    return value;
  };
}

/** A value in [0, 1) that maps to ALPHABET[index]. */
function pick(index: number): number {
  return (index + 0.5) / N;
}

/** Deterministic pseudo-random source (Park–Miller LCG) in [0, 1). */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const neverTaken = (): boolean => false;

describe('SPEC §2 código de sala de 6 caracteres: format', () => {
  it(`has ${ROOM_CODE_LENGTH} characters, all from ROOM_CODE_ALPHABET`, () => {
    const code = generateRoomCode(lcg(7), neverTaken);
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
  });

  it('is valid for RoomCodeSchema (and unchanged by its normalization)', () => {
    const random = lcg(123);
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(random, neverTaken);
      expect(RoomCodeSchema.safeParse(code)).toEqual({ success: true, data: code });
    }
  });
});

describe('SPEC §2 código de sala: deterministic from the injected random source', () => {
  it('random() = 0 gives the first alphabet character everywhere', () => {
    expect(generateRoomCode(() => 0, neverTaken)).toBe(ROOM_CODE_ALPHABET.charAt(0).repeat(ROOM_CODE_LENGTH));
  });

  it('random() just below 1 gives the last alphabet character everywhere', () => {
    expect(generateRoomCode(() => ALMOST_ONE, neverTaken)).toBe(LAST_CHAR.repeat(ROOM_CODE_LENGTH));
  });

  it('character i = ALPHABET[floor(r_i * ALPHABET.length)]', () => {
    const indexes = [0, 3, 7, 12, 20, N - 1];
    const expected = indexes.map((i) => ROOM_CODE_ALPHABET.charAt(i)).join('');
    expect(generateRoomCode(sequence(indexes.map(pick)), neverTaken)).toBe(expected);
  });

  it('uses floor: a value exactly at the start of a bucket maps to that bucket', () => {
    // 0.5 * N = 15.5 → index 15; values below 1/N map to index 0.
    expect(generateRoomCode(sequence([0.5, 0.999 / N]), neverTaken)).toBe(
      `${ROOM_CODE_ALPHABET.charAt(Math.floor(0.5 * N))}${ROOM_CODE_ALPHABET.charAt(0)}`.repeat(ROOM_CODE_LENGTH / 2),
    );
  });

  it(`consumes exactly ${ROOM_CODE_LENGTH} random values for one code`, () => {
    const random = vi.fn(() => 0);
    generateRoomCode(random, neverTaken);
    expect(random).toHaveBeenCalledTimes(ROOM_CODE_LENGTH);
  });
});

describe('SPEC §2 código de sala: unique among existing rooms', () => {
  const first = ROOM_CODE_ALPHABET.charAt(0).repeat(ROOM_CODE_LENGTH);
  const second = ROOM_CODE_ALPHABET.charAt(1).repeat(ROOM_CODE_LENGTH);
  const third = ROOM_CODE_ALPHABET.charAt(2).repeat(ROOM_CODE_LENGTH);
  /** Produces `first`, then `second`, then `third`, ... */
  const codesInOrder = () => sequence([...Array<number>(ROOM_CODE_LENGTH).fill(pick(0)), ...Array<number>(ROOM_CODE_LENGTH).fill(pick(1)), ...Array<number>(ROOM_CODE_LENGTH).fill(pick(2))]);

  it('returns the first code when it is free and checks it once', () => {
    const isTaken = vi.fn(neverTaken);
    expect(generateRoomCode(codesInOrder(), isTaken)).toBe(first);
    expect(isTaken).toHaveBeenCalledTimes(1);
    expect(isTaken).toHaveBeenCalledWith(first);
  });

  it('retries when the first code is taken and returns the second', () => {
    const isTaken = vi.fn((code: string) => code === first);
    expect(generateRoomCode(codesInOrder(), isTaken)).toBe(second);
    expect(isTaken.mock.calls).toEqual([[first], [second]]);
  });

  it('succeeds on the last allowed attempt', () => {
    const isTaken = vi.fn((code: string) => code !== third);
    expect(generateRoomCode(codesInOrder(), isTaken, 3)).toBe(third);
    expect(isTaken).toHaveBeenCalledTimes(3);
  });

  it('throws after maxAttempts collisions', () => {
    const isTaken = vi.fn(() => true);
    expect(() => generateRoomCode(lcg(1), isTaken, 3)).toThrow();
    expect(isTaken).toHaveBeenCalledTimes(3);
  });

  it('defaults to 100 attempts', () => {
    const isTaken = vi.fn(() => true);
    expect(() => generateRoomCode(lcg(1), isTaken)).toThrow();
    expect(isTaken).toHaveBeenCalledTimes(100);
  });
});
