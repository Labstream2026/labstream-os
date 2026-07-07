# Plan de auditoría de seguridad + mejoras — Labstream OS

> **Fecha:** 2026-07-07 · **Autor del análisis:** Claude Fable (auditoría multi-agente, 26 agentes, hallazgos verificados adversarialmente).
> **Para ejecutar con:** Opus. Este documento es un *runbook*: cada tarea trae archivo, símbolo/bloque exacto, el cambio y cómo verificar que **no se rompe funcionalidad**.
>
> **Regla de oro de este repo (no la olvides):**
> 1. Editar en local → `npm run build` (o `npx tsc --noEmit`) y `npm run lint` para validar.
> 2. Commit **solo de los archivos de esta tarea** (NUNCA `git add -A`; hay trabajo concurrente en `main`).
> 3. `push` a `main`.
> 4. En el NAS correr `bash /var/services/homes/Labstream/claude-job.sh` (pull de main + build Docker + `prisma migrate deploy`). Editar en el NAS se sobreescribe en el próximo deploy.
>
> **Ninguna de estas tareas quita funcionalidad.** Las 4 que *podrían* alterar comportamiento visible están marcadas con ⚠️ y traen la ruta segura.

---

## Estado de ejecución (2026-07-07, por Fable)

**YA APLICADO en local** (sin commitear aún — hay trabajo concurrente en `main`; commitea SOLO estos archivos, nunca `git add -A`). `tsc --noEmit` pasa con 0 errores; ESLint no añade problemas nuevos:

- ✅ **Parte B — chat de Marcebot eliminado** (copiloto/popup/digest intactos). Archivos: `chat/actions.ts`, `chat/chat-list.tsx`, `chat/list-data.ts`, `chat/[id]/page.tsx`, `components/chat/channel-chat.tsx`, `lib/marcebot/bot.ts`; **borrado** `lib/openclaw/bridge.ts`.
- ✅ **S1** (XSS propuestas): `sanitizeBlocks` en `createProposal`/`duplicateProposal` + saneo servidor en `/p/[token]/page.tsx` vía nuevo `lib/proposals/html-sanitize.ts`.
- ✅ **S2** (anti-escalada `setUserRole`), **S3+S6** (login IP último salto + limitador por email + purga), **S4** (`safe-next.ts`), **S8** (nosniff en avatar/banner/client-asset/proposal-img + guard de imagen), **S14** (`addClientMember`), **S15** (Permissions-Policy en `next.config.ts`).
- ✅ **S9** (imágenes de propuesta gateadas): `/api/proposal-img` exige token de la propuesta (`?t=`) o sesión; `/p/[token]/page.tsx` enhebra el token en `hero.bg` y `carousel.img` (nuevo helper `withImgToken`). Verificado con `tsc` + eslint.
- ✅ **Parte C (diseño) — 4 mejoras aplicadas en toda la app** (`tsc` + eslint limpios): (1) **skeletons de carga** — nuevos `components/ui/skeleton.tsx` + `(app)/loading.tsx` genérico + `loading.tsx` a medida en proyectos/facturación/reportes/calendario; (2) **`EmptyState`** reutilizable (`components/ui/empty-state.tsx`) aplicado en facturación, clientes, cotizaciones, revisiones, mis-entregas, wiki, mis-tareas, plantillas, papelera, biblioteca; (3) **botón de volver en móvil** en `topbar.tsx` para páginas de detalle; (4) **botones**: rebote al pulsar en `ui/button.tsx` (respeta reduced-motion) + área táctil ≥32px en los controles de `data-table.tsx`. **Pulido adicional aplicado:** contraste AA de la navegación + badge de no-leídos consistente (`sidebar.tsx`); **`PageHeader`** unificado (`components/ui/page-header.tsx`) en 7 páginas de lista (facturación, cotizaciones, clientes, revisiones, reportes, biblioteca, papelera). Todo committeado (5 commits) — sin push.

**PENDIENTE (requiere `.env`/NAS o rollout dedicado — NO ejecutado a propósito):**
- **S5, S10/S12, S13** — tocan `docker-compose.yml` (bajo edición concurrente) y **necesitan cambiar el `.env` del NAS**; aplicarlos a ciegas rompería el deploy. Pasos manuales abajo.
- **S11 (CSP)** — ⚠️ **NO aplicar sin rollout dedicado.** La doc de Next 16 (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`) confirma que la CSP **con nonce obliga a renderizado dinámico en TODA la app** (se desactivan optimización estática/ISR/PPR; posibles errores de runtime en páginas no preparadas + penalización de rendimiento). No es un cambio inocuo. Hacerlo como tarea propia: implementar el nonce en `proxy.ts` según esa doc, desplegar en `Content-Security-Policy-Report-Only`, verificar TODAS las páginas (login, chat, OnlyOffice, /p, /review, previews) sin errores de render dinámico ni violaciones, medir rendimiento, y solo entonces pasar a enforcing.

---

## Resumen ejecutivo

La app está **bien construida en seguridad**: RBAC revalidado en vivo por request, tokens comparados en tiempo constante, guard de SSRF que revalida en cada redirección, límite de intentos de login, rechazo de secreto de sesión débil en producción, servido de archivos con permiso/nosniff en la mayoría de rutas. **No hay vulnerabilidad crítica ni acceso anónimo a datos.**

Los hallazgos son **endurecimientos**. Uno solo es **HIGH** y merece atención pronta:

| # | Sev | Título | Esfuerzo | ¿Puede alterar comportamiento? |
|---|-----|--------|----------|-------------------------------|
| S1 | 🔴 HIGH | Stored XSS en el portal público de propuestas | Bajo | No |
| S2 | 🟠 MED | `setUserRole`: escalada de privilegios por delegado | Bajo | No |
| S3 | 🟠 MED | Login: rate-limit evadible por `X-Forwarded-For` | Bajo | No |
| S4 | 🟠 MED | Open redirect en login/OIDC (chars de control) | Trivial | No |
| S5 | 🟠 MED | Secreto JWT de OnlyOffice con default público en repo | Trivial | No |
| S6 | 🟡 LOW | Mapas de rate-limit nunca purgan (memoria) | Bajo | No |
| S7 | 🟡 LOW | Secretos de webhook por query string (quedan en logs) | Bajo | No |
| S8 | 🟡 LOW | Rutas de imagen sin `nosniff` + confían en MIME del cliente | Bajo | No |
| S9 | 🟡 LOW | Imágenes de propuesta públicas sin token/sesión | Bajo | ⚠️ Sí |
| S10 | 🟡 LOW | Postgres con fallback `changeme` | Trivial | ⚠️ Sí |
| S11 | 🟡 LOW | Sin Content-Security-Policy | Medio | ⚠️ Sí |
| S12 | 🟡 LOW | App publicada entera a la LAN (`192.168.0.22:3200`) | Medio | ⚠️ Sí |
| S13 | 🟡 LOW | Redis sin contraseña | Bajo | No |
| S14 | ⚪ INFO | `addClientMember` puede dar portal a cliente ajeno | Trivial | No |
| S15 | ⚪ INFO | Falta `Permissions-Policy`; body de 100 MB sin rate-limit | Bajo | No |

**Falso positivo descartado en verificación:** `/api/v1/ask` *sí* respeta `readOnly` (una key de solo lectura no puede consumir el LLM). No hay que tocar nada ahí.

**Orden sugerido de ejecución:** S1 → S2 → S4 → S3 → S5 → S14 → S7/S8/S6/S13/S15 (batch de LOW inofensivos) → S10/S12/S11/S9 (los ⚠️, con cuidado y despliegue escalonado).

---

# PARTE A — Seguridad (paso a paso)

## S1 · 🔴 HIGH — Stored XSS en el portal público de propuestas

**Qué pasa.** El bloque `text` de una propuesta se renderiza en la vista pública del cliente (`src/app/p/[token]/page.tsx` → `ProposalRenderer` → `proposal-renderer.tsx:79`) con `dangerouslySetInnerHTML`, y la única defensa ahí es `sanitizeProposalHtml` (`src/lib/proposals/sanitize.ts`), un sanitizador por **lista negra con regex**. Es evadible (verificado ejecutando la función): sobreviven `<img/onerror=alert(1) src=x>` (la `/` evita el `\s` previo a `on\w+`), `<img src="x"onerror="alert(1)">` (atributo pegado), `<a href="java&#09;script:...">` (entidad HTML). Además `createProposal` (`actions.ts:~118`) y `duplicateProposal` (`~240`) **guardan los bloques sin** pasar por `sanitizeBlocks`, y `templates.ts` interpola respuestas del usuario **sin escapar** dentro del `body`.

**Por qué importa.** Un usuario con `crear_cotizaciones` (rol comercial, no solo admin) crea una propuesta con un payload y comparte el link público `/p/[token]`; el JS corre en `os.labstreamsas.com` — mismo origen que la app autenticada. Víctimas: el cliente externo y cualquier admin/miembro que previsualice el link estando logueado (escalada de comercial → admin).

**La corrección es fácil porque `sanitizeBlocks` y `HTML_OPTS` (allowlist con `sanitize-html`) YA existen** en `actions.ts:52/61` y ya los usan `saveProposalBlocks` y `addProposalBlock`.

**Cambios (defensa en profundidad, no cambia el render visual — las plantillas solo emiten `<strong>/<p>/<a>`, todos en la allowlist):**

1. En `src/app/(app)/cotizaciones/propuestas/actions.ts`, dentro de `createProposal`, **antes** del `db.proposal.create(...)` (~L118), sanear los bloques:
   ```ts
   // reemplaza `blocks` por su versión saneada antes de crear
   const cleanBlocks = sanitizeBlocks(blocks);
   // ...usar cleanBlocks en el create (data: { ..., blocks: cleanBlocks })
   ```
2. En `duplicateProposal` (~L240), igual antes del `db.proposal.create(...)`:
   ```ts
   const cleanBlocks = sanitizeBlocks(src.blocks);
   // ...usar cleanBlocks en el create
   ```
3. Sustituir el sanitizador de render por la misma allowlist. En `src/lib/proposals/sanitize.ts`, reemplazar la implementación regex de `sanitizeProposalHtml` por `sanitize-html` con la misma allowlist que `HTML_OPTS`. Para no duplicar, **exportar `HTML_OPTS`** desde `actions.ts` (o mover `HTML_OPTS` a `src/lib/proposals/sanitize.ts` y que `actions.ts` lo importe — más limpio):
   ```ts
   import sanitizeHtml from "sanitize-html";
   export const HTML_OPTS: sanitizeHtml.IOptions = { /* la misma allowlist de actions.ts */ };
   export function sanitizeProposalHtml(html: string): string {
     if (!html) return "";
     return sanitizeHtml(html, HTML_OPTS);
   }
   ```
   Luego en `actions.ts` importar `HTML_OPTS` desde `sanitize.ts` en vez de declararlo local (evita divergencia).
4. (Opcional, refuerzo) En `src/lib/proposals/templates.ts` escapar las respuestas del usuario en los helpers `S`/`plain` (L19-20) antes de interpolarlas en `body` — con la allowlist de render ya es defensa redundante, pero es barato.

**Verificar.** `npm run build`; crear una propuesta con `<img/onerror=alert(1) src=x>` en un campo; abrir el link `/p/[token]` y comprobar (DOM) que el `<img>`/handler **no** aparece; que una propuesta normal se ve idéntica.

---

## S2 · 🟠 MED — `setUserRole`: escalada de privilegios por delegado

**Qué pasa.** `setUserRole` (`src/app/(app)/configuracion/actions.ts:339`) exige `administrar_usuarios` y ya bloquea asignar `admin` (L347) y cambiar el propio rol (L351), pero **no** verifica que el rol destino tenga solo permisos que el que asigna ya posee. Un delegado con `administrar_usuarios` (pero sin, p.ej., `ver_cotizaciones`) puede ascender a alguien a un rol que sí lo tiene → concede permisos que él no tiene. `setRolePermission` (L296-298) **ya** implementa exactamente esta anti-escalada; hay que replicarla.

**Cambio.** En `setUserRole`, tras resolver el rol destino y antes del `update`:
```ts
if (session.role !== "admin") {
  const target = await db.role.findUnique({
    where: { key: roleKey },
    select: { permissions: { select: { permission: { select: { key: true } } } } },
  });
  if (!target || !target.permissions.every((rp) => hasPermission(session, rp.permission.key))) {
    return { ok: false, error: "No puedes asignar un rol con permisos que tú no tienes." };
  }
}
```
No afecta al admin pleno (pasa por bypass) ni a un delegado asignando dentro de su alcance.

**Verificar.** Como no-admin sin `ver_cotizaciones`, intentar poner a un usuario en un rol que lo tenga → debe rechazar; asignar un rol dentro de su alcance → debe funcionar.

---

## S3 · 🟠 MED — Login: rate-limit evadible por `X-Forwarded-For`

**Qué pasa.** `src/lib/auth-actions.ts:38` toma la IP del **primer** valor de `x-forwarded-for` (controlable por el cliente). La clave del limitador es `email|ip`, así que rotando el XFF se evade el tope de 8/5min → fuerza bruta ilimitada.

**Cambio (dos partes).**
1. Derivar la IP de fuente confiable: tomar el **último** salto de XFF (el que añade tu nginx) en vez del primero, o leer una cabecera que solo tu reverse proxy fije. Ejemplo:
   ```ts
   const xff = h.get("x-forwarded-for")?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
   const ip = xff.length ? xff[xff.length - 1] : (h.get("x-real-ip") ?? "").trim();
   ```
   (Confirma cuántos proxies hay delante; con un solo nginx, el último valor es el fiable.)
2. Añadir un segundo limitador **solo por email**, independiente de la IP, con tope más alto (p.ej. 50/15 min) para que rotar IP no anule el control:
   ```ts
   if (loginRateLimited(`email:${email}`, 50, 15 * 60_000)) return { error: "Demasiados intentos, espera unos minutos." };
   ```
   (Parametriza `loginRateLimited` para aceptar `max`/`windowMs`.)

**Verificar.** Fallar 9 logins del mismo email variando XFF → debe bloquear igual.

---

## S4 · 🟠 MED — Open redirect en login/OIDC (caracteres de control)

**Qué pasa.** `src/lib/safe-next.ts` acepta `next` internos pero no filtra TAB/LF/CR; ciertos parseos de navegador tratan `/\t/…` como redirección externa. Se usa en `login` y en el callback OIDC (`oidc/callback/route.ts:42/105`).

**Cambio.** En `safe-next.ts`, antes de devolver `next`, rechazar chars de control y normalizar:
```ts
if (/[ -]/.test(next)) return fallback;
try {
  const u = new URL(next, "https://placeholder.invalid");
  if (u.origin !== "https://placeholder.invalid") return fallback; // era absoluta/externa
  return u.pathname + u.search + u.hash;
} catch { return fallback; }
```
Mantener las reglas actuales (rechazar `//`, `/\`, `/login`). Sigue aceptando rutas internas legítimas.

**Verificar.** `safeNext("/proyectos")` → igual; `safeNext("/\t/evil.com")` y `safeNext("https://evil.com")` → `fallback`.

---

## S5 · 🟠 MED — Secreto JWT de OnlyOffice con default público en repo

**Qué pasa.** `deploy/onlyoffice/docker-compose.yml:24` y `docker-compose.yml:63` traen `ONLYOFFICE_JWT_SECRET` con default `'cambia-este-secreto'` (repo público). Si el `.env` del NAS no lo define, cualquiera puede firmar callbacks de OnlyOffice válidos.

**Cambio (fail-fast, como `NEXTAUTH_SECRET`).** En ambos archivos:
```yaml
ONLYOFFICE_JWT_SECRET: ${ONLYOFFICE_JWT_SECRET:?define ONLYOFFICE_JWT_SECRET (openssl rand -hex 32), idéntico en ambos stacks}
```
Documentar que debe ser el mismo valor en el stack de la app y el de OnlyOffice. Si ya está en el `.env`, no cambia nada.

**Verificar.** Sin la env, `docker compose config` falla; con la env, arranca igual.

---

## S6 · 🟡 LOW — Mapas de rate-limit nunca purgan (memoria)

**Qué pasa.** `src/lib/rate-limit.ts:7` y `loginHits` en `auth-actions.ts:17` guardan `Map<clave, timestamps[]>` sin purga: con XFF falsificado (S3) la cardinalidad de claves crece sin techo.

**Cambio.** Al final de `rateLimit`/`loginRateLimited`, si `recent.length === 0` → `hits.delete(key)`; y/o barrido perezoso cada K inserciones que borre claves con último timestamp > `windowMs`. Combinar con S3 acota la cardinalidad.

**Verificar.** Unit test o logging del `hits.size` bajo carga sintética.

---

## S7 · 🟡 LOW — Secretos de webhook por query string (quedan en logs)

**Qué pasa.** `src/app/api/openclaw/inbound/route.ts:36` y `src/app/api/whatsapp/webhook/route.ts:15` aceptan el token por `?token=` → queda en logs de nginx/proxy.

**Cambio.** Preferir **solo cabecera** (`x-openclaw-token` / `x-webhook-token` / `Authorization`). Si por compatibilidad con Evolution/OpenClaw hay que mantener el query string, dejarlo pero (a) documentar el riesgo y (b) configurar el reverse proxy para no registrar el query string de esas rutas. No romper la variante por cabecera.

**Verificar.** Webhook con cabecera → 200; revisar que la config del proxy no loguee el token.

---

## S8 · 🟡 LOW — Rutas de imagen sin `nosniff` + confían en MIME del cliente

**Qué pasa.** `avatar/[id]`, `banner/[id]`, `client-asset/[kind]/[id]`, `proposal-img/...` no ponen `X-Content-Type-Options: nosniff` (sí lo ponen `img`, `wiki-file`, `files`, `files-asset`). Y las subidas (`perfil/actions.ts:47`, `propuestas/actions.ts:152`) validan por `file.type` (declarado por el cliente).

**Cambio.**
1. Añadir `"X-Content-Type-Options": "nosniff"` a las respuestas de esas 4 rutas.
2. En `proposal-img`, forzar `Content-Disposition: attachment` o servir `image/webp` fijo cuando el tipo no esté en allowlist inline-seguro (reutilizar `isInlineSafeMime` de `storage.ts`).
3. En la subida, validar por **bytes reales** (reprocesar con `sharp` o comprobar la firma) en vez de `file.type`.

No altera imágenes legítimas.

**Verificar.** Las imágenes actuales se ven igual; subir un archivo con MIME mentido → rechazado o servido como descarga.

---

## S9 · 🟡 LOW ⚠️ — Imágenes de propuesta públicas sin token/sesión

**Qué pasa.** `/api/proposal-img/[proposalId]/[name]` sirve la imagen a cualquiera que conozca el `proposalId` (está en `PUBLIC_PREFIXES`, `proxy.ts:24`), sin token ni sesión.

**Cambio (⚠️ cuidado: no romper propuestas ya publicadas).** Exigir el token de propuesta: aceptar `?t=` y validar `verifyScopedToken('proposal', t) === proposalId`, **o** sesión con acceso a la propuesta (para la vista interna). Hay que **enhebrar el token en las etiquetas `<img>`** del portal `/p/[token]` para no romper el render de propuestas ya compartidas. Aceptar también sesión evita romper la vista interna del equipo.

**Verificar.** Portal `/p/[token]` sigue mostrando imágenes; acceder a `/api/proposal-img/<id>/<name>` sin token ni sesión → 403.

> Prioridad real baja: expone imágenes de propuesta (no datos sensibles) a quien adivine el ID. Hacer junto con S1 (mismo módulo).

---

## S10 · 🟡 LOW ⚠️ — Postgres con fallback `changeme`

**Qué pasa.** `docker-compose.yml:32` (dentro de `DATABASE_URL`) y `:120` (`POSTGRES_PASSWORD`) caen a `changeme` si falta la env.

**Cambio (fail-fast).** En ambas ocurrencias: `${POSTGRES_PASSWORD:?define una POSTGRES_PASSWORD fuerte en el .env del NAS}`. En `.env.example` cambiar `changeme` por `CAMBIA_ESTA_CONTRASENA`.

**⚠️ No romper la BD existente.** El volumen `./data/postgres` **ya inicializado no cambia su contraseña** al cambiar la env. Si hoy corre con `changeme`, hay que rotarla dentro del contenedor y sincronizar `DATABASE_URL` en el mismo deploy:
```sql
-- dentro del contenedor postgres
ALTER USER labstream WITH PASSWORD '<nueva>';
```
Luego poner `<nueva>` en el `.env` (`POSTGRES_PASSWORD`) y redeploy. Alternativa: recrear el volumen (pierde datos — **no** en producción).

**Verificar.** App conecta con la nueva contraseña; sin la env, el compose falla.

---

## S11 · 🟡 LOW ⚠️ — Sin Content-Security-Policy

**Qué pasa.** `next.config.ts:17` deja la CSP como TODO. Sin CSP, el XSS de S1 (y cualquier futuro) ejecuta sin freno.

**Cambio (⚠️ desplegar en Report-Only primero para no romper la app).** Implementar CSP con **nonce por request** en `src/proxy.ts` (el App Router de Next 16 propaga el nonce a sus scripts si lo encuentra en la cabecera):
```ts
const nonce = crypto.randomUUID().replace(/-/g, "");
const requestHeaders = new Headers(req.headers);
requestHeaders.set("x-nonce", nonce);
const res = NextResponse.next({ request: { headers: requestHeaders } });
res.headers.set(
  "Content-Security-Policy-Report-Only", // ← empezar en Report-Only unos días
  `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; ` +
  `style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; ` +
  `connect-src 'self'; media-src 'self' blob:; frame-src 'self' https://docs.labstreamsas.com; ` +
  `frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests`
);
```
Ajustar `connect-src`/`frame-src` si OnlyOffice necesita `wss://docs.labstreamsas.com`. `style-src` mantiene `'unsafe-inline'` a propósito (Next/Tailwind inyectan estilos inline; nonce-earlos rompe hydration; el riesgo residual de CSS-inline es bajo frente al de script). Tras validar en Report-Only, cambiar a `Content-Security-Policy` (enforcing).

**Verificar.** Consola del navegador sin violaciones en Report-Only durante el rodaje (login, chat, OnlyOffice, previews, propuestas); recién ahí, enforcing.

---

## S12 · 🟡 LOW ⚠️ — App publicada entera a la LAN

**Qué pasa.** `docker-compose.yml:20` publica `192.168.0.22:3200` para que OnlyOffice alcance el callback, pero expone **toda** la superficie de la app a cualquiera en la LAN (mitigado hoy porque `cron-auth` ya exige `CRON_SECRET`).

**Cambio (⚠️ no romper el callback de OnlyOffice).** Poner el contenedor de la app y el de OnlyOffice en la **misma red Docker** (network externa compartida) y que el DS llame el callback por nombre de servicio (`http://app:3000`), sin publicar puerto a la LAN:
- Quitar la línea `- "192.168.0.22:3200:3000"`.
- Añadir `networks:` compartida entre ambos stacks; fijar `ONLYOFFICE_CALLBACK_BASE=http://app:3000`.
- Mantener `127.0.0.1:3200:3000` para el reverse proxy DSM.
Si por topología (stacks separados) no es viable red común, restringir con firewall DSM: solo la IP del host/contenedor de OnlyOffice puede al `:3200`.

**Verificar.** Editar un documento en OnlyOffice y **guardar** (el callback debe seguir llegando); desde otra máquina de la LAN, `curl http://192.168.0.22:3200/` ya no responde.

---

## S13 · 🟡 LOW — Redis sin contraseña

**Qué pasa.** `docker-compose.yml` levanta Redis sin `AUTH`. Hoy inocuo (no se consume aún; el `worker` está comentado), pero conviene cerrarlo antes de darle uso (fase 3).

**Cambio.**
```yaml
redis:
  command: ["redis-server", "--requirepass", "${REDIS_PASSWORD:?define REDIS_PASSWORD}"]
# y REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
```

**Verificar.** `redis-cli -a $REDIS_PASSWORD ping` → PONG; sin password → NOAUTH.

---

## S14 · ⚪ INFO — `addClientMember` puede dar portal a cliente ajeno

**Qué pasa.** `removeClientMember` exige `administrar_usuarios` para tocar usuarios rol `cliente` (asimetría), pero `addClientMember` (`clientes/actions.ts:274`) no: un usuario con permiso de miembros podría dar acceso de portal a un usuario `cliente` de otro cliente.

**Cambio.** En `addClientMember`, cargar el rol del usuario objetivo y replicar el guard:
```ts
// select: { name: true, role: { select: { key: true } } }
if (user.role?.key === "cliente" && !hasPermission(session, "administrar_usuarios"))
  return { ok: false, error: "Solo un administrador puede gestionar usuarios cliente." };
```
No afecta el alta de miembros internos.

---

## S15 · ⚪ INFO — Falta `Permissions-Policy`; body 100 MB sin rate-limit

**Cambio.** Añadir a `next.config.ts` (junto a las otras cabeceras):
```ts
{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" }
```
(Ajustar si alguna función legítima usa cámara/micrófono — p.ej. notas de voz usan micrófono en el navegador vía getUserMedia; si es el caso, quitar `microphone=()`.) Mantener `bodySizeLimit: 100mb` solo si el vídeo lo necesita; considerar rate-limit por IP/usuario delante de las server actions de subida.

---

# PARTE B — Quitar SOLO el chat de Marcebot (quirúrgico)

> **Objetivo:** eliminar el **chat conversacional** de Marcebot (DM donde escribes y responde por LLM + @menciones que disparan el agente), **conservando exactamente igual** el resto: la tarjeta copiloto del Inicio, el popup de aviso, el digest del cron, recordatorios, notificaciones, WhatsApp y la API v1. **No hay migración de BD.**

## Qué se conserva intacto (NO es chat — no tocar)
- `src/app/(app)/marcebot-card.tsx` — tarjeta de pendientes del Inicio (montada en `page.tsx:159`).
- `src/app/(app)/marcebot-popup.tsx` + `marcebot-actions.ts` + `src/app/api/marcebot/pending/route.ts` — popup de aviso proactivo (montado en `layout.tsx:226`).
- `src/app/api/cron/marcebot/route.ts` + `src/lib/marcebot/{run,data,chase,compose,time,config,weekly,index}.ts` — digest del cron.
- `src/lib/marcebot/bot.ts` — **conservar** (`ensureMarcebot`, `getOrCreateMarcebotDM`, `sendBotDM`, `postBotFileMessage`, `postBotTextMessage`, `sendBotEmail` sostienen copiloto, WhatsApp y digest).
- `src/lib/openclaw/{client,agent,tools,config,attachments}.ts` — **motor del agente** reutilizado por API v1, WhatsApp y el test de Configuración. **Solo `bridge.ts` es de chat.**
- `src/app/api/chat/dock/route.ts` — ya bloquea DMs hacia bots; dejar igual.
- `src/lib/notify.ts` y notificaciones tipo `marcebot` — campana/recordatorios del copiloto.

## Pasos ordenados

1. **`src/app/(app)/chat/actions.ts`**
   - Quitar imports: `import { mentionsBot, handleBotMention } from "@/lib/openclaw/bridge";` (L11) y `import { getOrCreateMarcebotDM, isBotDirectChannel } from "@/lib/marcebot/bot";` (L12).
   - Borrar la función `openMarcebotChat` completa (~L137-146).
   - Borrar los dos bloques de disparo del agente: en `sendMessage` (~L423-427) y en `sendMessageWithAttachments` (~L490-492).
   - Si el import `after` de `next/server` (L6) queda sin uso, quitarlo.

2. **`src/app/(app)/chat/chat-list.tsx`**
   - Quitar `openMarcebotChat` del import (L10) → dejar `import { createChannel } from "./actions";`.
   - Borrar `const [openingBot, startOpenBot] = React.useTransition();` (L21) y `const marcebotActive = ...` (L22).
   - Borrar el bloque del botón fijo `🤖 Marcebot` (div ~L109-129).

3. **`src/app/(app)/chat/list-data.ts`**
   - Quitar del tipo `ChatListData` la propiedad `marcebot: { channelId: string | null; unread: number };` (L32).
   - Borrar el cálculo `marcebotDM` / `marcebot` (~L89-94).
   - Quitar el campo `marcebot` de **ambos** returns: `getChatListData` (~L166) y `getClienteChatList` (~L211).
   - **NO tocar** el filtro anti-bot de `dms` (~L100-105): debe quedarse (si no, el DM del bot reaparece en “Mensajes directos”).

4. **`src/lib/openclaw/bridge.ts`** — **borrar el archivo completo.** (Único importador es `chat/actions.ts`, ya limpiado en el paso 1.) **No** borrar el resto de `src/lib/openclaw/*`.

5. **`src/lib/marcebot/bot.ts`** — *opcional*: borrar la función `isBotDirectChannel` (~L82-92), que queda sin importadores. Dejarla no rompe nada (código muerto inofensivo). **NO** tocar `getOrCreateMarcebotDM` (lo usan WhatsApp inbound y el webhook de OpenClaw).

6. **`src/components/chat/channel-chat.tsx`** — *opcional cosmético*: borrar `const MENTION_BOT` (L22) y simplificar `mentionPool` (~L709-713) a `const mentionPool = members;`, para no ofrecer `@Marcebot` en el autocompletado (ya no respondería).

7. **`src/app/(app)/chat/[id]/page.tsx`** — *opcional cosmético, junto al paso 6*: quitar la query `bots` (~L74-79), su inyección en `members` (~L168-184) y el import `MARCEBOT_EMAIL`/`MARCEBOT_NAME` (L11) si quedan sin uso.

8. **Validar build.** `npm run build` (o `npx tsc --noEmit`) y arreglar cualquier import huérfano restante (típicamente `after` en `actions.ts`).

## Riesgos a vigilar
- **No** borrar el filtro anti-bot de `dms` (list-data.ts ~L100-105).
- **No** borrar `src/lib/openclaw/*` (rompe API v1 `/agent`, `/ask`, `/health`, WhatsApp y el test de Configuración). Solo `bridge.ts`.
- **No** borrar `getOrCreateMarcebotDM` de `bot.ts` (lo usan `src/lib/whatsapp/inbound.ts:101` y `src/app/api/openclaw/inbound/route.ts:116`).
- Quitar `marcebot` del tipo `ChatListData` sin actualizar los **dos** returns + el consumidor `chat-list.tsx` → error de TypeScript en build. Hacerlo en el mismo commit.
- El usuario-bot y los canales DIRECT ya existentes **no** se borran: el canal queda huérfano de UI pero accesible por URL directa `/chat/<id>` (se ve como un DM normal; escribir ya no dispara respuesta). Inofensivo. Cerrarlo del todo requeriría borrar/ocultar esos canales en BD (fuera de alcance).

## ¿Y WhatsApp / API v1 `/agent` / `/ask`?
Son canales conversacionales del **mismo motor** pero **no son “el chat de la app”**. Se dejan intactos. Si más adelante quieres apagarlos también, es un cambio aparte (quitar el enrutado a `runAgent` en `whatsapp/inbound.ts` y devolver 410 en `/api/v1/agent` y `/api/v1/ask`).

## Verificación (Parte B)
- En `/chat`: ya **no** aparece la entrada fija `🤖 Marcebot · Tu asistente · chat directo`. El resto del rail igual.
- Escribir `@Marcebot ...` en un canal → **no** llega respuesta ni el indicador “escribiendo…”.
- El DM de Marcebot **no** reaparece en “Mensajes directos”.
- Inicio: la `MarcebotCard` sigue apareciendo y cargando; el `MarcebotPopup` sigue funcionando.
- El cron/digest sigue enviando DMs/correos del copiloto.
- `npm run build` en verde, sin imports huérfanos.

---

# PARTE C — Mejoras de diseño / UX / móvil / accesibilidad

Ordenadas por relación impacto/esfuerzo. Todas anclan en cómo está hoy el código.

**Ganancias rápidas (alto impacto, bajo esfuerzo):**
1. **`loading.tsx` con esqueletos por ruta** (alto/medio) — no existe **ningún** `loading.tsx` en `src/app/(app)/**`; las páginas son Server Components y la navegación se siente “congelada” hasta que resuelven las consultas. Añadir `loading.tsx` con skeletons por sección.
2. **Componente `EmptyState` reutilizable** (medio/bajo) — hoy los estados vacíos están duplicados con calidad desigual (`proyectos/page.tsx:122` rico vs `facturacion/page.tsx:128` una línea sosa). Unificar en un componente con emoji + título + descripción + CTA.
3. **Componente `PageHeader`** (medio/bajo) — cada sección compone su H1 a mano con estilos distintos (`text-3xl` en proyectos, saludo con emoji en Inicio, `text-sm` en facturación). Estandarizar.
4. **Afordancia de “volver” en detalle en móvil** (alto/bajo) — la Topbar móvil (`topbar.tsx:83`) solo muestra emoji+label sin botón de retroceso en rutas profundas (`/proyectos/[id]`, `/clientes/[id]`, `/facturacion/[id]`, `/revisiones/...`). Añadir back contextual.
5. **Búsqueda global desde móvil** (medio/bajo) — el ⌘K (`CommandPalette`) solo se abre por atajo o por el botón dentro del sidebar (oculto en móvil). Exponerlo en la `bottom-nav` o la topbar móvil.

**Móvil y accesibilidad:**
6. **Objetivos táctiles ≥44px** (alto/medio) — borrar fila/columna en `data-table` es `size-3.5` (~14px, L194/239); varios iconos del sidebar y asas de arrastre igual. Subir el área táctil.
7. **Apilar fechas en paneles estrechos** (medio/trivial) — `grid-cols-2` sin breakpoint en `task-detail.tsx:154`, `task-admin-panel.tsx:144/159/175`, `mis-tareas/task-detail-panel.tsx:161` se aprieta en paneles laterales. Usar `grid-cols-1 sm:grid-cols-2`.
8. **Ocultar columnas secundarias de tablas en móvil** (medio/bajo) — las tablas usan bien `overflow-x-auto` + `min-w`, pero en teléfono obliga a scroll horizontal para ver Estado/Total. Ocultar columnas secundarias (`hidden sm:table-cell`).
9. **Controles con `onClick` en `div` accesibles por teclado** (medio/medio) — 21 ocurrencias de `onClick` en `div/span` no reciben foco ni teclado. Convertir a `<button>` o añadir `role/tabIndex/onKeyDown`.
10. **Contraste AA en navegación atenuada** (medio/bajo) — `text-sidebar-foreground/80` y proyectos anidados `/70` (`sidebar.tsx:156/330`) caen bajo AA para texto pequeño. Subir opacidad/contraste.

**Pulido:**
11. **Unificar “Facturación” vs “Cotizaciones”** (medio/trivial) — el sidebar dice “Facturación” (`sidebar.tsx:358`) pero la migaja dice “Cotizaciones” (`nav-meta.ts:24`). Unificar nomenclatura.
12. **Consistencia de badges de no leídos** (bajo/trivial) — píldora tenue en sidebar vs badge sólido en bottom-nav. Unificar.
13. **Estado vacío/carga en `DataTableView`** (medio/medio) — el `<tbody>` se renderiza vacío sin guía cuando no hay filas (`data-table.tsx:203`).
14. **Micro-feedback `:active` en botones** (bajo/trivial) — `buttonVariants` solo tiene `transition-colors`; añadir `active:scale-[.98]` para feedback táctil.
15. **Tinte de color de cliente en modo oscuro** (bajo/trivial) — `ProjectCard` usa alfa fijo `${t.hex}14` calibrado para fondo claro (`project-card.tsx:27`); ajustar para dark.
16. **Skeleton al abrir el ChatDock de escritorio** (bajo/bajo) — `channel-chat.tsx` ya tiene skeleton, pero abrir el dock y la lista de canales no muestran carga.

---

# PARTE D — Mejoras de funcionalidad

Ordenadas por impacto. Todas encajan en modelos/infra ya existentes.

**Alto impacto:**
1. **Rentabilidad real por proyecto** (alto/medio) — `TimeEntry.minutes` ya se captura pero `User` no tiene tarifa/costo por hora, así que no hay margen real. Añadir `costPerHour`/`ratePerHour` a `User` y un panel costo-horas vs facturado en `/reportes`.
2. **Estimado vs. real de horas** (alto/bajo) — `Task.estimatedMinutes` y `TimeEntry` ya existen pero nunca se comparan. Panel de desviación por tarea/proyecto → afina cotizaciones futuras.
3. **Búsqueda global de contenido** (alto/medio) — `command-palette.tsx` solo indexa páginas, clientes, proyectos y títulos de wiki. Extender a tareas, entregables, notas, archivos, códigos de cotización/factura.
4. **Embudo comercial (kanban de propuestas)** (alto/medio) — la carpeta `src/app/(app)/comercial` está **vacía** y `Proposal/Quote` ya tienen estados. Tablero de oportunidades por etapa + tasa de cierre.
5. **Planeación de capacidad del equipo por horas** (alto/medio) — la “Carga del equipo” solo cuenta tareas abiertas. Con `estimatedMinutes` + `dueDate/startDate` → mapa de carga semanal por persona (detecta sobreasignación).
6. **Conflictos y utilización de equipos** (alto/bajo) — `EquipmentReservation` ya se cruza por `shootDate`, pero no avisa de doble-reserva de la misma cámara/lente el mismo día ni reporta utilización del inventario.
7. **Facturación electrónica (DIAN/Siigo/Alegra)** (alto/grande) — en Colombia es obligatoria; hoy las facturas viven solo en la app. Integración/exportación a Siigo/Alegra o el set de la DIAN.
8. **Facturación recurrente / iguala mensual** (alto/medio) — `Invoice` es snapshot puntual; no hay fee mensual. Con la infra de cron existente, generar facturas recurrentes.

**Medio impacto:**
9. **Cronómetro en vivo para el parte de horas** (medio/bajo) — hoy `TimeEntry` se escribe a mano; botón iniciar/detener por tarea que cree el `TimeEntry` real.
10. **Analítica de rondas de corrección por cliente** (medio/bajo) — `DeliverableDecision` (stage/result, `CORRECCIONES`) ya registra cada ida y vuelta; agregarlo en un reporte de “rondas promedio por cliente/proyecto”.
11. **Estado del proyecto en el portal del cliente** (medio/bajo) — el portal expone entregables/archivos/calendario pero no un estado legible (avance %, próximos hitos, qué espera de él). Usar `Project.progress/stages/dueDate`.
12. **Exportar y programar reportes** (medio/bajo) — `/reportes` es solo pantalla; con `lib/pdf` y `lib/email.ts` ya disponibles, exportar PDF/CSV y envío semanal automático a dirección.
13. **Plantillas completas de cotización por tipo de servicio** (medio/bajo) — `ServicePackage` precarga grupos de ítems, pero no una cotización entera (secciones, intro, alcance, contingencia, IVA) reutilizable por tipo de proyecto.
14. **Semáforo de salud del proyecto en el tablero** (medio/bajo) — combinar tareas vencidas + entregables en `CORRECCIONES`/atrasados + días a `dueDate` + horas sobre estimado → indicador de riesgo en `projects-board.tsx`.
15. **Briefing diario “Mi día” por persona** (medio/bajo) — el cron de Marcebot hace chase cada 2h y cierre semanal, pero no un resumen matutino por usuario (push/campana). *(Ojo: esto es copiloto, no chat — compatible con la Parte B.)*

**Rendimiento:**
16. **Materializar/cachear métricas de reportes** (medio/medio) — `team-performance.tsx` es `force-dynamic` y en cada carga hace varios `groupBy` + `aggregate` global + trae **todas** las invoices con items. Cachear o materializar (tabla resumen actualizada por cron).

---

# Apéndice — Despliegue y verificación global

1. Trabajar en local; tras cada parte: `npm run build` y `npm run lint`.
2. Commit por partes, **solo los archivos tocados** (no `git add -A`). Sugerencia de commits: `seguridad: S1 XSS propuestas`, `seguridad: S2-S5 …`, `chat: quitar chat de Marcebot`, etc.
3. `push` a `main`.
4. En el NAS: `bash /var/services/homes/Labstream/claude-job.sh` (verifica el log `/volume1/docker/labstream-os-deploy.log`).
5. Para S5/S10/S12/S13 hay que **actualizar el `.env` del NAS** antes del deploy (nuevas envs obligatorias) y, en S10, rotar la contraseña de Postgres en el contenedor.
6. Para S11 (CSP) desplegar en Report-Only, observar la consola unos días, luego enforcing.
