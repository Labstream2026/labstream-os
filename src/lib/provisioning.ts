import type { PrismaClient } from "@prisma/client";
import { DEFAULT_FOLDERS, TEMPLATES, type TemplateContent } from "./templates";

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

// Siguiente código correlativo LS-XXXX.
export async function nextProjectCode(db: PrismaClient): Promise<string> {
  const last = await db.project.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const n = last ? parseInt(last.code.replace(/\D/g, ""), 10) + 1 : 1;
  return `LS-${String(n).padStart(4, "0")}`;
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
  const code = await nextProjectCode(db);

  const stages = tpl?.content?.stages?.length ? tpl.content.stages : undefined;
  const project = await db.project.create({
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
  });

  // canal de chat del proyecto (automatización)
  await db.chatChannel.create({
    data: { type: "PROJECT", name: opts.name, projectId: project.id },
  });

  const content = tpl?.content;
  await createFolders(db, project.id, content?.folders ?? DEFAULT_FOLDERS);

  if (content?.tasks.length) {
    const cols = content.stages?.length ? content.stages : [];
    const total = content.tasks.length;
    await db.task.createMany({
      data: content.tasks.map((t, i) => ({
        projectId: project.id,
        title: t.title,
        priority: t.priority ?? "MEDIA",
        // fase explícita de la plantilla; si no, se distribuye por la posición.
        stage: t.stage ?? (cols.length ? cols[Math.min(cols.length - 1, Math.floor((i * cols.length) / total))] : null),
        position: i,
        assigneeId: opts.leadId ?? null,
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
