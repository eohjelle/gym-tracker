import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Gym Tracker',
        short_name: 'Gym Tracker',
        display: 'standalone',
        start_url: '/',
        background_color: '#000000',
        theme_color: '#007AFF',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,json,png}'],
      },
    }),
  ],
  optimizeDeps: {
    include: ['sql.js'],
  },
});
