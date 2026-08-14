/* Service worker — rend l'app utilisable hors ligne (métro, avion, sous-sol).
 *
 * Stratégie : cache d'abord pour les fichiers de l'app, avec rafraîchissement
 * en arrière-plan. Aucune donnée de tâche ne transite ici — elles ne quittent
 * jamais localStorage.
 *
 * Après avoir modifié un fichier de l'app, incrémente CACHE : c'est ce qui
 * déclenche le remplacement de l'ancienne version sur l'iPhone.
 */

const CACHE = 'points-v2';

const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(hit => {
      // Revalidation silencieuse : la prochaine ouverture aura la version fraîche.
      const network = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);

      return hit || network;
    })
  );
});
