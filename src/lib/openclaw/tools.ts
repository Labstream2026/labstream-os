import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { getLiveAuthState } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { accessibleProjectWhere, canWriteProject } from "@/lib/project-access";
import { accessibleClientWhere, userCanAccessClient } from "@/lib/client-access";
import { composeQuoteTotals } from "@/lib/quote-compose";
import { instantiateTemplate } from "@/lib/provisioning";
import { notifyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
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
          dueDate: { type: "string", description: "Fecha de entrega YYYY-MM-DD (opcional)." },
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
      description: "Lista las cotizaciones que la persona puede ver (REQUIERE permiso para ver cotizaciones; si no lo tiene, la herramienta lo niega). Filtra por cliente o estado.",
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
      description: "Lista las facturas que la persona puede ver (REQUIERE permiso para ver cotizaciones/facturación; si no lo tiene, la herramienta lo niega). Filtra por cliente o estado.",
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
];

// ── Ejecución de cada herramienta (con los permisos de `session`) ──
export async function executeAgentTool(name: string, args: Record<string, unknown>, session: SessionUser): Promise<string> {
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
      const dueDate = parseDate(args.dueDate);
      const position = projectId ? await db.task.count({ where: { projectId } }) : 0;
      const task = await db.task.create({
        data: {
          title, description: str(args.description) || null, projectId, assigneeId,
          ownerId: session.id, assignedById: assigneeId && assigneeId !== session.id ? session.id : null,
          priority, dueDate, isPrivate: args.isPrivate === true,
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
      // Candado: mismo permiso que la sección. Un rol sin él (p. ej. editor) recibe la
      // negativa y el agente la traslada al usuario.
      if (!hasPermission(session, "ver_cotizaciones")) return "No tienes permiso para ver cotizaciones.";
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
      if (!hasPermission(session, "ver_cotizaciones")) return "No tienes permiso para ver facturas.";
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

    default:
      return `Herramienta desconocida: ${name}`;
  }
}
