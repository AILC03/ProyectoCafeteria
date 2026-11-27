import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { SessionProvider } from './shared/auth/SessionProvider';
import { startLegacyDatabaseCleanupLifecycle } from './shared/storage';
import './styles/base.css';
import './styles/status-pages.css';

startLegacyDatabaseCleanupLifecycle();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </StrictMode>,
);
