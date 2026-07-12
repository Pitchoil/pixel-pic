// Caches every app file on first load so the app works with zero network
// connection from then on — nothing here ever fetches from, or sends
// anything to, a remote server. This only matters when Pixel-Pic is opened
// as a plain website/installed PWA; the native APK never needs this at all
// since its assets are bundled directly into the app package.
const CACHE_NAME = 'pixel-pic-v1';
const APP_SHELL = [
  './',
  './index.html',
  './main.js',
  './styles.css',
  './manifest.json',
  './assets/icons/icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
  './assets/icons/favicon-16.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first: once installed, every asset is served from disk, never the network.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
