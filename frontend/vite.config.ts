import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Proxy de dev vers l'ENT local (traefik :8090)
const proxyTarget = { target: 'http://localhost:8090', changeOrigin: false };

export default defineConfig(({ mode }) => ({
  // Servi sous /diary par entcore (cf. view/diary-react.html -> /diary/public/index.js)
  base: mode === 'production' ? '/diary' : '',
  resolve: {
    alias: {
      // Illustrations du socle (écrans vides), comme blog, wiki et l'agenda.
      '@images': resolve(__dirname, 'node_modules/@open-ent/bootstrap/dist/images'),
    },
    dedupe: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'react-i18next',
      'i18next',
      'react-router-dom',
      '@open-ent/client',
      '@open-ent/react',
      '@open-ent/bootstrap',
    ],
  },
  build: {
    assetsDir: 'public',
    rollupOptions: {
      output: {
        // Noms stables → la vue backend référence des chemins fixes.
        entryFileNames: 'public/index.js',
        chunkFileNames: 'public/[name].js',
        assetFileNames: (info) =>
          info.name && info.name.endsWith('.css')
            ? 'public/index.css'
            : 'public/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 4200,
    proxy: {
      '/diary': proxyTarget,
      '^/(?=assets|theme|locale|i18n|skin)': proxyTarget,
      // `viescolaire` et `mediacentre` manquaient : en développement, les cours de l'emploi du
      // temps et les ressources du médiacentre recevaient la page du serveur Vite au lieu du
      // JSON, et le calendrier affichait « le chargement a échoué » sans que rien ne soit cassé.
      '^/(?=auth|userbook|directory|portal|session|timeline|workspace|infra|conf|applications-list|viescolaire|mediacentre)':
        proxyTarget,
    },
  },
  plugins: [react()],
}));
