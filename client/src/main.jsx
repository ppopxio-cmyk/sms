import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker } from './lib/push'

// Registered here rather than inside a page, so the worker is installed whichever page
// somebody lands on first, including the sign-in and confirmation pages.
void registerServiceWorker()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              borderRadius: '14px',
              border: '1px solid rgba(226,232,240,0.9)',
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(12px)',
              color: '#0f172a',
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
