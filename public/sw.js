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
  const reminderId = (data.data && data.data.reminderId) || null;
  const options = {
    body: data.body || "",
    data: { url: data.url || "/", reminderId: reminderId },
    // Icono de marca (antes salía el genérico del navegador).
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // Tag por ENTIDAD (recordatorio/canal): así un aviso nuevo del mismo origen reemplaza al
    // anterior, pero avisos de orígenes distintos ya NO se pisan entre sí (antes un tag fijo
    // hacía que cada push borrara al anterior y se perdieran).
    tag: data.tag || ("labstream-" + (reminderId || Math.random().toString(36).slice(2))),
    renotify: true,
    // Botones de acción (recordatorios): posponer / marcar hecho sin abrir la app.
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic en la notificación → si es un botón de acción de recordatorio, lo ejecuta en el
// servidor (la cookie de sesión viaja en la petición del mismo origen); si no, enfoca/abre.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const info = event.notification.data || {};
  if ((event.action === "snooze" || event.action === "done") && info.reminderId) {
    event.waitUntil(
      fetch("/api/push/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderId: info.reminderId, action: event.action }),
      }).catch(() => {}),
    );
    return;
  }
  const url = info.url || "/";
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
