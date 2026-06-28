import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { getLiveAuthState } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { accessibleProjectWhere, canWriteProject, canAccessProject } from "@/lib/project-access";
import { accessibleClientWhere, userCanAccessClient } from "@/lib/client-access";
import { composeQuoteTotals } from "@/lib/quote-compose";
import { readBuffer } from "@/lib/storage";
import { extractDocsText } from "./attachments";
import { postBotFileMessage, ensureMarcebot, sendBotDM } from "@/lib/marcebot/bot";
import { renderQuotePdf } from "@/lib/pdf/quote-pdf";
import { instantiateTemplate } from "@/lib/provisioning";
import { notifyAndEmail } from "@/lib/notify";
import { createCalendarEventCore } from "@/lib/calendar-create";
import { generateImage, normalizeAspect } from "@/lib/higgsfield";
import { logActivity } from "@/lib/activity";
import { bogotaNoon } from "@/lib/today";
import type { ToolDef } from "./client";

// ── Sesión del usuario que etiqueta al bot ──
// El puente corre en segundo plano (sin cookie), así que reconstruimos la SessionUser a partir
// del id, con rol y permisos EN VIVO (igual que getSession). Todas las herramientas se ejecutan
// con esta sesión → el agente nunca ve ni hace más de lo que esa persona podría.
export async function buildAgentSession(userId: string): Promise<SessionUser | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, title: true, initials: true, avatarColor: true, avatarUrl: true },
  });
  if (!u) return null;
  const live = await getLiveAuthState(u.id);
  if (!live || !live.active) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    title: u.title,
    role: live.roleKey,
    perms: live.perms,
    initials: u.initials,
    color: u.avatarColor,
    avatarUrl: u.avatarUrl,
  };
}

// ── Helpers ──
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
// Fecha + hora en la convención de la app (hora de pared en UTC): "YYYY-MM-DD HH:mm".
const ymdhm = (d: Date): string => d.toISOString().slice(0, 16).replace("T", " ");

// "YYYY-MM-DD" → Date a mediodía UTC (convención de fechas de la app). null si vacío/ inválido.
function parseDate(v: unknown): Date | null {
  const m = str(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

// ── Tablas de datos (DataTable) ──
// Selección común (columnas + filas limitadas) y formateo a objetos legibles por fila.
// Reutilizado por las tablas de wiki (inventario/ubicación) y las de proyecto.
const TABLE_SELECT = {
  name: true,
  columns: { orderBy: { position: "asc" as const }, select: { id: true, name: true, type: true, options: true } },
  rows: { orderBy: { position: "asc" as const }, take: 200, select: { cells: { select: { columnId: true, value: true } } } },
} as const;

type TableForRender = {
  name: string;
  columns: { id: string; name: string; type: string; options: unknown }[];
  rows: { cells: { columnId: string; value: unknown }[] }[];
};

async function renderDataTable(table: TableForRender): Promise<string> {
  // Resuelve columnas PERSON (userId → nombre) en una sola consulta.
  const personCols = new Set(table.columns.filter((c) => c.type === "PERSON").map((c) => c.id));
  const userIds = new Set<string>();
  for (const r of table.rows) for (const c of r.cells) if (personCols.has(c.columnId) && typeof c.value === "string") userIds.add(c.value);
  const users = userIds.size ? await db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } }) : [];
  const userMap = new Map(users.map((u) => [u.id, u.name] as const));
  const fmt = (type: string, value: unknown, options: unknown): string => {
    if (value == null) return "";
    const opts = (Array.isArray(options) ? options : []) as { id: string; label: string }[];
    switch (type) {
      case "SELECT": return opts.find((o) => o.id === value)?.label ?? String(value);
      case "MULTISELECT": return Array.isArray(value) ? value.map((id) => opts.find((o) => o.id === id)?.label ?? "").filter(Boolean).join(", ") : "";
      case "PERSON": return userMap.get(String(value)) ?? "";
      case "CHECKBOX": return value ? "Sí" : "No";
      case "PASSWORD": return "(oculto)"; // seguridad: nunca se revela en el chat
      case "IMAGE": return "(imagen)";
      case "EVENT": return "(evento)";
      case "DATE": return typeof value === "string" ? value.slice(0, 10) : String(value);
      default: return typeof value === "object" ? JSON.stringify(value) : String(value);
    }
  };
  const colById = new Map(table.columns.map((c) => [c.id, c] as const));
  const rows = table.rows.map((r) => {
    const obj: Record<string, string> = {};
    for (const c of r.cells) {
      const col = colById.get(c.columnId);
      if (!col) continue;
      const v = fmt(col.type, c.value, col.options);
      if (v) obj[col.name] = v;
    }
    return obj;
  }).filter((o) => Object.keys(o).length);
  if (!rows.length) return `La tabla «${table.name}» está vacía.`;
  return JSON.stringify({ tabla: table.name, columnas: table.columns.map((c) => c.name), filas: rows });
}

// Días de la semana → 0..6 (0=Dom). Acepta español/inglés y números.
const DAY_MAP: Record<string, number> = {
  dom: 0, domingo: 0, sun: 0, sunday: 0,
  lun: 1, lunes: 1, mon: 1, monday: 1,
  mar: 2, martes: 2, tue: 2, tuesday: 2,
  mie: 3, "mié": 3, miercoles: 3, "miércoles": 3, wed: 3, wednesday: 3,
  jue: 4, jueves: 4, thu: 4, thursday: 4,
  vie: 5, viernes: 5, fri: 5, friday: 5,
  sab: 6, "sáb": 6, sabado: 6, "sábado": 6, sat: 6, saturday: 6,
};
function parseWeekdays(v: unknown): string | null {
  const items = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,]+/) : [];
  const set = new Set<number>();
  for (const it of items) {
    const n = num(it);
    if (n !== null && n >= 0 && n <= 6) { set.add(n); continue; }
    const key = String(it).toLowerCase().trim();
    if (key in DAY_MAP) set.add(DAY_MAP[key]);
  }
  return set.size ? [...set].sort((a, b) => a - b).join(",") : null;
}

// Resuelve un proyecto por id o por nombre, SOLO entre los que el usuario puede ver.
async function resolveProject(session: SessionUser, ref: unknown) {
  const s = str(ref);
  if (!s) return null;
  const where = accessibleProjectWhere(session);
  const sel = { id: true, code: true, name: true, status: true, isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } as const;
  const byId = await db.project.findFirst({ where: { AND: [where, { id: s }] }, select: sel });
  if (byId) return byId;
  return db.project.findFirst({ where: { AND: [where, { name: { contains: s, mode: "insensitive" } }] }, select: sel });
}

// Resuelve un usuario por "yo"/"me" o por nombre (activos, sin bots).
async function resolveUser(session: SessionUser, ref: unknown) {
  const s = str(ref);
  if (!s) return null;
  if (/^(me|yo|m[ií]|yo mismo|para m[ií])$/i.test(s)) return { id: session.id, name: session.name };
  const base = { active: true, isSystemBot: false } as const;
  const exact = await db.user.findFirst({ where: { ...base, name: { equals: s, mode: "insensitive" } }, select: { id: true, name: true } });
  if (exact) return exact;
  return db.user.findFirst({ where: { ...base, name: { contains: s, mode: "insensitive" } }, select: { id: true, name: true } });
}

// Resuelve un cliente por id o por nombre, SOLO entre los que el usuario puede ver (no archivados).
async function resolveClient(session: SessionUser, ref: unknown) {
  const s = str(ref);
  if (!s) return null;
  const where = accessibleClientWhere(session);
  const sel = { id: true, name: true } as const;
  const byId = await db.client.findFirst({ where: { AND: [where, { id: s, archivedAt: null }] }, select: sel });
  if (byId) return byId;
  return db.client.findFirst({ where: { AND: [where, { name: { contains: s, mode: "insensitive" }, archivedAt: null }] }, select: sel });
}

// Claves de estado "terminado" y prioridades válidas (definidas en WorkflowLabel).
async function doneStatusKeys(): Promise<string[]> {
  const rows = await db.workflowLabel.findMany({ where: { kind: "TASK_STATUS", isDone: true }, select: { key: true } });
  return rows.map((r) => r.key);
}
async function validPriority(input: unknown): Promise<string> {
  const want = str(input).toUpperCase();
  const rows = await db.workflowLabel.findMany({ where: { kind: "TASK_PRIORITY" }, select: { key: true, isDefault: true } });
  const match = rows.find((r) => r.key.toUpperCase() === want);
  if (match) return match.key;
  return rows.find((r) => r.isDefault)?.key ?? "MEDIA";
}

// Cláusula de visibilidad de tareas para el usuario (refleja la regla de privacidad de la app).
function taskVisibilityWhere(session: SessionUser): Record<string, unknown> {
  if (session.role === "admin") return {};
  return {
    OR: [
      { ownerId: session.id },
      { assigneeId: session.id },
      { AND: [{ isPrivate: false }, { project: accessibleProjectWhere(session) }] },
    ],
  };
}

// ── Definición de las herramientas (JSON Schema que ve el agente) ──
export const AGENT_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "find_projects",
      description: "Busca o lista los proyectos a los que la persona tiene acceso. Úsalo para resolver el nombre de un proyecto a su id antes de otras herramientas.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Texto a buscar en el nombre (opcional; vacío = lista los proyectos accesibles)." } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project",
      description: "Detalle de un proyecto: estado, progreso, responsable, miembros, y resumen de tareas (abiertas, vencidas, hechas) y próximas entregas.",
      parameters: { type: "object", properties: { project: { type: "string", description: "Id o nombre del proyecto." } }, required: ["project"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "Lista tareas que la persona puede ver, con filtros. Respeta privacidad y acceso.",
      parameters: {
        type: "object",
        properties: {
          project: { type: "string", description: "Id o nombre del proyecto (opcional)." },
          assignee: { type: "string", description: "'yo' o el nombre del responsable (opcional)." },
          scope: { type: "string", enum: ["open", "overdue", "done", "all"], description: "open=pendientes (def.), overdue=vencidas, done=terminadas, all=todas." },
          dueWithinDays: { type: "number", description: "Solo tareas que vencen en los próximos N días (opcional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_users",
      description: "Busca personas del equipo por nombre (para resolver el responsable de una tarea).",
      parameters: { type: "object", properties: { query: { type: "string", description: "Texto a buscar en el nombre (opcional)." } } },
    },
  },
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Envía un mensaje (que TÚ redactas) al chat directo con Marcebot de uno o varios colaboradores, con notificación push. Úsalo cuando la persona te pida avisar/informar/escribir a alguien o a todo el equipo. El mensaje queda atribuido a quien te lo pide. IMPORTANTE: antes de enviar a varias personas o a 'todos', muestra el borrador y confirma destinatarios; no envíes sin confirmación si hay ambigüedad.",
      parameters: {
        type: "object",
        properties: {
          recipients: { type: "string", description: "Nombres de las personas separados por coma (ej. 'Angie, Daniel, Lina'), o 'todos' para todo el equipo activo." },
          message: { type: "string", description: "El texto del mensaje a enviar, ya redactado, claro y completo." },
        },
        required: ["recipients", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Crea una tarea. Si das 'project', se crea en ese proyecto (requiere permiso de escritura); si no, es una tarea personal. Confirma con la persona antes si hay ambigüedad.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título de la tarea." },
          description: { type: "string", description: "Descripción (opcional)." },
          project: { type: "string", description: "Id o nombre del proyecto (opcional; vacío = tarea personal)." },
          assignee: { type: "string", description: "'yo' o nombre del responsable (opcional)." },
          priority: { type: "string", description: "Prioridad: ALTA, MEDIA o BAJA (opcional)." },
          startDate: { type: "string", description: "Fecha de inicio YYYY-MM-DD (opcional; def. hoy)." },
          dueDate: { type: "string", description: "Fecha de entrega YYYY-MM-DD (opcional; def. hoy)." },
          isPrivate: { type: "boolean", description: "Tarea privada (solo dueño y responsable). Opcional." },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_recurring_task",
      description: "Crea una PLANTILLA de tarea recurrente. Un proceso la materializa en una tarea cada vez que toca según la regla.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título de la tarea que se repetirá." },
          description: { type: "string", description: "Descripción (opcional)." },
          project: { type: "string", description: "Id o nombre del proyecto (opcional)." },
          assignee: { type: "string", description: "'yo' o nombre del responsable (opcional)." },
          priority: { type: "string", description: "ALTA, MEDIA o BAJA (opcional)." },
          frequency: { type: "string", enum: ["daily", "weekly", "monthly"], description: "Frecuencia." },
          interval: { type: "number", description: "Cada N (días/semanas/meses). Def. 1." },
          weekdays: { type: "array", items: { type: "string" }, description: "Solo WEEKLY: días, ej. ['lunes','miércoles'] o [1,3]." },
          dayOfMonth: { type: "number", description: "Solo MONTHLY: día del mes 1-31." },
          startDate: { type: "string", description: "Inicio YYYY-MM-DD (opcional; def. hoy)." },
          endDate: { type: "string", description: "Fin YYYY-MM-DD (opcional)." },
        },
        required: ["title", "frequency"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recurring_tasks",
      description: "Lista las tareas recurrentes activas que la persona puede ver.",
      parameters: { type: "object", properties: { project: { type: "string", description: "Id o nombre del proyecto (opcional)." } } },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Guarda una NOTA rápida de la persona (idea, recordatorio, apunte). Úsalo cuando diga 'crea una nota', 'guarda esto', 'anota que', 'recuérdame…'. Genera un título corto a partir del contenido si no lo dan. La nota es de quien la pide.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título corto de la nota (si no lo dan, genéralo del contenido)." },
          content: { type: "string", description: "Contenido/cuerpo de la nota." },
          category: { type: "string", description: "Categoría libre si se detecta (p. ej. 'presupuesto', 'idea'). Opcional." },
          project: { type: "string", description: "Id o nombre del proyecto al que pertenece (opcional)." },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_notes",
      description: "Lista o resume las notas de la persona (las más recientes). Útil para 'resúmeme mis notas' o '¿qué anoté sobre X?'. Devuelve el id de cada nota, necesario para editarla con update_note.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto a buscar en título/contenido (opcional)." },
          project: { type: "string", description: "Id o nombre del proyecto (opcional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_note",
      description: "Edita una NOTA existente de la persona (cambia su título, contenido o categoría). Úsalo cuando diga 'edita la nota…', 'añade a la nota…', 'corrige la nota…'. Primero usa list_notes para ubicar el id. Solo notas propias (los admin, cualquiera).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Id de la nota a editar (lo da list_notes)." },
          title: { type: "string", description: "Nuevo título (opcional; si no se pasa, se conserva)." },
          content: { type: "string", description: "Nuevo contenido (opcional; si no se pasa, se conserva)." },
          category: { type: "string", description: "Nueva categoría (opcional; cadena vacía la borra)." },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_clients",
      description: "Busca o lista los clientes a los que la persona tiene acceso. Útil para encontrar el cliente antes de crear un proyecto.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Texto a buscar en el nombre (opcional)." } } },
    },
  },
  {
    type: "function",
    function: {
      name: "create_client",
      description: "Crea un cliente nuevo. Requiere permiso para crear clientes o proyectos.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre del cliente." },
          company: { type: "string", description: "Empresa (opcional)." },
          description: { type: "string", description: "Descripción corta (opcional)." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description: "Crea un proyecto bajo un cliente existente. Requiere permiso para crear proyectos. Si el cliente no existe, créalo antes con create_client.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre del proyecto." },
          client: { type: "string", description: "Id o nombre del cliente dueño del proyecto." },
          lead: { type: "string", description: "'yo' o nombre del responsable del proyecto (opcional)." },
        },
        required: ["name", "client"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_quotes",
      description: "Lista las cotizaciones que la persona puede ver (REQUIERE permiso para ver finanzas; si no lo tiene, la herramienta lo niega y NO debes dar información de cotizaciones ni montos). Filtra por cliente o estado.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string", description: "Id o nombre del cliente (opcional)." },
          status: { type: "string", enum: ["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA"], description: "Estado (opcional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_invoices",
      description: "Lista las facturas que la persona puede ver (REQUIERE permiso para ver finanzas; si no lo tiene, la herramienta lo niega y NO debes dar información de facturación ni montos). Filtra por cliente o estado.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string", description: "Id o nombre del cliente (opcional)." },
          status: { type: "string", enum: ["BORRADOR", "ENVIADA", "PAGADA", "VENCIDA", "ANULADA"], description: "Estado (opcional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_events",
      description: "Lista los próximos eventos del calendario del equipo (REQUIERE permiso para ver el calendario). Por defecto los próximos 14 días.",
      parameters: {
        type: "object",
        properties: {
          withinDays: { type: "number", description: "Ventana hacia adelante en días (opcional; def. 14, máx. 120)." },
          project: { type: "string", description: "Id o nombre del proyecto para filtrar (opcional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Crea una cita/reunión en el calendario del equipo y ADJUNTA como asistentes a las personas indicadas; a cada invitado le llega una notificación (app + correo) avisando que la persona que pidió la cita lo invitó. El creador (quien te lo pide) queda incluido automáticamente. REQUIERE permiso para gestionar el calendario. Si falta la fecha, la hora o no está claro a quién invitar, pregúntalo antes de crear.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título de la cita/reunión." },
          date: { type: "string", description: "Fecha en formato YYYY-MM-DD." },
          time: { type: "string", description: "Hora de inicio HH:mm (24h). Si se omite, la cita es de todo el día." },
          endTime: { type: "string", description: "Hora de fin HH:mm (opcional)." },
          attendees: { type: "string", description: "A quién invitar: nombres separados por coma (ej. 'Angie, Daniel, Lina') o 'todos' para todo el equipo activo. No hace falta incluir a quien pide la cita." },
          location: { type: "string", description: "Lugar o enlace de la reunión (sala, Meet, Zoom…). Opcional." },
          description: { type: "string", description: "Agenda o descripción de la cita (opcional)." },
          project: { type: "string", description: "Id o nombre del proyecto al que pertenece la cita (opcional)." },
        },
        required: ["title", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_files",
      description: "Busca archivos de proyecto que la persona puede ver (REQUIERE permiso ver_archivos). Devuelve id y nombre para luego enviarlos con send_file.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto a buscar en el nombre (opcional)." },
          project: { type: "string", description: "Id o nombre del proyecto (opcional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Lee y devuelve el CONTENIDO en texto de un archivo de proyecto (PDF, Word, Excel, CSV, texto, Markdown, subtítulos…). REQUIERE permiso ver_archivos y acceso al proyecto. Úsalo para responder preguntas sobre lo que dice un documento. Las imágenes no devuelven texto: para mostrarlas usa send_file.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Id o nombre del archivo (usa find_files para ubicarlo)." },
        },
        required: ["file"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_file",
      description: "Envía al usuario, en este chat, un archivo de proyecto existente (por id o nombre). Requiere ver_archivos y acceso al proyecto. Si el archivo es un enlace externo (Drive/NAS), te devuelve el enlace para que lo compartas en tu respuesta.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Id o nombre del archivo (usa find_files para ubicarlo)." },
          note: { type: "string", description: "Mensaje breve que acompaña al archivo (opcional)." },
        },
        required: ["file"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generar_imagen",
      description: "Genera una imagen con IA a partir de una descripción en texto y la ENVÍA al usuario en este chat (se ve y se puede descargar). Úsalo cuando pidan 'créame/genérame/hazme/dibújame una imagen' de algo. NO inventes que la enviaste: usa SIEMPRE esta herramienta para entregarla de verdad.",
      parameters: {
        type: "object",
        properties: {
          descripcion: { type: "string", description: "Descripción detallada de la imagen a generar (en español o inglés)." },
          formato: { type: "string", description: "Orientación: '1:1' (cuadrado/Instagram, por defecto), '9:16' (vertical/story/reel) o '16:9' (horizontal)." },
        },
        required: ["descripcion"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_quote",
      description: "Genera el PDF de una cotización y se lo ENVÍA al usuario en este chat (REQUIERE permiso ver_finanzas y acceso al cliente). Identifica la cotización por su código (COT-XXXX), id o nombre.",
      parameters: {
        type: "object",
        properties: {
          quote: { type: "string", description: "Código (ej. COT-0007), id o nombre de la cotización." },
          note: { type: "string", description: "Mensaje breve que acompaña al PDF (opcional)." },
        },
        required: ["quote"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_wiki_pages",
      description: "Busca o lista páginas de la wiki del equipo (procesos, políticas, onboarding, fichas…). REQUIERE permiso ver_wiki. Devuelve id y título; usa get_wiki_page para el contenido.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto a buscar en título, etiquetas o contenido (opcional)." },
          section: { type: "string", description: "Filtra por sección (ej. Procesos, Administración) (opcional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_wiki_page",
      description: "Devuelve el contenido completo de una página de la wiki (por id o título). REQUIERE permiso ver_wiki.",
      parameters: {
        type: "object",
        properties: { page: { type: "string", description: "Id o título de la página." } },
        required: ["page"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_credentials",
      description: "Lista las credenciales (bóveda de contraseñas de la wiki) que la persona puede ver. REQUIERE permiso ver_contrasenas. Por seguridad NO devuelve la contraseña, solo título, usuario, URL y categoría.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto a buscar en título o usuario (opcional)." },
          category: { type: "string", description: "Filtra por categoría (correo, redes, hosting…) (opcional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_wiki_table",
      description: "Lee una tabla de la WIKI: el INVENTARIO de equipos o la UBICACIÓN. REQUIERE permiso ver_wiki. Para las tablas de un PROYECTO usa read_table.",
      parameters: {
        type: "object",
        properties: { table: { type: "string", description: "'inventario' o 'ubicacion'." } },
        required: ["table"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tables",
      description: "Lista las tablas de datos de un PROYECTO que la persona puede ver (REQUIERE acceso al proyecto). Devuelve nombre, id y nº de columnas/filas para luego leerlas con read_table.",
      parameters: {
        type: "object",
        properties: { project: { type: "string", description: "Id o nombre del proyecto." } },
        required: ["project"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_table",
      description: "Lee y devuelve el contenido (columnas y filas) de una tabla de datos de un PROYECTO. REQUIERE acceso al proyecto. Identifica la tabla por id o nombre; opcionalmente acota con el proyecto. Las columnas de contraseña salen ocultas. Úsalo para responder sobre los datos de una tabla del proyecto.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", description: "Id o nombre de la tabla (usa list_tables para ubicarla)." },
          project: { type: "string", description: "Id o nombre del proyecto (opcional, para desambiguar)." },
        },
        required: ["table"],
      },
    },
  },
];

// Contexto opcional del chat donde corre el agente (canal + id del bot), necesario para que
// algunas herramientas con efecto (p. ej. send_file) puedan PUBLICAR en la conversación.
export type ToolContext = { channelId: string; botId: string; source?: "chat" | "whatsapp" };

// Herramientas que MODIFICAN datos (para filtrar en keys de API read-only).
export const WRITE_TOOL_NAMES = new Set<string>([
  "create_task",
  "create_recurring_task",
  "create_note",
  "update_note",
  "create_client",
  "create_project",
  "create_calendar_event",
  "send_message",
]);

// Herramientas que ENTREGAN al chat del solicitante (necesitan un canal real): no aplican a la
// API intermedia, donde no hay un DM donde dejar el archivo/imagen. Se excluyen siempre (si no,
// se ofrecerían al modelo y siempre devolverían un no-op "no puedo enviar… en este contexto").
export const CHANNEL_TOOL_NAMES = new Set<string>(["send_file", "send_quote", "generar_imagen"]);

// Devuelve el subconjunto de herramientas apto para la API intermedia: sin las de canal y, si la
// key es de solo lectura, sin las de escritura.
export function toolsForApi(readOnly: boolean): ToolDef[] {
  return AGENT_TOOLS.filter((t) => {
    const n = t.function.name;
    if (CHANNEL_TOOL_NAMES.has(n)) return false;
    if (readOnly && WRITE_TOOL_NAMES.has(n)) return false;
    return true;
  });
}

// ── Ejecución de cada herramienta (con los permisos de `session`) ──
export async function executeAgentTool(name: string, args: Record<string, unknown>, session: SessionUser, ctx?: ToolContext): Promise<string> {
  switch (name) {
    case "find_projects": {
      const q = str(args.query);
      const where = q ? { AND: [accessibleProjectWhere(session), { name: { contains: q, mode: "insensitive" as const } }] } : accessibleProjectWhere(session);
      const rows = await db.project.findMany({
        where, take: 25, orderBy: { updatedAt: "desc" },
        select: { id: true, code: true, name: true, status: true, progress: true, dueDate: true, isPrivate: true, client: { select: { name: true } }, lead: { select: { name: true } } },
      });
      if (!rows.length) return "No hay proyectos que coincidan (o no tienes acceso).";
      return JSON.stringify(rows.map((p) => ({ id: p.id, code: p.code, name: p.name, cliente: p.client?.name ?? null, estado: p.status, progreso: `${p.progress}%`, responsable: p.lead?.name ?? null, entrega: p.dueDate ? ymd(p.dueDate) : null })));
    }

    case "get_project": {
      const p = await resolveProject(session, args.project);
      if (!p) return "No encontré ese proyecto o no tienes acceso a él.";
      const full = await db.project.findUnique({
        where: { id: p.id },
        select: {
          id: true, code: true, name: true, description: true, status: true, priority: true, progress: true, dueDate: true, startDate: true,
          client: { select: { name: true } }, lead: { select: { name: true } },
          members: { select: { user: { select: { name: true } }, role: true } },
          tasks: { select: { title: true, status: true, dueDate: true, isPrivate: true, ownerId: true, assigneeId: true, assignee: { select: { name: true } } } },
          deliverables: { select: { name: true, dueDate: true, status: true } },
        },
      });
      if (!full) return "Proyecto no encontrado.";
      const done = new Set(await doneStatusKeys());
      const now = new Date();
      const visible = full.tasks.filter((t) => session.role === "admin" || !t.isPrivate || t.ownerId === session.id || t.assigneeId === session.id);
      const open = visible.filter((t) => !done.has(t.status));
      const overdue = open.filter((t) => t.dueDate && t.dueDate < now);
      return JSON.stringify({
        id: full.id, code: full.code, nombre: full.name, cliente: full.client?.name ?? null, estado: full.status, prioridad: full.priority,
        progreso: `${full.progress}%`, responsable: full.lead?.name ?? null,
        inicio: full.startDate ? ymd(full.startDate) : null, entrega: full.dueDate ? ymd(full.dueDate) : null,
        descripcion: full.description ?? null,
        miembros: full.members.map((m) => m.user.name),
        tareas: { total: visible.length, abiertas: open.length, vencidas: overdue.length, terminadas: visible.length - open.length },
        proximas_tareas: open.filter((t) => t.dueDate).sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime())).slice(0, 8).map((t) => ({ titulo: t.title, vence: ymd(t.dueDate!), responsable: t.assignee?.name ?? null, vencida: !!(t.dueDate && t.dueDate < now) })),
        entregables: full.deliverables.slice(0, 8).map((d) => ({ nombre: d.name, estado: d.status, entrega: d.dueDate ? ymd(d.dueDate) : null })),
      });
    }

    case "list_tasks": {
      const filters: Record<string, unknown>[] = [taskVisibilityWhere(session)];
      if (str(args.project)) {
        const p = await resolveProject(session, args.project);
        if (!p) return "No encontré ese proyecto o no tienes acceso.";
        filters.push({ projectId: p.id });
      }
      if (str(args.assignee)) {
        const u = await resolveUser(session, args.assignee);
        if (!u) return `No encontré a la persona "${str(args.assignee)}".`;
        filters.push({ assigneeId: u.id });
      }
      const scope = str(args.scope) || "open";
      const done = await doneStatusKeys();
      const now = new Date();
      if (scope === "open") filters.push({ status: { notIn: done } });
      else if (scope === "done") filters.push({ status: { in: done } });
      else if (scope === "overdue") filters.push({ status: { notIn: done }, dueDate: { lt: now } });
      const within = num(args.dueWithinDays);
      if (within !== null) filters.push({ dueDate: { gte: now, lte: new Date(now.getTime() + within * 86400000) } });
      const rows = await db.task.findMany({
        where: { AND: filters }, take: 40, orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
        select: { id: true, title: true, status: true, priority: true, dueDate: true, isPrivate: true, project: { select: { name: true } }, assignee: { select: { name: true } } },
      });
      if (!rows.length) return "No hay tareas que coincidan con esos filtros.";
      return JSON.stringify(rows.map((t) => ({ titulo: t.title, estado: t.status, prioridad: t.priority, vence: t.dueDate ? ymd(t.dueDate) : null, vencida: !!(t.dueDate && t.dueDate < now && !done.includes(t.status)), proyecto: t.project?.name ?? "(personal)", responsable: t.assignee?.name ?? null })));
    }

    case "find_users": {
      const q = str(args.query);
      const rows = await db.user.findMany({
        where: { active: true, isSystemBot: false, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
        take: 25, orderBy: { name: "asc" }, select: { id: true, name: true, title: true },
      });
      if (!rows.length) return "No encontré personas con ese nombre.";
      return JSON.stringify(rows.map((u) => ({ id: u.id, nombre: u.name, cargo: u.title ?? null })));
    }

    case "send_message": {
      const recRaw = str(args.recipients);
      const message = str(args.message);
      if (!recRaw) return "Falta a quién enviar (nombres separados por coma o 'todos').";
      if (!message) return "Falta el mensaje a enviar.";
      const bot = await ensureMarcebot();
      const toAll = /^(todos|todo el equipo|equipo|all|everyone)$/i.test(recRaw.trim());
      const targets: { id: string; name: string }[] = [];
      const notFound: string[] = [];
      if (toAll) {
        // Todo el equipo activo, menos quien lo pide y los bots.
        const everyone = await db.user.findMany({ where: { active: true, isSystemBot: false, id: { not: session.id } }, select: { id: true, name: true } });
        targets.push(...everyone);
      } else {
        for (const n of recRaw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
          const u = await resolveUser(session, n);
          if (u) { if (!targets.some((t) => t.id === u.id)) targets.push(u); }
          else notFound.push(n);
        }
      }
      if (!targets.length) return notFound.length ? `No encontré a: ${notFound.join(", ")}.` : "No hay destinatarios válidos.";
      // El mensaje queda ATRIBUIDO a quien lo pide (sin suplantar a Marcebot ni anonimato).
      const body = `📨 *${session.name}* te envía (vía Marcebot):\n\n${message}`;
      let sent = 0;
      for (const t of targets) {
        try { await sendBotDM(bot, t.id, t.name, body); sent++; } catch { /* continúa con el resto */ }
      }
      await logActivity({ action: "marcebot.message", summary: `envió un mensaje vía Marcebot a ${sent} persona(s)`, entityType: "user", entityId: session.id }).catch(() => null);
      const extra = notFound.length ? ` No encontré a: ${notFound.join(", ")}.` : "";
      return JSON.stringify({ ok: true, enviados: sent, a: targets.map((t) => t.name), mensaje: `Mensaje enviado a ${sent} persona(s): ${targets.map((t) => t.name).join(", ")}.${extra}` });
    }

    case "create_task": {
      const title = str(args.title);
      if (!title) return "Falta el título de la tarea.";
      let projectId: string | null = null;
      if (str(args.project)) {
        const p = await resolveProject(session, args.project);
        if (!p) return "No encontré ese proyecto o no tienes acceso.";
        if (!canWriteProject(p, session)) return `No tienes permiso para crear tareas en «${p.name}».`;
        projectId = p.id;
      }
      let assigneeId: string | null = null;
      if (str(args.assignee)) {
        const u = await resolveUser(session, args.assignee);
        if (!u) return `No encontré a la persona "${str(args.assignee)}".`;
        assigneeId = u.id;
      }
      const priority = await validPriority(args.priority);
      // Toda tarea lleva inicio y fin (def. hoy si no se indica).
      const dueDate = parseDate(args.dueDate) ?? bogotaNoon();
      const startDate = parseDate(args.startDate) ?? bogotaNoon();
      const position = projectId ? await db.task.count({ where: { projectId } }) : 0;
      const task = await db.task.create({
        data: {
          title, description: str(args.description) || null, projectId, assigneeId,
          ownerId: session.id, assignedById: assigneeId && assigneeId !== session.id ? session.id : null,
          priority, startDate, dueDate, isPrivate: args.isPrivate === true,
          position,
        },
        select: { id: true },
      });
      if (assigneeId && assigneeId !== session.id) {
        await notifyAndEmail(assigneeId, { type: "task", title: `Nueva tarea: ${title}`, body: `${session.name} te asignó una tarea${dueDate ? ` (entrega ${ymd(dueDate)})` : ""} vía Marcebot.`, link: projectId ? `/proyectos/${projectId}?tab=tareas` : "/mis-tareas" }).catch(() => null);
      }
      await logActivity({ action: "task.create", summary: `creó la tarea «${title}» (vía @Marcebot)`, projectId: projectId ?? undefined, entityType: "task", entityId: task.id }).catch(() => null);
      return JSON.stringify({ ok: true, taskId: task.id, mensaje: `Tarea «${title}» creada${projectId ? " en el proyecto" : " (personal)"}${dueDate ? `, vence ${ymd(dueDate)}` : ""}.` });
    }

    case "create_recurring_task": {
      const title = str(args.title);
      const freqRaw = str(args.frequency).toUpperCase();
      if (!title) return "Falta el título.";
      if (!["DAILY", "WEEKLY", "MONTHLY"].includes(freqRaw)) return "frequency debe ser daily, weekly o monthly.";
      const frequency = freqRaw as "DAILY" | "WEEKLY" | "MONTHLY";
      let projectId: string | null = null;
      if (str(args.project)) {
        const p = await resolveProject(session, args.project);
        if (!p) return "No encontré ese proyecto o no tienes acceso.";
        if (!canWriteProject(p, session)) return `No tienes permiso para crear tareas en «${p.name}».`;
        projectId = p.id;
      }
      let assigneeId: string | null = null;
      if (str(args.assignee)) {
        const u = await resolveUser(session, args.assignee);
        if (!u) return `No encontré a la persona "${str(args.assignee)}".`;
        assigneeId = u.id;
      }
      const interval = Math.max(1, num(args.interval) ?? 1);
      const weekdays = frequency === "WEEKLY" ? parseWeekdays(args.weekdays) : null;
      const domRaw = num(args.dayOfMonth);
      const dayOfMonth = frequency === "MONTHLY" && domRaw !== null ? Math.min(31, Math.max(1, Math.round(domRaw))) : null;
      const startDate = parseDate(args.startDate) ?? new Date();
      const endDate = parseDate(args.endDate);
      const rule = await db.recurringTask.create({
        data: { title, description: str(args.description) || null, projectId, assigneeId, createdById: session.id, priority: await validPriority(args.priority), frequency, interval, weekdays, dayOfMonth, startDate, endDate },
        select: { id: true },
      });
      await logActivity({ action: "recurring.create", summary: `creó la tarea recurrente «${title}» (vía @Marcebot)`, projectId: projectId ?? undefined, entityType: "task", entityId: rule.id }).catch(() => null);
      const cadencia = frequency === "DAILY" ? `cada ${interval} día(s)` : frequency === "WEEKLY" ? `cada ${interval} semana(s)${weekdays ? ` (días ${weekdays})` : ""}` : `cada ${interval} mes(es)${dayOfMonth ? ` el día ${dayOfMonth}` : ""}`;
      return JSON.stringify({ ok: true, recurringId: rule.id, mensaje: `Tarea recurrente «${title}» creada: ${cadencia}, desde ${ymd(startDate)}.` });
    }

    case "list_recurring_tasks": {
      const where: Record<string, unknown>[] = [{ active: true }];
      if (session.role !== "admin") where.push({ OR: [{ createdById: session.id }, { assigneeId: session.id }, { project: accessibleProjectWhere(session) }] });
      if (str(args.project)) {
        const p = await resolveProject(session, args.project);
        if (!p) return "No encontré ese proyecto o no tienes acceso.";
        where.push({ projectId: p.id });
      }
      const rows = await db.recurringTask.findMany({ where: { AND: where }, take: 30, orderBy: { createdAt: "desc" }, select: { title: true, frequency: true, interval: true, weekdays: true, dayOfMonth: true, startDate: true, project: { select: { name: true } }, assignee: { select: { name: true } } } });
      if (!rows.length) return "No hay tareas recurrentes activas que puedas ver.";
      return JSON.stringify(rows.map((r) => ({ titulo: r.title, frecuencia: r.frequency, cada: r.interval, dias: r.weekdays, diaDelMes: r.dayOfMonth, desde: ymd(r.startDate), proyecto: r.project?.name ?? "(personal)", responsable: r.assignee?.name ?? null })));
    }

    case "create_note": {
      const content = str(args.content);
      if (!content) return "Falta el contenido de la nota.";
      const title = str(args.title) || content.replace(/\s+/g, " ").slice(0, 60);
      let projectId: string | null = null;
      if (str(args.project)) {
        const p = await resolveProject(session, args.project);
        if (!p) return "No encontré ese proyecto o no tienes acceso.";
        projectId = p.id;
      }
      const note = await db.note.create({
        data: { title, content, category: str(args.category) || null, source: ctx?.source ?? "chat", createdById: session.id, projectId },
        select: { id: true },
      });
      await logActivity({ action: "note.create", summary: `creó la nota «${title}» (vía @Marcebot)`, projectId: projectId ?? undefined, entityType: "note", entityId: note.id }).catch(() => null);
      return JSON.stringify({ ok: true, noteId: note.id, mensaje: `Nota «${title}» guardada.` });
    }

    case "list_notes": {
      const where: Record<string, unknown>[] = [];
      // Cada quien ve sus notas; los admins ven todas.
      if (session.role !== "admin") where.push({ createdById: session.id });
      const q = str(args.query);
      if (q) where.push({ OR: [{ title: { contains: q, mode: "insensitive" as const } }, { content: { contains: q, mode: "insensitive" as const } }] });
      if (str(args.project)) {
        const p = await resolveProject(session, args.project);
        if (!p) return "No encontré ese proyecto o no tienes acceso.";
        where.push({ projectId: p.id });
      }
      const rows = await db.note.findMany({
        where: where.length ? { AND: where } : {},
        take: 25, orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, content: true, category: true, updatedAt: true, project: { select: { name: true } } },
      });
      if (!rows.length) return "No tienes notas guardadas todavía.";
      return JSON.stringify(rows.map((n) => ({ id: n.id, titulo: n.title, contenido: n.content.slice(0, 400), categoria: n.category, fecha: ymd(n.updatedAt), proyecto: n.project?.name ?? null })));
    }

    case "update_note": {
      const id = str(args.id);
      if (!id) return "Falta el id de la nota a editar (usa list_notes para ubicarla).";
      const existing = await db.note.findUnique({ where: { id }, select: { createdById: true, title: true, content: true, category: true } });
      if (!existing) return "No encontré esa nota.";
      if (existing.createdById !== session.id && session.role !== "admin") return "No puedes editar una nota de otra persona.";
      const title = args.title !== undefined ? (str(args.title) || existing.title) : existing.title;
      const content = args.content !== undefined ? str(args.content) : existing.content;
      const category = args.category !== undefined ? (str(args.category) || null) : existing.category;
      if (!content.trim()) return "El contenido de la nota no puede quedar vacío.";
      const note = await db.note.update({ where: { id }, data: { title, content, category }, select: { id: true } });
      await logActivity({ action: "note.update", summary: `editó la nota «${title}» (vía @Marcebot)`, entityType: "note", entityId: note.id }).catch(() => null);
      return JSON.stringify({ ok: true, noteId: note.id, mensaje: `Nota «${title}» actualizada.` });
    }

    case "find_clients": {
      const q = str(args.query);
      const base = accessibleClientWhere(session);
      const where = q ? { AND: [base, { name: { contains: q, mode: "insensitive" as const }, archivedAt: null }] } : { AND: [base, { archivedAt: null }] };
      const rows = await db.client.findMany({ where, take: 25, orderBy: { name: "asc" }, select: { id: true, name: true, company: true, _count: { select: { projects: true } } } });
      if (!rows.length) return "No hay clientes que coincidan (o no tienes acceso).";
      return JSON.stringify(rows.map((c) => ({ id: c.id, nombre: c.name, empresa: c.company ?? null, proyectos: c._count.projects })));
    }

    case "create_client": {
      if (!hasPermission(session, "crear_clientes") && !hasPermission(session, "crear_proyectos")) return "No tienes permiso para crear clientes.";
      const name = str(args.name);
      if (!name) return "Falta el nombre del cliente.";
      const client = await db.client.create({
        data: {
          name,
          company: str(args.company) || null,
          description: str(args.description) || null,
          emoji: "🏢",
          members: { create: { userId: session.id } },
        },
        select: { id: true },
      });
      await logActivity({ action: "client.create", summary: `creó el cliente «${name}» (vía @Marcebot)`, clientId: client.id, entityType: "client", entityId: client.id }).catch(() => null);
      return JSON.stringify({ ok: true, clientId: client.id, mensaje: `Cliente «${name}» creado.` });
    }

    case "create_project": {
      if (!hasPermission(session, "crear_proyectos")) return "No tienes permiso para crear proyectos.";
      const name = str(args.name);
      if (!name) return "Falta el nombre del proyecto.";
      const client = await resolveClient(session, args.client);
      if (!client) return `No encontré el cliente "${str(args.client)}". Créalo primero con create_client (o revisa el nombre con find_clients).`;
      if (!(await userCanAccessClient(client.id, session))) return "No tienes acceso a ese cliente.";
      let leadId: string | null = null;
      if (str(args.lead)) {
        const u = await resolveUser(session, args.lead);
        if (u) leadId = u.id;
      }
      const project = await instantiateTemplate(db, { templateKey: "", name, clientId: client.id, leadId });
      await logActivity({ action: "project.create", summary: `creó el proyecto «${name}» (vía @Marcebot)`, projectId: project.id, entityType: "project", entityId: project.id }).catch(() => null);
      return JSON.stringify({ ok: true, projectId: project.id, code: project.code, mensaje: `Proyecto «${name}» (${project.code}) creado para el cliente ${client.name}.` });
    }

    case "list_quotes": {
      // Candado: MISMO permiso que la sección de la app (ver_finanzas, no ver_cotizaciones).
      // La UI de Cotizaciones/Facturación se cierra con ver_finanzas (solo Gerencia + admin);
      // si el agente usara ver_cotizaciones, Ventas/Productor —que sí lo tienen— obtendrían por
      // chat los valores que la app les oculta. Quien no ve finanzas recibe la negativa.
      if (!hasPermission(session, "ver_finanzas")) return "No tienes permiso para ver cotizaciones.";
      const filters: Record<string, unknown>[] = [{ client: accessibleClientWhere(session) }];
      if (str(args.client)) {
        const c = await resolveClient(session, args.client);
        if (!c) return `No encontré el cliente "${str(args.client)}" (o no tienes acceso).`;
        filters.push({ clientId: c.id });
      }
      const st = str(args.status).toUpperCase();
      if (["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA"].includes(st)) filters.push({ status: st });
      const rows = await db.quote.findMany({
        where: { AND: filters }, take: 30, orderBy: { updatedAt: "desc" },
        select: { code: true, title: true, status: true, currency: true, taxRate: true, contingencyPct: true, validUntil: true, client: { select: { name: true } }, items: { select: { quantity: true, unitPrice: true } } },
      });
      if (!rows.length) return "No hay cotizaciones que coincidan (o no tienes acceso).";
      return JSON.stringify(rows.map((q) => ({
        code: q.code, titulo: q.title, cliente: q.client?.name ?? null, estado: q.status,
        total: composeQuoteTotals(q.items, { taxRate: q.taxRate, contingencyPct: q.contingencyPct }).total,
        moneda: q.currency, valida_hasta: q.validUntil ? ymd(q.validUntil) : null,
      })));
    }

    case "list_invoices": {
      // Mismo candado que la sección de Facturación: ver_finanzas (no ver_cotizaciones).
      if (!hasPermission(session, "ver_finanzas")) return "No tienes permiso para ver facturas.";
      const filters: Record<string, unknown>[] = [{ client: accessibleClientWhere(session) }];
      if (str(args.client)) {
        const c = await resolveClient(session, args.client);
        if (!c) return `No encontré el cliente "${str(args.client)}" (o no tienes acceso).`;
        filters.push({ clientId: c.id });
      }
      const st = str(args.status).toUpperCase();
      if (["BORRADOR", "ENVIADA", "PAGADA", "VENCIDA", "ANULADA"].includes(st)) filters.push({ status: st });
      const rows = await db.invoice.findMany({
        where: { AND: filters }, take: 30, orderBy: { issueDate: "desc" },
        select: { code: true, status: true, currency: true, taxRate: true, issueDate: true, dueDate: true, paidAt: true, client: { select: { name: true } }, items: { select: { quantity: true, unitPrice: true } } },
      });
      if (!rows.length) return "No hay facturas que coincidan (o no tienes acceso).";
      return JSON.stringify(rows.map((f) => {
        const sub = f.items.reduce((n, i) => n + i.quantity * i.unitPrice, 0);
        return {
          code: f.code, cliente: f.client?.name ?? null, estado: f.status,
          total: Math.round(sub * (1 + Math.max(0, f.taxRate) / 100)), moneda: f.currency,
          emitida: ymd(f.issueDate), vence: f.dueDate ? ymd(f.dueDate) : null, pagada: f.paidAt ? ymd(f.paidAt) : null,
        };
      }));
    }

    case "list_events": {
      if (!hasPermission(session, "ver_calendario")) return "No tienes permiso para ver el calendario.";
      const now = new Date();
      const within = num(args.withinDays);
      const days = within !== null && within > 0 ? Math.min(120, within) : 14;
      const until = new Date(now.getTime() + days * 86400000);
      const filters: Record<string, unknown>[] = [{ start: { gte: now, lte: until } }];
      if (str(args.project)) {
        const p = await resolveProject(session, args.project);
        if (!p) return "No encontré ese proyecto o no tienes acceso.";
        filters.push({ projectId: p.id });
      }
      const rows = await db.calendarEvent.findMany({
        where: { AND: filters }, take: 40, orderBy: { start: "asc" },
        select: { title: true, start: true, end: true, allDay: true, location: true, project: { select: { name: true } }, attendees: { select: { user: { select: { name: true } } } } },
      });
      if (!rows.length) return `No hay eventos en los próximos ${days} días.`;
      return JSON.stringify(rows.map((e) => ({
        titulo: e.title, inicio: e.allDay ? ymd(e.start) : ymdhm(e.start), fin: e.end ? (e.allDay ? ymd(e.end) : ymdhm(e.end)) : null,
        todoElDia: e.allDay, lugar: e.location ?? null, proyecto: e.project?.name ?? null,
        asistentes: e.attendees.map((a) => a.user?.name).filter(Boolean),
      })));
    }

    case "create_calendar_event": {
      if (!hasPermission(session, "gestionar_calendario")) return "No tienes permiso para crear citas en el calendario.";
      const title = str(args.title);
      if (!title) return "Falta el título de la cita.";
      const date = str(args.date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Falta la fecha de la cita (formato YYYY-MM-DD).";
      const time = str(args.time);
      if (time && !/^\d{2}:\d{2}$/.test(time)) return "La hora de inicio debe ser HH:mm (24h) o vacía para todo el día.";
      const endTime = str(args.endTime);

      // Resolver asistentes por nombre (o 'todos'). El creador se incluye en el core.
      const attRaw = str(args.attendees);
      const attendeeIds: string[] = [];
      const notFound: string[] = [];
      if (attRaw) {
        if (/^(todos|todo el equipo|equipo|all|everyone)$/i.test(attRaw.trim())) {
          const everyone = await db.user.findMany({ where: { active: true, isSystemBot: false, id: { not: session.id } }, select: { id: true } });
          attendeeIds.push(...everyone.map((u) => u.id));
        } else {
          for (const n of attRaw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
            const u = await resolveUser(session, n);
            if (u) { if (!attendeeIds.includes(u.id)) attendeeIds.push(u.id); }
            else notFound.push(n);
          }
        }
      }

      // Proyecto opcional (valida acceso).
      let projectId: string | null = null;
      if (str(args.project)) {
        const p = await resolveProject(session, args.project);
        if (!p) return "No encontré ese proyecto o no tienes acceso.";
        projectId = p.id;
      }

      const res = await createCalendarEventCore({
        creatorId: session.id,
        creatorName: session.name,
        title,
        date,
        time,
        endTime,
        description: str(args.description),
        location: str(args.location),
        attendeeIds,
        projectId,
      });
      if (!res) return "No pude crear la cita: revisa que la fecha (YYYY-MM-DD) y la hora (HH:mm) sean válidas.";
      await logActivity({ action: "event.create", summary: `creó la cita «${title}» (vía @Marcebot)`, projectId: projectId ?? undefined, entityType: "event", entityId: res.id }).catch(() => null);
      const cuando = res.allDay ? `${date} (todo el día)` : `${date} a las ${time}${endTime ? `–${endTime}` : ""}`;
      const extra = notFound.length ? ` No encontré a: ${notFound.join(", ")} (no se invitaron).` : "";
      return JSON.stringify({
        ok: true,
        eventId: res.id,
        invitados: res.invitedCount,
        mensaje: `Cita «${title}» creada para ${cuando}. Se invitó a ${res.invitedCount} persona(s) y se les notificó.${extra}`,
      });
    }

    case "find_files": {
      if (!hasPermission(session, "ver_archivos")) return "No tienes permiso para ver archivos.";
      const filters: Record<string, unknown>[] = [{ project: accessibleProjectWhere(session) }];
      if (str(args.project)) {
        const p = await resolveProject(session, args.project);
        if (!p) return "No encontré ese proyecto o no tienes acceso.";
        filters.push({ projectId: p.id });
      }
      if (str(args.query)) filters.push({ name: { contains: str(args.query), mode: "insensitive" } });
      const rows = await db.fileAsset.findMany({
        where: { AND: filters }, take: 25, orderBy: { createdAt: "desc" },
        select: { id: true, name: true, kind: true, mime: true, size: true, project: { select: { name: true } } },
      });
      if (!rows.length) return "No hay archivos que coincidan (o no tienes acceso).";
      return JSON.stringify(rows.map((f) => ({ id: f.id, nombre: f.name, tipo: f.kind, mime: f.mime ?? null, proyecto: f.project?.name ?? null })));
    }

    case "read_file": {
      if (!hasPermission(session, "ver_archivos")) return "No tienes permiso para ver archivos.";
      const ref = str(args.file);
      if (!ref) return "Falta el archivo a leer (id o nombre).";
      const where = accessibleProjectWhere(session);
      const sel = { id: true, name: true, kind: true, url: true, path: true, mime: true, project: { select: { leadId: true, isPrivate: true, members: { select: { userId: true } } } } } as const;
      let file = await db.fileAsset.findFirst({ where: { AND: [{ project: where }, { id: ref }] }, select: sel });
      if (!file) file = await db.fileAsset.findFirst({ where: { AND: [{ project: where }, { name: { contains: ref, mode: "insensitive" } }] }, select: sel });
      if (!file) return `No encontré el archivo "${ref}" (o no tienes acceso).`;
      if (!canAccessProject(file.project, session)) return "No tienes acceso al proyecto de ese archivo.";
      if (file.kind !== "LOCAL" || !file.path) {
        return file.url ? `Es un archivo externo (enlace), no puedo leer su contenido directamente. Comparte el enlace: ${file.url}` : "Ese archivo no tiene contenido local para leer.";
      }
      const mime = file.mime ?? "";
      const name = file.name;
      const MAXTXT = 12000;
      const clip = (t: string) => (t.length > MAXTXT ? t.slice(0, MAXTXT) + "\n…(texto truncado)" : t);
      // PDF / Word / Excel → extracción estructurada de texto.
      if (/(pdf|word|officedocument|spreadsheet|ms-excel)/i.test(mime) || /\.(pdf|docx?|xlsx?)$/i.test(name)) {
        const txt = await extractDocsText([{ name, mime: file.mime, path: file.path }]);
        return txt ? clip(txt) : `No pude extraer texto de «${name}» (¿PDF escaneado o formato no soportado?).`;
      }
      // Texto plano / código / csv / json / markdown / subtítulos.
      if (/^text\//i.test(mime) || /(json|csv|xml|yaml|markdown|javascript|typescript)/i.test(mime) || /\.(txt|md|markdown|csv|tsv|json|xml|ya?ml|log|srt|vtt|html?|css|jsx?|tsx?)$/i.test(name)) {
        let buf: Buffer;
        try { buf = await readBuffer(file.path); } catch { return "El archivo no está disponible en el almacenamiento."; }
        const txt = buf.toString("utf8").trim();
        return txt ? clip(txt) : "(archivo vacío)";
      }
      if (/^image\//i.test(mime)) return `«${name}» es una imagen; no extraigo texto de imágenes. Usa send_file para mostrársela al usuario.`;
      return `No puedo leer «${name}» como texto (tipo ${mime || "desconocido"}).`;
    }

    case "send_file": {
      if (!ctx) return "No puedo enviar archivos en este contexto.";
      if (!hasPermission(session, "ver_archivos")) return "No tienes permiso para enviar archivos.";
      const ref = str(args.file);
      if (!ref) return "Falta el archivo a enviar (id o nombre).";
      const where = accessibleProjectWhere(session);
      const sel = { id: true, name: true, kind: true, url: true, path: true, mime: true, project: { select: { leadId: true, isPrivate: true, members: { select: { userId: true } } } } } as const;
      let file = await db.fileAsset.findFirst({ where: { AND: [{ project: where }, { id: ref }] }, select: sel });
      if (!file) file = await db.fileAsset.findFirst({ where: { AND: [{ project: where }, { name: { contains: ref, mode: "insensitive" } }] }, select: sel });
      if (!file) return `No encontré el archivo "${ref}" (o no tienes acceso).`;
      if (!canAccessProject(file.project, session)) return "No tienes acceso al proyecto de ese archivo.";
      const note = str(args.note);
      if (file.kind === "LOCAL" && file.path) {
        let buf: Buffer;
        try { buf = await readBuffer(file.path); } catch { return "El archivo no está disponible en el almacenamiento."; }
        await postBotFileMessage(ctx.botId, ctx.channelId, note || `📎 ${file.name}`, [{ name: file.name, mime: file.mime, buf }]);
        return JSON.stringify({ ok: true, mensaje: `Archivo «${file.name}» enviado al usuario en el chat.` });
      }
      if (file.url) {
        return JSON.stringify({ ok: true, tipo: "enlace", mensaje: `Es un archivo externo. Comparte este enlace con el usuario: ${file.url}` });
      }
      return "Ese archivo no tiene contenido local ni enlace para enviar.";
    }

    case "generar_imagen": {
      if (!ctx) return "No puedo enviar imágenes en este contexto.";
      const prompt = str(args.descripcion) || str(args.prompt);
      if (!prompt) return "Falta la descripción de la imagen a generar.";
      const aspecto = normalizeAspect(str(args.formato) || str(args.aspect_ratio) || str(args.formato_imagen));
      let url: string;
      try {
        ({ url } = await generateImage(prompt, aspecto));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "error desconocido";
        if (/credit/i.test(msg)) return "No pude generar la imagen: la cuenta de Higgsfield no tiene créditos. Dile al usuario que avise al administrador para recargar créditos en Higgsfield.";
        if (/HF_CREDENTIALS/i.test(msg)) return "No pude generar la imagen: falta configurar las credenciales de Higgsfield en el servidor. Avísale al administrador.";
        return `No pude generar la imagen: ${msg}.`;
      }
      let buf: Buffer;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`descarga ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
      } catch (e) {
        return `Generé la imagen pero no pude adjuntarla (${e instanceof Error ? e.message : "error"}). Comparte este enlace con el usuario: ${url}`;
      }
      await postBotFileMessage(ctx.botId, ctx.channelId, "🖼️ Aquí tienes la imagen que generé.", [
        { name: `imagen-${Date.now()}.jpg`, mime: "image/jpeg", buf },
      ]);
      return JSON.stringify({ ok: true, mensaje: "Imagen generada y enviada al usuario en el chat (se ve y se puede descargar)." });
    }

    case "send_quote": {
      if (!ctx) return "No puedo enviar archivos en este contexto.";
      // Mismo candado que la sección de Cotizaciones: ver_finanzas (no ver_cotizaciones).
      if (!hasPermission(session, "ver_finanzas")) return "No tienes permiso para ver cotizaciones.";
      const ref = str(args.quote);
      if (!ref) return "Falta la cotización (código, id o nombre).";
      const base = { client: accessibleClientWhere(session) };
      const sel = {
        id: true, code: true, title: true, currency: true, taxRate: true, contingencyPct: true, notes: true,
        scope: true, deliverables: true, validUntil: true, createdAt: true, recipientName: true, recipientCity: true, intro: true,
        client: { select: { name: true, company: true } }, project: { select: { name: true } },
        items: { orderBy: { position: "asc" as const }, select: { section: true, description: true, unit: true, quantity: true, unitPrice: true } },
      } as const;
      let q = await db.quote.findFirst({ where: { AND: [base, { OR: [{ id: ref }, { code: { equals: ref, mode: "insensitive" } }] }] }, select: sel });
      if (!q) q = await db.quote.findFirst({ where: { AND: [base, { title: { contains: ref, mode: "insensitive" } }] }, select: sel });
      if (!q) return `No encontré la cotización "${ref}" (o no tienes acceso).`;
      let bytes: Uint8Array;
      try {
        bytes = await renderQuotePdf({
          code: q.code, title: q.title, currency: q.currency, taxRate: q.taxRate, contingencyPct: q.contingencyPct,
          notes: q.notes, scope: q.scope, deliverables: q.deliverables, validUntil: q.validUntil, createdAt: q.createdAt,
          clientName: q.client.name, clientCompany: q.client.company, recipientName: q.recipientName, recipientCity: q.recipientCity,
          intro: q.intro, projectName: q.project?.name ?? null,
          items: q.items.map((i) => ({ section: i.section, description: i.description, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice })),
        });
      } catch (e) {
        return `No pude generar el PDF: ${e instanceof Error ? e.message : "error"}.`;
      }
      await postBotFileMessage(ctx.botId, ctx.channelId, str(args.note) || `📄 Cotización ${q.code}`, [
        { name: `Cotizacion-${q.code}.pdf`, mime: "application/pdf", buf: Buffer.from(bytes) },
      ]);
      return JSON.stringify({ ok: true, mensaje: `Cotización ${q.code} enviada como PDF al usuario.` });
    }

    case "find_wiki_pages": {
      if (!hasPermission(session, "ver_wiki")) return "No tienes permiso para ver la wiki.";
      const q = str(args.query);
      const section = str(args.section);
      const where: Record<string, unknown> = {};
      if (section) where.section = { equals: section, mode: "insensitive" };
      if (q) where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { tags: { has: q } },
        { content: { contains: q, mode: "insensitive" } },
      ];
      const rows = await db.wikiPage.findMany({
        where, take: 30, orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, section: true, tags: true, updatedAt: true },
      });
      if (!rows.length) return "No hay páginas de wiki que coincidan.";
      return JSON.stringify(rows.map((p) => ({ id: p.id, titulo: p.title, seccion: p.section ?? null, tags: p.tags, actualizada: ymd(p.updatedAt) })));
    }

    case "get_wiki_page": {
      if (!hasPermission(session, "ver_wiki")) return "No tienes permiso para ver la wiki.";
      const ref = str(args.page);
      if (!ref) return "Falta la página (id o título).";
      const sel = { id: true, title: true, section: true, tags: true, content: true, updatedAt: true, owner: { select: { name: true } } } as const;
      let p = await db.wikiPage.findFirst({ where: { id: ref }, select: sel });
      if (!p) p = await db.wikiPage.findFirst({ where: { title: { contains: ref, mode: "insensitive" } }, select: sel });
      if (!p) return `No encontré la página "${ref}".`;
      const content = p.content.length > 6000 ? `${p.content.slice(0, 6000)}…(contenido truncado)` : p.content;
      return JSON.stringify({ id: p.id, titulo: p.title, seccion: p.section ?? null, tags: p.tags, responsable: p.owner?.name ?? null, actualizada: ymd(p.updatedAt), contenido: content });
    }

    case "list_credentials": {
      if (!hasPermission(session, "ver_contrasenas")) return "No tienes permiso para ver las contraseñas.";
      // Mismo filtro de acceso que la página: admin todo; los demás solo las suyas o donde son viewers.
      const access = session.role === "admin" ? {} : { OR: [{ createdById: session.id }, { viewers: { some: { userId: session.id } } }] };
      const filters: Record<string, unknown>[] = [access];
      if (str(args.category)) filters.push({ category: { equals: str(args.category), mode: "insensitive" } });
      if (str(args.query)) filters.push({ OR: [{ title: { contains: str(args.query), mode: "insensitive" } }, { username: { contains: str(args.query), mode: "insensitive" } }] });
      const rows = await db.credential.findMany({
        where: { AND: filters }, take: 30, orderBy: { title: "asc" },
        select: { title: true, category: true, username: true, url: true, notes: true },
      });
      if (!rows.length) return "No hay credenciales que puedas ver.";
      // Seguridad: NUNCA se descifra ni se devuelve la contraseña en el chat.
      return JSON.stringify({
        nota: "Por seguridad NO muestro la contraseña en el chat; el usuario la revela en Wiki → Contraseñas.",
        credenciales: rows.map((c) => ({ titulo: c.title, categoria: c.category ?? null, usuario: c.username ?? null, url: c.url ?? null, notas: c.notes ?? null })),
      });
    }

    case "get_wiki_table": {
      if (!hasPermission(session, "ver_wiki")) return "No tienes permiso para ver la wiki.";
      const ref = str(args.table).toLowerCase();
      const key = ref.includes("inventario") ? "sys:inventario" : ref.includes("ubicaci") ? "sys:ubicacion" : null;
      // Por clave (inventario/ubicación) o por nombre, pero SOLO tablas de wiki/globales:
      // las de proyecto se leen con read_table (con su control de acceso al proyecto).
      const table = key
        ? await db.dataTable.findUnique({ where: { key }, select: TABLE_SELECT })
        : await db.dataTable.findFirst({ where: { name: { contains: str(args.table), mode: "insensitive" }, OR: [{ key: { not: null } }, { wikiPageId: { not: null } }] }, select: TABLE_SELECT });
      if (!table) return "No encontré esa tabla de wiki. Usa 'inventario' o 'ubicacion', o read_table para tablas de proyecto.";
      return renderDataTable(table);
    }

    case "list_tables": {
      const ref = str(args.project);
      if (!ref) return "Falta el proyecto.";
      const p = await resolveProject(session, ref);
      if (!p) return "No encontré ese proyecto o no tienes acceso.";
      const rows = await db.dataTable.findMany({
        where: { projectId: p.id }, orderBy: { createdAt: "asc" },
        select: { id: true, name: true, _count: { select: { rows: true, columns: true } } },
      });
      if (!rows.length) return `El proyecto «${p.name}» no tiene tablas.`;
      return JSON.stringify(rows.map((t) => ({ id: t.id, nombre: t.name, columnas: t._count.columns, filas: t._count.rows })));
    }

    case "read_table": {
      const ref = str(args.table);
      if (!ref) return "Falta la tabla (id o nombre).";
      // Solo tablas que cuelgan de un proyecto al que la persona tiene acceso.
      const filters: Record<string, unknown>[] = [{ project: accessibleProjectWhere(session) }];
      if (str(args.project)) {
        const p = await resolveProject(session, str(args.project));
        if (!p) return "No encontré ese proyecto o no tienes acceso.";
        filters.push({ projectId: p.id });
      }
      let table = await db.dataTable.findFirst({ where: { AND: [...filters, { id: ref }] }, select: TABLE_SELECT });
      if (!table) table = await db.dataTable.findFirst({ where: { AND: [...filters, { name: { contains: ref, mode: "insensitive" } }] }, select: TABLE_SELECT });
      if (!table) return `No encontré la tabla "${ref}" en proyectos a los que tengas acceso.`;
      return renderDataTable(table);
    }

    default:
      return `Herramienta desconocida: ${name}`;
  }
}
