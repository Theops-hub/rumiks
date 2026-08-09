// Service worker : le jeu doit rester jouable sans le moindre réseau.
//
// Tout le nécessaire tient en quelques centaines de kilo-octets et ne change qu'à la
// publication d'une version : la totalité est mise en cache à l'installation, puis servie
// depuis le cache. Rien n'est chargé à la demande, donc rien ne peut manquer hors ligne.

// Numéro à incrémenter à chaque publication : c'est ce qui déclenche la mise à jour du cache
// chez les joueurs, l'ancien étant supprimé à l'activation.
const CACHE = 'rumiks-v7';

const ASSETS = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/ui.js',
  './js/dragdrop.js',
  './js/game.js',
  './js/engine.js',
  './js/rules.js',
  './js/progression.js',
  './js/solver.js',
  './js/ai.js',
  './js/storage.js',
  './js/feedback.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './sounds/tile_select.wav',
  './sounds/tile_place.wav',
  './sounds/tile_draw.wav',
  './sounds/turn_commit.wav',
  './sounds/move_reject.wav',
  './sounds/round_end.wav',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE).map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Cache d'abord : la partie ne dépend d'aucune donnée distante, et c'est ce qui garantit un
  // démarrage identique avec ou sans réseau. Le réseau ne sert que de recours.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Navigation hors ligne vers une adresse inconnue : on renvoie le jeu.
          if (request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
    }),
  );
});
