import type { QuestionRevealPayload, QuestionStartPayload, RoomStatePayload } from '@preguntica/shared';

/** Valid server payloads for the view tests. */
export const ROOM_CODE = 'ABC234';
export const HOST_TOKEN = '6f1c8f5e-3b7a-4c2e-9d1f-2a4b6c8d0e1f';
export const PLAYER_ID = '0b9e4d2a-7c1f-4e3b-8a5d-1c2e3f4a5b6c';
export const OTHER_PLAYER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

export const ROOM_STATE: RoomStatePayload = {
  roomCode: ROOM_CODE,
  phase: 'LOBBY',
  topic: 'Volcanes de Costa Rica',
  players: [{ nickname: 'Tica', score: 0, connected: true }],
  questionIndex: null,
  totalQuestions: 5,
};

export const QUESTION: QuestionStartPayload = {
  index: 0,
  total: 5,
  prompt: '¿Cuál es el volcán más alto de Costa Rica?',
  options: ['Irazú', 'Poás', 'Arenal', 'Turrialba'],
  endsAt: 1_761_600_020_000,
};

export const REVEAL: QuestionRevealPayload = {
  correctIndex: 0,
  distribution: [3, 1, 0, 1],
  explanation: 'El Irazú mide 3432 m.',
};
