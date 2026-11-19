import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { SessionProvider } from './shared/auth/SessionProvider';
import './styles/base.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </StrictMode>,
);
