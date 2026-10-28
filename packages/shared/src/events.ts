import { z } from 'zod';
import {
  LEADERBOARD_SIZE,
  MAX_PLAYERS,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  OPTIONS_PER_QUESTION,
  PODIUM_SIZE,
  TOPIC_MAX_LENGTH,
  TOPIC_MIN_LENGTH,
} from './constants.js';
import {
  DifficultySchema,
  NicknameSchema,
  OptionIndexSchema,
  OptionsSchema,
  PhaseSchema,
  PlayerIdSchema,
  QuestionSchema,
  RoomCodeSchema,
} from './domain.js';

export const ClientEvents = {
  HostCreate: 'host:create',
  HostStart: 'host:start',
  HostNext: 'host:next',
  PlayerJoin: 'player:join',
  PlayerAnswer: 'player:answer',
} as const;
export type ClientEvent = (typeof ClientEvents)[keyof typeof ClientEvents];

export const ServerEvents = {
  RoomState: 'room:state',
  QuestionStart: 'question:start',
  QuestionReveal: 'question:reveal',
  Leaderboard: 'leaderboard',
  GameEnd: 'game:end',
  Error: 'error',
} as const;
export type ServerEvent = (typeof ServerEvents)[keyof typeof ServerEvents];

// ---------------------------------------------------------------------------
// C→S payloads. Strict: unknown keys are rejected.
// ---------------------------------------------------------------------------

export const HostCreatePayloadSchema = z.strictObject({
  topic: z.string().trim().min(TOPIC_MIN_LENGTH).max(TOPIC_MAX_LENGTH),
  count: z.int().min(MIN_QUESTIONS).max(MAX_QUESTIONS),
  difficulty: DifficultySchema,
});

export const HostStartPayloadSchema = z.strictObject({
  roomCode: RoomCodeSchema,
});

export const HostNextPayloadSchema = z.strictObject({
  roomCode: RoomCodeSchema,
});

export const PlayerJoinPayloadSchema = z.strictObject({
  roomCode: RoomCodeSchema,
  nickname: NicknameSchema,
  playerId: PlayerIdSchema.optional(),
});

export const PlayerAnswerPayloadSchema = z.strictObject({
  roomCode: RoomCodeSchema,
  questionIndex: z.int().min(0).max(MAX_QUESTIONS - 1),
  optionIndex: OptionIndexSchema,
});

/** Lets the socket layer validate any incoming event generically. */
export const clientPayloadSchemas = {
  [ClientEvents.HostCreate]: HostCreatePayloadSchema,
  [ClientEvents.HostStart]: HostStartPayloadSchema,
  [ClientEvents.HostNext]: HostNextPayloadSchema,
  [ClientEvents.PlayerJoin]: PlayerJoinPayloadSchema,
  [ClientEvents.PlayerAnswer]: PlayerAnswerPayloadSchema,
} as const satisfies Record<ClientEvent, z.ZodType>;

export type HostCreatePayload = z.infer<typeof HostCreatePayloadSchema>;
export type HostStartPayload = z.infer<typeof HostStartPayloadSchema>;
export type HostNextPayload = z.infer<typeof HostNextPayloadSchema>;
export type PlayerJoinPayload = z.infer<typeof PlayerJoinPayloadSchema>;
export type PlayerAnswerPayload = z.infer<typeof PlayerAnswerPayloadSchema>;

// ---------------------------------------------------------------------------
// S→C payloads. Strict, so tests catch any accidental leak (e.g. correctIndex).
// ---------------------------------------------------------------------------

const ScoreSchema = z.int().min(0);

/** Public view of a player. Never includes `playerId`: it is the reconnection secret. */
export const PublicPlayerSchema = z.strictObject({
  nickname: NicknameSchema,
  score: ScoreSchema,
  connected: z.boolean(),
});
export type PublicPlayer = z.infer<typeof PublicPlayerSchema>;

export const RoomStatePayloadSchema = z.strictObject({
  roomCode: RoomCodeSchema,
  phase: PhaseSchema,
  topic: z.string(),
  players: z.array(PublicPlayerSchema).max(MAX_PLAYERS),
  /** Index of the current question; null before the first one starts. */
  questionIndex: z.int().min(0).nullable(),
  totalQuestions: z.int().min(MIN_QUESTIONS).max(MAX_QUESTIONS),
});

export const QuestionStartPayloadSchema = z.strictObject({
  index: z.int().min(0),
  total: z.int().min(1),
  prompt: QuestionSchema.shape.prompt,
  options: OptionsSchema,
  /** Epoch milliseconds (server clock) when answers close. */
  endsAt: z.int().positive(),
});

export const AnswerResultSchema = z.strictObject({
  correct: z.boolean(),
  points: ScoreSchema,
  streak: z.int().min(0),
  totalScore: ScoreSchema,
});
export type AnswerResult = z.infer<typeof AnswerResultSchema>;

export const QuestionRevealPayloadSchema = z.strictObject({
  correctIndex: OptionIndexSchema,
  /** Votes per option, same order as `options`. */
  distribution: z.array(z.int().min(0)).length(OPTIONS_PER_QUESTION),
  explanation: QuestionSchema.shape.explanation,
  /** Only present in the copy sent to each player. */
  yourResult: AnswerResultSchema.optional(),
});

export const LeaderboardEntrySchema = z.strictObject({
  nickname: NicknameSchema,
  score: ScoreSchema,
  delta: ScoreSchema,
});

export const LeaderboardPayloadSchema = z.strictObject({
  top: z.array(LeaderboardEntrySchema).max(LEADERBOARD_SIZE),
});

export const PodiumEntrySchema = z.strictObject({
  rank: z.int().min(1).max(PODIUM_SIZE),
  nickname: NicknameSchema,
  score: ScoreSchema,
});

export const GameEndPayloadSchema = z.strictObject({
  podium: z.array(PodiumEntrySchema).max(PODIUM_SIZE),
});

export const ErrorCodeSchema = z.enum([
  'INVALID_PAYLOAD',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'NICKNAME_TAKEN',
  'NOT_HOST',
  'INVALID_PHASE',
  'QUESTIONS_NOT_READY',
  'NO_PLAYERS',
  'RATE_LIMITED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorPayloadSchema = z.strictObject({
  code: ErrorCodeSchema,
  message: z.string(),
});

export const serverPayloadSchemas = {
  [ServerEvents.RoomState]: RoomStatePayloadSchema,
  [ServerEvents.QuestionStart]: QuestionStartPayloadSchema,
  [ServerEvents.QuestionReveal]: QuestionRevealPayloadSchema,
  [ServerEvents.Leaderboard]: LeaderboardPayloadSchema,
  [ServerEvents.GameEnd]: GameEndPayloadSchema,
  [ServerEvents.Error]: ErrorPayloadSchema,
} as const satisfies Record<ServerEvent, z.ZodType>;

export type RoomStatePayload = z.infer<typeof RoomStatePayloadSchema>;
export type QuestionStartPayload = z.infer<typeof QuestionStartPayloadSchema>;
export type QuestionRevealPayload = z.infer<typeof QuestionRevealPayloadSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type LeaderboardPayload = z.infer<typeof LeaderboardPayloadSchema>;
export type PodiumEntry = z.infer<typeof PodiumEntrySchema>;
export type GameEndPayload = z.infer<typeof GameEndPayloadSchema>;
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

// ---------------------------------------------------------------------------
// Typed Socket.io maps. Client payloads use the schema *input* type because the
// server receives raw data and parses it.
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  [ClientEvents.HostCreate]: (payload: z.input<typeof HostCreatePayloadSchema>) => void;
  [ClientEvents.HostStart]: (payload: z.input<typeof HostStartPayloadSchema>) => void;
  [ClientEvents.HostNext]: (payload: z.input<typeof HostNextPayloadSchema>) => void;
  [ClientEvents.PlayerJoin]: (payload: z.input<typeof PlayerJoinPayloadSchema>) => void;
  [ClientEvents.PlayerAnswer]: (payload: z.input<typeof PlayerAnswerPayloadSchema>) => void;
}

export interface ServerToClientEvents {
  [ServerEvents.RoomState]: (payload: RoomStatePayload) => void;
  [ServerEvents.QuestionStart]: (payload: QuestionStartPayload) => void;
  [ServerEvents.QuestionReveal]: (payload: QuestionRevealPayload) => void;
  [ServerEvents.Leaderboard]: (payload: LeaderboardPayload) => void;
  [ServerEvents.GameEnd]: (payload: GameEndPayload) => void;
  [ServerEvents.Error]: (payload: ErrorPayload) => void;
}
