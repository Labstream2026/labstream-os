import { db } from "@/lib/db";
import { utcFromBogota, isValidTime, isValidYmd } from "@/lib/reminder-schedule";
import { todayInputValue } from "@/lib/today";

// ── Las herramientas del asistente: recordatorios de verdad ─────────────────
// Hasta ahora «recuérdame llamar al cliente el martes» recibía una respuesta amable y CERO
// escritura en la base: el martes no sonaba nada. La pantalla del asistente no le pasaba
// ninguna herramienta al modelo. Estas tres se enchufan al motor de recordatorios que ya
// existe (recurrencia, push con botones, delegación): no se construye un motor nuevo, se
// conecta el que hay.
//
// Solo UNA_VEZ a propósito: «todos los lunes…» tiene su pantalla propia con recurrencia
// completa, y un asistente que configura recurrencias a medias crea recordatorios zombis.

export const HERRAMIENTAS_ASISTENTE = [
  {
    name: "crear_recordatorio",
    description:
      "Crea un recordatorio de una sola vez para el usuario. Úsalo SIEMPRE que pidan «recuérdame…», «avísame…», «no me dejes olvidar…». Convierte tú la fecha relativa («el martes», «mañana») a YYYY-MM-DD usando la fecha de hoy del sistema. Si no dicen hora, usa 09:00.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Qué hay que recordar, corto y accionable («Llamar al cliente de Postobón»)" },
        date: { type: "string", description: "YYYY-MM-DD (día de Bogotá)" },
        time: { type: "string", description: "HH:mm de Bogotá, 24 h. Por defecto 09:00" },
        notes: { type: "string", description: "Detalle opcional" },
      },
      required: ["title", "date"],
    },
  },
  {
    name: "listar_recordatorios",
    description: "Lista los próximos recordatorios pendientes del usuario, con su id.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "cancelar_recordatorio",
    description: "Cancela un recordatorio pendiente del usuario por su id (sale de listar_recordatorios).",
    input_schema: {
      type: "object" as const,
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

const FMT = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: true });

/**
 * Ejecuta una herramienta EN NOMBRE del usuario de la sesión — el userId viene del servidor,
 * jamás del modelo. Devuelve el texto que el modelo usará para confirmar.
 */
export async function ejecutarHerramienta(
  nombre: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<string> {
  try {
    if (nombre === "crear_recordatorio") {
      const title = String(input.title ?? "").trim().slice(0, 200);
      const date = String(input.date ?? "").trim();
      const time = String(input.time ?? "09:00").trim();
      const notes = String(input.notes ?? "").trim().slice(0, 500) || null;
      if (!title) return "Error: falta el título.";
      if (!isValidYmd(date)) return "Error: la fecha debe ser YYYY-MM-DD.";
      if (!isValidTime(time)) return "Error: la hora debe ser HH:mm.";
      if (date < todayInputValue()) return `Error: ${date} ya pasó (hoy es ${todayInputValue()}). Pregunta al usuario qué fecha quería.`;
      const nextFireAt = utcFromBogota(date, time);
      if (nextFireAt.getTime() < Date.now() - 60_000) return "Error: ese momento ya pasó hoy. Propón una hora futura.";
      const r = await db.reminder.create({
        data: { title, notes, forUserId: userId, createdById: userId, frequency: "UNA_VEZ", timeOfDay: time, nextFireAt },
        select: { id: true, nextFireAt: true },
      });
      return `Recordatorio creado (id ${r.id}). Sonará el ${FMT.format(r.nextFireAt)} (hora de Bogotá), con aviso en la app y push. Confírmale al usuario el día y la hora EXACTOS.`;
    }

    if (nombre === "listar_recordatorios") {
      const filas = await db.reminder.findMany({
        where: { forUserId: userId, active: true, doneAt: null, nextFireAt: { gte: new Date(Date.now() - 60_000) } },
        orderBy: { nextFireAt: "asc" },
        take: 10,
        select: { id: true, title: true, nextFireAt: true, frequency: true },
      });
      if (!filas.length) return "No tiene recordatorios pendientes.";
      return filas
        .map((r) => `· [${r.id}] «${r.title}» — ${FMT.format(r.nextFireAt)}${r.frequency !== "UNA_VEZ" ? ` (${r.frequency.toLowerCase()})` : ""}`)
        .join("\n");
    }

    if (nombre === "cancelar_recordatorio") {
      const id = String(input.id ?? "").trim();
      // El candado: solo recordatorios DEL usuario. Un id ajeno devuelve «no existe», sin
      // distinguirse de uno inventado.
      const r = await db.reminder.findFirst({ where: { id, forUserId: userId }, select: { id: true, title: true } });
      if (!r) return "Ese recordatorio no existe (o no es de este usuario).";
      await db.reminder.delete({ where: { id: r.id } });
      return `Cancelado: «${r.title}».`;
    }

    return `Herramienta desconocida: ${nombre}.`;
  } catch (e) {
    return `Error ejecutando ${nombre}: ${e instanceof Error ? e.message.slice(0, 200) : "desconocido"}.`;
  }
}
