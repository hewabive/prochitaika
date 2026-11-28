// Service worker: позволяет установить Прочитайку на главный экран и открывать её без сети.
// Стратегия «сначала сеть»: свежие файлы берутся с сервера, кэш нужен только когда сети нет.
// (Само распознавание речи без интернета всё равно не работает.)

const CACHE = 'prochitaika-v8';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/words.js',
  './js/split.js',
  './js/match.js',
  './js/speech.js',
  './js/tts.js',
  './js/effects.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((cached) => cached || caches.match('./index.html'))),
  );
});
