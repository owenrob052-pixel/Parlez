const CACHE_NAME = 'parlez-cache-v16';
const urlsToCache = [
  './',
  './index.html',
  './words.js',
  './app.js',
  './gamification.js',
  './sentences.js',
  './style.css',
  './gamification.css',
  './leaves.png',
  './word_data/01_top200.txt',
  './word_data/02_verbs.txt',
  './word_data/03_nouns_a.txt',
  './word_data/04_nouns_b.txt',
  './word_data/05_adjectives.txt',
  './word_data/06_daily.txt',
  './word_data/07_advanced.txt',
  './word_data/08_extra.txt',
  './word_data/09_final.txt',
  './word_data/10_final_push.txt'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
