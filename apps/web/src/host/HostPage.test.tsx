import { ServerEvents, type Phase } from '@preguntica/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOST_TOKEN, QUESTION, REVEAL, ROOM_CODE, ROOM_STATE } from '../game/fixtures.js';
import { FakeSocket } from '../net/fake-socket.js';
import { saveHostSession } from '../net/storage.js';
import { HostPage } from './HostPage.js';
import { REQUEST_TIMEOUT_MS } from './useHostGame.js';

const SESSION = { roomCode: ROOM_CODE, hostToken: HOST_TOKEN };
const FAR_FUTURE = Date.now() + 15_000;
let fake: FakeSocket;
const options = { createSocket: () => fake.asGameSocket() };

function renderPage() {
  return render(
    <MemoryRouter>
      <HostPage options={options} />
    </MemoryRouter>,
  );
}

/** A host back in its room, in the given phase. */
function inPhase(phase: Phase, overrides: Partial<typeof ROOM_STATE> = {}) {
  saveHostSession(SESSION);
  renderPage();
  const started = phase !== 'LOBBY' && phase !== 'GENERATING';
  receive(ServerEvents.RoomState, { ...ROOM_STATE, phase, questionIndex: started ? 0 : null, ...overrides });
}

function receive(event: string, payload: unknown) {
  act(() => {
    fake.receive(event, payload);
  });
}

const emitted = (event: string) => fake.emitted.filter((e) => e.event === event);

beforeAll(() => {
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});

beforeEach(() => {
  fake = new FakeSocket();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('form', () => {
  it('sends the chosen topic, count, difficulty and language', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 'Volcanes' } });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Difícil' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Inglés' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    expect(emitted('host:create')).toEqual([
      { event: 'host:create', payload: { topic: 'Volcanes', count: 12, difficulty: 'hard', language: 'en' } },
    ]);
  });

  it('offers 5 to 15 questions', () => {
    renderPage();
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('min')).toBe('5');
    expect(slider.getAttribute('max')).toBe('15');
  });

  it('a topic too short is caught here, without spending an attempt', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    expect(screen.getByRole('alert').textContent).toContain('Escribe un tema');
    expect(emitted('host:create')).toEqual([]);
  });

  it('cannot be sent twice while the room is being created', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 'Volcanes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Creando…' }).disabled).toBe(true);
  });

  it('TOPIC_REJECTED explains it and brings the form back with the topic still there', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 'Tema prohibido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    receive(ServerEvents.HostCreated, SESSION);
    receive(ServerEvents.RoomState, { ...ROOM_STATE, phase: 'GENERATING' });
    expect(screen.queryByLabelText('Tema')).toBeNull();

    receive(ServerEvents.Error, { code: 'TOPIC_REJECTED', message: 'x' });
    expect(screen.getByRole('alert').textContent).toContain('Ese tema no se puede usar');
    expect(screen.getByLabelText<HTMLInputElement>('Tema').value).toBe('Tema prohibido');
  });

  it('RATE_LIMITED explains what to do and lets the host try again', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 'Volcanes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
    receive(ServerEvents.Error, { code: 'RATE_LIMITED', message: 'x' });
    expect(screen.getByRole('alert').textContent).toContain('Espera unos minutos');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Crear sala' }).disabled).toBe(false);
  });
});

describe('lobby', () => {
  it('shows the QR, the code and the URL of the room', () => {
    inPhase('LOBBY');
    const url = `${window.location.origin}/play/${ROOM_CODE}`;
    expect(screen.getByRole('img', { name: `Código QR para unirse: ${url}` })).toBeDefined();
    expect(screen.getByText(ROOM_CODE)).toBeDefined();
    expect(screen.getByText(url.replace(/^https?:\/\//, ''))).toBeDefined();
  });

  it('Iniciar is enabled with a connected player and starts the game', () => {
    inPhase('LOBBY');
    fireEvent.click(screen.getByRole('button', { name: /Iniciar/ }));
    expect(emitted('host:start')).toEqual([{ event: 'host:start', payload: { roomCode: ROOM_CODE } }]);
  });

  it.each([
    ['while the questions generate', 'GENERATING', ROOM_STATE.players, 'Generando las preguntas…'],
    ['without players', 'LOBBY', [], 'Esperando jugadores…'],
  ] as const)('Iniciar is disabled %s', (_case, phase, players, hint) => {
    inPhase(phase, { players: [...players] });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Iniciar/ }).disabled).toBe(true);
    expect(screen.getByText(hint)).toBeDefined();
  });

  it('clicking a nickname asks first and kicks only after confirming', () => {
    inPhase('LOBBY');
    fireEvent.click(screen.getByRole('button', { name: 'Expulsar a Tica' }));
    expect(emitted('host:kick')).toEqual([]);

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Expulsar' }));
    expect(emitted('host:kick')).toEqual([{ event: 'host:kick', payload: { roomCode: ROOM_CODE, nickname: 'Tica' } }]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancelling keeps the player', () => {
    inPhase('LOBBY');
    fireEvent.click(screen.getByRole('button', { name: 'Expulsar a Tica' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(emitted('host:kick')).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('fallback notice', () => {
  const NOTICE = /Preguntas de respaldo/;

  it.each(['GENERATING', 'LOBBY'] as const)('shows in %s', (phase) => {
    inPhase(phase, { questionOrigin: 'fallback' });
    expect(screen.getByText(NOTICE)).toBeDefined();
  });

  it('is not on the projector during the game: players are looking at it', () => {
    inPhase('QUESTION', { questionOrigin: 'fallback' });
    const fallback = (phase: Phase) => ({ ...ROOM_STATE, phase, questionIndex: 0, questionOrigin: 'fallback' });

    receive(ServerEvents.QuestionStart, { ...QUESTION, endsAt: FAR_FUTURE });
    expect(screen.getByRole('heading', { name: QUESTION.prompt })).toBeDefined();
    expect(screen.queryByText(NOTICE)).toBeNull();

    receive(ServerEvents.RoomState, fallback('REVEAL'));
    receive(ServerEvents.QuestionReveal, REVEAL);
    expect(screen.getByRole('button', { name: /Siguiente/ })).toBeDefined();
    expect(screen.queryByText(NOTICE)).toBeNull();

    receive(ServerEvents.RoomState, fallback('LEADERBOARD'));
    receive(ServerEvents.Leaderboard, { top: [{ nickname: 'Tica', score: 900, delta: 900 }] });
    expect(screen.getByRole('heading', { name: 'Ranking' })).toBeDefined();
    expect(screen.queryByText(NOTICE)).toBeNull();

    receive(ServerEvents.RoomState, fallback('PODIUM'));
    receive(ServerEvents.GameEnd, { podium: [{ rank: 1, nickname: 'Tica', score: 900 }] });
    expect(screen.getByRole('heading', { name: '¡Podio final!' })).toBeDefined();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});

describe('question', () => {
  it('shows the prompt, the four options, the timer and who has answered', () => {
    inPhase('QUESTION', { answeredCount: 3, expectedAnswers: 5 });
    receive(ServerEvents.QuestionStart, { ...QUESTION, endsAt: FAR_FUTURE });
    expect(screen.getByRole('heading', { name: QUESTION.prompt })).toBeDefined();
    for (const option of QUESTION.options) expect(screen.getByText(option)).toBeDefined();
    expect(screen.getByRole('timer')).toBeDefined();
    expect(screen.getByText('3 de 5 respondieron')).toBeDefined();
  });

  it('the host does not choose: the options are not buttons', () => {
    inPhase('QUESTION');
    receive(ServerEvents.QuestionStart, { ...QUESTION, endsAt: FAR_FUTURE });
    expect(screen.queryByRole('button', { name: /Opción/ })).toBeNull();
  });

  it('uses the singular for one answer', () => {
    inPhase('QUESTION', { answeredCount: 1, expectedAnswers: 5 });
    receive(ServerEvents.QuestionStart, { ...QUESTION, endsAt: FAR_FUTURE });
    expect(screen.getByText('1 de 5 respondió')).toBeDefined();
  });
});

describe('reveal', () => {
  it('needs only question:reveal, as after a reload, and marks the right answer', () => {
    inPhase('REVEAL');
    receive(ServerEvents.QuestionReveal, REVEAL);
    expect(screen.getByRole('heading', { name: REVEAL.prompt })).toBeDefined();
    expect(screen.getByRole('group', { name: /Irazú \(Correcta\)/ })).toBeDefined();
    expect(screen.getByText(REVEAL.explanation)).toBeDefined();
  });

  it('labels the votes of each option, so the bars do not depend on color', () => {
    inPhase('REVEAL');
    receive(ServerEvents.QuestionReveal, REVEAL);
    expect(screen.getByRole('img', { name: 'Opción A: 3 votos, 60 %' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'Opción B: 1 voto, 20 %' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'Opción C: 0 votos, 0 %' })).toBeDefined();
  });

  it('says so when nobody answered', () => {
    inPhase('REVEAL');
    receive(ServerEvents.QuestionReveal, { ...REVEAL, distribution: [0, 0, 0, 0] });
    expect(screen.getByText('Nadie respondió.')).toBeDefined();
  });

  it('Siguiente sends host:next', () => {
    inPhase('REVEAL');
    receive(ServerEvents.QuestionReveal, REVEAL);
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(emitted('host:next')).toHaveLength(1);
  });
});

describe('leaderboard', () => {
  const TOP = [
    { nickname: 'Ana', score: 1100, delta: 1000 },
    { nickname: 'Beto', score: 800, delta: 0 },
  ];

  it('starts each row from where it was, for the position animation', () => {
    inPhase('LEADERBOARD');
    receive(ServerEvents.Leaderboard, { top: TOP });
    const [first, second] = screen.getAllByRole('listitem');
    expect(first?.style.getPropertyValue('--from')).toBe('1');
    expect(second?.style.getPropertyValue('--from')).toBe('-1');
  });

  it('the button leads to the next question, and to the podium after the last one', () => {
    inPhase('LEADERBOARD');
    receive(ServerEvents.Leaderboard, { top: TOP });
    expect(screen.getByRole('button', { name: /Siguiente pregunta/ })).toBeDefined();

    receive(ServerEvents.RoomState, { ...ROOM_STATE, phase: 'LEADERBOARD', questionIndex: 4 });
    expect(screen.getByRole('button', { name: /Ver podio/ })).toBeDefined();
  });
});

describe('podium', () => {
  it('shows the top 3 and a way to start over, though the session already ended', () => {
    inPhase('PODIUM');
    receive(ServerEvents.GameEnd, {
      podium: [
        { rank: 1, nickname: 'Ana', score: 3000 },
        { rank: 2, nickname: 'Beto', score: 2000 },
        { rank: 3, nickname: 'Cata', score: 1000 },
      ],
    });
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Ana'),
      expect.stringContaining('Beto'),
      expect.stringContaining('Cata'),
    ]);
    expect(screen.getByRole('link', { name: 'Nueva partida' }).getAttribute('href')).toBe('/host');
  });

  it('works with a single player', () => {
    inPhase('PODIUM');
    receive(ServerEvents.GameEnd, { podium: [{ rank: 1, nickname: 'Ana', score: 3000 }] });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});

describe('keyboard shortcut', () => {
  const inReveal = () => {
    inPhase('REVEAL');
    receive(ServerEvents.QuestionReveal, REVEAL);
  };

  it.each([' ', 'Enter'])('%j advances', (key) => {
    inReveal();
    fireEvent.keyDown(document.body, { key });
    expect(emitted('host:next')).toHaveLength(1);
  });

  it('Space starts the game from the lobby', () => {
    inPhase('LOBBY');
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(emitted('host:start')).toHaveLength(1);
  });

  it('other keys do nothing', () => {
    inReveal();
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(emitted('host:next')).toEqual([]);
  });

  it('holding the key down counts once', () => {
    inReveal();
    fireEvent.keyDown(document.body, { key: ' ', repeat: true });
    expect(emitted('host:next')).toEqual([]);
  });

  it('leaves a focused button alone: its own activation would make it two', () => {
    inReveal();
    fireEvent.keyDown(screen.getByRole('button', { name: /Siguiente/ }), { key: ' ' });
    expect(emitted('host:next')).toEqual([]);
  });

  it('does not act behind the kick dialog', () => {
    inPhase('LOBBY');
    fireEvent.click(screen.getByRole('button', { name: 'Expulsar a Tica' }));
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(emitted('host:start')).toEqual([]);
  });

  it('does not act while typing the topic', () => {
    renderPage();
    fireEvent.keyDown(screen.getByLabelText('Tema'), { key: ' ' });
    expect(fake.emitted).toEqual([]);
  });
});

describe('connection', () => {
  it('with a stored session it shows the room is being recovered, not the form', () => {
    saveHostSession(SESSION);
    renderPage();
    expect(screen.getByText('Recuperando tu sala…')).toBeDefined();
    expect(emitted('host:rejoin')).toEqual([{ event: 'host:rejoin', payload: SESSION }]);
  });

  it('a lost connection is announced without taking the game off the screen', () => {
    inPhase('REVEAL');
    receive(ServerEvents.QuestionReveal, REVEAL);
    act(() => {
      fake.disconnect();
    });
    expect(screen.getByText('Reconectando…')).toBeDefined();
    expect(screen.getByRole('heading', { name: REVEAL.prompt })).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Siguiente/ }).disabled).toBe(true);
  });

  it('an error during the game shows as a notice that can be closed', () => {
    inPhase('REVEAL');
    receive(ServerEvents.QuestionReveal, REVEAL);
    receive(ServerEvents.Error, { code: 'INVALID_PHASE', message: 'Esa acción no está disponible.' });
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('HostPage: a failed create is always shown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function create() {
    renderPage();
    fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 'Volcanes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sala' }));
  }

  it('a create the server never answers shows an error and can be tried again', () => {
    vi.useFakeTimers();
    create();
    act(() => {
      vi.advanceTimersByTime(REQUEST_TIMEOUT_MS);
    });
    expect(screen.getByRole('alert').textContent).toContain('El servidor no respondió');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Crear sala' }).disabled).toBe(false);
  });

  it('a create that cannot be sent shows an error instead of doing nothing', () => {
    const emit = fake.emit.bind(fake);
    fake.emit = (event: string, payload?: unknown) => {
      if (event === 'host:create') throw new Error('socket broken');
      return emit(event, payload);
    };
    create();
    expect(screen.getByRole('alert').textContent).toContain('No se pudo enviar');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Crear sala' }).disabled).toBe(false);
  });

  it('host:created in time cancels the timeout', () => {
    vi.useFakeTimers();
    create();
    receive(ServerEvents.HostCreated, SESSION);
    receive(ServerEvents.RoomState, ROOM_STATE);
    act(() => {
      vi.advanceTimersByTime(REQUEST_TIMEOUT_MS * 2);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
