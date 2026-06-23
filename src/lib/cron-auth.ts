import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// Autorización de los endpoints de cron (recurring-tasks, calendar-sync, marcebot).
//
// Se EXIGE SIEMPRE `Authorization: Bearer $CRON_SECRET`. No hay excepción "local".
//
// HISTORIA (importante): antes se aceptaba la llamada local del NAS sin secreto, confiando en
// que el puerto sólo escuchaba en loopback (`127.0.0.1:3200:3000`) y por tanto sólo el propio
// host podía originar la petición. Eso dejó de ser cierto: para que el Document Server de
// OnlyOffice alcance el callback de la app, el `docker-compose.yml` ahora publica también
// `192.168.0.22:3200` (IP LAN). Con el puerto expuesto a la LAN, comprobar `Host: localhost`
// es FALSIFICABLE: cualquiera en la red puede hacer
// `curl -H "Host: localhost" http://192.168.0.22:3200/api/cron/...` y la app no puede distinguir
// por qué interfaz entró la conexión (las cabeceras son idénticas a las de una llamada loopback).
// Por eso se eliminó el bypass y el secreto pasa a ser obligatorio para TODAS las llamadas.
//
// El Programador de tareas del NAS debe enviar el header con el secreto guardado en el `.env`
// del NAS (`CRON_SECRET`). Si `CRON_SECRET` no está configurado, los endpoints quedan cerrados.

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sin secreto configurado, los endpoints de cron quedan cerrados
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return safeEqual(header, secret);
}
