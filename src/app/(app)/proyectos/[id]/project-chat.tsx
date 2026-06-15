import { Lock, Globe, Users } from "lucide-react";
import { isEditableOffice } from "@/lib/onlyoffice";
import { UserAvatar } from "@/components/user-avatar";
import { ChannelChat } from "@/components/chat/channel-chat";
import { ChannelSettings } from "@/components/chat/channel-settings";

type ChannelMessage = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: Date;
  author: { name: string; initials: string | null; avatarColor: string | null } | null;
  attachments: { id: string; name: string; mime: string | null }[];
  reactions: { emoji: string; userId: string }[];
  poll: {
    id: string;
    question: string;
    options: { id: string; text: string; _count: { votes: number } }[];
    votes: { optionId: string }[];
  } | null;
};

type ChannelMemberRow = {
  userId: string;
  role: string;
  user: { id: string; name: string; initials: string | null; avatarColor: string | null };
};

type TeamMember = { id: string; name: string; initials: string | null; avatarColor: string | null };

// Chat propio del proyecto, PRIVADO (por invitación). Quien no es miembro no ve
// la conversación; el responsable / administradores del chat pueden invitar.
export function ProjectChat({
  channel,
  me,
  team,
  canAccess,
  canManage,
}: {
  channel: { id: string; name: string; isPublic: boolean; messages: ChannelMessage[]; members: ChannelMemberRow[] };
  me: { id: string; name: string; initials: string | null; color: string | null };
  team: TeamMember[];
  canAccess: boolean;
  canManage: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {channel.isPublic ? <Globe className="size-4 text-emerald-600" /> : <Lock className="size-4 text-amber-600" />}
        <h2 className="text-sm font-semibold">Chat del proyecto</h2>
        {channel.isPublic ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            Público para el equipo
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            Privado · por invitación
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-3.5" /> {channel.members.length}
        </span>
      </div>

      {/* Gestión de miembros (solo responsable / admin del chat) */}
      {canManage ? (
        <ChannelSettings
          channelId={channel.id}
          isPublic={channel.isPublic}
          canManage={canManage}
          members={channel.members.map((m) => ({ id: m.user.id, name: m.user.name, initials: m.user.initials, color: m.user.avatarColor, role: m.role }))}
          team={team.map((t) => ({ id: t.id, name: t.name, initials: t.initials, color: t.avatarColor }))}
        />
      ) : channel.members.length > 0 ? (
        // Miembros (lectura) para quien participa pero no administra.
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
          <span className="text-xs text-muted-foreground">En la conversación:</span>
          {channel.members.map((m) => (
            <span key={m.userId} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs">
              <UserAvatar initials={m.user.initials} color={m.user.avatarColor} size="sm" />
              {m.user.name}
            </span>
          ))}
        </div>
      ) : null}

      {canAccess ? (
        <div className="h-[60vh] overflow-hidden rounded-xl border border-border bg-card">
          <ChannelChat
            channelId={channel.id}
            me={me}
            members={team.map((t) => ({ id: t.id, name: t.name }))}
            initialMessages={channel.messages.map((m) => ({
              id: m.id,
              body: m.body,
              parentId: m.parentId,
              createdAt: m.createdAt.toISOString(),
              author: m.author ? { name: m.author.name, initials: m.author.initials, color: m.author.avatarColor } : null,
              attachments: m.attachments.map((a) => ({ id: a.id, name: a.name, mime: a.mime, editable: isEditableOffice(a.name) })),
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
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-8 py-16 text-center">
          <Lock className="size-7 text-muted-foreground" />
          <p className="font-medium">No estás en el chat de este proyecto</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Esta conversación es privada. Pídele al responsable del proyecto o a un administrador del chat que te invite.
          </p>
        </div>
      )}
    </div>
  );
}
