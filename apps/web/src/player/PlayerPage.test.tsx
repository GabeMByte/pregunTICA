import { ServerEvents, type ErrorCode } from '@preguntica/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLAYER_ID, ROOM_CODE, ROOM_STATE } from '../game/fixtures.js';
import { FakeSocket } from '../net/fake-socket.js';
import { PLAYER_KEY, savePlayerSession } from '../net/storage.js';
import { PlayerPage } from './PlayerPage.js';

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
