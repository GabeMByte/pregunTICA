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
};
