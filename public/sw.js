/* HeistScript オフライン用サービスワーカー: 初回ロード後は取得したファイルをキャッシュし、ネットワークがなくても起動できる。 */
const CACHE = 'heistscript-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).catch(() => undefined));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(event.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      // ハッシュ付きアセットはキャッシュ優先、それ以外はネットワーク優先（更新を取り込む）
      return cached && /assets\//.test(event.request.url) ? cached : network.then((r) => r ?? cached);
    }),
  );
});
