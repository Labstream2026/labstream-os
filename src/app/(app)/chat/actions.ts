"use server";

import type { Prisma } from "@prisma/client";
import { noAutorizado } from "@/lib/authz-error";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessChannel, userCanManageChannel, canAccessChannel } from "@/lib/chat-access";
import { logActivity } from "@/lib/activity";
import { CHAT_SECTIONS, sectionMeta } from "@/lib/chat-section";
import { userHasSectionAccess, sessionHasSectionAccess } from "@/lib/chat-section-access";

// ── Crear canales y mensajes directos ──

// Crea un canal (público para todo el equipo, o privado solo para invitados).
// El creador queda como ADMIN del canal.
export async function createChannel(formData: FormData) {
  const session = await getSession();
  if (!session) noAutorizado();
  if (!hasPermission(session, "crear_canales")) noAutorizado();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return;
  const isPublic = formData.get("isPublic") !== "false"; // por defecto público
  // Sección/dependencia opcional a la que se ASIGNA el grupo (wiki, biblioteca…). Solo se asigna si
  // quien crea tiene acceso a esa sección.
  const rawSection = String(formData.get("section") ?? "").trim();
  const section = rawSection && CHAT_SECTIONS[rawSection] && sessionHasSectionAccess(rawSection, session) ? rawSection : null;
  // Miembros marcados al crear un grupo (multiselección). El creador siempre va como ADMIN.
  const picked = [...new Set(formData.getAll("members").map(String).filter((id) => id && id !== session.id))];
  let valid = picked.length
    ? (await db.user.findMany({ where: { id: { in: picked }, active: true }, select: { id: true } })).map((u) => u.id)
    : [];
  // Si el grupo se asigna a una sección, solo entran los invitados con acceso a esa sección.
  if (section) {
    const checked = await Promise.all(valid.map(async (id) => ({ id, ok: await userHasSectionAccess(id, section) })));
    valid = checked.filter((c) => c.ok).map((c) => c.id);
    // Una sección tiene UN grupo a la vez: libera el que estuviera asignado.
    await db.chatChannel.updateMany({ where: { section }, data: { section: null } });
  }
  const channel = await db.chatChannel.create({
    data: {
      type: "GENERAL",
      name,
      isPublic,
      section,
      members: {
        create: [
          { userId: session.id, role: "ADMIN" },
          ...valid.map((userId) => ({ userId })),
        ],
      },
    },
  });
  revalidatePath("/chat");
  if (section) revalidatePath(CHAT_SECTIONS[section].href);
  redirect(`/chat/${channel.id}`);
}

// Asigna (o quita, con section=null) un GRUPO a una sección/dependencia de la app. Una sección tiene
// un solo grupo a la vez. No aplica a canales de proyecto/cliente (ya tienen su chat por defecto).
export async function assignChannelToSection(channelId: string, section: string | null): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!(await userCanManageChannel(channelId, session))) return { ok: false, error: "No autorizado" };
  const sec = section && CHAT_SECTIONS[section] ? section : null;
  if (section && !sec) return { ok: false, error: "Sección inválida" };
  if (sec && !sessionHasSectionAccess(sec, session)) return { ok: false, error: `No tienes acceso a ${CHAT_SECTIONS[sec].label}.` };
  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { type: true, projectId: true, clientId: true, slug: true, roleKey: true, section: true } });
  if (!channel) return { ok: false, error: "Canal no encontrado" };
  // Solo GRUPOS creados por el equipo: no canales de proyecto/cliente (ya tienen su chat), ni los de
  // sistema con slug (general, estados-equipo), ni los de equipo por rol (gestionados).
  if (channel.type !== "GENERAL" || channel.projectId || channel.clientId || channel.slug || channel.roleKey) return { ok: false, error: "Solo un grupo se puede asignar a una sección." };
  if (sec) await db.chatChannel.updateMany({ where: { section: sec }, data: { section: null } }); // una sección, un grupo
  await db.chatChannel.update({ where: { id: channelId }, data: { section: sec } });
  revalidatePath("/chat");
  revalidatePath(`/chat/${channelId}`);
  if (sec) revalidatePath(CHAT_SECTIONS[sec].href);
  if (channel.section && CHAT_SECTIONS[channel.section]) revalidatePath(CHAT_SECTIONS[channel.section].href);
  return { ok: true };
}

// Borra por completo un grupo del chat (canal GENERAL). Arrastra en cascada sus mensajes,
// miembros y encuestas. NO aplica a DMs ni a los canales de proyecto/cliente, que viven
// con su entidad y se borran al borrar el proyecto/cliente.
export async function deleteChannel(channelId: string) {
  const session = await getSession();
  if (!session) noAutorizado();
  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { type: true, name: true, roleKey: true } });
  if (!channel) return;
  if (channel.type !== "GENERAL") throw new Error("Solo se pueden borrar grupos creados en el chat.");
  // Los canales de equipo por ROL son gestionados: borrarlos perdería el historial y la próxima
  // sincronización los volvería a crear (con el rol aún activo). No se borran a mano.
  if (channel.roleKey) throw new Error("El canal de un rol no se puede borrar (se gestiona solo).");
  if (!(await userCanManageChannel(channelId, session))) noAutorizado();
  await db.chatChannel.delete({ where: { id: channelId } });
  await logActivity({
    action: "chat.channel.delete",
    summary: `borró el grupo «${channel.name}»`,
  }).catch(() => null);
  revalidatePath("/chat");
  redirect("/chat");
}

// Abre (o crea) un mensaje directo 1:1 con otra persona.
export async function openDirectMessage(otherUserId: string) {
  const session = await getSession();
  if (!session) noAutorizado();
  // El portal cliente solo usa el chat de SU proyecto: no abre DMs con personas del equipo.
  if (session.role === "cliente") noAutorizado();
  if (otherUserId === session.id) return;
  const other = await db.user.findUnique({ where: { id: otherUserId }, select: { id: true, name: true, active: true, isSystemBot: true } });
  if (!other?.active) throw new Error("Usuario inválido");
  // No se permite abrir/sembrar un DM hacia un bot del sistema (p. ej. Marcebot):
  // su DM de auditoría no debe ser escribible por el usuario.
  if (other.isSystemBot) throw new Error("Usuario inválido");

  const existing = await db.chatChannel.findFirst({
    where: {
      type: "DIRECT",
      AND: [{ members: { some: { userId: session.id } } }, { members: { some: { userId: otherUserId } } }],
    },
    select: { id: true },
  });
  if (existing) redirect(`/chat/${existing.id}`);

  const channel = await db.chatChannel.create({
    data: {
      type: "DIRECT",
      name: other.name, // referencia; en la UI se muestra el nombre del otro
      isPublic: false,
      members: { create: [{ userId: session.id }, { userId: otherUserId }] },
    },
  });
  revalidatePath("/chat");
  redirect(`/chat/${channel.id}`);
}

// Unirse / salir de un canal público (para que aparezca en "mis chats").
export async function joinChannel(channelId: string) {
  const session = await getSession();
  if (!session || !(await userCanAccessChannel(channelId, session))) noAutorizado();
  // Los canales de PROYECTO/CLIENTE/ROL no se unen a mano: su membresía la derivan
  // ensureProjectChannels/ensureRoleChannels del equipo o del rol. Unirse crearía una fila
  // que la siguiente sincronización quitaría.
  const ch = await db.chatChannel.findUnique({ where: { id: channelId }, select: { type: true, roleKey: true } });
  if (ch?.type === "PROJECT" || ch?.type === "CLIENT" || ch?.roleKey) return;
  await db.channelMember.upsert({
    where: { channelId_userId: { channelId, userId: session.id } },
    create: { channelId, userId: session.id },
    update: {},
  });
  revalidatePath("/chat");
}

export async function leaveChannel(channelId: string) {
  const session = await getSession();
  if (!session) noAutorizado();
  // Igual que al unirse: no se sale a mano de un canal de proyecto/cliente/rol (se sale saliendo
  // del proyecto o cambiando de rol). Evita que un miembro se quite su propia fila del canal.
  const ch = await db.chatChannel.findUnique({ where: { id: channelId }, select: { type: true, roleKey: true } });
  if (ch?.type === "PROJECT" || ch?.type === "CLIENT" || ch?.roleKey) return;
  await db.channelMember.delete({ where: { channelId_userId: { channelId, userId: session.id } } }).catch(() => null);
  revalidatePath("/chat");
}
import { publishMessage, publishPollUpdate, publishReactionUpdate, publishMessageEdit, publishMessageDelete, publishMessagePin, publishTyping, publishConversationClear, type ChatMessagePayload, type PollData, type ReactionItem } from "@/lib/chat-bus";

// ── Editar / borrar / fijar mensajes ──

// Editar el cuerpo de un mensaje propio (o admin del sistema).
export async function editMessage(messageId: string, body: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const text = body.trim();
  if (!text) return;
  const msg = await db.chatMessage.findUnique({ where: { id: messageId }, select: { channelId: true, authorId: true } });
  if (!msg) return;
  if (msg.authorId !== session.id && session.role !== "admin") return;
  if (!(await userCanAccessChannel(msg.channelId, session))) return;
  const updated = await db.chatMessage.update({ where: { id: messageId }, data: { body: text, editedAt: new Date() } });
  publishMessageEdit(msg.channelId, messageId, updated.body, updated.editedAt!.toISOString());
}

// Borrar un mensaje propio (o admin del sistema / gestor del canal).
// Borrado SUAVE: el mensaje desaparece para los usuarios pero el administrador lo
// sigue viendo (en gris) para seguimiento. No se elimina la fila de la BD.
export async function deleteMessage(messageId: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const msg = await db.chatMessage.findUnique({ where: { id: messageId }, select: { channelId: true, authorId: true, deletedAt: true } });
  if (!msg || msg.deletedAt) return;
  const isOwner = msg.authorId === session.id;
  // Borrar mensajes de OTROS exige moderar_chat (o admin / gestor del canal). El autor
  // siempre puede borrar el suyo.
  if (!isOwner && session.role !== "admin" && !hasPermission(session, "moderar_chat") && !(await userCanManageChannel(msg.channelId, session))) return;
  await db.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date(), deletedById: session.id } });
  publishMessageDelete(msg.channelId, messageId);
}

// Borrar una conversación entera (todos sus mensajes). Borrado suave: para los
// usuarios desaparece; el administrador la sigue viendo en gris. Permitido en los
// chats directos (cualquiera de los dos) o por admin / gestor del canal.
export async function clearConversation(channelId: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  if (!(await userCanAccessChannel(channelId, session))) return;
  const channel = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: {
      type: true,
      name: true,
      projectId: true,
      members: { select: { userId: true, user: { select: { isSystemBot: true } } } },
    },
  });
  // No se puede vaciar un DM cuyo otro miembro es un bot del sistema (Marcebot):
  // el rastro de auditoría no debe poder borrarlo el usuario.
  if (
    channel?.type === "DIRECT" &&
    channel.members.some((m) => m.userId !== session.id && m.user?.isSystemBot)
  ) {
    return;
  }
  const allowed = channel?.type === "DIRECT" || session.role === "admin" || (await userCanManageChannel(channelId, session));
  if (!allowed) return;
  const res = await db.chatMessage.updateMany({
    where: { channelId, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: session.id },
  });
  publishConversationClear(channelId);
  // Rastro de auditoría del borrado masivo (además de que el admin sigue viendo los
  // mensajes en gris). En canales de proyecto aparece en su actividad.
  if (res.count > 0) {
    await logActivity({
      action: "chat.clear",
      summary: `borró la conversación «${channel?.name ?? "chat"}» (${res.count} mensaje${res.count === 1 ? "" : "s"})`,
      projectId: channel?.projectId ?? null,
      entityType: "project",
    });
  }
}

// Fijar / desfijar un mensaje del canal (cualquier miembro con acceso).
export async function togglePin(messageId: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const msg = await db.chatMessage.findUnique({ where: { id: messageId }, select: { channelId: true, pinned: true } });
  if (!msg) return;
  if (!(await userCanAccessChannel(msg.channelId, session))) return;
  // Fijar/desfijar es moderación: exige moderar_chat (o admin / gestor del canal).
  if (session.role !== "admin" && !hasPermission(session, "moderar_chat") && !(await userCanManageChannel(msg.channelId, session))) return;
  await db.chatMessage.update({ where: { id: messageId }, data: { pinned: !msg.pinned } });
  publishMessagePin(msg.channelId, messageId, !msg.pinned);
}

// Indicador efímero de "escribiendo…".
export async function notifyTyping(channelId: string): Promise<void> {
  const session = await getSession();
  if (!session || !(await userCanAccessChannel(channelId, session))) return;
  publishTyping(channelId, session.id, session.name);
}

// Marca el canal como leído por el usuario (para los contadores de no leídos).
// Miembro → ChannelMember.lastReadAt (como siempre, sin auto-unir a canales públicos).
// NO-miembro que puede ver el canal (el admin: la membresía la sincronizan
// ensureProjectChannels/ensureRoleChannels y no se puede crear a mano) → su lectura vive en
// UserChannelState, que es lo que consulta el conteo de no leídos del rail para no-miembros.
export async function markChannelRead(channelId: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const res = await db.channelMember.updateMany({
    where: { channelId, userId: session.id },
    data: { lastReadAt: new Date() },
  });
  if (res.count === 0) {
    await db.userChannelState
      .upsert({
        where: { userId_channelId: { userId: session.id, channelId } },
        create: { userId: session.id, channelId, lastReadAt: new Date() },
        update: { lastReadAt: new Date() },
      })
      .catch(() => null); // canal borrado en paralelo o BD sin migrar: no rompe la lectura
  }
}

// Fijar/desfijar un canal arriba del rail para el USUARIO actual. Vive en UserChannelState
// (no en la membresía, que los canales de proyecto/rol sincronizan y borrarían). Devuelve el
// nuevo estado (true = fijado) o null si no aplica.
export async function toggleChannelPin(channelId: string): Promise<boolean | null> {
  const session = await getSession();
  if (!session || !(await userCanAccessChannel(channelId, session))) return null;
  const existing = await db.userChannelState.findUnique({
    where: { userId_channelId: { userId: session.id, channelId } },
    select: { pinnedAt: true },
  });
  const pin = !existing?.pinnedAt;
  await db.userChannelState.upsert({
    where: { userId_channelId: { userId: session.id, channelId } },
    create: { userId: session.id, channelId, pinnedAt: pin ? new Date() : null },
    update: { pinnedAt: pin ? new Date() : null },
  });
  revalidatePath("/chat");
  return pin;
}
import { mimeFor } from "@/lib/storage";
import { saveBufferWithPreview } from "@/lib/image";
import { isEditableOffice } from "@/lib/onlyoffice";
import { notifyAndEmail, notify } from "@/lib/notify";

// Detecta @menciones en el TEXTO (servidor, no se confía en el cliente). Coincidencia exacta
// con límites de palabra; nombres largos tienen prioridad ("@Ana María" antes que "@Ana").
// Además de personas: @canal / @todos (los miembros del canal) y @Rol por su NOMBRE
// ("@Editor" → todo el equipo de ese rol). Si un texto es a la vez nombre de persona y de rol,
// se avisa a ambos.
type MentionTargets = { userIds: string[]; roleKeys: string[]; canal: boolean };
function detectMentionTargets(
  body: string,
  users: { id: string; name: string }[],
  roles: { key: string; name: string }[],
): MentionTargets {
  const out: MentionTargets = { userIds: [], roleKeys: [], canal: false };
  if (!body.includes("@")) return out;
  const names = [
    ...users.map((u) => ({ name: u.name, kind: "user" as const, id: u.id })),
    ...roles.map((r) => ({ name: r.name, kind: "role" as const, id: r.key })),
    { name: "canal", kind: "canal" as const, id: "" },
    { name: "todos", kind: "canal" as const, id: "" },
  ].filter((n) => n.name);
  if (names.length === 0) return out;
  const sorted = names.sort((a, b) => b.name.length - a.name.length);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\p{L}0-9_])@(${sorted.map((n) => esc(n.name)).join("|")})(?![\\p{L}0-9_])`, "gu");
  const userIds = new Set<string>();
  const roleKeys = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    for (const n of sorted) {
      if (n.name !== m[1]) continue;
      if (n.kind === "user") userIds.add(n.id);
      else if (n.kind === "role") roleKeys.add(n.id);
      else out.canal = true;
    }
  }
  out.userIds = [...userIds];
  out.roleKeys = [...roleKeys];
  return out;
}

// Notifica (app + correo) a los usuarios mencionados con @ que tengan acceso al canal.
// Recalcula las menciones EN EL SERVIDOR a partir del texto (el cliente no es de fiar).
// El correo solo sale si el SMTP está configurado (Configuración → Integraciones); si no,
// queda solo el aviso in-app. El título dice QUIÉN te mencionó y DÓNDE para que se note.
// El nivel de aviso «nada» (UserChannelState) silencia también las menciones.
async function notifyMentions(channelId: string, authorId: string, authorName: string, body: string) {
  if (!body.includes("@")) return;
  const channel = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: { name: true, isPublic: true, type: true, slug: true, members: { select: { userId: true } } },
  });
  if (!channel) return;
  const [users, roles] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, isSystemBot: true } }),
    db.role.findMany({ where: { key: { notIn: ["cliente", "demo"] } }, select: { key: true, name: true } }),
  ]);
  const targets = detectMentionTargets(body, users, roles);
  const memberIds = new Set(channel.members.map((m) => m.userId));
  const bots = new Set(users.filter((u) => u.isSystemBot).map((u) => u.id));

  const ids = new Set(targets.userIds);
  // @canal/@todos: los miembros del canal. En los canales de difusión (general/estados-equipo,
  // que reúnen a todo el equipo) se ignora: sería un altavoz masivo al alcance de cualquiera.
  const isBroadcast = channel.type === "GENERAL" && !!channel.slug;
  if (targets.canal && channel.type !== "DIRECT" && !isBroadcast) {
    for (const id of memberIds) ids.add(id);
  }
  // @Rol: el equipo activo de ese rol (en canal privado se limita abajo a los miembros).
  if (targets.roleKeys.length) {
    const roleUsers = await db.user.findMany({
      where: { active: true, isSystemBot: false, role: { key: { in: targets.roleKeys } } },
      select: { id: true },
    });
    for (const u of roleUsers) ids.add(u.id);
  }
  ids.delete(authorId);
  const idArr = [...ids].filter((id) => !bots.has(id) && (channel.isPublic || memberIds.has(id))); // privado: solo miembros del canal
  if (idArr.length === 0) return;
  const off = await db.userChannelState.findMany({
    where: { channelId, userId: { in: idArr }, notifyLevel: "none" },
    select: { userId: true },
  });
  const offSet = new Set(off.map((s) => s.userId));
  // En un DM el "nombre del canal" es interno; el contexto es la conversación directa.
  const where = channel.type === "DIRECT" ? "en un mensaje directo" : `en ${channel.name}`;
  for (const userId of idArr) {
    if (offSet.has(userId)) continue;
    await notifyAndEmail(userId, {
      type: "mention",
      event: "chat_mention",
      title: `${authorName} te mencionó ${where}`,
      body: body.slice(0, 140),
      link: `/chat/${channelId}`,
      actorId: authorId,
    });
  }
}

// Notifica a los miembros del canal (menos al autor) que llegó un mensaje nuevo.
// Cubre DMs, chats de proyecto y grupos privados. Se omiten los canales de
// difusión del equipo (general, estados-equipo) para no saturar de avisos.
// Respeta el NIVEL de aviso por canal (UserChannelState): "all" avisa por mensaje;
// "mentions" (equivale al silenciar clásico) y "none" no — sin fila manda la
// membresía (muted → "mentions"). `excludeIds` = ya recibieron un aviso más rico
// (p. ej. el de respuesta en hilo) y no se duplica.
async function notifyChannelMessage(channelId: string, authorId: string, authorName: string, body: string, excludeIds?: Set<string>) {
  const channel = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: { type: true, name: true, slug: true, members: { select: { userId: true, muted: true, user: { select: { isSystemBot: true } } } } },
  });
  if (!channel) return;
  const isBroadcast = channel.type === "GENERAL" && !!channel.slug; // general / estados-equipo
  if (isBroadcast) return;

  const memberIds = channel.members.map((m) => m.userId);
  const states = memberIds.length
    ? await db.userChannelState.findMany({
        where: { channelId, userId: { in: memberIds }, notifyLevel: { not: null } },
        select: { userId: true, notifyLevel: true },
      })
    : [];
  const levelOf = new Map(states.map((s) => [s.userId, s.notifyLevel] as const));

  const isDM = channel.type === "DIRECT";
  const link = `/chat/${channelId}`;
  const title = isDM ? `Mensaje de ${authorName}` : `${authorName} en ${channel.name}`;

  for (const m of channel.members) {
    if (m.userId === authorId) continue;
    if (excludeIds?.has(m.userId)) continue;
    if (m.user?.isSystemBot) continue; // no notificar/emailar a bots del sistema (Marcebot)
    const level = levelOf.get(m.userId) ?? (m.muted ? "mentions" : "all");
    if (level !== "all") continue; // silenciado o «solo menciones»: las @ llegan por notifyMentions
    // En app (sin email para no saturar). Los DMs sí van también por correo.
    if (isDM) {
      await notifyAndEmail(m.userId, { type: "dm", event: "chat_dm", title, body: body.slice(0, 140), link, actorId: authorId });
    } else {
      await notify(m.userId, { type: "chat", event: "chat_channel", title, body: body.slice(0, 140), link, actorId: authorId });
    }
  }
}

// Aviso de HILO: al responder dentro de un hilo se avisa al autor del mensaje padre y a
// quienes ya respondieron, AUNQUE tengan el canal en «solo menciones» (participar en el hilo
// es opt-in, como en Slack). El nivel «nada» sí lo silencia. Devuelve los cubiertos para que
// el aviso genérico del canal no los duplique.
async function notifyThreadReply(channelId: string, parentId: string, authorId: string, authorName: string, body: string): Promise<Set<string>> {
  const covered = new Set<string>();
  const parent = await db.chatMessage.findUnique({
    where: { id: parentId },
    select: {
      authorId: true,
      author: { select: { isSystemBot: true } },
      channel: { select: { type: true, name: true } },
      replies: { where: { deletedAt: null }, select: { authorId: true, author: { select: { isSystemBot: true } } } },
    },
  });
  // En un DM el aviso normal ya es directo: no hace falta el de hilo.
  if (!parent || parent.channel.type === "DIRECT") return covered;
  const ids = new Set<string>();
  if (parent.authorId && !parent.author?.isSystemBot) ids.add(parent.authorId);
  for (const r of parent.replies) if (r.authorId && !r.author?.isSystemBot) ids.add(r.authorId);
  ids.delete(authorId);
  if (ids.size === 0) return covered;
  const off = await db.userChannelState.findMany({
    where: { channelId, userId: { in: [...ids] }, notifyLevel: "none" },
    select: { userId: true },
  });
  const offSet = new Set(off.map((s) => s.userId));
  for (const userId of ids) {
    covered.add(userId); // en «nada» tampoco debe llegarle el aviso genérico
    if (offSet.has(userId)) continue;
    await notify(userId, {
      type: "chat",
      event: "chat_thread",
      title: `${authorName} respondió en un hilo de ${parent.channel.name}`,
      body: body.slice(0, 140),
      link: `/chat/${channelId}?msg=${parentId}`,
      actorId: authorId,
    });
  }
  return covered;
}

// Reacción con emoji a un mensaje (toggle). Devuelve la lista de reacciones del mensaje.
export async function toggleReaction(channelId: string, messageId: string, emoji: string): Promise<ReactionItem[] | null> {
  const session = await getSession();
  if (!session || !(await userCanAccessChannel(channelId, session))) return null;
  const clean = emoji.slice(0, 16);
  const existing = await db.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: session.id, emoji: clean } },
  });
  if (existing) {
    await db.messageReaction.delete({ where: { id: existing.id } });
  } else {
    await db.messageReaction.create({ data: { messageId, userId: session.id, emoji: clean } });
  }
  const all = await db.messageReaction.findMany({ where: { messageId }, select: { emoji: true, userId: true } });
  publishReactionUpdate(channelId, messageId, all);
  return all;
}

// Silenciar/reactivar los avisos de un canal para el USUARIO actual. Las @menciones siguen
// llegando (como en Slack). Devuelve el nuevo estado (true = silenciado) o null si no aplica
// (no es miembro / sin acceso).
export async function toggleChannelMute(channelId: string): Promise<boolean | null> {
  const session = await getSession();
  if (!session || !(await userCanAccessChannel(channelId, session))) return null;
  const existing = await db.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId: session.id } },
    select: { muted: true },
  });
  if (!existing) return null; // no es miembro del canal: no hay preferencia que guardar
  const muted = !existing.muted;
  await db.channelMember.update({
    where: { channelId_userId: { channelId, userId: session.id } },
    data: { muted },
  });
  revalidatePath(`/chat/${channelId}`);
  return muted;
}

// Nivel de aviso del canal para el USUARIO actual: "all" (todo), "mentions" (solo @menciones —
// equivale al silenciar clásico) o "none" (nada, ni menciones). Vive en UserChannelState, así
// que también lo puede fijar quien VE el canal sin ser miembro (el admin). Mantiene el
// ChannelMember.muted heredado coherente para lo que aún lo lee (badge gris del rail, fallback).
export async function setChannelNotifyLevel(channelId: string, level: "all" | "mentions" | "none"): Promise<boolean> {
  const session = await getSession();
  if (!session || !["all", "mentions", "none"].includes(level)) return false;
  if (!(await userCanAccessChannel(channelId, session))) return false;
  await db.userChannelState.upsert({
    where: { userId_channelId: { userId: session.id, channelId } },
    create: { userId: session.id, channelId, notifyLevel: level },
    update: { notifyLevel: level },
  });
  await db.channelMember.updateMany({ where: { channelId, userId: session.id }, data: { muted: level !== "all" } });
  revalidatePath(`/chat/${channelId}`);
  return true;
}

export async function sendMessage(
  channelId: string,
  body: string,
  parentId?: string | null,
  _mentionIds?: string[], // el cliente puede pasar menciones, pero se recalculan en el servidor
): Promise<ChatMessagePayload | null> {
  const text = body.trim();
  if (!text) return null;

  const session = await getSession();
  if (!(await userCanAccessChannel(channelId, session))) return null;
  if (!hasPermission(session, "comentar")) return null;

  const msg = await db.chatMessage.create({
    data: { channelId, body: text, parentId: parentId ?? null, authorId: session!.id },
    include: {
      author: { select: { name: true, initials: true, avatarColor: true } },
      channel: { select: { name: true, type: true, members: { select: { userId: true, user: { select: { isSystemBot: true } } } } } },
    },
  });

  const payload: ChatMessagePayload = {
    id: msg.id,
    channelId,
    body: msg.body,
    parentId: msg.parentId,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author
      ? { name: msg.author.name, initials: msg.author.initials, color: msg.author.avatarColor }
      : null,
    attachments: [],
  };
  // PRIMERO se publica al canal en vivo y DESPUÉS se notifica: las notificaciones (que pueden
  // incluir correo SMTP lento) no deben retrasar la aparición del mensaje para los demás. Mismo
  // orden que sendMessageWithAttachments.
  publishMessage(payload);
  const who = msg.author?.name ?? "Alguien";
  const inThread = parentId ? await notifyThreadReply(channelId, parentId, session!.id, who, text) : undefined;
  await notifyMentions(channelId, session!.id, who, text);
  await notifyChannelMessage(channelId, session!.id, who, text, inThread);
  return payload;
}

// Envío con archivos adjuntos (Word, Excel, PDF, imágenes, etc.)
export async function sendMessageWithAttachments(formData: FormData): Promise<ChatMessagePayload | null> {
  const channelId = String(formData.get("channelId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "") || null;
  const MAX = 50 * 1024 * 1024; // 50 MB por archivo
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0 && f.size <= MAX);
  if (!channelId || (!body && files.length === 0)) return null;

  const session = await getSession();
  if (!(await userCanAccessChannel(channelId, session))) return null;
  if (!hasPermission(session, "comentar")) return null;

  const msg = await db.chatMessage.create({
    data: { channelId, body, parentId, authorId: session!.id },
    include: {
      author: { select: { name: true, initials: true, avatarColor: true } },
      channel: { select: { type: true, members: { select: { userId: true, user: { select: { isSystemBot: true } } } } } },
    },
  });

  const created: { id: string; name: string; mime: string | null; editable: boolean }[] = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const att = await db.messageAttachment.create({
      data: { messageId: msg.id, name: file.name, path: "", mime: mimeFor(file.name, file.type), size: buf.length },
    });
    const rel = await saveBufferWithPreview(`chat/${att.id}`, file.name, buf, file.type);
    await db.messageAttachment.update({ where: { id: att.id }, data: { path: rel } });
    created.push({ id: att.id, name: file.name, mime: mimeFor(file.name, file.type), editable: isEditableOffice(file.name) });
  }

  const payload: ChatMessagePayload = {
    id: msg.id,
    channelId,
    body: msg.body,
    parentId: msg.parentId,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author
      ? { name: msg.author.name, initials: msg.author.initials, color: msg.author.avatarColor }
      : null,
    attachments: created,
  };
  publishMessage(payload);
  const who = msg.author?.name ?? "Alguien";
  const noteBody = body || "📎 Archivo adjunto";
  const inThread = parentId ? await notifyThreadReply(channelId, parentId, session!.id, who, noteBody) : undefined;
  await notifyMentions(channelId, session!.id, who, body);
  await notifyChannelMessage(channelId, session!.id, who, noteBody, inThread);
  // Se devuelve para que el emisor vea su mensaje al instante (sin depender del SSE).
  return payload;
}

// ── Encuestas ──

export async function createPoll(channelId: string, formData: FormData): Promise<void> {
  const question = String(formData.get("question") ?? "").trim();
  const options = formData
    .getAll("options")
    .map((o) => String(o).trim())
    .filter(Boolean);
  if (!question || options.length < 2) return;

  const session = await getSession();
  if (!(await userCanAccessChannel(channelId, session))) return;

  const msg = await db.chatMessage.create({
    data: {
      channelId,
      body: `📊 ${question}`,
      authorId: session!.id,
      poll: {
        create: {
          channelId,
          question,
          createdById: session!.id,
          options: { create: options.map((text, i) => ({ text, position: i })) },
        },
      },
    },
    include: {
      author: { select: { name: true, initials: true, avatarColor: true } },
      poll: { include: { options: { orderBy: { position: "asc" } } } },
    },
  });

  publishMessage({
    id: msg.id,
    channelId,
    body: msg.body,
    parentId: msg.parentId,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author
      ? { name: msg.author.name, initials: msg.author.initials, color: msg.author.avatarColor }
      : null,
    attachments: [],
    poll: msg.poll
      ? {
          id: msg.poll.id,
          question: msg.poll.question,
          options: msg.poll.options.map((o) => ({ id: o.id, text: o.text, votes: 0 })),
          totalVotes: 0,
        }
      : null,
  });
}

export async function votePoll(pollId: string, optionId: string): Promise<PollData | null> {
  const session = await getSession();
  if (!session) return null;

  // La opción debe pertenecer a esta encuesta (evita votos cruzados entre encuestas).
  const poll = await db.poll.findUnique({
    where: { id: pollId },
    include: {
      options: { orderBy: { position: "asc" }, include: { _count: { select: { votes: true } } } },
    },
  });
  if (!poll || !poll.options.some((o) => o.id === optionId)) return null;
  if (!(await userCanAccessChannel(poll.channelId, session))) return null;

  await db.pollVote.upsert({
    where: { pollId_userId: { pollId, userId: session.id } },
    create: { pollId, optionId, userId: session.id },
    update: { optionId },
  });
  // recuento tras el voto
  const counts = await db.pollOption.findMany({
    where: { pollId },
    orderBy: { position: "asc" },
    include: { _count: { select: { votes: true } } },
  });
  const data: PollData = {
    id: poll.id,
    question: poll.question,
    options: counts.map((o) => ({ id: o.id, text: o.text, votes: o._count.votes })),
    totalVotes: counts.reduce((n, o) => n + o._count.votes, 0),
  };
  publishPollUpdate(poll.channelId, data);
  return data;
}

// ── Gestión del canal (miembros / visibilidad) ──

export async function setChannelVisibility(channelId: string, isPublic: boolean) {
  const session = await getSession();
  if (!(await userCanManageChannel(channelId, session))) {
    noAutorizado();
  }
  const channel = await db.chatChannel.update({ where: { id: channelId }, data: { isPublic } });
  if (channel.projectId) revalidatePath(`/proyectos/${channel.projectId}`);
}

// Renombra un grupo del chat. Solo aplica a canales GENERAL creados por usuarios (sin slug):
// los canales de sistema (general, estados-equipo) y los de proyecto/cliente conservan su nombre.
export async function renameChannel(channelId: string, name: string) {
  const session = await getSession();
  if (!(await userCanManageChannel(channelId, session))) noAutorizado();
  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { type: true, slug: true, roleKey: true, name: true } });
  if (!channel) return;
  // Sin slug (canales de sistema) y sin roleKey (el nombre de un canal de rol SIGUE al rol).
  if (channel.type !== "GENERAL" || channel.slug || channel.roleKey) throw new Error("Este canal no se puede renombrar.");
  const clean = name.trim().slice(0, 80);
  if (!clean || clean === channel.name) return;
  await db.chatChannel.update({ where: { id: channelId }, data: { name: clean } });
  await logActivity({ action: "chat.channel.rename", summary: `renombró el grupo «${channel.name}» → «${clean}»` }).catch(() => null);
  revalidatePath("/chat");
  revalidatePath(`/chat/${channelId}`);
}

export async function addChannelMember(channelId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!(await userCanManageChannel(channelId, session))) return { ok: false, error: "No autorizado" };
  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { projectId: true, section: true, roleKey: true } });
  // Canal de equipo por ROL: la membresía SIGUE al rol; añadir a mano se desharía en la
  // próxima sincronización (se entra cambiando el rol de la persona en Configuración).
  if (channel?.roleKey) {
    return { ok: false, error: "La membresía de este canal sigue al rol (se gestiona sola)." };
  }
  // Grupo asignado a una DEPENDENCIA: solo se pueden añadir personas con acceso a esa sección.
  if (channel?.section && !(await userHasSectionAccess(userId, channel.section))) {
    return { ok: false, error: `Esa persona no tiene acceso a ${sectionMeta(channel.section)?.label ?? channel.section}.` };
  }
  await db.channelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId },
    update: {},
  });
  if (channel?.projectId) revalidatePath(`/proyectos/${channel.projectId}`);
  return { ok: true };
}

// Promover/degradar a un miembro como channel-admin (gestiona visibilidad/miembros).
export async function setChannelMemberRole(channelId: string, userId: string, makeAdmin: boolean) {
  const session = await getSession();
  if (!(await userCanManageChannel(channelId, session))) {
    noAutorizado();
  }
  await db.channelMember
    .update({
      where: { channelId_userId: { channelId, userId } },
      data: { role: (makeAdmin ? "ADMIN" : "MEMBER") as never },
    })
    .catch(() => null);
  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { projectId: true } });
  if (channel?.projectId) revalidatePath(`/proyectos/${channel.projectId}`);
}

export async function removeChannelMember(channelId: string, userId: string) {
  const session = await getSession();
  if (!(await userCanManageChannel(channelId, session))) {
    noAutorizado();
  }
  // Canal de equipo por ROL: quitar a mano se desharía en la próxima sincronización.
  const ch = await db.chatChannel.findUnique({ where: { id: channelId }, select: { roleKey: true } });
  if (ch?.roleKey) return;
  await db.channelMember
    .delete({ where: { channelId_userId: { channelId, userId } } })
    .catch(() => null);
  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { projectId: true } });
  if (channel?.projectId) revalidatePath(`/proyectos/${channel.projectId}`);
}

// ── Reenviar entre canales (alimentación cruzada de los proyectos de un cliente) ──

// Destinos de reenvío: los OTROS chats del MISMO cliente — los canales internos de sus proyectos
// hermanos y el canal de la cuenta. Nunca los canales "con el cliente" (audience CLIENT): lo que se
// cruza entre proyectos es conversación interna del equipo. Solo canales que el usuario puede ver.
export async function getForwardTargets(channelId: string): Promise<{ id: string; name: string }[]> {
  const session = await getSession();
  if (!session) return [];
  if (!(await userCanAccessChannel(channelId, session))) return [];
  const ch = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: { clientId: true, project: { select: { clientId: true } } },
  });
  const clientId = ch?.clientId ?? ch?.project?.clientId ?? null;
  if (!clientId) return [];
  const channels = await db.chatChannel.findMany({
    where: {
      id: { not: channelId },
      OR: [
        { clientId },
        // Canales internos de los proyectos hermanos (INTERNAL; incluye heredados sin audiencia —
        // `not: "CLIENT"` en Prisma excluiría los null).
        { AND: [{ project: { clientId } }, { OR: [{ audience: "INTERNAL" }, { audience: null }] }] },
      ],
    },
    select: {
      id: true, name: true, isPublic: true, audience: true, section: true, clientId: true,
      members: { select: { userId: true } },
      project: { select: { leadId: true, members: { select: { userId: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return channels
    .filter((c) => canAccessChannel(c, session))
    .map((c) => ({ id: c.id, name: c.clientId ? `${c.name} · cuenta` : c.name }));
}

// Reenvía un mensaje a otro canal: copia el texto con la referencia al canal/autor de origen,
// firmado por QUIEN reenvía. Exige acceso a AMBOS canales (leer el origen, escribir el destino) y
// permiso de comentar. Los adjuntos no se duplican (se anota cuántos hay en el original).
export async function forwardMessage(messageId: string, targetChannelId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sin sesión." };
  if (!hasPermission(session, "comentar")) return { ok: false, error: "Sin permiso para comentar." };
  const original = await db.chatMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true, body: true, deletedAt: true, channelId: true,
      author: { select: { name: true } },
      channel: { select: { name: true } },
      _count: { select: { attachments: true } },
    },
  });
  if (!original || original.deletedAt) return { ok: false, error: "Mensaje no encontrado." };
  if (original.channelId === targetChannelId) return { ok: false, error: "Ese es el mismo canal." };
  if (!(await userCanAccessChannel(original.channelId, session)) || !(await userCanAccessChannel(targetChannelId, session))) {
    return { ok: false, error: "Sin acceso al canal." };
  }

  const n = original._count.attachments;
  const attachNote = n > 0 ? `\n(${n} adjunto${n === 1 ? "" : "s"} en el original)` : "";
  const body = `↪️ Reenviado de «${original.channel.name}» — ${original.author?.name ?? "Sistema"}:\n${original.body}${attachNote}`.slice(0, 4000);
  const msg = await db.chatMessage.create({
    data: { channelId: targetChannelId, body, authorId: session.id },
    include: { author: { select: { name: true, initials: true, avatarColor: true } } },
  });
  publishMessage({
    id: msg.id,
    channelId: targetChannelId,
    body: msg.body,
    parentId: null,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author ? { name: msg.author.name, initials: msg.author.initials, color: msg.author.avatarColor } : null,
    attachments: [],
  });
  await notifyChannelMessage(targetChannelId, session.id, msg.author?.name ?? "Alguien", body);
  return { ok: true };
}

// ── Búsqueda de mensajes (server-side, en todos MIS chats) ──

export type MessageSearchHit = {
  id: string;
  channelId: string;
  channelName: string;
  author: string | null;
  body: string;
  createdAt: string; // ISO
};

// Busca en el TEXTO de los mensajes de todos los canales que el usuario puede ver (la misma
// regla de visibilidad que el rail), sin distinguir mayúsculas. Devuelve lo más reciente
// primero; cada resultado enlaza al permalink ?msg= (el chat centra y resalta el mensaje).
export async function searchMessages(query: string): Promise<MessageSearchHit[]> {
  const session = await getSession();
  if (!session) return [];
  if (session.role === "demo") return []; // el usuario demo no tiene chat
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];

  let where: Prisma.ChatChannelWhereInput;
  if (session.role === "cliente") {
    // El portal del cliente solo alcanza el chat CON el equipo de sus proyectos.
    where = { type: "PROJECT", audience: "CLIENT", project: { members: { some: { userId: session.id } } } };
  } else {
    const isAdmin = session.role === "admin";
    where = {
      OR: [
        { members: { some: { userId: session.id } } },
        { type: "GENERAL", isPublic: true },
        ...(isAdmin
          ? ([{ type: { in: ["PROJECT", "CLIENT"] } }] as Prisma.ChatChannelWhereInput[])
          : ([
              { type: { in: ["PROJECT", "CLIENT"] }, isPublic: true },
              { type: "PROJECT", project: { leadId: session.id } },
              { type: "PROJECT", project: { members: { some: { userId: session.id } } } },
            ] as Prisma.ChatChannelWhereInput[])),
      ],
    };
  }
  const channels = await db.chatChannel.findMany({
    where,
    select: { id: true, name: true, section: true, clientId: true },
  });
  // Grupos asignados a una sección: solo si tengo acceso a esa sección (misma puerta que el rail).
  const allowed = channels.filter((c) => !c.section || sessionHasSectionAccess(c.section, session));
  if (allowed.length === 0) return [];
  const nameOf = new Map(allowed.map((c) => [c.id, c.clientId ? `${c.name} · cuenta` : c.name] as const));

  const msgs = await db.chatMessage.findMany({
    where: { channelId: { in: allowed.map((c) => c.id) }, deletedAt: null, body: { contains: q, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, channelId: true, body: true, createdAt: true, author: { select: { name: true } } },
  });
  return msgs.map((m) => ({
    id: m.id,
    channelId: m.channelId,
    channelName: nameOf.get(m.channelId) ?? "Chat",
    author: m.author?.name ?? null,
    body: m.body.replace(/\s+/g, " ").trim().slice(0, 120),
    createdAt: m.createdAt.toISOString(),
  }));
}
