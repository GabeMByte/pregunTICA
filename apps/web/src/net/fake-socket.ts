import type { GameSocket } from './socket.js';

type Listener = (payload: unknown) => void;

/** In-memory stand-in for a Socket.io client, for tests: records emits and lets tests push server events. */
export class FakeSocket {
  connected = false;
  readonly emitted: { event: string; payload: unknown }[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, payload?: unknown): this {
    this.emitted.push({ event, payload });
    return this;
  }

  connect(): this {
    this.connected = true;
    this.receive('connect');
    return this;
  }

  disconnect(): this {
    this.connected = false;
    this.receive('disconnect', 'io client disconnect');
    return this;
  }

  /** Simulates the server sending `event`. */
  receive(event: string, payload?: unknown): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(payload);
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  asGameSocket(): GameSocket {
    return this as unknown as GameSocket;
  }
}
