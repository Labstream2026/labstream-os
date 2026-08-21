import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { accessibleProjectWhere } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import type { SessionUser } from "@/lib/session";

// ── Núcleo de guardado de una nota ──
// Compartido por el server action (/notas, autoguardado con debounce) y por la ruta
// /api/notas/autosave, que recibe el último borrador por `sendBeacon` cuando la pestaña se
// cierra o se oculta. Al vivir aquí, ambos caminos aplican EXACTAMENTE las mismas reglas:
// acceso al proyecto/cliente, saneado de campos y — sobre todo — el CONTROL DE CONCURRENCIA.
//
// Concurrencia: el editor manda `baseUpdatedAt` = la última versión que él conoce. Si en la
// base hay una versión MÁS NUEVA y distinta, alguien la editó en otro dispositivo o pestaña:
// no se pisa en silencio, se devuelve `conflict` con la versión del servidor para que el
// usuario decida. (El camino de salida — sendBeacon — no tiene con quién hablar; ver
// `onConflict` abajo.)

export type NoteSaveInput = {
  id?: string;
  title?: string;
  content?: string;
  category?: string | null;
  projectId?: string | null;
  clientId?: string | null;
  color?: string | null;
  remindAt?: string | null;
  visibility?: string | null;
  // Última versión conocida por quien edita (ISO). Sin ella no hay control de concurrencia.
  baseUpdatedAt?: string | null;
};

export type NoteServerVersion = { title: string; content: string; updatedAt: string };

export type NoteSaveResult =
  | { ok: true; id: string; title: string; createdAt: string; updatedAt: string }
  | { ok: false; error: string; conflict?: boolean; server?: NoteServerVersion };

// Qué hacer si al guardar resulta que la nota cambió en otro lado:
//  · "ask"  → no se escribe nada; se devuelve la versión del servidor para preguntar (editor).
//  · "keep-both" → se escribe lo nuestro CONSERVANDO lo del servidor al final, separado y
//    fechado. Lo usa la salida por sendBeacon: ahí no hay a quién preguntar y perder texto
//    (de cualquiera de los dos lados) sería peor que dejar la nota con las dos versiones.
//  · "force" → se escribe lo nuestro tal cual (el usuario ya eligió «conservar lo mío»).
export type NoteConflictMode = "ask" | "keep-both" | "force";

function fmtBogota(d: Date): string {
  try {
    return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return d.toISOString();
  }
}

export async function persistNote(
  session: SessionUser,
  input: NoteSaveInput,
  onConflict: NoteConflictMode = "ask",
): Promise<NoteSaveResult> {
  let content = (input.content ?? "").trim();
  const title = (input.title ?? "").trim() || content.replace(/\s+/g, " ").slice(0, 60) || "Nota sin título";
  const category = (input.category ?? "")?.toString().trim() || null;

  // Proyecto vinculado (opcional). `undefined` = no tocar; "" o id inaccesible → se deja sin proyecto.
  let projectId: string | null | undefined = undefined;
  if (input.projectId !== undefined) {
    projectId = null;
    if (input.projectId) {
      const p = await db.project.findFirst({ where: { AND: [accessibleProjectWhere(session), { id: input.projectId }] }, select: { id: true } });
      if (p) projectId = p.id;
    }
  }
  // Cliente vinculado (opcional, mismo patrón): solo se guarda si es accesible para el usuario.
  let clientId: string | null | undefined = undefined;
  if (input.clientId !== undefined) {
    clientId = null;
    if (input.clientId) {
      const c = await db.client.findFirst({ where: { AND: [accessibleClientWhere(session), { id: input.clientId }] }, select: { id: true } });
      if (c) clientId = c.id;
    }
  }
  // Color (clave de paleta) y recordatorio. `undefined` = no tocar. Al fijar un recordatorio
  // se resetea reminderSentAt para que el cron lo dispare de nuevo.
  let color: string | null | undefined = undefined;
  if (input.color !== undefined) color = (input.color ?? "").toString().trim() || null;
  let remindAt: Date | null | undefined = undefined;
  if (input.remindAt !== undefined) {
    remindAt = null;
    if (input.remindAt) { const d = new Date(input.remindAt); if (!Number.isNaN(d.getTime())) remindAt = d; }
  }
  // Visibilidad (compartir): solo valores válidos; cualquier otro cae a "private".
  let visibility: string | undefined = undefined;
  if (input.visibility !== undefined) {
    const v = String(input.visibility);
    visibility = ["private", "project", "team"].includes(v) ? v : "private";
  }

  if (input.id) {
    const existing = await db.note.findUnique({ where: { id: input.id }, select: { createdById: true, archivedAt: true, title: true, content: true, updatedAt: true } });
    // Nota nueva creada con un id DEL CLIENTE (flujo offline): el id lo generó el editor para
    // tener una nota estable sin conexión, y al sincronizar llega aquí. Como el id es la clave,
    // reenviar el mismo «crear» es idempotente: la primera vez CREA con ese id; las siguientes
    // caen en el UPDATE de abajo. Así una nota escrita offline nunca se duplica al volver la red.
    if (!existing) {
      const n = await db.note.create({
        data: { id: input.id, title, content, category, source: "app", createdById: session.id, projectId: projectId ?? null, clientId: clientId ?? null, color: color ?? null, remindAt: remindAt ?? null, visibility: visibility ?? "private" },
        select: { id: true, title: true, createdAt: true, updatedAt: true },
      });
      await logActivity({ action: "note.create", summary: `creó la nota «${title}»`, entityType: "note", entityId: n.id }).catch(() => null);
      return { ok: true, id: n.id, title: n.title, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() };
    }
    if (existing.createdById !== session.id && session.role !== "admin") return { ok: false, error: "No autorizado" };
    // Si la nota se mandó a la papelera mientras el editor tenía un guardado pendiente, ese
    // guardado NO la resucita: se descarta en silencio.
    if (existing.archivedAt) return { ok: false, error: "La nota está en la papelera" };

    if (onConflict !== "force" && input.baseUpdatedAt) {
      const base = new Date(input.baseUpdatedAt);
      const changedElsewhere =
        !Number.isNaN(base.getTime()) &&
        existing.updatedAt.getTime() > base.getTime() &&
        (existing.content !== content || existing.title !== title);
      if (changedElsewhere) {
        if (onConflict === "ask") {
          return {
            ok: false,
            error: "La nota cambió en otro lugar",
            conflict: true,
            server: { title: existing.title, content: existing.content, updatedAt: existing.updatedAt.toISOString() },
          };
        }
        // "keep-both": nada se pierde; la otra versión queda abajo, fechada y señalada.
        content = `${content}\n\n---\n\n> ⚠️ Versión guardada en otro dispositivo (${fmtBogota(existing.updatedAt)}). Revisa y borra la que no sirva.\n\n${existing.content}`;
      }
    }

    const n = await db.note.update({
      where: { id: input.id },
      data: {
        title,
        content,
        category,
        ...(projectId !== undefined ? { projectId } : {}),
        ...(clientId !== undefined ? { clientId } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(remindAt !== undefined ? { remindAt, reminderSentAt: null } : {}),
        ...(visibility !== undefined ? { visibility } : {}),
      },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return { ok: true, id: n.id, title: n.title, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() };
  }

  const n = await db.note.create({
    data: { title, content, category, source: "app", createdById: session.id, projectId: projectId ?? null, clientId: clientId ?? null, color: color ?? null, remindAt: remindAt ?? null, visibility: visibility ?? "private" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  await logActivity({ action: "note.create", summary: `creó la nota «${title}»`, entityType: "note", entityId: n.id }).catch(() => null);
  return { ok: true, id: n.id, title: n.title, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() };
}
