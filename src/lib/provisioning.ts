import type { PrismaClient } from "@prisma/client";
import { DEFAULT_FOLDERS, TEMPLATES, type TemplateContent } from "./templates";
import { createWithSequentialCode, maxCodeFrom } from "./sequential-code";
import { bogotaNoon, todayInputValue } from "./today";
import { festivosDeFechas, programarPlantilla, sumarHabiles } from "./plantillas/calendario";

// Resuelve la definición de una plantilla por su `key`: primero la versión
// editable de la BD (ProjectTemplate), y si no existe cae a la del código.
export async function resolveTemplate(
  db: PrismaClient,
  key: string,
): Promise<{ type: string; emoji: string; content: TemplateContent } | null> {
  if (!key) return null;
  const row = await db.projectTemplate.findUnique({ where: { key } });
  if (row) {
    const content = row.content as unknown as TemplateContent;
    // Las copias de BD de las plantillas de FÁBRICA nacieron antes del plan de producción
    // (ancla/offset/duración/rol): sin esto, el calendario del código quedaría a la sombra
    // para siempre. Se FUSIONA por título: la tarea de BD adopta el calendario del código
    // solo si no declara el suyo — lo que el equipo haya editado a mano siempre gana.
    const codigo = TEMPLATES.find((t) => t.key === key);
    if (codigo && content?.tasks?.length) {
      const porTitulo = new Map(codigo.content.tasks.map((t) => [t.title, t]));
      content.tasks = content.tasks.map((t) => {
        const c = porTitulo.get(t.title);
        if (!c || t.ancla !== undefined || t.duracionDias !== undefined || t.offsetDias !== undefined) return t;
        return { ...t, ancla: c.ancla, offsetDias: c.offsetDias, duracionDias: c.duracionDias, estimatedMinutes: t.estimatedMinutes ?? c.estimatedMinutes, role: t.role ?? c.role };
      });
      const entPorNombre = new Map(codigo.content.deliverables.map((d) => [d.name, d]));
      content.deliverables = (content.deliverables ?? []).map((d) =>
        d.offsetDias === undefined && entPorNombre.get(d.name)?.offsetDias !== undefined ? { ...d, offsetDias: entPorNombre.get(d.name)!.offsetDias } : d,
      );
    }
    return { type: row.type, emoji: row.emoji ?? "🎬", content };
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
  opts: {
    templateKey: string;
    name: string;
    clientId: string;
    leadId?: string | null;
    // Fechas REALES del proyecto: con ellas, las tareas que declaran calendario en la
    // plantilla nacen programadas hacia atrás (lib/plantillas/calendario) en vez de todas
    // venciendo hoy, y los entregables nacen con su fecha de compromiso.
    fechas?: { entrega: string; rodaje?: string | null } | null;
  },
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

  // ── Fechas del plan ──
  // Con fechas reales, las tareas que declaran calendario nacen programadas hacia atrás y
  // NINGUNA nace vencida. Sin fechas (proyecto en blanco, plantilla vieja): como siempre, hoy.
  const fechaDe = (clave: string) => new Date(`${clave}T12:00:00.000Z`);
  const plan =
    opts.fechas && content?.tasks.some((t) => t.ancla !== undefined || t.duracionDias !== undefined)
      ? programarPlantilla(content.tasks, { entrega: opts.fechas.entrega, rodaje: opts.fechas.rodaje ?? null, hoy: todayInputValue() })
      : null;
  const planPorTitulo = new Map((plan?.tareas ?? []).map((t) => [t.title, t]));

  if (content?.tasks.length) {
    const cols = content.stages?.length ? content.stages : [];
    const total = content.tasks.length;
    const hoy = bogotaNoon(); // toda tarea lleva inicio y fin; sin plan, arrancan hoy
    await db.task.createMany({
      data: content.tasks.map((t, i) => {
        const p = planPorTitulo.get(t.title);
        return {
          projectId: project.id,
          title: t.title,
          priority: t.priority ?? "MEDIA",
          // fase explícita de la plantilla; si no, se distribuye por la posición.
          stage: t.stage ?? (cols.length ? cols[Math.min(cols.length - 1, Math.floor((i * cols.length) / total))] : null),
          position: i,
          assigneeId: opts.leadId ?? null,
          startDate: p?.inicio ? fechaDe(p.inicio) : hoy,
          dueDate: p?.fin ? fechaDe(p.fin) : hoy,
          estimatedMinutes: t.estimatedMinutes ?? null,
        };
      }),
    });
  }

  // El proyecto toma sus fechas del plan: arranca donde arranca la primera tarea y vence el
  // día de la entrega. Los entregables nacen con su fecha de compromiso.
  if (opts.fechas) {
    const iniMin = (plan?.tareas ?? []).reduce<string | null>((m, t) => (t.inicio && (!m || t.inicio < m) ? t.inicio : m), null);
    await db.project.update({
      where: { id: project.id },
      data: { startDate: fechaDe(iniMin ?? todayInputValue()), dueDate: fechaDe(opts.fechas.entrega) },
    });
  }

  const festivosEntrega = opts.fechas ? festivosDeFechas(opts.fechas.entrega) : null;
  for (const d of content?.deliverables ?? []) {
    const due =
      opts.fechas && festivosEntrega ? fechaDe(sumarHabiles(opts.fechas.entrega, d.offsetDias ?? 0, festivosEntrega)) : null;
    await db.deliverable.create({
      data: { projectId: project.id, name: d.name, type: d.type, ...(due ? { dueDate: due } : {}) },
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
