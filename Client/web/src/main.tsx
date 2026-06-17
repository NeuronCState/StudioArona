import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useConnectionStatus } from './hooks/useConnectionStatus';
import { createQueryClient } from './lib/query-client';
import './styles/globals.css';
import './styles/studio-globals.css';
import './registry';

async function enableMocking() {
  // MSW is only enabled when VITE_USE_MSW=1 is set explicitly.
  // In production (or dev without the flag) all requests go to the real backend.
  if (import.meta.env.VITE_USE_MSW === '1') {
    const { worker } = await import('./mocks/browser');
    return worker.start({ onUnhandledRequest: 'bypass' });
  }
}

const queryClient = createQueryClient();

/**
 * Root wrapper — 装 useConnectionStatus 单例, 让全 App 知道 server 状态.
 * ping 8080/health 通了才 setServerStatus('online'), 各 page 才能决定 fetch / 走本地.
 */
function RootWithConnection() {
  useConnectionStatus();
  return (
    <ErrorBoundary scope="app">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RootWithConnection />
    </React.StrictMode>,
  );
}

enableMocking().then(renderApp, renderApp);
