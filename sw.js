// オフラインで動かすため、アプリのファイルを端末に保存しておく。
// アプリを更新したら VERSION を上げる（上げないと iPad に新しい版が届かない）。
const VERSION = 'v3';
const CACHE = `sokubaikai-pos-${VERSION}`;
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-512.png',
  'js/main.js', 'js/ui.js', 'js/db.js', 'js/store.js', 'js/logic.js', 'js/zip.js', 'js/player.js',
  'js/listen.js', 'js/demo.js', 'js/staff.js', 'js/register.js', 'js/sales.js', 'js/products.js',
  'js/events.js', 'js/settings.js', 'js/pack.js',
];

self.addEventListener('install', e => {
  // ブラウザの一時保存を通さず、サーバーから取り直す（古い版が混ざらないように）
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('sokubaikai-pos-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
