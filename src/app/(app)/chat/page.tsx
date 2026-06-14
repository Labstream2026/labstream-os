import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { UserAvatar } from "@/components/user-avatar";
import { Hash, Lock, Users } from "lucide-react";
import { createChannel } from "./actions";
import { DmStarter } from "./dm-starter";

export const dynamic = "force-dynamic";

export default async function ChatHubPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [myChannels, publicChannels, team] = await Promise.all([
    // Canales donde soy miembro (privados, públicos a los que me uní, y DMs).
    db.chatChannel.findMany({
      where: { members: { some: { userId: session.id } } },
      orderBy: { createdAt: "desc" },
      include: {
        members: { include: { user: { select: { id: true, name: true, initials: true, avatarColor: true } } } },
        _count: { select: { messages: true } },
      },
    }),
    // Canales públicos del equipo para explorar.
    db.chatChannel.findMany({
      where: { type: "GENERAL", isPublic: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    db.user.findMany({ where: { active: true, NOT: { id: session.id } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const dms = myChannels.filter((c) => c.type === "DIRECT");
  const channels = myChannels.filter((c) => c.type !== "DIRECT");
  const myChannelIds = new Set(myChannels.map((c) => c.id));
  const explore = publicChannels.filter((c) => !myChannelIds.has(c.id));

  // No leídos por canal: mensajes de otros posteriores a mi última lectura.
  const unreadPairs = await Promise.all(
    myChannels.map(async (c) => {
      const mine = c.members.find((m) => m.userId === session.id);
      const count = await db.chatMessage.count({
        where: { channelId: c.id, parentId: null, authorId: { not: session.id }, createdAt: { gt: mine?.lastReadAt ?? new Date(0) } },
      });
      return [c.id, count] as const;
    }),
  );
  const unread = new Map(unreadPairs);
  const badge = (id: string) => {
    const n = unread.get(id) ?? 0;
    return n > 0 ? <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{n}</span> : null;
  };

  const dmName = (c: (typeof myChannels)[number]) => {
    const other = c.members.find((m) => m.user.id !== session.id)?.user;
    return other ?? { name: c.name, initials: null, avatarColor: null, id: "" };
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Chats</h1>
      <p className="mt-1 text-sm text-muted-foreground">Canales del equipo, grupos privados y mensajes directos.</p>

      {/* Acciones rápidas */}
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <form action={createChannel} className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            <span className="mb-1 block font-medium">Nuevo canal</span>
            <input name="name" required placeholder="Nombre del canal" className="w-48 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
            <select name="isPublic" defaultValue="true" className="rounded-md border border-input bg-background px-2 py-2 text-sm">
              <option value="true">Público (todo el equipo)</option>
              <option value="false">Privado (solo invitados)</option>
            </select>
          </label>
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Crear</button>
        </form>
        <span className="pb-2"><DmStarter team={team} /></span>
      </div>

      {/* Mensajes directos */}
      <Section title="Mensajes directos" icon={<Users className="size-4" />}>
        {dms.length === 0 ? (
          <Empty>Sin mensajes directos todavía. Empieza uno arriba.</Empty>
        ) : (
          dms.map((c) => {
            const o = dmName(c);
            return (
              <Row key={c.id} href={`/chat/${c.id}`}>
                <UserAvatar initials={o.initials} color={o.avatarColor} size="sm" />
                <span className="flex-1 truncate font-medium">{o.name}</span>
                {badge(c.id)}
                <span className="text-xs text-muted-foreground">{c._count.messages} msj.</span>
              </Row>
            );
          })
        )}
      </Section>

      {/* Mis canales */}
      <Section title="Mis canales" icon={<Hash className="size-4" />}>
        {channels.length === 0 ? (
          <Empty>No estás en ningún canal privado o de grupo aún.</Empty>
        ) : (
          channels.map((c) => (
            <Row key={c.id} href={`/chat/${c.id}`}>
              {c.isPublic ? <Hash className="size-4 text-muted-foreground" /> : <Lock className="size-4 text-amber-600" />}
              <span className="flex-1 truncate font-medium">{c.name}</span>
              {badge(c.id)}
              <span className="text-xs text-muted-foreground">{c.members.length} miembros</span>
            </Row>
          ))
        )}
      </Section>

      {/* Explorar canales públicos */}
      {explore.length > 0 ? (
        <Section title="Canales del equipo" icon={<Hash className="size-4" />}>
          {explore.map((c) => (
            <Row key={c.id} href={`/chat/${c.id}`}>
              <Hash className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-xs text-primary">Abrir →</span>
            </Row>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">{icon} {title}</h2>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{children}</div>
    </section>
  );
}
function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40">{children}</Link>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}
