/* 오프라인용: 한 번 열어 둔 사이트 파일(화면·일정·기능)을 휴대폰에 저장해 두고,
 * 인터넷이 끊기면 저장해 둔 것으로 연다. 인터넷이 되면 항상 새 파일을 먼저 받는다.
 * 지도 조각(배경 지도)은 크기가 커서 저장하지 않는다 → 끊기면 일정 목록이 대신 보인다. */
var CACHE = 'macau-trip-v1';
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(['./', './index.html']); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  var same = url.origin === self.location.origin;
  var lib = /unpkg\.com\/maplibre-gl|cdn\.jsdelivr\.net\/npm\/maplibre-gl/.test(req.url);
  if (!same && !lib) return;                       // 지도 조각·구글 등은 건드리지 않는다
  if (lib) {                                       // 지도 엔진: 저장해 둔 것 먼저 (버전 고정)
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (r) { var c = r.clone(); caches.open(CACHE).then(function (s) { s.put(req, c); }); return r; });
    }));
    return;
  }
  e.respondWith(fetch(req).then(function (r) {     // 사이트 파일: 새것 먼저, 안 되면 저장해 둔 것
    if (r.ok) { var c = r.clone(); caches.open(CACHE).then(function (s) { s.put(req, c); }); }
    return r;
  }).catch(function () {
    return caches.match(req).then(function (hit) { return hit || caches.match('./index.html'); });
  }));
});
