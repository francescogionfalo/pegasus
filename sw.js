// Offline cache. Bump VERSION on every deploy so phones pick up the new files.
const VERSION = "v8";
const CACHE = "huberman-gym-" + VERSION;
// Exercise photos (img/ex/<id>-0.jpg and -1.jpg): precached so they work offline in the gym.
const EX = ["legpress","rdl","hack","legext","legcurl","calf","kickback","chestpress","incdb","pecdeck","latpd","row","sapd","cablecrunch","hlr","ohp","lateral","reardelt","inccurl","cablecurl","pushdown","ohext","abwheel","wrist"];
const CORE = ["./", "index.html", "manifest.webmanifest", "stats.js", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  ...EX.flatMap(id => [`img/ex/${id}-0.jpg`, `img/ex/${id}-1.jpg`])];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first for the page (fresh code when online), cache first for everything else (fonts, icons).
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); return r; })
      .catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
