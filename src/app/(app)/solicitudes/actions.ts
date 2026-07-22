"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canWriteProject } from "@/lib/project-access";
import { notifyAndEmail, notifyManyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { REQUEST_TYPES } from "@/lib/client-portal";

// ── Solicitudes del cliente ──
// El cliente pide cosas SIN chat: una solicitud estructurada (tipo + título + detalle) que nace
// como TAREA del equipo (asignada al responsable del proyecto) y tiene estado visible para el
// cliente: RECIBIDA → EN_CURSO → RESUELTA. Asíncrono y ordenado — una solicitud, una resolución.
// (Un archivo "use server" solo puede exportar funciones async: el catálogo de tipos vive en
// @/lib/client-portal.)

export async function createClientRequest(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await getSession();
    if (!session || session.role !== "cliente" || !hasPermission(session, "comentar")) {
      return { ok: false, error: "Solo el portal del cliente puede crear solicitudes." };
    }

    const projectId = String(fd.get("projectId") ?? "");
    const type = String(fd.get("type") ?? "");
    const title = String(fd.get("title") ?? "").trim();
    const details = String(fd.get("details") ?? "").trim();

    if (!REQUEST_TYPES[type]) return { ok: false, error: "Elige el tipo de solicitud." };
    if (title.length < 3) return { ok: false, error: "Cuéntanos qué necesitas (mínimo 3 letras)." };
    if (title.length > 140) return { ok: false, error: "El título es muy largo (máx. 140)." };
    if (details.length > 2000) return { ok: false, error: "El detalle es muy largo (máx. 2000)." };

    // El cliente solo pide en SUS proyectos (miembro), y no en la papelera.
    const [member, project] = await Promise.all([
      db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: session.id } }, select: { userId: true } }),
      db.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, leadId: true, archivedAt: true, members: { select: { userId: true } } },
      }),
    ]);
    if (!project || project.archivedAt || (!member && project.leadId !== session.id)) {
      return { ok: false, error: "No tienes acceso a ese proyecto." };
    }

    // Freno anti-ráfaga: máximo una solicitud cada 3 minutos por persona.
    const last = await db.clientRequest.findFirst({
      where: { createdById: session.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last && Date.now() - last.createdAt.getTime() < 3 * 60 * 1000) {
      return { ok: false, error: "Acabas de enviar una solicitud. Espera unos minutos antes de la siguiente." };
    }

    const meta = REQUEST_TYPES[type];

    // Tarea espejo para el equipo (el seguimiento vive en el tablero del proyecto).
    const task = await db.task.create({
      data: {
        title: `Solicitud del cliente: ${title}`.slice(0, 180),
        description: `${details ? `${details}\n\n` : ""}— ${meta.label} de ${session.name} (portal del cliente)`,
        projectId,
        assigneeId: project.leadId ?? undefined,
        ownerId: session.id,
        priority: type === "CAMBIO" ? "ALTA" : "MEDIA",
      },
      select: { id: true },
    });

    await db.clientRequest.create({
      data: { projectId, createdById: session.id, type, title, details: details || null, taskId: task.id },
    });

    // Avisa al equipo interno del proyecto (lead + miembros que no son clientes).
    const memberIds = [...new Set([project.leadId, ...project.members.map((m) => m.userId)].filter(Boolean))] as string[];
    const internal = memberIds.length
      ? await db.user.findMany({
          where: { id: { in: memberIds }, active: true, isSystemBot: false, NOT: { role: { key: "cliente" } } },
          select: { id: true },
        })
      : [];
    const recipients = internal.map((u) => u.id);
    await notifyManyAndEmail(recipients, {
      event: "client_request",
      type: "client_request",
      title: `${meta.emoji} Solicitud de ${session.name}: ${title}`,
      body: `${meta.label} · ${project.name}${details ? ` — ${details.slice(0, 180)}` : ""}`,
      link: `/proyectos/${projectId}?tab=resumen`,
      actorId: session.id,
      projectId,
    });
    await logActivity({
      action: "client.request",
      summary: `envió una solicitud desde el portal: «${title}» (${meta.label})`,
      projectId,
      exclude: recipients,
    });

    revalidatePath("/solicitudes");
    revalidatePath(`/proyectos/${projectId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo enviar la solicitud." };
  }
}

// El EQUIPO gestiona la solicitud: tomarla (EN_CURSO) o resolverla (con nota para el cliente).
export async function setRequestStatus(
  requestId: string,
  status: "EN_CURSO" | "RESUELTA",
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await getSession();
    if (!session || session.role === "cliente" || session.role === "demo") return { ok: false, error: "Sin permiso." };
    if (status !== "EN_CURSO" && status !== "RESUELTA") return { ok: false, error: "Estado inválido." };

    const req = await db.clientRequest.findUnique({
      where: { id: requestId },
      select: { id: true, title: true, status: true, projectId: true, createdById: true },
    });
    if (!req) return { ok: false, error: "Solicitud no encontrada." };

    const project = await db.project.findUnique({
      where: { id: req.projectId },
      select: { id: true, name: true, isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } },
    });
    if (!project || !canWriteProject(project, session)) return { ok: false, error: "Sin permiso en este proyecto." };

    const clean = (note ?? "").trim().slice(0, 500);
    await db.clientRequest.update({
      where: { id: requestId },
      data:
        status === "RESUELTA"
          ? { status, responseNote: clean || null, resolvedAt: new Date(), resolvedById: session.id }
          : { status, responseNote: clean || null, resolvedAt: null, resolvedById: null },
    });

    // El cliente ve el avance sin perseguir a nadie: aviso directo con la respuesta.
    await notifyAndEmail(req.createdById, {
      event: "client_request_update",
      type: "client_request_update",
      title:
        status === "RESUELTA"
          ? `✅ Tu solicitud «${req.title}» quedó resuelta`
          : `🔧 Tu solicitud «${req.title}» está en curso`,
      body: clean || `${project.name} · el equipo ${status === "RESUELTA" ? "la marcó como resuelta" : "ya está trabajando en ella"}.`,
      link: "/solicitudes",
      actorId: session.id,
      projectId: project.id,
    });

    revalidatePath("/solicitudes");
    revalidatePath(`/proyectos/${req.projectId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar la solicitud." };
  }
}
