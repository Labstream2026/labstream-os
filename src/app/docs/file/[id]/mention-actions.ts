"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { notifyMany } from "@/lib/notify";
import { encodeActionLink } from "@/lib/doc-action-link";

// Menciones dentro de un comentario del documento: al escribir «+» en el editor sale la lista
// de gente del proyecto y, al elegir a alguien, OnlyOffice nos pasa el comentario y un ancla
// del sitio exacto. Aquí se convierte en un aviso de la app que abre el documento EN ese punto.

export async function notifyDocMention(
  fileId: string,
  emails: string[],
  comment: string,
  actionLink: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };

  const file = await db.fileAsset.findUnique({
    where: { id: fileId },
    select: {
      name: true,
      projectId: true,
      project: {
        select: {
          name: true,
          isPrivate: true,
          leadId: true,
          archivedAt: true,
          finishedAt: true,
          members: { select: { userId: true, role: true } },
        },
      },
    },
  });
  if (!file) return { ok: false, error: "El archivo no existe" };
  if (!canAccessProject(file.project, session)) return { ok: false, error: "Sin acceso" };

  // Los correos los propone el navegador: solo valen si son de gente que YA tiene acceso a
  // este proyecto (si no, mencionar sería una forma de filtrar el documento a cualquiera).
  const permitidos = new Set([file.project.leadId, ...file.project.members.map((m) => m.userId)].filter(Boolean));
  const destinos = await db.user.findMany({
    where: { email: { in: emails.slice(0, 20).map((e) => e.trim().toLowerCase()) }, active: true },
    select: { id: true },
  });
  const ids = destinos.map((u) => u.id).filter((id) => permitidos.has(id));
  if (!ids.length) return { ok: true }; // nadie a quien avisar: no es un error

  const texto = comment.trim().replace(/\s+/g, " ");
  const ancla = actionLink ? `?ir=${encodeActionLink(actionLink)}` : "";
  await notifyMany(ids, {
    type: "doc_mention",
    event: "doc_mention",
    actorId: session.id,
    title: `${session.name} te mencionó en «${file.name}»`,
    body: texto.length > 160 ? `${texto.slice(0, 159)}…` : texto,
    link: `/docs/file/${fileId}${ancla}`,
    projectId: file.projectId,
    groupKey: `doc:${fileId}`,
  });
  return { ok: true };
}
