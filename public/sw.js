// Service worker de Labstream OS.
//
// Antes esto no guardaba NADA a propósito, por un miedo legítimo: servir código viejo después
// de un despliegue. Ese miedo se respeta aquí, pero se resuelve por partes en vez de renunciar
// a todo el caché — porque con internet lento o con el NAS caído, no guardar nada se paga caro.
//
//   · ESTÁTICOS (/_next/static, /icons) → de caché primero, para siempre. Es SEGURO porque
//     esas URL llevan el hash del contenido: un despliegue nuevo pide archivos con OTRO nombre,
//     así que es imposible servir una versión vieja. Antes se volvían a bajar en cada arranque.
//   · MINIATURAS → de caché primero y se refresca por detrás. Es lo que más se repite en el
//     día (paneles llenos de miniaturas) y lo que más pesa con conexión mala.
//   · PÁGINAS → SIEMPRE red primero. La copia guardada solo sale cuando la red FALLA de
//     verdad, nunca para ahorrar. Así jamás se ve algo viejo con el servidor sano, y con el
//     servidor caído al menos se puede consultar lo último que se vio.
//
// Lo que esto NO es: no permite TRABAJAR sin servidor. Guardar cambios necesita el servidor,
// y por eso la app enseña una barra roja diciéndolo (ver components/sin-conexion). Un modo
// offline que deje escribir y perder el trabajo sería peor que no tenerlo.

const ESTATICO = "labstream-estatico-v1";
const MINIATURAS = "labstream-miniaturas-v1";
const PAGINAS = "labstream-paginas-v1";
const OFFLINE_CACHE = "labstream-offline-v2";
const OFFLINE_URL = "/offline.html";
const VIVOS = [ESTATICO, MINIATURAS, PAGINAS, OFFLINE_CACHE];

// Topes: sin esto el caché crece sin freno en equipos que se usan todo el día.
const TOPE_MINIATURAS = 400;
const TOPE_PAGINAS = 40;

// Rutas NÚCLEO que deben ABRIR sin conexión (modo offline, Camino B — Fase 3). Son justo las
// pantallas donde SÍ se puede trabajar sin servidor: escribir notas, crear/completar tareas y
// registrar horas (todo cae en la cola local y se sincroniza al volver). Se precachean al activar
// el SW —con la sesión ya iniciada—, para que el arranque EN FRÍO sin red (la app de escritorio
// abriendo sus pestañas) caiga en una pantalla usable y no en «sin conexión». Se sirven de la
// copia SOLO cuando la red falla de verdad (la navegación sigue siendo red-primero).
const NUCLEO_OFFLINE = ["/", "/mis-tareas", "/notas"];

async function precachearNucleo() {
  try {
    const cache = await caches.open(PAGINAS);
    await Promise.all(
      NUCLEO_OFFLINE.map(async (ruta) => {
        try {
          // credentials same-origin por defecto: la cookie de sesión viaja, así se guarda la
          // versión AUTENTICADA de la pantalla (no el login).
          const res = await fetch(ruta, { cache: "no-store" });
          if (guardable(res)) await cache.put(ruta, res.clone());
        } catch {
          /* sin red al activar: no pasa nada, se cachea sola al visitarla online */
        }
      }),
    );
    await recortar(PAGINAS, TOPE_PAGINAS);
  } catch {
    /* el precaché es un lujo: si falla, la app sigue igual */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !VIVOS.includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
      // Deja listas las pantallas que abren sin conexión (no bloquea el claim: si tarda o no hay
      // red, la app ya está controlada por el SW igual).
      await precachearNucleo();
    })(),
  );
});

// Recorta el caché por orden de llegada (lo más viejo primero).
async function recortar(nombre, tope) {
  try {
    const cache = await caches.open(nombre);
    const claves = await cache.keys();
    if (claves.length <= tope) return;
    await Promise.all(claves.slice(0, claves.length - tope).map((k) => cache.delete(k)));
  } catch {
    /* el caché es un lujo: si falla, la app sigue igual */
  }
}

function esEstatico(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

// Imágenes DERIVADAS (miniaturas, carátulas, avatares, logos). Nunca el archivo original:
// un video de 2 GB no tiene por qué acabar en el caché del navegador.
function esMiniatura(url) {
  if (url.pathname.startsWith("/api/avatar/") || url.pathname.startsWith("/api/brand-logo/")) return true;
  if (url.pathname.startsWith("/api/banner/") || url.pathname.startsWith("/api/client-asset/")) return true;
  const derivada = url.searchParams.get("thumb") === "1" || url.searchParams.get("poster") === "1";
  return derivada && (url.pathname.startsWith("/api/files-asset/") || url.pathname.startsWith("/api/ops-asset/"));
}

// Solo se guardan respuestas completas y propias: nada de 206 (trozos de video), nada de
// respuestas opacas de otro origen, nada que no sea un 200 limpio.
function guardable(res) {
  return !!res && res.status === 200 && res.type === "basic";
}

async function deCachePrimero(req, nombre, tope) {
  const cache = await caches.open(nombre);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  const res = await fetch(req);
  if (guardable(res)) {
    cache.put(req, res.clone()).then(() => recortar(nombre, tope)).catch(() => {});
  }
  return res;
}

// Enseña lo guardado YA y refresca por detrás: la miniatura aparece al instante aunque la
// conexión esté fatal, y la próxima vez ya está la nueva.
async function deCacheYRefrescar(req, nombre, tope) {
  const cache = await caches.open(nombre);
  const guardada = await cache.match(req);
  const red = fetch(req)
    .then((res) => {
      if (guardable(res)) {
        cache.put(req, res.clone()).then(() => recortar(nombre, tope)).catch(() => {});
      }
      return res;
    })
    .catch(() => null);
  if (guardada) return guardada;
  const res = await red;
  return res || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Solo GET del mismo origen. Todo lo demás (POST de acciones, subidas, streams) pasa
  // derecho: meter mano ahí es la forma más rápida de romper la app.
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(PAGINAS);
          // Al pasar por el login la sesión cambia: se tira lo guardado para que nadie vea
          // páginas de quien usó el equipo antes.
          if (url.pathname === "/login" || url.pathname === "/logout") {
            await caches.delete(PAGINAS);
          } else if (guardable(res)) {
            cache.put(req, res.clone()).then(() => recortar(PAGINAS, TOPE_PAGINAS)).catch(() => {});
          }
          return res;
        } catch {
          // Aquí sí falló la red de verdad: la copia de ESTA página, y si no, la pantalla
          // de sin conexión. `ignoreVary` porque Next marca las páginas con `Vary: RSC…`: sin
          // esto, la copia PRECACHEADA (traída sin esas cabeceras) no casaría con la navegación
          // real y se perdería el arranque offline de las rutas núcleo.
          const cache = await caches.open(PAGINAS);
          const guardada = await cache.match(req, { ignoreSearch: false, ignoreVary: true });
          if (guardada) return guardada;
          const off = await caches.open(OFFLINE_CACHE);
          return (await off.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
    return;
  }

  if (esEstatico(url)) {
    event.respondWith(deCachePrimero(req, ESTATICO, 600).catch(() => fetch(req)));
    return;
  }
  if (esMiniatura(url)) {
    event.respondWith(deCacheYRefrescar(req, MINIATURAS, TOPE_MINIATURAS).catch(() => fetch(req)));
  }
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
