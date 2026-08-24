/* PIC — service worker · by Majin */
const CACHE = "pic-majin-v3";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js",
  "./intro.js", "./manifest.webmanifest", "./favicon.svg",
  "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Réseau d'abord pour le HTML (mise à jour), cache d'abord pour le reste */
self.addEventListener("fetch", e => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.startsWith("/api/")) return;   // toujours le réseau

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }))
  );
});

/* ============================================================
   Rappels poussés
   Le message reçu est vide : aucune donnée ne transite par le
   service de push. Le détail est demandé à l'API au moment
   d'afficher la notification.
   ============================================================ */
async function readSpace() {
  try {
    const c = await caches.open("pic-meta");
    const r = await c.match("/__pic/space");
    if (!r) return null;
    const s = (await r.text()).trim();
    return /^[a-f0-9]{64}$/.test(s) ? s : null;
  } catch (e) { return null; }
}

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let body = "Des échéances approchent dans PIC.";
    const space = await readSpace();

    if (space) {
      try {
        const res = await fetch(`/api/rappels?space=${space}`, { cache: "no-store" });
        const d = await res.json();
        if (!d || !d.count) return;              // plus rien à signaler : on se tait
        body = d.count === 1
          ? `« ${d.first} » arrive à échéance.`
          : `${d.count} tâches arrivent à échéance, dont « ${d.first} ».`;
      } catch (e) { /* on garde le message générique */ }
    }

    await self.registration.showNotification("PIC — rappel d'échéance", {
      body,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "pic-rappel",
      renotify: true,
      data: { url: "./" }
    });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes(self.registration.scope)) return c.focus();
    }
    return self.clients.openWindow("./");
  })());
});
