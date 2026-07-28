import { db } from "@/lib/db";
import { notifyMany } from "@/lib/notify";
import { readDocComments } from "@/lib/doc-comments";
import { officeType } from "@/lib/onlyoffice";

// ── Lo que pasa DENTRO de un documento y se ve desde fuera ──
// Dos cosas que OnlyOffice no cuenta por sí solo y que la app necesita saber:
//  · los comentarios (viajan dentro del archivo → se leen al guardar);
//  · quién lo tiene abierto (eso sí lo dice el Document Server, en su callback de estado).
// Nada de esto puede tumbar el guardado: todo va envuelto y falla en silencio con un log.

// Pasado este rato sin noticias, se da por hecho que la persona ya cerró (si el Document
// Server se cae, nunca llega el aviso de desconexión y la presencia se quedaría pegada).
const PRESENCIA_VIVA_MIN = 30;

function corto(s: string, n = 120): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// Refleja en la BD los comentarios que trae el archivo recién guardado y avisa de los NUEVOS.
// `editorIds` son quienes tenían el documento abierto (los informa el propio callback): no se
// les avisa de lo que acaban de escribir.
export async function syncDocComments(
  fileId: string,
  buf: Buffer,
  editorIds: string[] = [],
): Promise<{ nuevos: number; total: number }> {
  try {
    const file = await db.fileAsset.findUnique({
      where: { id: fileId },
      select: {
        name: true,
        projectId: true,
        project: { select: { id: true, name: true, leadId: true, members: { select: { userId: true } } } },
      },
    });
    if (!file) return { nuevos: 0, total: 0 };

    const enElArchivo = readDocComments(buf, officeType(file.name));
    const enLaBd = await db.docComment.findMany({
      where: { fileId },
      select: { id: true, extId: true, text: true, author: true, resolved: true, taskId: true },
    });
    const previos = new Map(enLaBd.map((c) => [c.extId, c]));
    const ahora = new Set(enElArchivo.map((c) => c.extId));

    const nuevos: typeof enElArchivo = [];
    for (const c of enElArchivo) {
      const antes = previos.get(c.extId);
      if (!antes) {
        nuevos.push(c);
        continue;
      }
      // Ya lo conocíamos: solo se refresca si cambió algo (editar el texto no vuelve a avisar).
      if (antes.text !== c.text || antes.author !== c.author || antes.resolved !== c.resolved) {
        await db.docComment.update({
          where: { id: antes.id },
          data: { text: c.text, author: c.author, resolved: c.resolved, at: c.at },
        });
      }
    }
    if (nuevos.length) {
      await db.docComment.createMany({
        data: nuevos.map((c) => ({
          fileId,
          extId: c.extId,
          author: c.author,
          text: c.text,
          at: c.at,
          resolved: c.resolved,
        })),
        skipDuplicates: true,
      });
    }
    // Comentario borrado dentro del documento → fuera de la lista. Si tenía tarea, la tarea se
    // queda (es trabajo real que ya vive por su cuenta).
    const sobrantes = enLaBd.filter((c) => !ahora.has(c.extId)).map((c) => c.id);
    if (sobrantes.length) await db.docComment.deleteMany({ where: { id: { in: sobrantes } } });

    // Aviso: al equipo del proyecto y a los clientes que son miembros, menos quien lo escribió.
    const sinResolver = nuevos.filter((c) => !c.resolved);
    if (sinResolver.length && file.project) {
      const destinos = [...new Set([file.project.leadId, ...file.project.members.map((m) => m.userId)])].filter(
        (id): id is string => Boolean(id) && !editorIds.includes(id!),
      );
      const primero = sinResolver[0];
      await notifyMany(destinos, {
        type: "doc_comment",
        event: "doc_comment",
        title:
          sinResolver.length === 1
            ? `${primero.author} comentó en «${file.name}»`
            : `${sinResolver.length} comentarios nuevos en «${file.name}»`,
        body: corto(primero.text),
        link: `/docs/file/${fileId}`,
        projectId: file.projectId,
        groupKey: `doc:${fileId}`,
      });
    }
    return { nuevos: nuevos.length, total: enElArchivo.length };
  } catch (e) {
    console.error("[docs] no se pudieron sincronizar los comentarios:", e instanceof Error ? e.message : e);
    return { nuevos: 0, total: 0 };
  }
}

// Deja la presencia del documento EXACTAMENTE como la reporta el Document Server: quien no
// esté en la lista es que ya salió. Así se recupera solo si se pierde algún aviso.
export async function setDocPresence(fileId: string, userIds: string[]): Promise<void> {
  try {
    const ids = [...new Set(userIds.filter(Boolean))];
    // El id que manda OnlyOffice es el que le dimos al abrir (el del usuario), pero un
    // documento abierto por un enlace público podría traer cualquier cosa: se filtran los que
    // no existen para no reventar la clave foránea.
    const validos = ids.length
      ? (await db.user.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((u) => u.id)
      : [];
    await db.docPresence.deleteMany({
      where: { fileId, ...(validos.length ? { userId: { notIn: validos } } : {}) },
    });
    for (const userId of validos) {
      await db.docPresence.upsert({
        where: { fileId_userId: { fileId, userId } },
        create: { fileId, userId },
        update: { seenAt: new Date() },
      });
    }
  } catch (e) {
    console.error("[docs] presencia:", e instanceof Error ? e.message : e);
  }
}

export type DocPresent = { id: string; name: string; color: string | null; avatarUrl: string | null };

// Quién tiene abiertos estos documentos ahora mismo (fileId → personas), ya sin los fantasmas.
export async function docPresenceFor(fileIds: string[]): Promise<Map<string, DocPresent[]>> {
  const out = new Map<string, DocPresent[]>();
  if (!fileIds.length) return out;
  try {
    const desde = new Date(Date.now() - PRESENCIA_VIVA_MIN * 60_000);
    const filas = await db.docPresence.findMany({
      where: { fileId: { in: fileIds }, seenAt: { gte: desde } },
      select: { fileId: true, user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } },
    });
    for (const f of filas) {
      const lista = out.get(f.fileId) ?? [];
      lista.push({ id: f.user.id, name: f.user.name, color: f.user.avatarColor, avatarUrl: f.user.avatarUrl });
      out.set(f.fileId, lista);
    }
  } catch (e) {
    console.error("[docs] leer presencia:", e instanceof Error ? e.message : e);
  }
  return out;
}
