import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from '../routes/Home.js';
import { I18nProvider } from './I18nProvider.js';
import { LOCALE_KEY } from './locale.js';

function stubLanguages(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
}

function renderHome() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  document.documentElement.lang = 'es';
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('SPEC §4 Idioma: the ES / EN switch', () => {
  it('starts in Spanish on a Spanish device', () => {
    stubLanguages(['es-CR']);
    renderHome();
    expect(screen.getByRole('link', { name: /Crear partida/ })).toBeDefined();
    expect(screen.getByRole('button', { name: 'ES' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.lang).toBe('es');
  });

  it('starts in English on any other device', () => {
    stubLanguages(['fr-FR']);
    renderHome();
    expect(screen.getByRole('link', { name: /Create a game/ })).toBeDefined();
    expect(document.documentElement.lang).toBe('en');
  });

  it('switching changes the texts, the html lang and is remembered', () => {
    stubLanguages(['es-CR']);
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('link', { name: /Create a game/ })).toBeDefined();
    expect(screen.getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en');
  });

  it('the remembered choice wins over the device language after a reload', () => {
    stubLanguages(['es-CR']);
    localStorage.setItem(LOCALE_KEY, 'en');
    renderHome();
    expect(screen.getByRole('link', { name: /Create a game/ })).toBeDefined();
  });

  it('the switch itself is labelled in the current language', () => {
    stubLanguages(['en-US']);
    renderHome();
    expect(screen.getByRole('group', { name: 'Language' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'ES' }));
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeDefined();
  });
});
