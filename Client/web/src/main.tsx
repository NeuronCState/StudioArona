import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
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

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
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
    </React.StrictMode>,
  );
}

enableMocking().then(renderApp, renderApp);
