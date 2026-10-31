import type { Dictionary } from './es.js';

/** English dictionary. Typed with the Spanish one: a missing or extra key does not compile. */
export const en: Dictionary = {
  languageSwitch: {
    label: 'Language',
    es: 'ES',
    en: 'EN',
    esName: 'Spanish',
    enName: 'English',
  },
  home: {
    tagline: 'Live trivia with AI-made questions about any topic you like.',
    start: 'Get started',
    create: 'Create a game',
    createHint: 'For whoever presents on the big screen',
    join: 'Join',
    joinHint: 'With the room code, from your phone',
  },
  status: {
    connecting: 'Connecting…',
    disconnected: 'Connection lost',
    error: 'Something went wrong',
    retry: 'Try again',
    home: 'Back to home',
  },
  option: {
    label: (letter: string, text: string) => `Option ${letter}: ${text}`,
    selected: 'Your answer',
    correct: 'Correct',
    wrong: 'Wrong',
  },
  timer: (seconds: number) => (seconds === 1 ? '1 second left' : `${String(seconds)} seconds left`),
  ranking: {
    rank: (rank: number) => `Place ${String(rank)}`,
  },
};
