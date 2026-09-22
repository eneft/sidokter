import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { getPersistedClientSession, refreshUserSessionProfile } from './lib/authService';
import './index.css';

// Silently handle benign Vite HMR WebSocket errors in proxied sandbox container environments
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = typeof reason === 'string' ? reason : (reason?.message || String(reason || ''));
    if (msg.includes('WebSocket closed without opened') || msg.includes('failed to connect to websocket')) {
      event.preventDefault();
    }
  });
}

async function restoreFirebaseAuthBeforeRender(): Promise<void> {
  const persistedSession = getPersistedClientSession();
  if (!persistedSession?.sessionId) return;

  try {
    // SIDOKTER sessionStorage is the application session cache, while Firestore
    // Rules evaluate Firebase Auth. After a reload Firebase Auth restoration can
    // lag behind React effects, causing otherwise-valid reads/writes to run as an
    // anonymous client. Refresh the trusted session first so its custom token is
    // applied before any hierarchy/SPO Firestore listener starts.
    await refreshUserSessionProfile(persistedSession);
  } catch (error) {
    console.info('[bootstrap] Firebase Auth session restoration notice:', error);
  }
}

async function bootstrap(): Promise<void> {
  await restoreFirebaseAuthBeforeRender();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
