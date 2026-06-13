import type { PrismaClient } from "@prisma/client";
import { DEFAULT_FOLDERS, TEMPLATES } from "./templates";

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
  const tpl = TEMPLATES.find((t) => t.key === opts.templateKey);
  const code = await nextProjectCode(db);

  const project = await db.project.create({
    data: {
      code,
      name: opts.name,
      clientId: opts.clientId,
      leadId: opts.leadId ?? null,
      type: tpl?.type ?? "REEL",
      emoji: tpl?.emoji ?? "🎬",
      templateKey: tpl?.key ?? null,
      status: "EN_PLANEACION",
    },
  });

  const content = tpl?.content;
  await createFolders(db, project.id, content?.folders ?? DEFAULT_FOLDERS);

  if (content?.tasks.length) {
    await db.task.createMany({
      data: content.tasks.map((t, i) => ({
        projectId: project.id,
        title: t.title,
        priority: t.priority ?? "MEDIA",
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

  return project;
}
