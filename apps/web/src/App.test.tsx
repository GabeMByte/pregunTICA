import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App.js';

afterEach(cleanup);

describe('App', () => {
  it('shows the host view under /host', () => {
    render(<App pathname="/host" />);
    expect(screen.getByText('Crea una sala y elige un tema.')).toBeDefined();
  });

  it('shows the player view everywhere else', () => {
    render(<App pathname="/" />);
    expect(screen.getByText('Ingresa el código de la sala para unirte.')).toBeDefined();
  });
});
