import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/App';
import { SessionProvider } from '@/lib/session';
import { ApiError } from '@/lib/api';
import '@/index.css';

/**
 * One query client for the app.
 *
 * `retry` is a function rather than a number because retrying a 4xx is
 * pointless — the request will fail identically forever — while a 5xx or a
 * dropped connection often succeeds on the next attempt. Retrying auth
 * errors would also fire a refresh for every failed login in a batch.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (ApiError.is(error)) {
          if (error.status >= 400 && error.status < 500) return false;
          if (error.code === 'NETWORK_ERROR') return failureCount < 2;
        }
        return failureCount < 1;
      },
    },
    mutations: { retry: false },
  },
});

const container = document.getElementById('root');
if (container === null) {
  throw new Error('No se encontró el contenedor #root');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
