export const QUESTION_TIME_MS = 20_000;
/**
 * A player disconnected for less than this still counts as pending when deciding whether everyone
 * answered: a reload, switching apps or a locked phone must not end the question (SPEC §3).
 */
export const DISCONNECT_GRACE_MS = 5_000;
export const OPTIONS_PER_QUESTION = 4;

export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 15;

export const MAX_PLAYERS = 50;
export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 16;

export const LEADERBOARD_SIZE = 5;
export const PODIUM_SIZE = 3;

export const TOPIC_MIN_LENGTH = 2;
export const TOPIC_MAX_LENGTH = 80;

export const PROMPT_MAX_LENGTH = 120;
export const OPTION_MAX_LENGTH = 60;
export const EXPLANATION_MAX_LENGTH = 160;

export const ROOM_CODE_LENGTH = 6;
/** Uppercase letters and digits without look-alikes (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const ROOM_IDLE_TTL_MS = 60 * 60 * 1000;
export const ROOM_CREATION_LIMIT = 5;
export const ROOM_CREATION_WINDOW_MS = 10 * 60 * 1000;
/** Per socket, not per IP: a whole classroom can share one IP behind the school router. */
export const PLAYER_JOIN_LIMIT = 10;
export const PLAYER_JOIN_WINDOW_MS = 60 * 1000;
