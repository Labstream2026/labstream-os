"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageProject, userCanAccessProject, PROJECT_ACCESS_SELECT } from "@/lib/project-access";
import { noAutorizado } from "@/lib/authz-error";
import { logActivity } from "@/lib/activity";
import { notifyMany } from "@/lib/notify";

// ── Acciones de la HOJA DE LLAMADO ──────────────────────────────────────────
// Crear/editar/enviar exige GESTIONAR el proyecto (produce quien produce). Confirmar
// asistencia es de cada citado. La hoja nace PRE-LLENADA: el equipo del proyecto como
// personas, el plan de equipos de esa fecha si existe, y la locación del evento de
// calendario del día si hay uno.

async function proyectoSiGestiono(projectId: string) {
  const session = await getSession();
  if (!session || session.role === "demo" || session.role === "cliente") return { session: null, proyecto: null };
  const proyecto = await db.project.findUnique({
    where: { id: projectId },
    select: { ...PROJECT_ACCESS_SELECT, id: true, name: true },
  });
  if (!proyecto || !canManageProject(proyecto, session)) return { session: null, proyecto: null };
  return { session, proyecto };
}

const aMediodia = (ymd: string) => new Date(`${ymd}T12:00:00.000Z`);
const HORA_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const horaLimpia = (s: unknown): string | null => {
  const t = String(s ?? "").trim();
  return HORA_RE.test(t) ? t : null;
};

export async function crearLlamado(projectId: string, formData: FormData) {
  const { session, proyecto } = await proyectoSiGestiono(projectId);
  if (!session || !proyecto) noAutorizado();

  const ymd = String(formData.get("fecha") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Falta la fecha del rodaje.");
  const fecha = aMediodia(ymd);
  const ventana = { gte: new Date(`${ymd}T00:00:00.000Z`), lt: new Date(`${ymd}T23:59:59.999Z`) };

  // Pre-llenado desde lo que el proyecto ya sabe de ese día.
  const [miembros, plan, evento] = await Promise.all([
    db.projectMember.findMany({
      where: { projectId },
      select: { userId: true, role: true, user: { select: { title: true } } },
    }),
    db.equipmentPlan.findFirst({ where: { projectId, shootDate: fecha }, select: { id: true, title: true } }),
    db.calendarEvent.findFirst({
      where: { projectId, start: ventana },
      orderBy: { start: "asc" },
      select: { title: true, location: true, start: true, allDay: true },
    }),
  ]);

  // Citación por defecto: la hora del evento del día (en Bogotá) o 07:00, el estándar de rodaje.
  const horaEvento =
    evento && !evento.allDay
      ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(evento.start)
      : null;

  const sheet = await db.callSheet.create({
    data: {
      projectId,
      fecha,
      titulo: evento?.title ?? null,
      citacionGeneral: horaEvento ?? "07:00",
      locacion: evento?.location ?? null,
      equipmentPlanId: plan?.id ?? null,
      createdById: session!.id,
      bloques: [
        { hora: horaEvento ?? "07:00", actividad: "Citación y montaje", notas: "" },
        { hora: "", actividad: "", notas: "" },
      ],
      personas: {
        create: miembros.map((m, i) => ({
          userId: m.userId,
          rol: m.role || m.user?.title || null,
          position: i,
        })),
      },
    },
    select: { id: true },
  });

  await logActivity({
    action: "llamado.crear",
    summary: `creó la hoja de llamado del ${ymd}`,
    projectId,
    entityType: "llamado",
    entityId: sheet.id,
    silent: true,
  });
  revalidatePath(`/proyectos/${projectId}`);
  redirect(`/proyectos/${projectId}/llamado/${sheet.id}`);
}

type PersonaEntrada = {
  id?: string | null;
  userId?: string | null;
  nombre?: string | null;
  rol?: string | null;
  telefono?: string | null;
  citacion?: string | null;
};

/** Guardar TODO de una vez: campos de la hoja + la lista de personas reconciliada. */
export async function guardarLlamado(sheetId: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const sheet = await db.callSheet.findUnique({ where: { id: sheetId }, select: { projectId: true } });
  if (!sheet) return { ok: false, error: "La hoja ya no existe." };
  const { session } = await proyectoSiGestiono(sheet.projectId);
  if (!session) return { ok: false, error: "Solo quien gestiona el proyecto edita la hoja." };

  const txt = (k: string, max = 500) => String(formData.get(k) ?? "").trim().slice(0, max) || null;

  // Cronograma: filas con al menos hora o actividad; horas saneadas.
  let bloques: { hora: string; actividad: string; notas: string }[] = [];
  try {
    const crudo = JSON.parse(String(formData.get("bloques") ?? "[]")) as Record<string, unknown>[];
    bloques = (Array.isArray(crudo) ? crudo : [])
      .map((b) => ({
        hora: horaLimpia(b.hora) ?? "",
        actividad: String(b.actividad ?? "").trim().slice(0, 200),
        notas: String(b.notas ?? "").trim().slice(0, 300),
      }))
      .filter((b) => b.hora || b.actividad)
      .slice(0, 40);
  } catch {
    return { ok: false, error: "El cronograma llegó dañado. Recarga la página." };
  }

  // Personas: reconciliar — las que vienen se conservan/actualizan, las que no, se van.
  let personas: PersonaEntrada[] = [];
  try {
    const crudo = JSON.parse(String(formData.get("personas") ?? "[]")) as Record<string, unknown>[];
    personas = (Array.isArray(crudo) ? crudo : []).slice(0, 60).map((p) => ({
      id: typeof p.id === "string" && p.id ? p.id : null,
      userId: typeof p.userId === "string" && p.userId ? p.userId : null,
      nombre: String(p.nombre ?? "").trim().slice(0, 120) || null,
      rol: String(p.rol ?? "").trim().slice(0, 80) || null,
      telefono: String(p.telefono ?? "").trim().slice(0, 40) || null,
      citacion: horaLimpia(p.citacion),
    }));
  } catch {
    return { ok: false, error: "La lista de personas llegó dañada. Recarga la página." };
  }

  await db.$transaction(async (tx) => {
    await tx.callSheet.update({
      where: { id: sheetId },
      data: {
        titulo: txt("titulo", 160),
        citacionGeneral: horaLimpia(formData.get("citacionGeneral")),
        locacion: txt("locacion", 160),
        direccion: txt("direccion", 300),
        indicaciones: txt("indicaciones", 600),
        clienteEnSet: txt("clienteEnSet", 200),
        notas: txt("notas", 1000),
        bloques,
      },
    });

    const actuales = await tx.callSheetPerson.findMany({ where: { sheetId }, select: { id: true } });
    const vivos = new Set(personas.map((p) => p.id).filter(Boolean) as string[]);
    const fuera = actuales.filter((a) => !vivos.has(a.id)).map((a) => a.id);
    if (fuera.length) await tx.callSheetPerson.deleteMany({ where: { id: { in: fuera }, sheetId } });

    for (let i = 0; i < personas.length; i++) {
      const p = personas[i];
      if (p.id) {
        // La CONFIRMACIÓN no se toca al editar: cambiar el rol no des-confirma a nadie.
        await tx.callSheetPerson.updateMany({
          where: { id: p.id, sheetId },
          data: { rol: p.rol, telefono: p.telefono, citacion: p.citacion, nombre: p.userId ? null : p.nombre, position: i },
        });
      } else {
        // Nueva: del equipo (userId) o externa (nombre). El unique (sheetId, userId) evita
        // duplicar a alguien del equipo — si ya está, se ignora.
        await tx.callSheetPerson
          .create({ data: { sheetId, userId: p.userId, nombre: p.userId ? null : p.nombre, rol: p.rol, telefono: p.telefono, citacion: p.citacion, position: i } })
          .catch(() => null);
      }
    }
  });

  revalidatePath(`/proyectos/${sheet.projectId}/llamado/${sheetId}`);
  revalidatePath(`/proyectos/${sheet.projectId}`);
  return { ok: true };
}

/** Enviar la hoja: aviso in-app (+push/correo según preferencia) a cada citado con cuenta. */
export async function enviarLlamado(sheetId: string): Promise<{ ok: boolean; error?: string; avisados?: number }> {
  const sheet = await db.callSheet.findUnique({
    where: { id: sheetId },
    select: {
      id: true, projectId: true, fecha: true, titulo: true, citacionGeneral: true, locacion: true,
      project: { select: { name: true } },
      personas: { select: { userId: true, citacion: true } },
    },
  });
  if (!sheet) return { ok: false, error: "La hoja ya no existe." };
  const { session } = await proyectoSiGestiono(sheet.projectId);
  if (!session) return { ok: false, error: "Solo quien gestiona el proyecto la envía." };

  const fechaTxt = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" }).format(sheet.fecha);
  const ids = sheet.personas.map((p) => p.userId).filter(Boolean) as string[];

  await notifyMany(ids, {
    type: "llamado",
    event: "llamado.enviado",
    title: `📋 Hoja de llamado: ${sheet.titulo ?? `rodaje ${sheet.project.name}`}`,
    body: `${fechaTxt}${sheet.citacionGeneral ? ` · citación ${sheet.citacionGeneral}` : ""}${sheet.locacion ? ` · ${sheet.locacion}` : ""} — confirma tu asistencia.`,
    link: `/proyectos/${sheet.projectId}/llamado/${sheet.id}`,
    actorId: session!.id,
    projectId: sheet.projectId,
    groupKey: `llamado:${sheet.id}`,
    priority: 1,
  });

  await db.callSheet.update({ where: { id: sheetId }, data: { estado: "ENVIADA", sentAt: new Date() } });
  await logActivity({
    action: "llamado.enviar",
    summary: `envió la hoja de llamado del ${fechaTxt} (${ids.length} persona${ids.length === 1 ? "" : "s"})`,
    projectId: sheet.projectId,
    entityType: "llamado",
    entityId: sheet.id,
  });
  revalidatePath(`/proyectos/${sheet.projectId}/llamado/${sheetId}`);
  return { ok: true, avisados: ids.length };
}

/** Confirmar MI asistencia (cada citado la suya; no hay confirmar por otro). */
export async function confirmarLlamado(sheetId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sin sesión." };
  const r = await db.callSheetPerson.updateMany({
    where: { sheetId, userId: session.id, confirmadoAt: null },
    data: { confirmadoAt: new Date() },
  });
  if (r.count === 0) {
    const existe = await db.callSheetPerson.findFirst({ where: { sheetId, userId: session.id }, select: { id: true } });
    if (!existe) return { ok: false, error: "No estás citado en esta hoja." };
  }
  const sheet = await db.callSheet.findUnique({ where: { id: sheetId }, select: { projectId: true } });
  if (sheet) revalidatePath(`/proyectos/${sheet.projectId}/llamado/${sheetId}`);
  return { ok: true };
}

export async function revocarEnlaceLlamado(sheetId: string, revocar: boolean): Promise<void> {
  const sheet = await db.callSheet.findUnique({ where: { id: sheetId }, select: { projectId: true } });
  if (!sheet) return;
  const { session } = await proyectoSiGestiono(sheet.projectId);
  if (!session) return;
  await db.callSheet.update({ where: { id: sheetId }, data: { publicRevokedAt: revocar ? new Date() : null } });
  revalidatePath(`/proyectos/${sheet.projectId}/llamado/${sheetId}`);
}

export async function eliminarLlamado(sheetId: string): Promise<void> {
  const sheet = await db.callSheet.findUnique({ where: { id: sheetId }, select: { projectId: true } });
  if (!sheet) return;
  const { session } = await proyectoSiGestiono(sheet.projectId);
  if (!session) noAutorizado();
  await db.callSheet.delete({ where: { id: sheetId } });
  await logActivity({ action: "llamado.eliminar", summary: "eliminó una hoja de llamado", projectId: sheet.projectId, entityType: "llamado" });
  revalidatePath(`/proyectos/${sheet.projectId}`);
  redirect(`/proyectos/${sheet.projectId}?tab=calendario`);
}

// ¿Puede VER la hoja? Cualquiera con acceso al proyecto (el documento es de coordinación).
export async function puedeVerLlamado(projectId: string): Promise<boolean> {
  const session = await getSession();
  return userCanAccessProject(projectId, session);
}
