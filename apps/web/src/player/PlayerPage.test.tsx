import { PlayerIdSchema, ServerEvents, type ErrorCode } from '@preguntica/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_ID, QUESTION, REVEAL, ROOM_CODE, ROOM_STATE } from '../game/fixtures.js';
import { FakeSocket } from '../net/fake-socket.js';
import { PLAYER_KEY, savePlayerSession } from '../net/storage.js';
import { PlayerPage } from './PlayerPage.js';
import { REQUEST_TIMEOUT_MS } from './usePlayerGame.js';

const SESSION = { roomCode: ROOM_CODE, playerId: PLAYER_ID, nickname: 'Tica' };
let fake: FakeSocket;
const createSocket = () => fake.asGameSocket();

function renderAt(path = `/play/${ROOM_CODE}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/play/:code?" element={<PlayerPage createSocket={createSocket} />} />
      </Routes>
    </MemoryRouter>,
  );
}

function receive(event: string, payload?: unknown) {
  act(() => {
    fake.receive(event, payload);
  });
}

const codeInput = () => screen.getByLabelText<HTMLInputElement>('Código de sala');
const nicknameInput = () => screen.getByLabelText<HTMLInputElement>('Tu apodo');
const joinEmits = () => fake.emitted.filter((e) => e.event === 'player:join');

function submit(nickname = 'Tica') {
  fireEvent.change(nicknameInput(), { target: { value: nickname } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

function joinedLobby(waitingForNextQuestion = false) {
  renderAt();
  submit();
  receive(ServerEvents.PlayerJoined, { playerId: PLAYER_ID, nickname: 'Tica', waitingForNextQuestion });
  receive(ServerEvents.RoomState, ROOM_STATE);
}

beforeEach(() => {
  fake = new FakeSocket();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('join', () => {
  it('prefills the code from /play/:code, normalized', () => {
    renderAt('/play/abc234');
    expect(codeInput().value).toBe('ABC234');
  });

  it('/play with an invalid code leaves the field empty', () => {
    renderAt('/play/no-valido');
    expect(codeInput().value).toBe('');
    expect(screen.getByText('Ingresa el código de la sala para unirte.')).toBeDefined();
  });

  it('typing a code uppercases it', () => {
    renderAt('/play');
    fireEvent.change(codeInput(), { target: { value: 'abc234' } });
    expect(codeInput().value).toBe('ABC234');
  });

  it('sends the join with the normalized nickname', () => {
    renderAt();
    submit('  Tica  ');
    expect(joinEmits()).toHaveLength(1);
    expect(joinEmits()[0]?.payload).toMatchObject({ roomCode: ROOM_CODE, nickname: 'Tica' });
  });

  it('does not send a code or nickname that cannot be valid', () => {
    renderAt('/play');
    submit('   ');
    expect(joinEmits()).toHaveLength(0);
    expect(screen.getByText('El código tiene 6 letras y números.')).toBeDefined();
    expect(screen.getByText('Escribe un apodo de hasta 16 caracteres.')).toBeDefined();
  });

  it('a second submit waits for the server', () => {
    renderAt();
    submit();
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Entrando…' });
    expect(button.disabled).toBe(true);
  });

  it.each<[ErrorCode, string]>([
    ['NICKNAME_TAKEN', 'Ese apodo ya está en uso en esta sala. Prueba con otro.'],
    ['ROOM_NOT_FOUND', 'No encontramos esa sala. Revisa el código.'],
    ['ROOM_FULL', 'La sala está llena: ya tiene 50 jugadores.'],
    ['RATE_LIMITED', 'Demasiados intentos. Espera un minuto y vuelve a probar.'],
  ])('%s explains what happened and keeps the form usable', (code, message) => {
    renderAt();
    submit();
    receive(ServerEvents.Error, { code, message: 'servidor' });
    expect(screen.getByRole('alert').textContent).toBe(message);
    expect(nicknameInput().value).toBe('Tica');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Entrar' }).disabled).toBe(false);
  });

  it('editing a field clears the error', () => {
    renderAt();
    submit();
    receive(ServerEvents.Error, { code: 'NICKNAME_TAKEN', message: 'x' });
    fireEvent.change(nicknameInput(), { target: { value: 'Tica2' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('KICKED gets its own screen, whatever the phase', () => {
    savePlayerSession(SESSION);
    renderAt();
    receive(ServerEvents.RoomState, ROOM_STATE);
    receive(ServerEvents.Error, { code: 'KICKED', message: 'El presentador te sacó de la sala.' });
    expect(screen.getByRole('heading', { name: 'Te sacaron de la sala' })).toBeDefined();
    expect(screen.getByText('Ya no participas en esta partida.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toBeDefined();
    expect(localStorage.getItem(PLAYER_KEY)).toBeNull();
  });
});

describe('lobby', () => {
  it('says you are in, with your nickname', () => {
    joinedLobby();
    expect(screen.getByRole('heading', { name: 'Estás dentro' })).toBeDefined();
    expect(screen.getByText('Tica')).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe('Espera a que empiece la partida');
  });

  it('a late joiner waits for the next question', () => {
    joinedLobby(true);
    receive(ServerEvents.RoomState, { ...ROOM_STATE, phase: 'QUESTION', questionIndex: 1 });
    expect(screen.getByRole('heading', { name: 'Estás dentro' })).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe('Espera a la siguiente pregunta');
  });
});

describe('question', () => {
  function inQuestion(index = 0) {
    savePlayerSession(SESSION);
    renderAt();
    receive(ServerEvents.PlayerJoined, { playerId: PLAYER_ID, nickname: 'Tica', waitingForNextQuestion: false });
    showQuestion(index);
  }

  function showQuestion(index: number) {
    receive(ServerEvents.RoomState, { ...ROOM_STATE, phase: 'QUESTION', questionIndex: index });
    receive(ServerEvents.QuestionStart, { ...QUESTION, index, endsAt: Date.now() + 15_000 });
  }

  const optionButtons = () => screen.getAllByRole<HTMLButtonElement>('button');
  const option = (letter: string) => screen.getByRole<HTMLButtonElement>('button', { name: new RegExp(`^Opción ${letter}:`) });
  const answers = () => fake.emitted.filter((e) => e.event === 'player:answer');

  it('shows four options with letter and text, and the timer', () => {
    inQuestion();
    expect(screen.getByRole('heading', { name: QUESTION.prompt })).toBeDefined();
    expect(optionButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Opción A: Irazú',
      'Opción B: Poás',
      'Opción C: Arenal',
      'Opción D: Turrialba',
    ]);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Quedan 15 segundos');
    expect(screen.getByText('Pregunta 1 de 5')).toBeDefined();
  });

  it('one tap sends once, locks the options and confirms', () => {
    inQuestion();
    fireEvent.click(option('B'));
    fireEvent.click(option('B'));
    fireEvent.click(option('A'));
    expect(answers()).toEqual([{ event: 'player:answer', payload: { roomCode: ROOM_CODE, questionIndex: 0, optionIndex: 1 } }]);
    expect(screen.getByRole('status').textContent).toBe('Respuesta enviada');
    expect(optionButtons().every((b) => b.disabled)).toBe(true);
    expect(option('B').getAttribute('aria-pressed')).toBe('true');
  });

  it('the next question starts clean, with a fresh timer', () => {
    inQuestion();
    fireEvent.click(option('A'));
    const oldTimer = screen.getByRole('timer');
    showQuestion(1);
    expect(screen.getByRole('status').textContent).toBe('Elige una respuesta');
    expect(optionButtons().every((b) => !b.disabled)).toBe(true);
    expect(screen.getByRole('timer')).not.toBe(oldTimer);
  });

  it('a reconnection in the same question keeps the answer', () => {
    inQuestion();
    fireEvent.click(option('C'));
    showQuestion(0);
    expect(screen.getByRole('status').textContent).toBe('Respuesta enviada');
    expect(answers()).toHaveLength(1);
  });

  it('a late joiner never sees the question in progress', () => {
    joinedLobby(true);
    receive(ServerEvents.RoomState, { ...ROOM_STATE, phase: 'QUESTION', questionIndex: 0 });
    expect(screen.queryByRole('timer')).toBeNull();
  });
});

describe('results', () => {
  /** Twelve players with Tica last: outside both the top 5 and the podium. */
  const players = [
    ...Array.from({ length: 11 }, (_, i) => ({ nickname: `P${String(i)}`, score: 1000 - i, connected: true })),
    { nickname: 'Tica', score: 10, connected: true },
  ];

  function inRoom(phase: string, roomPlayers = players) {
    savePlayerSession(SESSION);
    renderAt();
    receive(ServerEvents.PlayerJoined, { playerId: PLAYER_ID, nickname: 'Tica', waitingForNextQuestion: false });
    receive(ServerEvents.RoomState, { ...ROOM_STATE, phase, questionIndex: 0, players: roomPlayers });
  }

  it('a right answer shows points, streak and position', () => {
    inRoom('REVEAL');
    receive(ServerEvents.QuestionReveal, { ...REVEAL, yourResult: { correct: true, points: 950, streak: 3, totalScore: 1900 } });
    expect(screen.getByRole('heading', { name: '¡Correcto!' })).toBeDefined();
    expect(screen.getByText('+950')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText(/Vas en el puesto/).textContent).toBe('Vas en el puesto 12 de 12');
  });

  it('a wrong answer says so, with no points', () => {
    inRoom('REVEAL');
    receive(ServerEvents.QuestionReveal, { ...REVEAL, yourResult: { correct: false, points: 0, streak: 0, totalScore: 0 } });
    expect(screen.getByRole('heading', { name: 'Incorrecto' })).toBeDefined();
    expect(screen.getByText('+0')).toBeDefined();
  });

  it('never invents a result the server did not send', () => {
    inRoom('REVEAL');
    receive(ServerEvents.QuestionReveal, REVEAL);
    expect(screen.getByRole('heading', { name: 'Mira la pantalla' })).toBeDefined();
  });

  it('the leaderboard shows the position of a player outside the top 5', () => {
    inRoom('LEADERBOARD');
    receive(ServerEvents.Leaderboard, { top: players.slice(0, 5).map(({ nickname, score }) => ({ nickname, score, delta: 0 })) });
    expect(screen.getByRole('heading', { name: 'Tu posición' })).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('de 12')).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('the leaderboard highlights your row', () => {
    inRoom('LEADERBOARD', ROOM_STATE.players);
    receive(ServerEvents.Leaderboard, { top: [{ nickname: 'Tica', score: 900, delta: 900 }] });
    expect(screen.getByRole('listitem').getAttribute('aria-current')).toBe('true');
  });

  it('the podium gives the final position after the session ended', () => {
    inRoom('PODIUM');
    receive(ServerEvents.GameEnd, { podium: players.slice(0, 3).map(({ nickname, score }, i) => ({ rank: i + 1, nickname, score })) });
    expect(screen.getByRole('heading', { name: 'Terminaste en' })).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toBeDefined();
    expect(localStorage.getItem(PLAYER_KEY)).toBeNull();
  });

  it('the winner is told so', () => {
    inRoom('PODIUM', ROOM_STATE.players);
    receive(ServerEvents.GameEnd, { podium: [{ rank: 1, nickname: 'Tica', score: 900 }] });
    expect(screen.getByRole('heading', { name: '¡Ganaste!' })).toBeDefined();
  });

  it('the podium stays up when the connection drops', () => {
    inRoom('PODIUM');
    receive(ServerEvents.GameEnd, { podium: [] });
    act(() => {
      fake.disconnect();
    });
    expect(screen.getByRole('heading', { name: 'Terminaste en' })).toBeDefined();
  });
});

describe('reconnection', () => {
  it('a reload rejoins with the stored playerId and skips the form', () => {
    savePlayerSession(SESSION);
    renderAt();
    expect(joinEmits()).toEqual([{ event: 'player:join', payload: SESSION }]);
    expect(screen.queryByLabelText('Tu apodo')).toBeNull();
    receive(ServerEvents.PlayerJoined, { playerId: PLAYER_ID, nickname: 'Tica', waitingForNextQuestion: false });
    receive(ServerEvents.RoomState, ROOM_STATE);
    expect(screen.getByRole('heading', { name: 'Estás dentro' })).toBeDefined();
  });

  it('a rejoin the server refuses returns to the form with the nickname filled in', () => {
    savePlayerSession(SESSION);
    renderAt();
    receive(ServerEvents.Error, { code: 'NICKNAME_TAKEN', message: 'x' });
    expect(nicknameInput().value).toBe('Tica');
    expect(codeInput().value).toBe(ROOM_CODE);
  });

  it('a reload in REVEAL shows the result again', () => {
    savePlayerSession(SESSION);
    renderAt();
    receive(ServerEvents.PlayerJoined, { playerId: PLAYER_ID, nickname: 'Tica', waitingForNextQuestion: false });
    receive(ServerEvents.RoomState, { ...ROOM_STATE, phase: 'REVEAL', questionIndex: 0 });
    receive(ServerEvents.QuestionReveal, { ...REVEAL, yourResult: { correct: true, points: 900, streak: 1, totalScore: 900 } });
    expect(screen.getByRole('heading', { name: '¡Correcto!' })).toBeDefined();
  });

  it('a dropped connection offers to retry', () => {
    joinedLobby();
    act(() => {
      fake.disconnect();
    });
    expect(screen.getByRole('heading', { name: 'Se perdió la conexión' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(fake.connected).toBe(true);
  });
});

describe('PlayerPage over plain HTTP (pnpm dev:lan) and failed joins', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('joins without crypto.randomUUID, which only exists in secure contexts', () => {
    // http://192.168.x.x: getRandomValues is there, randomUUID is not.
    const realCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });
    renderAt();
    submit();
    const [join] = joinEmits();
    expect(PlayerIdSchema.safeParse((join?.payload as { playerId?: unknown } | undefined)?.playerId).success).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a join that cannot even be sent shows an error instead of doing nothing', () => {
    vi.stubGlobal('crypto', {});
    renderAt();
    submit();
    expect(joinEmits()).toEqual([]);
    expect(screen.getByRole('alert').textContent).toContain('No se pudo enviar');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Entrar' }).disabled).toBe(false);
  });

  it('a join the server never answers shows an error and can be tried again', () => {
    vi.useFakeTimers();
    renderAt();
    submit();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Entrando…' }).disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(REQUEST_TIMEOUT_MS);
    });
    expect(screen.getByRole('alert').textContent).toContain('El servidor no respondió');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Entrar' }).disabled).toBe(false);
  });

  it('an answer in time cancels the timeout', () => {
    vi.useFakeTimers();
    renderAt();
    submit();
    receive(ServerEvents.PlayerJoined, { playerId: PLAYER_ID, nickname: 'Tica', waitingForNextQuestion: false });
    receive(ServerEvents.RoomState, ROOM_STATE);
    act(() => {
      vi.advanceTimersByTime(REQUEST_TIMEOUT_MS * 2);
    });
    expect(screen.getByRole('heading', { name: 'Estás dentro' })).toBeDefined();
  });
});
