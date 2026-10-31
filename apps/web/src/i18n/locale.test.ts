import { afterEach, describe, expect, it } from 'vitest';
import { detectLocale, initialLocale, LOCALE_KEY, readLocale, saveLocale } from './locale.js';

const blocked = (): Storage => {
  throw new DOMException('Blocked', 'SecurityError');
};

afterEach(() => {
  localStorage.clear();
});

describe('SPEC §4 Idioma: detection from navigator.languages', () => {
  it.each([
    [['es-CR', 'en-US'], 'es'],
    [['es'], 'es'],
    [['ES-MX'], 'es'],
    [['en-US', 'es-CR'], 'es'],
    [['en-US'], 'en'],
    [['fr-FR', 'pt-BR'], 'en'],
    [[], 'en'],
  ] as const)('%j → %s', (languages, expected) => {
    expect(detectLocale(languages)).toBe(expected);
  });

  it('does not take a language that only contains "es" for Spanish', () => {
    expect(detectLocale(['et-EE', 'en'])).toBe('en');
  });
});

describe('SPEC §4 Idioma: the choice is kept per device', () => {
  it('saves and reads back the chosen language', () => {
    saveLocale('en');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en');
    expect(readLocale()).toBe('en');
  });

  it('nothing saved → null', () => {
    expect(readLocale()).toBeNull();
  });

  it('an unknown value is no choice', () => {
    localStorage.setItem(LOCALE_KEY, 'fr');
    expect(readLocale()).toBeNull();
  });

  it('blocked storage never throws', () => {
    expect(readLocale(blocked)).toBeNull();
    expect(() => {
      saveLocale('es', blocked);
    }).not.toThrow();
  });

  it('a saved choice wins over the detection', () => {
    saveLocale('en');
    expect(initialLocale(['es-CR'])).toBe('en');
    saveLocale('es');
    expect(initialLocale(['en-US'])).toBe('es');
  });

  it('without a saved choice the detection decides', () => {
    expect(initialLocale(['es-CR'])).toBe('es');
    expect(initialLocale(['en-GB'])).toBe('en');
  });

  it('with storage blocked the detection still works', () => {
    expect(initialLocale(['es-CR'], blocked)).toBe('es');
  });
});
