import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// Autorización de los endpoints de cron (calendar-sync, marcebot).
//
// Se aceptan de dos formas:
//   1. Llamada LOCAL del propio NAS: el Programador de tareas hace
//      `curl http://localhost:3200/api/cron/...`. Esa petición llega DIRECTO al
//      contenedor (Host: localhost) y NO pasa por el reverse proxy de DSM, que es quien
//      añade X-Forwarded-For / X-Real-IP y reescribe el Host al dominio público. Como el
//      puerto del contenedor solo escucha en 127.0.0.1, una petición con Host local y sin
//      cabeceras de proxy únicamente puede originarse en el propio NAS → de confianza. Así
//      la tarea del NAS no tiene que guardar el secreto.
//   2. Llamada EXTERNA (vía dominio público / reverse proxy): se exige el header
//      `Authorization: Bearer $CRON_SECRET`, igual que antes.

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function isLocalNas(req: NextRequest): boolean {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  const proxied = !!req.headers.get("x-forwarded-for") || !!req.headers.get("x-real-ip");
  return local && !proxied;
}

export function cronAuthorized(req: NextRequest): boolean {
  if (isLocalNas(req)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sin secreto configurado, el endpoint externo queda cerrado
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return safeEqual(header, secret);
}
