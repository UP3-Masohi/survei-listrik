import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Mode HP: aplikasi dan API berbagi satu alamat. Permintaan ke /api/... diteruskan ke API
// di port 3000, jadi tidak perlu CORS dan cukup satu tunnel HTTPS (lihat README).
const API_LOKAL = process.env.API_PROXY || 'http://localhost:3000'
const proxyApi = {
  '/api': { target: API_LOKAL, changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') }
}

export default defineConfig({
  server: { host: true, allowedHosts: true, proxy: proxyApi },
  preview: { host: true, allowedHosts: true, proxy: proxyApi },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Survei Calon Pelanggan Listrik',
        short_name: 'Survei Listrik',
        lang: 'id',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0b5ed7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [{
          urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'tile-peta',
            expiration: { maxEntries: 1000, maxAgeSeconds: 30 * 24 * 3600 }
          }
        }]
      }
    })
  ]
})
