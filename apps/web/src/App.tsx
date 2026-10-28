import { HostPage } from './host/HostPage.js';
import { PlayerPage } from './player/PlayerPage.js';

export function App({ pathname = window.location.pathname }: { pathname?: string }) {
  return pathname.startsWith('/host') ? <HostPage /> : <PlayerPage />;
}
