import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiJson } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { canAccessProject, canWriteProject, canManageProject } from "@/lib/project-access";
import { canAccessClient, canManageClient, userCanAccessClient } from "@/lib/client-access";
import type { SessionUser } from "@/lib/session";

// ── Helpers COMPARTIDOS de las rutas /api/v1 ──
// La API hereda las MISMAS reglas que la app: cada gate de aquí es el espejo exacto del que usan
// los server actions (ensureProjectAccess / ensureAccessVia / canEditTaskMeta). Una credencial
// nunca puede hacer por API algo que su titular no podría hacer en la interfaz.

export const ymd = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
export const isYmd = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isHm = (s: string): boolean => /^\d{1,2}:\d{2}$/.test(s);
// Convención de fechas de la app: mediodía UTC para que no salte de día por zona horaria.
export const noon = (s: string): Date => new Date(`${s}T12:00:00.000Z`);

// Cuerpo JSON o respuesta de error (el llamador comprueba instanceof NextResponse).
export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T | NextResponse> {
  try {
    return (await req.json()) as T;
  } catch {
    return apiJson({ ok: false, error: "Cuerpo JSON inválido." }, 400);
  }
}

export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
export const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : []);

// ── Proyecto: carga + gates ──

// Select con lo necesario para TODOS los checks de acceso (incluye los miembros del cliente para
// reconocer al RESPONSABLE de la cuenta, igual que el detalle del proyecto en la app).
export const PROJECT_ACCESS_SELECT = {
  id: true,
  name: true,
  isPrivate: true,
  leadId: true,
  archivedAt: true,
  members: { select: { userId: true, role: true } },
  client: { select: { members: { select: { userId: true, role: true } } } },
} as const;

export type ProjectAccess = {
  id: string;
  name: string;
  isPrivate: boolean;
  leadId: string | null;
  archivedAt: Date | null;
  members: { userId: string; role: string }[];
  client: { members: { userId: string; role: string | null }[] } | null;
};

// Carga el proyecto y verifica LECTURA. Los archivados no existen para la API (papelera).
export async function loadProjectForRead(projectId: string, session: SessionUser): Promise<ProjectAccess | NextResponse> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: PROJECT_ACCESS_SELECT });
  if (!project || project.archivedAt) return apiJson({ ok: false, error: "Proyecto no encontrado." }, 404);
  if (!canAccessProject(project, session)) return apiJson({ ok: false, error: "Sin acceso a este proyecto." }, 403);
  return project;
}

// Verifica ESCRITURA en el proyecto (espejo de ensureProjectAccess): canWriteProject y, si no,
// la excepción del PORTAL CLIENTE — miembro GUEST con el permiso explícito indicado (así el
// cliente puede crear tareas/subir archivos en SU proyecto, igual que en la app).
export async function loadProjectForWrite(projectId: string, session: SessionUser, perm?: string): Promise<ProjectAccess | NextResponse> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: PROJECT_ACCESS_SELECT });
  if (!project || project.archivedAt) return apiJson({ ok: false, error: "Proyecto no encontrado." }, 404);
  if (!canWriteProject(project, session)) {
    const isClienteMember = session.role === "cliente" && perm != null && project.members.some((m) => m.userId === session.id);
    if (!(isClienteMember && hasPermission(session, perm))) return apiJson({ ok: false, error: "Sin permiso de escritura en este proyecto." }, 403);
  }
  if (perm && !hasPermission(session, perm)) return apiJson({ ok: false, error: `Falta el permiso ${perm}.` }, 403);
  return project;
}

// ── Tareas: select, gates y serializador ──

export const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  stage: true,
  priority: true,
  startDate: true,
  dueDate: true,
  dueTime: true,
  shootDate: true,
  completedAt: true,
  isPrivate: true,
  estimatedMinutes: true,
  ownerId: true,
  assigneeId: true,
  projectId: true,
  assignee: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  project: { select: { id: true, code: true, name: true, isPrivate: true, leadId: true, archivedAt: true, members: { select: { userId: true, role: true } } } },
  _count: { select: { checklist: true, comments: true } },
} as const;

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  stage: string | null;
  priority: string;
  startDate: Date | null;
  dueDate: Date | null;
  dueTime: string | null;
  shootDate: Date | null;
  completedAt: Date | null;
  isPrivate: boolean;
  estimatedMinutes: number | null;
  ownerId: string | null;
  assigneeId: string | null;
  projectId: string | null;
  assignee: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  project: { id: string; code: string | null; name: string } | null;
  _count: { checklist: number; comments: number };
};

export function shapeTask(t: TaskRow) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    stage: t.stage,
    priority: t.priority,
    startDate: ymd(t.startDate),
    dueDate: ymd(t.dueDate),
    dueTime: t.dueTime,
    shootDate: ymd(t.shootDate),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    isPrivate: t.isPrivate,
    estimatedMinutes: t.estimatedMinutes,
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
    owner: t.owner ? { id: t.owner.id, name: t.owner.name } : null,
    project: t.project ? { id: t.project.id, code: t.project.code, name: t.project.name } : null,
    checklistCount: t._count.checklist,
    commentCount: t._count.comments,
  };
}

type TaskAccessShape = {
  ownerId: string | null;
  assigneeId: string | null;
  isPrivate: boolean;
  project: { isPrivate: boolean; leadId: string | null; archivedAt: Date | null; members: { userId: string; role: string }[] } | null;
};

// ¿Puede LEER la tarea? Espejo de ensureAccessVia(perm null) + el filtro de privacidad de la app:
// una tarea privada solo la ven su dueño/responsable (y el admin).
export function canReadTask(task: TaskAccessShape, session: SessionUser): boolean {
  const mine = task.ownerId === session.id || task.assigneeId === session.id;
  if (task.isPrivate && !mine && session.role !== "admin") return false;
  if (task.project) {
    if (task.project.archivedAt) return false;
    return canAccessProject(task.project, session);
  }
  return session.role === "admin" || mine;
}

// ¿Puede ESCRIBIR la tarea con este permiso? Espejo exacto de ensureAccessVia: acceso de escritura
// al proyecto (o excepción cliente-miembro-con-permiso), y el permiso del catálogo con BYPASS para
// el dueño o el responsable de SU propia tarea.
export function canWriteTask(task: TaskAccessShape, session: SessionUser, perm: string | null = "editar_tareas"): boolean {
  const mine = task.ownerId === session.id || task.assigneeId === session.id;
  if (task.project) {
    if (task.project.archivedAt) return false;
    if (!canWriteProject(task.project, session)) {
      const clienteOk = session.role === "cliente" && perm != null && task.project.members.some((m) => m.userId === session.id) && hasPermission(session, perm);
      if (!clienteOk) return false;
    }
  } else {
    if (!(session.role === "admin" || mine)) return false;
  }
  if (perm && !hasPermission(session, perm) && !mine) return false;
  return true;
}

// ¿Puede cambiar PRIORIDAD y FECHAS? Espejo de canEditTaskMeta de los server actions: quien la
// creó, admin/productor, el cliente con gestionar_cronograma (ya acotado a su proyecto por
// canWriteTask) o quien gestiona el proyecto.
export function canEditTaskMetaApi(task: TaskAccessShape, session: SessionUser): boolean {
  if (session.role === "admin" || session.role === "productor") return true;
  if (task.ownerId === session.id) return true;
  if (session.role === "cliente" && hasPermission(session, "gestionar_cronograma")) return true;
  return !!task.project && canManageProject(task.project, session);
}

// Recalcula el progreso del proyecto (% tareas completadas) — mismo cálculo que la app.
export async function recalcProgress(projectId: string | null): Promise<void> {
  if (!projectId) return;
  const [total, done] = await Promise.all([
    db.task.count({ where: { projectId } }),
    db.task.count({ where: { projectId, completedAt: { not: null } } }),
  ]);
  await db.project.update({ where: { id: projectId }, data: { progress: total ? Math.round((done / total) * 100) : 0 } }).catch(() => null);
}

// Cláusula de PRIVACIDAD de tareas para listados: fuera las privadas de otros (el admin ve todo).
export function taskPrivacyWhere(session: SessionUser): Record<string, unknown> {
  if (session.role === "admin") return {};
  return { OR: [{ isPrivate: false }, { ownerId: session.id }, { assigneeId: session.id }] };
}

// ── Citas del calendario: include, serializador y visibilidad ──

export const EVENT_INCLUDE = {
  project: { select: { id: true, name: true, isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } },
  attendees: { select: { status: true, user: { select: { id: true, name: true } } } },
  guests: { select: { email: true } },
} as const;

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  start: Date;
  end: Date | null;
  allDay: boolean;
  location: string | null;
  source: string;
  createdById: string | null;
  projectId: string | null;
  project: { id: string; name: string; isPrivate: boolean; leadId: string | null; members: { userId: string; role: string }[] } | null;
  attendees: { status: string; user: { id: string; name: string } }[];
  guests: { email: string }[];
};

export function shapeEvent(e: EventRow) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    start: e.start.toISOString(),
    end: e.end ? e.end.toISOString() : null,
    allDay: e.allDay,
    location: e.location,
    source: e.source,
    project: e.project ? { id: e.project.id, name: e.project.name } : null,
    attendees: e.attendees.map((a) => ({ id: a.user.id, name: a.user.name, status: a.status })),
    guests: e.guests.map((g) => g.email),
  };
}

// MISMA visibilidad que el calendario de la app: las citas importadas de un calendario personal
// (source != "app") son solo del dueño e invitados; las de la app sin proyecto son del equipo
// (nunca del portal cliente); las de proyecto, de quien accede al proyecto o está invitado.
export function eventVisible(e: EventRow, session: SessionUser): boolean {
  const me = session.id;
  if (e.source !== "app") return e.createdById === me || e.attendees.some((a) => a.user.id === me);
  if (session.role === "cliente") return !!e.project && canAccessProject(e.project, session);
  if (!e.project) return true;
  if (e.createdById === me) return true;
  if (e.attendees.some((a) => a.user.id === me)) return true;
  return canAccessProject(e.project, session);
}

// ── Proyecto: gate de GESTIÓN (miembros, papelera, carpetas) ──
// Espejo de `ensureProjectManage`: canManageProject (admin/productor, líder, editor con acceso u
// OWNER) + permiso opcional del catálogo. `allowArchived` para restaurar desde la papelera.
export async function loadProjectForManage(
  projectId: string,
  session: SessionUser,
  perm?: string,
  allowArchived = false,
): Promise<ProjectAccess | NextResponse> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: PROJECT_ACCESS_SELECT });
  if (!project || (!allowArchived && project.archivedAt)) return apiJson({ ok: false, error: "Proyecto no encontrado." }, 404);
  if (!canManageProject(project, session)) return apiJson({ ok: false, error: "Sin permiso para gestionar este proyecto." }, 403);
  if (perm && !hasPermission(session, perm)) return apiJson({ ok: false, error: `Falta el permiso ${perm}.` }, 403);
  return project;
}

// ── Cliente: select + gates (espejo de client-access) ──

export const CLIENT_ACCESS_SELECT = {
  id: true,
  name: true,
  archivedAt: true,
  members: { select: { userId: true, role: true } },
  projects: { select: { leadId: true, members: { select: { userId: true } } } },
} as const;

export type ClientAccess = {
  id: string;
  name: string;
  archivedAt: Date | null;
  members: { userId: string; role: string | null }[];
  projects: { leadId: string | null; members: { userId: string }[] }[];
};

// Carga el cliente y verifica LECTURA (ver_clientes + canAccessClient). Archivados = 404.
export async function loadClientForRead(clientId: string, session: SessionUser): Promise<ClientAccess | NextResponse> {
  if (!hasPermission(session, "ver_clientes")) return apiJson({ ok: false, error: "Sin permiso para ver clientes (ver_clientes)." }, 403);
  const client = await db.client.findUnique({ where: { id: clientId }, select: CLIENT_ACCESS_SELECT });
  if (!client || client.archivedAt) return apiJson({ ok: false, error: "Cliente no encontrado." }, 404);
  if (!canAccessClient(client, session)) return apiJson({ ok: false, error: "Sin acceso a este cliente." }, 403);
  return client;
}

// Carga el cliente y verifica GESTIÓN. Espejo de `canEditClient` de los server actions:
// canManageClient (admin/productor, editor con acceso o RESPONSABLE) O el permiso editar_clientes.
export async function loadClientForManage(clientId: string, session: SessionUser, allowArchived = false): Promise<ClientAccess | NextResponse> {
  const client = await db.client.findUnique({ where: { id: clientId }, select: CLIENT_ACCESS_SELECT });
  if (!client || (!allowArchived && client.archivedAt)) return apiJson({ ok: false, error: "Cliente no encontrado." }, 404);
  if (!canManageClient(client, session) && !hasPermission(session, "editar_clientes")) {
    return apiJson({ ok: false, error: "Sin permiso para gestionar este cliente." }, 403);
  }
  return client;
}

// ── Entregable: select + carga para gating ──
// El proyecto trae los campos que necesitan canAccessProject/canWriteProject/canManageProject
// (incluye members del cliente para reconocer al RESPONSABLE de la cuenta).
export const DELIVERABLE_ACCESS_SELECT = {
  id: true,
  name: true,
  projectId: true,
  ownerId: true,
  archivedAt: true,
  project: {
    select: {
      id: true, name: true, isPrivate: true, leadId: true, archivedAt: true,
      members: { select: { userId: true, role: true } },
      client: { select: { members: { select: { userId: true, role: true } } } },
    },
  },
  reviewers: { select: { userId: true } },
} as const;

export type DeliverableAccess = {
  id: string;
  name: string;
  projectId: string;
  ownerId: string | null;
  archivedAt: Date | null;
  project: {
    id: string; name: string; isPrivate: boolean; leadId: string | null; archivedAt: Date | null;
    members: { userId: string; role: string }[];
    client: { members: { userId: string; role: string | null }[] } | null;
  };
  reviewers: { userId: string }[];
};

// Carga el entregable con lo necesario para autorizar. El llamador aplica el gate concreto
// (canWriteProject / canManageProject) según la operación, igual que los server actions.
export async function loadDeliverable(id: string): Promise<DeliverableAccess | null> {
  return db.deliverable.findUnique({ where: { id }, select: DELIVERABLE_ACCESS_SELECT });
}

// ── Cotización: gates (espejo de requirePerm + ensureQuoteAccess) ──
export type QuoteRow = { id: string; clientId: string; status: string };

// Lectura: ver_finanzas (mismo candado que la lista y el agente) + acceso al cliente.
export async function loadQuoteForRead(quoteId: string, session: SessionUser): Promise<QuoteRow | NextResponse> {
  if (!hasPermission(session, "ver_finanzas")) return apiJson({ ok: false, error: "Sin permiso para ver finanzas (ver_finanzas)." }, 403);
  const q = await db.quote.findUnique({ where: { id: quoteId }, select: { id: true, clientId: true, status: true } });
  if (!q) return apiJson({ ok: false, error: "Cotización no encontrada." }, 404);
  if (!(await userCanAccessClient(q.clientId, session))) return apiJson({ ok: false, error: "Sin acceso a esta cotización." }, 403);
  return q;
}

// Escritura: crear_cotizaciones + acceso al cliente. `requireEditable` bloquea las APROBADAS
// (su total firmado no se toca), igual que assertEditable.
export async function loadQuoteForWrite(quoteId: string, session: SessionUser, requireEditable = false): Promise<QuoteRow | NextResponse> {
  if (!hasPermission(session, "crear_cotizaciones")) return apiJson({ ok: false, error: "Sin permiso para editar cotizaciones (crear_cotizaciones)." }, 403);
  const q = await db.quote.findUnique({ where: { id: quoteId }, select: { id: true, clientId: true, status: true } });
  if (!q) return apiJson({ ok: false, error: "Cotización no encontrada." }, 404);
  if (!(await userCanAccessClient(q.clientId, session))) return apiJson({ ok: false, error: "Sin acceso a esta cotización." }, 403);
  if (requireEditable && q.status === "APROBADA") return apiJson({ ok: false, error: "La cotización está aprobada y no se puede editar." }, 409);
  return q;
}

// ── Propuesta: ACCESO (espejo de ensureProposalAccess) ── el llamador comprueba aparte el permiso
// del catálogo (crear_cotizaciones, o aprobar_cotizaciones para marcar ACEPTADA).
export type ProposalRow = { id: string; clientId: string | null; createdById: string | null; status: string };
export async function loadProposalAccess(proposalId: string, session: SessionUser): Promise<ProposalRow | NextResponse> {
  const p = await db.proposal.findUnique({ where: { id: proposalId }, select: { id: true, clientId: true, createdById: true, status: true } });
  if (!p) return apiJson({ ok: false, error: "Propuesta no encontrada." }, 404);
  if (p.clientId) {
    if (!(await userCanAccessClient(p.clientId, session))) return apiJson({ ok: false, error: "Sin acceso a esta propuesta." }, 403);
  } else if (p.createdById !== session.id && session.role !== "admin") {
    return apiJson({ ok: false, error: "Sin acceso a esta propuesta." }, 403);
  }
  return p;
}

// ── Plan de equipos: carga + gate de escritura (canWriteProject vía su proyecto) ──
export type EquipmentPlanRow = {
  id: string; projectId: string; title: string | null; taskId: string | null;
  project: { isPrivate: boolean; leadId: string | null; archivedAt: Date | null; members: { userId: string; role: string }[]; client: { members: { userId: string; role: string | null }[] } | null };
};
export async function loadEquipmentPlan(planId: string): Promise<EquipmentPlanRow | null> {
  return db.equipmentPlan.findUnique({
    where: { id: planId },
    select: { id: true, projectId: true, title: true, taskId: true, project: { select: { isPrivate: true, leadId: true, archivedAt: true, members: { select: { userId: true, role: true } }, client: { select: { members: { select: { userId: true, role: true } } } } } } },
  });
}
