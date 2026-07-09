# Auditoría funcional — Labstream OS (os.labstreamsas.com)

> **Fecha:** 2026-07-09 · **Método:** recorrido completo de la UI en producción (sesión real en Chrome), logs de 7 días del contenedor, conteos reales de la BD, `.env` del NAS y código fuente (`main` al día).
> Complementa a `PLAN-AUDITORIA-2026-07.md` (seguridad). Este documento es SOLO funcionalidad.

## Veredicto general

La app está **sana y en uso real intensivo**: 14 miembros activos, 27 proyectos, ~40 entregables en revisión, chat vivo (los no-leídos subían durante la propia auditoría), 8.600 notificaciones generadas, 104 migraciones aplicadas sin pendientes, logs de 7 días sin errores de servidor (salvo lo anotado abajo). El flujo central del negocio (subir versión → revisar con comentarios por segundo → aprobar/pedir cambios → enlace público para el cliente con contador de visitas) **funciona de punta a punta**.

Los hallazgos son concretos y casi todos de bajo esfuerzo.

---

## Hallazgos (priorizados)

### F1 · 🔴 Asistente IA muerto en producción — falta `ANTHROPIC_API_KEY`
- **Síntoma:** `/asistente` muestra "IA no configurada (falta ANTHROPIC_API_KEY)". Todo lo LLM (asistente, Marcebot inteligente) está degradado; lo que se ve de Marcebot en chat/inicio es lo automático no-LLM.
- **Causa:** el `.env` del NAS (`/volume1/docker/labstream-os/.env`) no define `ANTHROPIC_API_KEY` (verificado). El compose la pasa vacía.
- **Arreglo:** añadir la clave al `.env` del NAS y `docker compose -p labstream-os up -d app` (recrear app). No requiere código.
- **Nota:** el `.env` tiene `CRON_SECRET` **duplicada** (2 líneas) — inofensivo pero conviene limpiar.

### F2 · 🔴 Zona horaria: saludo incorrecto + errores de hidratación React #418 en TODA la app
- **Síntoma:** a las 3:55 PM el inicio dice "Buenas noches"; la consola registra `Minified React error #418` (texto servidor ≠ cliente) en prácticamente todas las páginas.
- **Causa:** el contenedor corre con `TZ=UTC` (a propósito, por el calendario). Pero `src/app/(app)/page.tsx:21-25` (`greeting()`) usa `new Date().getHours()` sin timezone → el servidor calcula la hora en UTC y el cliente en Bogotá. Hay ~20 archivos que usan `toLocaleDateString/toLocaleString` sin `timeZone`, generando el mismo desajuste de hidratación por fechas.
- **Arreglo:** usar `lib/bogota-time.ts` (`APP_TZ`) en `greeting()`/`todayLabel()` y pasar `timeZone: APP_TZ` en todo formateo visible; barrido de los ~20 archivos.
- **Impacto real:** además del saludo, cualquier fecha "de hoy" puede correrse ±1 día para el usuario entre las 7 PM y medianoche de Bogotá.

### F3 · 🟠 Tras cada deploy, las pestañas abiertas quedan rotas ("Failed to find Server Action")
- **Síntoma:** los logs de producción de las últimas 48 h muestran ~10 errores `Failed to find Server Action ... older or newer deployment`. Con deploys frecuentes y un equipo que vive en la app, cada deploy deja a los usuarios con botones que fallan en silencio hasta recargar.
- **Arreglo recomendado:** detectar el fallo de acción/versión en el cliente y mostrar aviso "Hay una versión nueva — recarga la página" (o auto-reload). Next 16 no conserva builds viejos en standalone; la mitigación es UX.

### F4 · 🟠 `/cotizaciones` tiene el título equivocado: dice "Facturación"
- **Causa:** `src/app/(app)/cotizaciones/page.tsx:81` → `title="Facturación"`. La página de Cotizaciones y la de Facturación muestran el mismo encabezado; confunde la navegación.
- **Extra:** el subtítulo dice "1 propuestas" (concordancia singular/plural).

### F5 · 🟡 Estados de proyecto no reflejan el avance
- **Síntoma:** proyectos con barra al **100%** siguen "En planeación" (p. ej. LOREAL PARIS, Grabacion Junio); DOVE al 50% también "En planeación".
- **Sugerencia:** o auto-avanzar el estado por hitos/avance, o al menos avisar la incongruencia en la tarjeta. Hoy el tablero por estado miente respecto al trabajo real.

### F6 · 🟡 Canales de configuración sin datos / features apagadas silenciosamente (`.env`)
Verificado en el `.env` del NAS — vacíos y por tanto la función está APAGADA sin que la UI lo diga (excepto el asistente):
- `VAPID_*` → **push del navegador desactivado** (las notificaciones solo viven dentro de la app).
- `RESEND_API_KEY` / `SMTP_*` → **la app no puede enviar correo** (invitaciones/avisos por email).
- `EVOLUTION_*` → canal WhatsApp desactivado.
- `CALDAV_*` → vacío en `.env` (la sync de calendario funciona porque las conexiones se guardan por usuario en BD — `CalendarConnection`=10, `EventSyncRef`=68 — pero conviene confirmar que no haya rutas que dependan del `.env`).
Decidir cuáles se quieren activas y poblar el `.env`; y valorar mostrar en Configuración un panel "estado de integraciones" que diga qué está apagado (como ya hace el asistente).

### F7 · 🟡 Reportes: "Horas registradas" siempre "—"
No hay registro de horas en ninguna parte de la app (no existe módulo de time-tracking). La tarjeta promete un dato que nunca existirá tal como está. Quitarla o construir la captura de horas.

### F8 · ⚪ Higiene de datos menor
- Canales de chat con **0 miembros** ("Lanzamientos Hot Jamin", "Nutra").
- Biblioteca: recursos apuntan a **letras de unidad del PC de quien los creó** (`O:\`, `E:\`, `P:\`) — en otro PC esas rutas no existen. Sugerencia: guardar además la ruta UNC (`\\192.168.0.22\share\...`).
- `/estados` arrastra muchos mensajes "Borrado · visible solo para admin" al inicio del historial (ruido para admins).

---

## Lo que se probó y funciona bien ✅

| Módulo | Estado |
|---|---|
| Inicio (radar Marcebot no-LLM, cronograma, KPIs) | ✅ carga con datos reales |
| Mis tareas (filtros, urgencia, cumplimiento) | ✅ |
| Chat (canales por cliente/interno, no-leídos en vivo, adjuntos, reacciones) | ✅ uso intenso |
| Calendario del equipo (4 calendarios, colores por persona, cronograma) | ✅ denso y funcional |
| Proyectos (tableros vertical/horizontal/lista, % avance) | ✅ (ver F5) |
| **Revisiones** (player, comentarios por segundo, dibujar/anotar, velocidad, pre-aprobar/cambios, enlace cliente + visitas + revocar) | ✅ flujo completo |
| Mis entregas (campañas por cliente, piezas aprobadas/pendientes) | ✅ |
| Clientes (ficha, apariencia, portal de personas, accesos) | ✅ |
| Facturación (por facturar/cobrar/vencido, facturas emitidas) | ✅ datos coherentes |
| Comercial (embudo borrador→cierre) | ✅ (poco uso aún) |
| Wiki (documentación, inventario 77 equipos, ubicación, credenciales cifradas, plantillas) | ✅ |
| Biblioteca (recursos NAS/Drive) | ✅ (ver F8) |
| Recordatorios (una vez/recurrentes, para otros, push+Marcebot) | ✅ UI correcta (0 activos) |
| Configuración (usuarios, roles, API keys con scopes y último uso, Marcebot, marca) | ✅ API keys de OpenClaw activas ("uso hace 9 min") |
| Crons DSM (Marcebot, LabstreamCalendarSync, horarios) | ✅ existen y corren; endpoints cron devuelven 401 sin Bearer (bien cerrados) |
| Infra: `/api/v1/health` (401 sin key = por diseño), TLS válido, 104 migraciones al día, logs de 7 días limpios | ✅ |

## Uso real por módulo (filas en BD, 2026-07-09)

Muy usado: Notification 8.603 · ActivityLog 1.691 · ChatMessage 471 · Task 199 · ReviewComment 148 · DeliverableVersion 118 · Deliverable 74 · CalendarEvent 28+93 asistentes · Project 27.
Poco/no usado: Note 8 · Reminder 2 · EquipmentPlan 2 · MyDayItem 5 · Propuestas/cotizaciones (3 documentos) · facturas 2.

## Cómo se auditó
- UI: sesión real (Chrome) recorriendo 20+ páginas con captura y consola por página.
- Servidor: `docker logs` 48h/168h; `.env` (solo nombres); `pg_stat_user_tables`; crontab + synoschedtask del DSM.
- Código: `main` actualizado; verificación de los fixes de seguridad de PLAN-AUDITORIA (S1/S2/S8/Parte C **sí están en `main`**).
