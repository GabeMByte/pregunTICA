import { Navigate, Route, Routes } from 'react-router';
import { HostPage } from './host/HostPage.js';
import { PlayerPage } from './player/PlayerPage.js';
import { Home } from './routes/Home.js';

/** SPEC §4 Interfaz: /, /host and /play/:code? (the QR points to /play/CODE). */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/host" element={<HostPage />} />
      <Route path="/play/:code?" element={<PlayerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
