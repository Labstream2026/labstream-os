"use server";

import { noAutorizado } from "@/lib/authz-error";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessClient, accessibleClientWhere } from "@/lib/client-access";
import { ensureProjectChannels } from "@/lib/project-chat";
import { instantiateTemplate } from "@/lib/provisioning";
import { validateAssignee } from "@/lib/task-assign";
import { logActivity } from "@/lib/activity";
import { notifyAndEmail } from "@/lib/notify";

type WizardAnswer = { taskTitle: string; assigneeId?: string | null; dueDate?: string | null };

export async function createProject(formData: FormData) {
  const session = await getSession();
  if (!hasPermission(session, "crear_proyectos")) noAutorizado();
  const name = String(formData.get("name") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "");
  // El responsable (lead) lo asigna el equipo, NO el cliente: ser lead otorga gestión del proyecto
  // (canManageProject) y del chat. Aunque el formulario del cliente no muestra el campo, el POST es
  // alcanzable, así que el cliente nunca puede fijarse como lead (se ignora su leadId).
  const leadId = session?.role === "cliente" ? null : (String(formData.get("leadId") ?? "") || null);
  const templateKey = String(formData.get("templateKey") ?? "");
  if (!name || !clientId) return;
  // No confiar en el clientId del formulario: exigir que el usuario pueda acceder a ese cliente.
  if (!(await userCanAccessClient(clientId, session))) noAutorizado();

  const project = await instantiateTemplate(db, {
    templateKey,
    name,
    clientId,
    leadId,
  });

  // El cliente accede a sus proyectos SOLO por membresía (no por la rama de proyectos públicos),
  // así que al crear uno debe quedar como miembro GUEST (solo lectura) para poder verlo.
  // Además, un proyecto creado por el CLIENTE no debe nacer HUÉRFANO (antes quedaba solo con el
  // cliente dentro: sin responsable, sin equipo, sin nadie en el chat y sin aviso al equipo).
  let clientTeamAdded: string[] = [];
  if (session?.role === "cliente") {
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: session.id } },
      create: { projectId: project.id, userId: session.id, role: "GUEST" },
      update: {},
    });
    // El brief que escribió el cliente queda como descripción del proyecto para que el equipo lo lea.
    const brief = String(formData.get("brief") ?? "").trim();
    if (brief) await db.project.update({ where: { id: project.id }, data: { description: brief.slice(0, 1000) } });

    // Entran SOLOS: la dirección (admin/gerente) y los RESPONSABLES de la cuenta — el proyecto
    // les aparece en sus listas, quedan en su chat y reciben el aviso desde el minuto 1.
    const [direccion, responsables, myClients] = await Promise.all([
      db.user.findMany({
        where: { active: true, isSystemBot: false, role: { key: { in: ["admin", "gerente"] } } },
        select: { id: true },
      }),
      db.clientMember.findMany({ where: { clientId, role: "RESPONSABLE" }, select: { userId: true } }),
      db.client.findMany({ where: accessibleClientWhere(session), select: { id: true } }),
    ]);
    // Personas que el cliente MARCÓ en el formulario: solo se aceptan las que YA conoce
    // (responsables o equipo de los proyectos de sus clientes; el POST no es de fiar y no debe
    // servir para descubrir el directorio completo de la empresa).
    const myClientIds = myClients.map((c) => c.id);
    const picked = [...new Set(formData.getAll("members").map(String).filter(Boolean))];
    const validPicked = picked.length
      ? await db.user.findMany({
          where: {
            id: { in: picked },
            active: true,
            isSystemBot: false,
            role: { key: { notIn: ["cliente", "demo"] } },
            OR: [
              { role: { key: { in: ["admin", "gerente"] } } },
              { clientMemberships: { some: { clientId: { in: myClientIds } } } },
              { projectMemberships: { some: { project: { clientId: { in: myClientIds } } } } },
              { ledProjects: { some: { clientId: { in: myClientIds } } } },
            ],
          },
          select: { id: true },
        })
      : [];
    clientTeamAdded = [
      ...new Set([...direccion.map((u) => u.id), ...responsables.map((m) => m.userId), ...validPicked.map((u) => u.id)]),
    ].filter((id) => id !== session.id);
    if (clientTeamAdded.length) {
      await db.projectMember.createMany({
        data: clientTeamAdded.map((userId) => ({ projectId: project.id, userId })),
        skipDuplicates: true,
      });
      // Los chats del proyecto nacen ya con el equipo dentro (incluido el canal con el cliente).
      try {
        await ensureProjectChannels(project.id);
      } catch {
        // best-effort: el chat se sincroniza igual en la próxima carga.
      }
      // Aviso directo con correo (alta señal: el cliente inició un proyecto). Sin `event`:
      // igual que la actividad de proyectos, no es un aviso que se pueda apagar por tipo.
      for (const userId of clientTeamAdded) {
        await notifyAndEmail(userId, {
          type: "project",
          title: `${session.name} (cliente) creó el proyecto «${name}»`,
          body: "Entraste al equipo automáticamente. Revisa el brief y asigna un responsable.",
          link: `/proyectos/${project.id}`,
          actorId: session.id,
        });
      }
    }
  }

  await logActivity({
    action: "project.create",
    summary: templateKey ? `creó el proyecto «${name}» desde plantilla` : `creó el proyecto «${name}»`,
    projectId: project.id,
    entityType: "project",
    entityId: project.id,
    // El equipo auto-agregado ya recibió el aviso directo (con correo): sin duplicados.
    exclude: clientTeamAdded,
  });

  // Aplicar respuestas del wizard: asignar responsables y fechas a las tareas
  // creadas por la plantilla (por título), y avisar a los responsables.
  let answers: WizardAnswer[] = [];
  try {
    answers = JSON.parse(String(formData.get("wizard") ?? "[]"));
  } catch { /* sin wizard */ }
  for (const a of answers) {
    if (!a.taskTitle || (!a.assigneeId && !a.dueDate)) continue;
    const task = await db.task.findFirst({ where: { projectId: project.id, title: a.taskTitle }, select: { id: true } });
    if (!task) continue;
    // El responsable del wizard debe ser del equipo (nunca un cliente; si quien crea es un cliente,
    // solo su equipo del proyecto). Evita que un cliente asigne tareas a cualquiera al crear proyecto.
    const assigneeId = await validateAssignee(project.id, a.assigneeId || null, session);
    const dueDate = a.dueDate ? new Date(`${a.dueDate}T12:00:00.000Z`) : null;
    await db.task.update({
      where: { id: task.id },
      data: {
        ...(assigneeId ? { assigneeId, assignedById: session?.id ?? null } : {}),
        ...(a.dueDate ? { dueDate } : {}),
      },
    });
    if (assigneeId && assigneeId !== session?.id) {
      await notifyAndEmail(assigneeId, {
        type: "task",
        event: "task_assigned",
        title: `Tarea asignada: ${a.taskTitle}`,
        body: `En el proyecto «${name}»${a.dueDate ? ` · entrega ${a.dueDate}` : ""}.`,
        link: `/proyectos/${project.id}?tab=tareas`,
        actorId: session?.id,
      });
    }
  }

  revalidatePath("/proyectos");
  revalidatePath("/");
  redirect(`/proyectos/${project.id}`);
}
