// Service worker mínimo de Labstream OS.
// Objetivo: cumplir el criterio de instalabilidad de Chrome (un SW con manejador `fetch`)
// y dar una pantalla de "sin conexión" decente — SIN cachear el código de la app, para no
// servir nunca una versión vieja tras un despliegue.

const OFFLINE_CACHE = "labstream-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Limpia caches de versiones anteriores.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Solo interceptamos NAVEGACIONES (la página completa): red primero y, si no hay conexión,
// mostramos la página offline. El resto de peticiones (JS, datos, HMR) pasan sin tocar.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }),
  );
});

// ─── Web Push (notificaciones en segundo plano) ──────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Labstream OS" };
  }
  const title = data.title || "Labstream OS";
  const options = {
    body: data.body || "",
    data: { url: data.url || "/" },
    tag: "labstream-push",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic en la notificación → enfocar una ventana existente y navegar, o abrir una nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          try {
            await client.navigate(url);
          } catch {
            /* navigate puede fallar entre orígenes; al menos enfocamos */
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});
