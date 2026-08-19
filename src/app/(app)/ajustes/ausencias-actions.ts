"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { notifyAndEmail } from "@/lib/notify";

// ── Registrar y quitar AUSENCIAS (vacaciones, incapacidades, permisos) ──────
// Vive en Ajustes → Equipo y lo gestiona quien administra usuarios. Una ausencia registrada
// hace tres cosas solas: encoge la capacidad en la Carga del equipo y en las sugerencias de
// plantilla, exime del cumplimiento las tareas que venzan dentro, y le avisa a la persona.

const TIPOS = new Set(["VACACIONES", "INCAPACIDAD", "PERMISO", "OTRO"]);
const TIPO_LABEL: Record<string, string> = { VACACIONES: "vacaciones", INCAPACIDAD: "incapacidad", PERMISO: "permiso", OTRO: "ausencia" };

export async function crearAusencia(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_usuarios")) return { ok: false, error: "Sin permiso." };

  const userId = String(formData.get("userId") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const desde = String(formData.get("desde") ?? "");
  const hasta = String(formData.get("hasta") ?? "").trim() || desde; // un solo día si no hay fin
  const nota = String(formData.get("nota") ?? "").trim().slice(0, 200) || null;

  if (!TIPOS.has(tipo)) return { ok: false, error: "Tipo inválido." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return { ok: false, error: "Faltan las fechas." };
  if (hasta < desde) return { ok: false, error: "La fecha final es anterior a la inicial." };
  // Un año de tope: más que eso no es una ausencia, es un retiro — y un dedazo en el año
  // dejaría a alguien «de vacaciones» hasta 2036 descontando capacidad para siempre.
  if (new Date(hasta).getTime() - new Date(desde).getTime() > 366 * 86_400_000) {
    return { ok: false, error: "Ese rango supera un año. Revisa las fechas." };
  }

  const persona = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, active: true } });
  if (!persona?.active) return { ok: false, error: "Esa persona no existe o está desactivada." };

  // Mediodía UTC, como todas las fechas de calendario de la casa: no salta de día al formatear.
  const a = await db.absence.create({
    data: {
      userId,
      createdById: session.id,
      tipo,
      startDate: new Date(`${desde}T12:00:00.000Z`),
      endDate: new Date(`${hasta}T12:00:00.000Z`),
      nota,
    },
    select: { id: true },
  });

  const rango = desde === hasta ? `el ${desde}` : `del ${desde} al ${hasta}`;
  await logActivity({
    action: "ausencia.crear",
    summary: `registró ${TIPO_LABEL[tipo]} de ${persona.name} ${rango}`,
    entityType: "ausencia",
    entityId: a.id,
  }).catch(() => {});
  // La persona se entera de lo que se registró a su nombre — nada sobre ella sin ella.
  if (persona.id !== session.id) {
    await notifyAndEmail(persona.id, {
      type: "equipo",
      event: "ausencia",
      title: `Se registró tu ${TIPO_LABEL[tipo]}`,
      body: `${rango[0].toUpperCase()}${rango.slice(1)}${nota ? ` · ${nota}` : ""}. Tus tareas que venzan en esas fechas no contarán en tu cumplimiento, y tu capacidad semanal se ajusta sola.`,
      actorId: session.id,
    }).catch(() => {});
  }

  revalidatePath("/ajustes");
  return { ok: true };
}

export async function eliminarAusencia(id: string): Promise<void> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_usuarios")) return;
  const a = await db.absence.findUnique({ where: { id }, select: { id: true, tipo: true, user: { select: { name: true } } } });
  if (!a) return;
  await db.absence.delete({ where: { id } });
  await logActivity({
    action: "ausencia.eliminar",
    summary: `quitó la ${TIPO_LABEL[a.tipo] ?? "ausencia"} registrada de ${a.user.name}`,
    entityType: "ausencia",
    entityId: id,
  }).catch(() => {});
  revalidatePath("/ajustes");
}
