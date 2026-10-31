import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { HostPage } from './host/HostPage.js';
import { I18nProvider } from './i18n/I18nProvider.js';
import { PlayerPage } from './player/PlayerPage.js';
import { Home } from './routes/Home.js';

// Dev-only component catalog; the dynamic import keeps it out of the production bundle.
const ComponentsPage = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('./routes/ComponentsPage.js')).ComponentsPage }))
  : null;

/** SPEC §4 Interfaz: /, /host and /play/:code? (the QR points to /play/CODE). */
export function App() {
  return (
    <I18nProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/play/:code?" element={<PlayerPage />} />
        {ComponentsPage !== null && (
          <Route
            path="/dev/componentes"
            element={
              <Suspense>
                <ComponentsPage />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </I18nProvider>
  );
}
