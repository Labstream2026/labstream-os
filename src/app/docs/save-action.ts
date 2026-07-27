"use server";

import { SignJWT } from "jose";
import { getSession } from "@/lib/auth";
import { getOnlyOfficeConfig } from "@/lib/onlyoffice";

// ── Guardar AHORA un documento abierto ──
// OnlyOffice, por defecto, solo escribe el archivo cuando el ÚLTIMO editor cierra el documento
// (unos segundos después). Hasta ese momento el trabajo vive únicamente en el Document Server:
// si se cae o se reinicia el NAS, ese tramo se pierde.
//
// Esto le pide al Document Server un «forcesave» de la sesión de edición: el DS llama a nuestro
// callback con status 6 y el archivo queda escrito en disco. Lo usa el botón «Guardar ahora» de
// la cabecera del editor y el guardado automático cada pocos minutos.
//
// La `key` es la de la sesión de edición (`<id>_<versión>`); no da acceso a nada: forzar el
// guardado solo escribe el contenido que el propio Document Server ya tiene.

export type ForceSaveResult = { ok: boolean; nothingToSave?: boolean; error?: string };

export async function forceSaveDoc(key: string): Promise<ForceSaveResult> {
  const session = await getSession();
  if (!session || session.role === "demo") return { ok: false, error: "No autorizado" };
  const k = (key ?? "").trim();
  if (!k) return { ok: false, error: "Falta la referencia del documento" };

  const cfg = await getOnlyOfficeConfig();
  if (!cfg.enabled) return { ok: false, error: "OnlyOffice no está conectado" };
  const base = (cfg.internalUrl || cfg.docsUrl).replace(/\/$/, "");

  const payload: Record<string, unknown> = { c: "forcesave", key: k };
  const token = cfg.jwtSecret
    ? await new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .sign(new TextEncoder().encode(cfg.jwtSecret))
    : "";

  try {
    const res = await fetch(`${base}/coauthoring/CommandService.ashx`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(token ? { ...payload, token } : payload),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { ok: false, error: `El servidor de documentos respondió ${res.status}` };
    const data = (await res.json().catch(() => ({}))) as { error?: number };
    // 0 = guardado. 4 = «no hay cambios desde el último guardado» → para el usuario es un éxito.
    if (data.error === 0) return { ok: true };
    if (data.error === 4) return { ok: true, nothingToSave: true };
    return { ok: false, error: `No se pudo guardar (código ${data.error ?? "desconocido"})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo contactar al servidor de documentos" };
  }
}
