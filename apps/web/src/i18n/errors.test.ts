import { describe, expect, it } from 'vitest';
import type { GameError, GameErrorCode } from '../game/requests.js';
import { en } from './en.js';
import { errorText } from './errors.js';
import { es } from './es.js';

const fromServer = (code: GameErrorCode): GameError => ({ code, message: 'texto del servidor' });

describe('errorText', () => {
  it('translates a known code by the dictionary, never with the server text', () => {
    expect(errorText(es, fromServer('ROOM_FULL'))).toBe(es.errors.ROOM_FULL);
    expect(errorText(en, fromServer('ROOM_FULL'))).toBe('The room is full.');
  });

  it('translates the failures only the client sees', () => {
    expect(errorText(es, fromServer('SEND_FAILED'))).toContain('No se pudo enviar');
    expect(errorText(en, fromServer('NO_RESPONSE'))).toContain('The server did not answer');
  });

  it('a context can override the generic text', () => {
    expect(errorText(en, fromServer('RATE_LIMITED'), en.hostErrors)).toBe(en.hostErrors.RATE_LIMITED);
    expect(errorText(en, fromServer('INTERNAL'), en.hostErrors)).toBe(en.errors.INTERNAL);
  });

  it.each([
    ['NICKNAME_TAKEN', 'Ese apodo ya está en uso en esta sala. Prueba con otro.'],
    ['ROOM_NOT_FOUND', 'No encontramos esa sala. Revisa el código.'],
    ['ROOM_FULL', 'La sala está llena: ya tiene 50 jugadores.'],
    ['RATE_LIMITED', 'Demasiados intentos. Espera un minuto y vuelve a probar.'],
    ['INVALID_PHASE', 'Esta partida ya terminó.'],
  ] as const)('joining, %s has a clear message', (code, message) => {
    expect(errorText(es, fromServer(code), es.joinErrors)).toBe(message);
  });

  it('an unknown code falls back to the server message', () => {
    const unknown = { code: 'SOMETHING_NEW', message: 'texto del servidor' } as unknown as GameError;
    expect(errorText(en, unknown)).toBe('texto del servidor');
  });
});
