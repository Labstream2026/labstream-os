import { db } from "@/lib/db";
import { loadInventory } from "@/lib/equipos";
import type { LlamadoDoc, LlamadoBloque } from "@/components/llamado-document";

// ── Armar el DOCUMENTO de una hoja de llamado ───────────────────────────────
// Un solo ensamblador para las tres vistas (interna, impresión y enlace público): la hoja,
// sus personas (con nombre/teléfono reales del equipo o los del externo), el cronograma y
// los equipos del plan vinculado con sus nombres del inventario.

export type SheetCompleta = NonNullable<Awaited<ReturnType<typeof cargarSheet>>>;

export async function cargarSheet(sheetId: string) {
  return db.callSheet.findUnique({
    where: { id: sheetId },
    include: {
      project: { select: { id: true, name: true, client: { select: { name: true } } } },
      personas: {
        orderBy: { position: "asc" },
        include: { user: { select: { id: true, name: true, title: true, whatsappPhone: true } } },
      },
      equipmentPlan: {
        select: {
          id: true,
          title: true,
          assignee: { select: { name: true } },
          items: { select: { rowId: true, quantity: true } },
        },
      },
    },
  });
}

export function bloquesDe(raw: unknown): LlamadoBloque[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((b) => ({
    hora: String(b.hora ?? ""),
    actividad: String(b.actividad ?? ""),
    notas: String(b.notas ?? ""),
  }));
}

export async function docDeSheet(sheet: SheetCompleta): Promise<LlamadoDoc> {
  // Nombres de los equipos reservados: del inventario (una sola verdad de nombres).
  let equipos: { nombre: string; cantidad: number }[] = [];
  if (sheet.equipmentPlan?.items.length) {
    const { items } = await loadInventory();
    const nombreDe = new Map(items.map((i) => [i.rowId, i.name]));
    equipos = sheet.equipmentPlan.items
      .map((r) => ({ nombre: nombreDe.get(r.rowId) ?? "Equipo", cantidad: r.quantity }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  return {
    proyecto: sheet.project.name,
    cliente: sheet.project.client?.name ?? null,
    titulo: sheet.titulo,
    fecha: sheet.fecha,
    citacionGeneral: sheet.citacionGeneral,
    locacion: sheet.locacion,
    direccion: sheet.direccion,
    indicaciones: sheet.indicaciones,
    clienteEnSet: sheet.clienteEnSet,
    notas: sheet.notas,
    personas: sheet.personas.map((p) => ({
      nombre: p.user?.name ?? p.nombre ?? "—",
      rol: p.rol ?? p.user?.title ?? null,
      citacion: p.citacion,
      telefono: p.telefono ?? p.user?.whatsappPhone ?? null,
      confirmado: !!p.confirmadoAt,
    })),
    bloques: bloquesDe(sheet.bloques),
    equipos,
    responsableEquipos: sheet.equipmentPlan?.assignee?.name ?? null,
  };
}

/** El texto para pegar en el grupo de WhatsApp: la hoja en versión mensaje. */
export function textoWhatsappLlamado(doc: LlamadoDoc, urlPublica: string): string {
  const fecha = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" }).format(new Date(doc.fecha));
  const lineas = [
    `📋 *HOJA DE LLAMADO — ${doc.titulo ?? doc.proyecto}*`,
    `📅 ${fecha}`,
    doc.citacionGeneral ? `🕐 Citación general: *${doc.citacionGeneral}*` : null,
    doc.locacion ? `📍 ${doc.locacion}${doc.direccion ? ` — ${doc.direccion}` : ""}` : null,
    "",
    "*Equipo:*",
    ...doc.personas.map((p) => `· ${p.nombre}${p.rol ? ` (${p.rol})` : ""} — ${p.citacion ?? doc.citacionGeneral ?? ""}`),
    "",
    `Hoja completa: ${urlPublica}`,
    "Confirma tu asistencia en la app 🙌",
  ];
  return lineas.filter((l) => l !== null).join("\n");
}
