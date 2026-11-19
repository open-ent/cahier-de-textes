import { EdificeClientProvider, EdificeThemeProvider } from '@open-ent/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { router } from './routes';

import './i18n';
import './index.css';

// Le bootstrap openent n'est PAS bundlé : il est chargé au runtime via
// <link href="/assets/themes/openent-bootstrap/index.css"> dans index.html et dans la vue
// backend (view/diary-react.html), comme pour l'agenda, blog et wiki. C'est cette feuille
// partagée qui porte les couleurs de marque par déploiement (data-product / data-theme) ;
// le paquet npm, lui, reste figé sur la palette compilée au dernier build.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <EdificeClientProvider params={{ app: 'diary' }}>
      <EdificeThemeProvider>
        <RouterProvider router={router} />
      </EdificeThemeProvider>
    </EdificeClientProvider>
  </QueryClientProvider>,
);
