import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusScreen, type StatusScreenProps } from './StatusScreen.js';
import { InLocale } from '../i18n/InLocale.js';

afterEach(cleanup);

function renderScreen(props: StatusScreenProps) {
  return render(
    <MemoryRouter>
      <StatusScreen {...props} />
    </MemoryRouter>,
  );
}

describe('SPEC §4 Interfaz: StatusScreen', () => {
  it('connecting is announced politely as a status', () => {
    renderScreen({ kind: 'connecting' });
    expect(screen.getByRole('status').textContent).toContain('Conectando');
  });

  it.each([
    ['disconnected', 'Se perdió la conexión'],
    ['error', 'Algo salió mal'],
  ] as const)('%s is an alert with a default title', (kind, title) => {
    renderScreen({ kind });
    expect(screen.getByRole('alert').textContent).toContain(title);
  });

  it('shows a custom title and message', () => {
    renderScreen({ kind: 'error', title: 'Sala no encontrada', message: 'Revisa el código.' });
    expect(screen.getByRole('heading', { name: 'Sala no encontrada' })).toBeDefined();
    expect(screen.getByText('Revisa el código.')).toBeDefined();
  });

  it('retry calls onRetry', () => {
    const onRetry = vi.fn();
    renderScreen({ kind: 'disconnected', onRetry });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('can link back home', () => {
    renderScreen({ kind: 'error', showHome: true });
    expect(screen.getByRole('link', { name: 'Volver al inicio' }).getAttribute('href')).toBe('/');
  });

  it('has no actions unless asked', () => {
    renderScreen({ kind: 'connecting' });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Volver al inicio' })).toBeNull();
  });
});

describe('SPEC §4 Idioma: StatusScreen in English', () => {
  it('default titles and actions are in English', () => {
    render(
      <InLocale locale="en">
        <MemoryRouter>
          <StatusScreen kind="disconnected" onRetry={vi.fn()} showHome />
        </MemoryRouter>
      </InLocale>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Connection lost');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeDefined();
  });
});
