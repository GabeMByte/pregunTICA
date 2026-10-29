import { z } from 'zod';
import {
  EXPLANATION_MAX_LENGTH,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  OPTION_MAX_LENGTH,
  OPTIONS_PER_QUESTION,
  PROMPT_MAX_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './constants.js';

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const PhaseSchema = z.enum(['GENERATING', 'LOBBY', 'QUESTION', 'REVEAL', 'LEADERBOARD', 'PODIUM']);
export type Phase = z.infer<typeof PhaseSchema>;

const roomCodePattern = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Accepts lowercase and surrounding spaces, normalizes to the canonical code. */
export const RoomCodeSchema = z.string().trim().toUpperCase().regex(roomCodePattern, 'Código de sala inválido');
export type RoomCode = z.infer<typeof RoomCodeSchema>;

const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}]/gu;

/**
 * NFKC, then format characters (zero-width, bidi overrides, BOM) are dropped, control whitespace
 * (tab, newline) becomes a space, other control characters are dropped, and spaces collapse.
 * Homoglyphs across scripts (Cyrillic "А" vs Latin "A") are deliberately not handled.
 */
export function normalizeNickname(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(INVISIBLE_OR_CONTROL, (c) => (/\p{Cc}/u.test(c) && /\s/u.test(c) ? ' ' : ''))
    .replace(/\s+/gu, ' ')
    .trim();
}

export const NicknameSchema = z
  .string()
  .transform(normalizeNickname)
  .pipe(z.string().min(NICKNAME_MIN_LENGTH).max(NICKNAME_MAX_LENGTH));

export const PlayerIdSchema = z.uuid();

export const OptionIndexSchema = z.int().min(0).max(OPTIONS_PER_QUESTION - 1);

export const OptionTextSchema = z.string().trim().min(1).max(OPTION_MAX_LENGTH);

export const OptionsSchema = z
  .array(OptionTextSchema)
  .length(OPTIONS_PER_QUESTION)
  .refine((options) => new Set(options.map((o) => o.toLowerCase())).size === options.length, {
    message: 'Las opciones deben ser únicas',
  });

/**
 * Full question, including the answer. Server-only: never send it to a client.
 * Clients get `question:start` (no answer) and later `question:reveal`.
 */
export const QuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(PROMPT_MAX_LENGTH),
  options: OptionsSchema,
  correctIndex: OptionIndexSchema,
  explanation: z.string().trim().min(1).max(EXPLANATION_MAX_LENGTH),
});
export type Question = z.infer<typeof QuestionSchema>;
