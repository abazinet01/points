/* Service worker — rend l'app utilisable hors ligne (métro, avion, sous-sol).
 *
 * Stratégie : cache d'abord pour les fichiers de l'app, avec rafraîchissement
 * en arrière-plan. Aucune donnée de tâche ne transite ici — elles ne quittent
 * jamais localStorage.
 *
 * Après avoir modifié un fichier de l'app, incrémente CACHE : c'est ce qui
 * déclenche le remplacement de l'ancienne version sur l'iPhone.
 */

const CACHE = 'points-v10';

const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  '/points/icons/v2/icon-32.png',
  '/points/icons/v2/icon-152.png',
  '/points/icons/v2/icon-167.png',
  '/points/icons/v2/icon-180.png',
  '/points/icons/v2/icon-192.png',
  '/points/icons/v2/icon-512.png',
  '/points/icons/v2/icon-maskable-512.png',
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
  // La page de diagnostic doit répondre du réseau seul : mise en cache, elle
  // ne dirait plus rien de l'état réel du serveur.
  if (new URL(req.url).pathname.startsWith('/points/test/')) return;

  // Une page HTML servie depuis le cache masque toute mise à jour jusqu'au
  // rafraîchissement suivant : les balises d'icônes, notamment, restaient
  // celles de la version précédente. Le réseau d'abord, le cache en secours.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

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
