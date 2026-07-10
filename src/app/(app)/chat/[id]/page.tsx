import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { getSession, hasPermission } from "@/lib/auth";
import { canAccessChannel, userCanManageChannel } from "@/lib/chat-access";
import { ensureProjectChannels } from "@/lib/project-chat";
import { isEditableOffice } from "@/lib/onlyoffice";
import { ChannelChat } from "@/components/chat/channel-chat";
import { NotifyLevelToggle, PinToggle, type NotifyLevel } from "@/components/chat/mute-toggle";
import { ChannelSettings } from "@/components/chat/channel-settings";
import { JoinLeave } from "./join-leave";
import { UserAvatar } from "@/components/user-avatar";
import { Hash, Lock, ChevronLeft, Users, Settings2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params;
  // Permalink a un mensaje (?msg=...): el chat hace scroll hasta él y lo resalta.
  const { msg: highlightId } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  // El administrador ve también los mensajes borrados (en gris) para seguimiento;
  // los demás solo ven los no borrados.
  const isAdmin = session.role === "admin";

  const channel = await db.chatChannel.findUnique({
    where: { id },
    include: {
      project: { select: { leadId: true, members: { select: { userId: true } } } },
      members: { include: { user: { select: { id: true, name: true, initials: true, avatarColor: true, isSystemBot: true } } } },
      messages: {
        where: isAdmin ? undefined : { deletedAt: null },
        // Traemos los 100 MÁS RECIENTES (desc) y los re-invertimos a orden cronológico abajo.
        // Con orderBy:"asc"+take:100 Prisma devolvía los 100 más VIEJOS → en chats largos (p. ej.
        // el DM con Marcebot) los mensajes nuevos nunca llegaban al cliente y "no aparecían".
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          author: { select: { name: true, initials: true, avatarColor: true } },
          attachments: true,
          reactions: { select: { emoji: true, userId: true } },
          poll: {
            include: {
              options: { orderBy: { position: "asc" }, include: { _count: { select: { votes: true } } } },
              votes: { where: { userId: session.id }, select: { optionId: true } },
            },
          },
        },
      },
    },
  });
  if (!channel) notFound();
  // El chat conversacional con Marcebot se eliminó: su DM (histórico, oculto del riel) ya no
  // se puede abrir ni por enlace viejo. El copiloto vive en la tarjeta del Inicio.
  if (channel.type === "DIRECT" && channel.members.some((m) => m.user.isSystemBot)) redirect("/");

  // Acceso: público → equipo; privado → admin/responsable/miembro.
  if (!canAccessChannel({ isPublic: channel.isPublic, audience: channel.audience, section: channel.section, project: channel.project, members: channel.members }, session)) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-8 py-24 text-center">
        <Lock className="size-7 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Chat privado</h1>
        <p className="text-sm text-muted-foreground">No tienes acceso a este chat. Pídele a un administrador del canal que te invite.</p>
        <Link href="/chat" className="mt-2 text-sm font-medium text-primary hover:underline">← Volver a Chats</Link>
      </div>
    );
  }

  const isDM = channel.type === "DIRECT";
  const other = isDM ? channel.members.find((m) => m.user.id !== session.id)?.user : null;
  const title = isDM ? other?.name ?? channel.name : channel.name;
  const canManage = !isDM && (await userCanManageChannel(id, session));
  const myMember = channel.members.find((m) => m.user.id === session.id);
  const isMember = !!myMember;

  // Nivel de aviso y fijado del usuario en este canal: UserChannelState manda; sin fila, la
  // membresía heredada (muted → «solo menciones»). También aplica al admin sin membresía.
  const myState = await db.userChannelState
    .findUnique({ where: { userId_channelId: { userId: session.id, channelId: id } }, select: { notifyLevel: true, pinnedAt: true, lastReadAt: true } })
    .catch(() => null);
  const notifyLevel = (myState?.notifyLevel ?? (myMember?.muted ? "mentions" : "all")) as NotifyLevel;
  const isPinned = !!myState?.pinnedAt;
  // Última lectura ANTES de abrir ahora (máximo de las dos fuentes, igual que el rail):
  // el chat pinta la línea «Mensajes nuevos» a partir de este instante.
  const lastReadAt = [myMember?.lastReadAt, myState?.lastReadAt]
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const team = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } });

  // Destinos especiales del autocompletado de @: «canal» y los roles del equipo. Solo en chats
  // internos del equipo (no en DMs, ni en el chat con el cliente, ni para el portal del cliente).
  let mentionExtras: { name: string; hint: string }[] = [];
  if (!isDM && session.role !== "cliente" && channel.audience !== "CLIENT") {
    const roles = await db.role.findMany({
      where: { key: { notIn: ["cliente", "demo"] }, users: { some: { active: true, isSystemBot: false } } },
      orderBy: { name: "asc" },
      select: { name: true },
    });
    mentionExtras = [{ name: "canal", hint: "todos los miembros" }, ...roles.map((r) => ({ name: r.name, hint: "equipo del rol" }))];
  }

  // Pestañas de audiencia: en un canal de PROYECTO con dos audiencias (interno del equipo + con el
  // cliente), el EQUIPO ve pestañas para saltar entre ambos. El invitado no las ve (solo alcanza el
  // canal "con el cliente"). ensureProjectChannels crea el canal con el cliente si hay un invitado.
  let audienceTabs: { id: string; audience: string | null }[] = [];
  if (channel.type === "PROJECT" && channel.projectId && session.role !== "cliente") {
    await ensureProjectChannels(channel.projectId);
    const chans = await db.chatChannel.findMany({ where: { projectId: channel.projectId, type: "PROJECT" }, select: { id: true, audience: true } });
    if (chans.length > 1) audienceTabs = chans.sort((a, b) => (a.audience === "INTERNAL" ? -1 : 1));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2 sm:px-6 sm:py-2.5">
        <div className="flex items-center gap-2">
          {/* Volver a la lista de chats (solo móvil): flecha grande tipo WhatsApp para cambiar de conversación. */}
          <Link
            href="/chat"
            aria-label="Volver a Chats"
            className="-ml-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted md:hidden"
          >
            <ChevronLeft className="size-6" />
          </Link>
          {isDM ? (
            <UserAvatar initials={other?.initials ?? null} color={other?.avatarColor ?? null} size="sm" />
          ) : channel.isPublic ? (
            <Hash className="size-5 shrink-0 text-muted-foreground" />
          ) : (
            <Lock className="size-5 shrink-0 text-muted-foreground" />
          )}
          <h1 className="min-w-0 truncate text-base font-semibold tracking-tight sm:text-lg">{title}</h1>
          {!isDM ? (
            <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:inline-flex" title="Miembros del canal">
              <Users className="size-3.5" /> {channel.members.length}
            </span>
          ) : null}
          {/* Pestañas Interno / Con el cliente: segmented compacto EN la misma franja. */}
          {audienceTabs.length > 1 ? (
            <div className="flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5">
              {audienceTabs.map((t) => {
                const active = t.id === id;
                const isClient = t.audience === "CLIENT";
                return (
                  <Link
                    key={t.id}
                    href={`/chat/${t.id}`}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                      active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {isClient ? <Users className="size-3" /> : <Lock className="size-3" />}
                    <span className="hidden sm:inline">{isClient ? "Con el cliente" : "Interno"}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {/* Canales de proyecto/cliente/rol: la membresía sigue al equipo o al rol, no se une/sale a mano. */}
            {(() => {
              const isAuto = channel.type === "PROJECT" || channel.type === "CLIENT" || !!channel.roleKey;
              return (
                <>
                  {/* Fijar en el rail: aquí funciona también en táctil (el pin del rail es solo hover). */}
                  <PinToggle channelId={id} pinned={isPinned} />
                  {/* El admin puede fijar su nivel de aviso también sin membresía (afecta a sus @). */}
                  {isMember || isAdmin ? <NotifyLevelToggle channelId={id} level={notifyLevel} /> : null}
                  {!isDM && !isAuto && !isMember ? <JoinLeave channelId={id} joined={false} /> : null}
                  {!isDM && !isAuto && isMember && !canManage ? <JoinLeave channelId={id} joined={true} /> : null}
                </>
              );
            })()}
            {/* Administración del canal (renombrar, sección, visibilidad, miembros, invitar,
                borrar): recogida en un panel — las acciones de frecuencia mensual no ocupan
                una franja permanente sobre la conversación diaria. */}
            {canManage ? (
              <details data-autoclose className="relative">
                <summary
                  className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Detalles del canal"
                >
                  <Settings2 className="size-4" />
                </summary>
                <div className="absolute right-0 z-40 mt-1 w-[min(34rem,90vw)] rounded-xl border border-border bg-popover p-3 shadow-lg">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalles del canal</p>
                  <ChannelSettings
                    channelId={id}
                    isPublic={channel.isPublic}
                    canManage={canManage}
                    type={channel.type}
                    roleManaged={!!channel.roleKey}
                    channelName={channel.name}
                    section={channel.section}
                    members={channel.members.map((m) => ({ id: m.user.id, name: m.user.name, initials: m.user.initials, color: m.user.avatarColor, role: m.role }))}
                    team={team.map((t) => ({ id: t.id, name: t.name, initials: t.initials, color: t.avatarColor }))}
                  />
                </div>
              </details>
            ) : null}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ChannelChat
          channelId={id}
          isAdmin={isAdmin}
          highlightId={highlightId ?? null}
          mentionExtras={mentionExtras}
          projectId={channel.type === "PROJECT" ? channel.projectId : null}
          initialLastReadAt={lastReadAt ? lastReadAt.toISOString() : null}
          canArchive={session.role !== "cliente" && session.role !== "demo" && hasPermission(session, "subir_archivos")}
          me={{ id: session.id, name: session.name, initials: session.initials, color: session.color }}
          members={(() => {
            // El chat CON EL CLIENTE (audience "CLIENT") "solo habla con el equipo del proyecto": la
            // lista de menciones se acota al responsable + miembros de ESTE proyecto (equipo + el
            // invitado), sin toda la empresa. Igual para el PORTAL CLIENTE, que solo alcanza este canal.
            if (session.role === "cliente" || channel.audience === "CLIENT") {
              const allowed = new Set<string>([channel.project?.leadId, ...(channel.project?.members.map((m) => m.userId) ?? [])].filter(Boolean) as string[]);
              return team.filter((t) => allowed.has(t.id)).map((t) => ({ id: t.id, name: t.name, initials: t.initials, color: t.avatarColor }));
            }
            // Grupo asignado a una DEPENDENCIA: solo se puede etiquetar a quien ESTÁ en el grupo (los
            // que no tienen acceso a esa sección ni siquiera se pudieron añadir).
            if (channel.section) {
              return channel.members.map((m) => ({ id: m.user.id, name: m.user.name, initials: m.user.initials, color: m.user.avatarColor }));
            }
            return team.map((t) => ({ id: t.id, name: t.name, initials: t.initials, color: t.avatarColor }));
          })()}
          initialMessages={[...channel.messages].reverse().map((m) => ({
            id: m.id,
            body: m.body,
            parentId: m.parentId,
            deleted: !!m.deletedAt,
            createdAt: m.createdAt.toISOString(),
            author: m.author ? { name: m.author.name, initials: m.author.initials, color: m.author.avatarColor } : null,
            attachments: m.attachments.map((a) => ({ id: a.id, name: a.name, mime: a.mime, editable: isEditableOffice(a.name), fileAssetId: a.fileAssetId ?? null })),
            pinned: m.pinned,
            editedAt: m.editedAt ? m.editedAt.toISOString() : null,
            reactions: m.reactions.map((r) => ({ emoji: r.emoji, userId: r.userId })),
            poll: m.poll
              ? {
                  id: m.poll.id,
                  question: m.poll.question,
                  options: m.poll.options.map((o) => ({ id: o.id, text: o.text, votes: o._count.votes })),
                  totalVotes: m.poll.options.reduce((n, o) => n + o._count.votes, 0),
                }
              : null,
            myOptionId: m.poll?.votes[0]?.optionId ?? null,
          }))}
        />
      </div>
    </div>
  );
}
