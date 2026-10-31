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
};

export type Dictionary = typeof es;
