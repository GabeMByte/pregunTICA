import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@preguntica/shared';

/**
 * Random room code from ROOM_CODE_ALPHABET with ROOM_CODE_LENGTH characters.
 * `random` returns a number in [0, 1); codes for which `isTaken` is true are retried.
 * Throws after `maxAttempts` collisions.
 */
export function generateRoomCode(random: () => number, isTaken: (code: string) => boolean, maxAttempts = 100): string {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET.charAt(Math.floor(random() * ROOM_CODE_ALPHABET.length))).join('');
    if (!isTaken(code)) return code;
  }
  throw new Error(`No free room code after ${String(maxAttempts)} attempts`);
}
