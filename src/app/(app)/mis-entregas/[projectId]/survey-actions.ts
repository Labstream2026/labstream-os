"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notifyManyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";

// Encuesta de satisfacción al TERMINAR un proyecto: el cliente califica 1–5 (+ comentario).
// Una respuesta por persona y proyecto (upsert: puede corregir su calificación).
export async function submitProjectSurvey(
  projectId: string,
  fd: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await getSession();
    if (!session || session.role !== "cliente") return { ok: false, error: "Solo el portal del cliente." };

    const score = Number(fd.get("score"));
    const comment = String(fd.get("comment") ?? "").trim().slice(0, 1000);
    if (!Number.isInteger(score) || score < 1 || score > 5) return { ok: false, error: "Elige de 1 a 5 estrellas." };

    const [member, project] = await Promise.all([
      db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: session.id } }, select: { userId: true } }),
      db.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, leadId: true, finishedAt: true },
      }),
    ]);
    if (!project || (!member && project.leadId !== session.id)) return { ok: false, error: "No tienes acceso a ese proyecto." };
    if (!project.finishedAt) return { ok: false, error: "La encuesta se abre cuando el proyecto termina." };

    await db.projectSurvey.upsert({
      where: { projectId_userId: { projectId, userId: session.id } },
      create: { projectId, userId: session.id, score, comment: comment || null },
      update: { score, comment: comment || null },
    });

    // Termómetro para el equipo: responsable + dirección (admin/gerente) se enteran al instante.
    const direction = await db.user.findMany({
      where: { active: true, isSystemBot: false, role: { key: { in: ["admin", "gerente"] } } },
      select: { id: true },
    });
    const stars = "⭐".repeat(score);
    await notifyManyAndEmail([project.leadId, ...direction.map((u) => u.id)], {
      event: "client_survey",
      type: "client_survey",
      title: `${stars} ${session.name} calificó «${project.name}»: ${score}/5`,
      body: comment || undefined,
      link: `/proyectos/${projectId}`,
      actorId: session.id,
      projectId,
    });
    await logActivity({
      action: "client.survey",
      summary: `calificó el proyecto con ${score}/5 al terminar`,
      projectId,
      silent: true,
    });

    revalidatePath(`/mis-entregas/${projectId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo guardar tu calificación." };
  }
}
