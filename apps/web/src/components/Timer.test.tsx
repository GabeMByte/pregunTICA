import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timer } from './Timer.js';
import { InLocale } from '../i18n/InLocale.js';

const START = 1_761_600_000_000;
let clock = START;
const now = () => clock;

beforeEach(() => {
  vi.useFakeTimers();
  clock = START;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function advance(ms: number) {
  clock += ms;
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('SPEC §4 Interfaz: Timer', () => {
  it('shows the whole seconds left until endsAt', () => {
    render(<Timer endsAt={START + 20_000} durationMs={20_000} now={now} />);
    expect(screen.getByRole('timer', { name: 'Quedan 20 segundos' })).toBeDefined();
  });

  it('rounds partial seconds up so 0 only shows when time is over', () => {
    render(<Timer endsAt={START + 400} durationMs={20_000} now={now} />);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Queda 1 segundo');
  });

  it('counts down as the clock moves', () => {
    render(<Timer endsAt={START + 20_000} durationMs={20_000} now={now} />);
    advance(3_000);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Quedan 17 segundos');
  });

  it('turns urgent at 5 seconds or less', () => {
    render(<Timer endsAt={START + 6_000} durationMs={20_000} now={now} />);
    expect(screen.getByRole('timer').dataset.urgent).toBe('false');
    advance(1_000);
    expect(screen.getByRole('timer').dataset.urgent).toBe('true');
  });

  it('never goes below zero', () => {
    render(<Timer endsAt={START + 1_000} durationMs={20_000} now={now} />);
    advance(5_000);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Quedan 0 segundos');
  });

  it('stops ticking when unmounted', () => {
    const { unmount } = render(<Timer endsAt={START + 20_000} durationMs={20_000} now={now} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('SPEC §4 Idioma: Timer in English', () => {
  it('reads the time left in English, with the singular', () => {
    render(
      <InLocale locale="en">
        <Timer endsAt={START + 20_000} durationMs={20_000} now={now} />
      </InLocale>,
    );
    expect(screen.getByRole('timer', { name: '20 seconds left' })).toBeDefined();
    advance(19_000);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('1 second left');
  });
});
