import type { ErrorCode, ErrorPayload } from '@preguntica/shared';

/** Clearer than the generic server text where the host has something to do about it. */
const MESSAGES: Partial<Record<ErrorCode, string>> = {
  TOPIC_REJECTED: 'Ese tema no se puede usar. Prueba con otro.',
  RATE_LIMITED: 'Creaste demasiadas salas en poco tiempo. Espera unos minutos y vuelve a intentarlo.',
  ROOM_NOT_FOUND: 'Esa sala ya no existe. Crea una nueva para seguir jugando.',
};

export function errorMessage({ code, message }: ErrorPayload): string {
  return MESSAGES[code] ?? message;
}
