import type { PrismaClient } from "@prisma/client";
import { DEFAULT_FOLDERS, TEMPLATES, type TemplateContent } from "./templates";
import { createWithSequentialCode, maxCodeFrom } from "./sequential-code";
import { bogotaNoon } from "./today";

// Resuelve la definición de una plantilla por su `key`: primero la versión
// editable de la BD (ProjectTemplate), y si no existe cae a la del código.
async function resolveTemplate(
  db: PrismaClient,
  key: string,
): Promise<{ type: string; emoji: string; content: TemplateContent } | null> {
  if (!key) return null;
  const row = await db.projectTemplate.findUnique({ where: { key } });
  if (row) {
    return { type: row.type, emoji: row.emoji ?? "🎬", content: row.content as unknown as TemplateContent };
  }
  const tpl = TEMPLATES.find((t) => t.key === key);
  return tpl ? { type: tpl.type, emoji: tpl.emoji, content: tpl.content } : null;
}

// Código más alto de proyecto (para derivar el siguiente LS-XXXX sin colisiones).
function projectMaxCode(db: PrismaClient): Promise<string | null> {
  return maxCodeFrom((args) => db.project.findMany(args));
}

// Crea la estructura de carpetas sugerida del proyecto.
export async function createFolders(
  db: PrismaClient,
  projectId: string,
  folders: string[] = DEFAULT_FOLDERS,
) {
  await db.projectFolder.createMany({
    data: folders.map((name, i) => ({ projectId, name, position: i })),
    skipDuplicates: true,
  });
}

// Automatización v1: crear un proyecto a partir de una plantilla
// → genera carpetas, tareas y entregables típicos.
export async function instantiateTemplate(
  db: PrismaClient,
  opts: { templateKey: string; name: string; clientId: string; leadId?: string | null },
) {
  const tpl = await resolveTemplate(db, opts.templateKey);

  const stages = tpl?.content?.stages?.length ? tpl.content.stages : undefined;
  const project = await createWithSequentialCode({
    prefix: "LS",
    findMaxCode: () => projectMaxCode(db),
    create: (code) =>
      db.project.create({
        data: {
          code,
          name: opts.name,
          clientId: opts.clientId,
          leadId: opts.leadId ?? null,
          type: (tpl?.type ?? "REEL") as never,
          emoji: tpl?.emoji ?? "🎬",
          templateKey: opts.templateKey || null,
          status: "EN_PLANEACION",
          ...(stages ? { stages } : {}),
        },
      }),
  });

  // Canal de chat del proyecto: PRIVADO (por invitación). El responsable entra
  // como administrador del chat; el resto del equipo debe ser invitado.
  await db.chatChannel.create({
    data: {
      type: "PROJECT",
      audience: "INTERNAL", // canal del EQUIPO; el canal con el cliente se crea al invitar a uno
      name: opts.name,
      projectId: project.id,
      isPublic: false,
      ...(opts.leadId ? { members: { create: { userId: opts.leadId, role: "ADMIN" as never } } } : {}),
    },
  });

  const content = tpl?.content;
  // Solo se crean carpetas si la plantilla define una lista explícita y no vacía.
  // Los proyectos nuevos arrancan SIN carpetas (el equipo las crea a su gusto).
  if (content?.folders?.length) await createFolders(db, project.id, content.folders);

  if (content?.tasks.length) {
    const cols = content.stages?.length ? content.stages : [];
    const total = content.tasks.length;
    const hoy = bogotaNoon(); // toda tarea lleva inicio y fin; las de plantilla arrancan hoy
    await db.task.createMany({
      data: content.tasks.map((t, i) => ({
        projectId: project.id,
        title: t.title,
        priority: t.priority ?? "MEDIA",
        // fase explícita de la plantilla; si no, se distribuye por la posición.
        stage: t.stage ?? (cols.length ? cols[Math.min(cols.length - 1, Math.floor((i * cols.length) / total))] : null),
        position: i,
        assigneeId: opts.leadId ?? null,
        startDate: hoy,
        dueDate: hoy,
      })),
    });
  }

  for (const d of content?.deliverables ?? []) {
    await db.deliverable.create({
      data: { projectId: project.id, name: d.name, type: d.type },
    });
  }

  // Tableros colaborativos especializados (plan de rodaje, shot list, etc.).
  for (const tbl of content?.tables ?? []) {
    await db.dataTable.create({
      data: {
        name: tbl.name,
        projectId: project.id,
        columns: {
          create: tbl.columns.map((c, i) => ({
            name: c.name,
            type: c.type as never,
            position: i,
            options: (c.options ?? undefined) as never,
          })),
        },
        rows: { create: Array.from({ length: tbl.rows ?? 3 }, (_, i) => ({ position: i })) },
      },
    });
  }

  return project;
}
