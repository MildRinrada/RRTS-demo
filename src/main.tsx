import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/ibm-plex-sans-thai/400.css';
import '@fontsource/ibm-plex-sans-thai/500.css';
import '@fontsource/ibm-plex-sans-thai/600.css';
import '@fontsource/ibm-plex-sans-thai/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shop.css';
import './styles/customer.css';
import './styles/demo.css';
import { queryClient } from './api/hooks';
import { onDemoChange } from './demo/server';
import { App } from './App';

// Another tab changed the demo data (a customer approved a quote, say): refresh what this tab shows.
onDemoChange(() => queryClient.invalidateQueries());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
