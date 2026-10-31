import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.js';
import { LOCALE_KEY } from './i18n/locale.js';

// jsdom reports an English device; these tests read the Spanish texts.
beforeEach(() => {
  localStorage.setItem(LOCALE_KEY, 'es');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('SPEC §4 Interfaz: routes', () => {
  it('/ shows the two ways in: create a game or join one', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: /Crear partida/ }).getAttribute('href')).toBe('/host');
    expect(screen.getByRole('link', { name: /Unirme/ }).getAttribute('href')).toBe('/play');
  });

  it('/host shows the host view', () => {
    renderAt('/host');
    expect(screen.getByText('Crea una sala y elige un tema.')).toBeDefined();
  });

  it('/play without a code asks for one', () => {
    renderAt('/play');
    expect(screen.getByText('Ingresa el código de la sala para unirte.')).toBeDefined();
  });

  it('/play/:code (the QR link) shows the code already filled in, normalized', () => {
    renderAt('/play/abc234');
    expect(screen.getByLabelText<HTMLInputElement>('Código de sala').value).toBe('ABC234');
  });

  it('/play/:code with an invalid code ignores it', () => {
    renderAt('/play/no-valido');
    expect(screen.getByText('Ingresa el código de la sala para unirte.')).toBeDefined();
  });

  it('an unknown route goes back home', () => {
    renderAt('/nada');
    expect(screen.getByRole('link', { name: /Crear partida/ })).toBeDefined();
  });
});

describe('SPEC §4 Idioma: the whole app follows the interface language', () => {
  it('an English device gets the English home', () => {
    localStorage.clear();
    renderAt('/');
    expect(screen.getByRole('link', { name: /Create a game/ }).getAttribute('href')).toBe('/host');
    expect(screen.getByRole('link', { name: /Join/ }).getAttribute('href')).toBe('/play');
  });
});
