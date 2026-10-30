import { HostTokenSchema, NicknameSchema, PlayerIdSchema, RoomCodeSchema } from '@preguntica/shared';
import { z } from 'zod';

/** What the host needs to take back their room after a reload (SPEC §4 Interfaz). */
export const HostSessionSchema = z.strictObject({ roomCode: RoomCodeSchema, hostToken: HostTokenSchema });
export type HostSession = z.infer<typeof HostSessionSchema>;

/** What a player needs to rejoin as themselves after a reload. */
export const PlayerSessionSchema = z.strictObject({
  roomCode: RoomCodeSchema,
  playerId: PlayerIdSchema,
  nickname: NicknameSchema,
});
export type PlayerSession = z.infer<typeof PlayerSessionSchema>;

export const HOST_KEY = 'preguntica:host';
export const PLAYER_KEY = 'preguntica:player';

type GetStorage = () => Storage;
const browserStorage: GetStorage = () => window.localStorage;

// localStorage can throw (private mode, blocked site data) and its content is external input:
// every access is wrapped and every read is parsed, so a broken session just means "no session".
function read<T>(key: string, schema: z.ZodType<T>, getStorage: GetStorage): T | null {
  try {
    const raw = getStorage().getItem(key);
    if (raw === null) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown, getStorage: GetStorage): void {
  try {
    getStorage().setItem(key, JSON.stringify(value));
  } catch {
    // Without storage the game still works; only reconnection after a reload is lost.
  }
}

function remove(key: string, getStorage: GetStorage): void {
  try {
    getStorage().removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export function readHostSession(getStorage = browserStorage): HostSession | null {
  return read(HOST_KEY, HostSessionSchema, getStorage);
}

export function saveHostSession(session: HostSession, getStorage = browserStorage): void {
  write(HOST_KEY, session, getStorage);
}

export function clearHostSession(getStorage = browserStorage): void {
  remove(HOST_KEY, getStorage);
}

export function readPlayerSession(getStorage = browserStorage): PlayerSession | null {
  return read(PLAYER_KEY, PlayerSessionSchema, getStorage);
}

export function savePlayerSession(session: PlayerSession, getStorage = browserStorage): void {
  write(PLAYER_KEY, session, getStorage);
}

export function clearPlayerSession(getStorage = browserStorage): void {
  remove(PLAYER_KEY, getStorage);
}
