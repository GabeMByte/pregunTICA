import { MAX_PLAYERS, TOPIC_MAX_LENGTH, TOPIC_MIN_LENGTH } from '@preguntica/shared';
import type { GameErrorCode } from '../game/requests.js';

/**
 * Spanish dictionary: the reference. `Dictionary` is its type, so en.ts fails to compile when a key
 * is missing or extra. Texts with values are functions; the dictionaries test checks both match.
 */
export const es = {
  languageSwitch: {
    label: 'Idioma',
    es: 'ES',
    en: 'EN',
    esName: 'Español',
    enName: 'Inglés',
  },
  home: {
    tagline: 'Trivia en vivo con preguntas creadas por IA sobre el tema que quieras.',
    start: 'Empezar',
    create: 'Crear partida',
    createHint: 'Para quien presenta en la pantalla grande',
    join: 'Unirme',
    joinHint: 'Con el código de la sala, desde tu celular',
  },
  status: {
    connecting: 'Conectando…',
    disconnected: 'Se perdió la conexión',
    error: 'Algo salió mal',
    retry: 'Reintentar',
    home: 'Volver al inicio',
  },
  option: {
    label: (letter: string, text: string) => `Opción ${letter}: ${text}`,
    selected: 'Tu respuesta',
    correct: 'Correcta',
    wrong: 'Incorrecta',
  },
  timer: (seconds: number) => (seconds === 1 ? 'Queda 1 segundo' : `Quedan ${String(seconds)} segundos`),
  ranking: {
    rank: (rank: number) => `Puesto ${String(rank)}`,
  },
  /** Every code, so a known error never shows the server's Spanish text in another language. */
  errors: {
    INVALID_PAYLOAD: 'Los datos enviados no son válidos.',
    ROOM_NOT_FOUND: 'No existe una sala con ese código.',
    PLAYER_NOT_FOUND: 'No formas parte de esta sala.',
    ROOM_FULL: 'La sala está llena.',
    NICKNAME_TAKEN: 'Ese apodo ya está en uso en la sala.',
    NOT_HOST: 'Solo el presentador puede hacer esto.',
    INVALID_PHASE: 'Esa acción no está disponible en este momento.',
    QUESTIONS_NOT_READY: 'Las preguntas todavía se están generando.',
    NO_PLAYERS: 'Se necesita al menos un jugador conectado.',
    RATE_LIMITED: 'Demasiados intentos. Espera un momento y vuelve a probar.',
    TOPIC_REJECTED: 'Ese tema no está permitido. Prueba con otro.',
    KICKED: 'El presentador te sacó de la sala.',
    INTERNAL: 'Ocurrió un error inesperado.',
    SEND_FAILED: 'No se pudo enviar. Recarga la página e intenta de nuevo.',
    NO_RESPONSE: 'El servidor no respondió. Revisa tu conexión e intenta de nuevo.',
  } satisfies Record<GameErrorCode, string>,
  /** Clearer than the generic text where the host has something to do about it. */
  hostErrors: {
    TOPIC_REJECTED: 'Ese tema no se puede usar. Prueba con otro.',
    RATE_LIMITED: 'Creaste demasiadas salas en poco tiempo. Espera unos minutos y vuelve a intentarlo.',
    ROOM_NOT_FOUND: 'Esa sala ya no existe. Crea una nueva para seguir jugando.',
  },
  joinErrors: {
    NICKNAME_TAKEN: 'Ese apodo ya está en uso en esta sala. Prueba con otro.',
    ROOM_NOT_FOUND: 'No encontramos esa sala. Revisa el código.',
    ROOM_FULL: `La sala está llena: ya tiene ${String(MAX_PLAYERS)} jugadores.`,
    RATE_LIMITED: 'Demasiados intentos. Espera un minuto y vuelve a probar.',
    // The only phase that refuses a new player.
    INVALID_PHASE: 'Esta partida ya terminó.',
  },
  hostForm: {
    title: 'Nueva partida',
    lead: 'Crea una sala y elige un tema.',
    topic: 'Tema',
    topicPlaceholder: 'Volcanes de Costa Rica',
    topicError: `Escribe un tema de ${String(TOPIC_MIN_LENGTH)} a ${String(TOPIC_MAX_LENGTH)} caracteres.`,
    questions: 'Preguntas:',
    difficulty: 'Dificultad',
    easy: 'Fácil',
    medium: 'Media',
    hard: 'Difícil',
    questionLanguage: 'Idioma de las preguntas',
    es: 'Español',
    en: 'Inglés',
    create: 'Crear sala',
    creating: 'Creando…',
  },
  host: {
    recovering: 'Recuperando tu sala…',
    progress: (number: number, total: number) => `Pregunta ${String(number)} de ${String(total)}`,
    code: 'Código',
    shortcut: 'Espacio',
    close: 'Cerrar',
    reconnecting: 'Reconectando…',
  },
  lobby: {
    generating: 'Generando las preguntas…',
    waiting: 'Esperando jugadores…',
    howToJoin: 'Cómo unirse',
    room: 'Sala',
    roomCode: 'Código de sala',
    qr: (url: string) => `Código QR para unirse: ${url}`,
    players: (count: number) => `Jugadores: ${String(count)}`,
    scan: 'Escanea el código para entrar.',
    kickHelp: 'Haz clic en un apodo para expulsarlo.',
    kick: (nickname: string) => `Expulsar a ${nickname}`,
    fallback: 'Preguntas de respaldo: la IA no respondió.',
    start: 'Iniciar',
  },
  kick: {
    title: (nickname: string) => `¿Expulsar a ${nickname}?`,
    text: 'Sale de la sala. Si vuelve a entrar, lo hace como jugador nuevo.',
    cancel: 'Cancelar',
    confirm: 'Expulsar',
  },
  hostQuestion: {
    answered: (answered: number, expected: number) =>
      `${String(answered)} de ${String(expected)} ${answered === 1 ? 'respondió' : 'respondieron'}`,
  },
  reveal: {
    votes: (votes: number) => `${String(votes)} ${votes === 1 ? 'voto' : 'votos'}`,
    percent: (percent: number) => `${String(percent)} %`,
    nobody: 'Nadie respondió.',
    next: 'Siguiente',
  },
  leaderboard: {
    title: 'Ranking',
    empty: 'Todavía no hay jugadores en el ranking.',
    podium: 'Ver podio',
    next: 'Siguiente pregunta',
  },
  podium: {
    title: '¡Podio final!',
    empty: 'Esta partida terminó sin jugadores.',
    again: 'Nueva partida',
  },
};

export type Dictionary = typeof es;
