"use client";

import * as React from "react";
import { Globe, Lock, Plus, X } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { setChannelVisibility, addChannelMember, removeChannelMember } from "@/app/(app)/chat/actions";

type Member = { id: string; name: string; initials: string | null; color: string | null };

export function ChannelSettings({
  channelId,
  isPublic,
  members,
  team,
  canManage,
}: {
  channelId: string;
  isPublic: boolean;
  members: Member[];
  team: Member[];
  canManage: boolean;
}) {
  const [pending, start] = React.useTransition();
  const [adding, setAdding] = React.useState(false);
  const memberIds = new Set(members.map((m) => m.id));
  const candidates = team.filter((u) => !memberIds.has(u.id));

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
      {/* Visibilidad */}
      <button
        disabled={!canManage || pending}
        onClick={() => start(() => setChannelVisibility(channelId, !isPublic))}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          isPublic
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
          (!canManage || pending) && "opacity-70",
        )}
        title={canManage ? "Cambiar visibilidad" : undefined}
      >
        {isPublic ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
        {isPublic ? "Público para el equipo" : "Privado · solo invitados"}
      </button>

      <span className="text-xs text-muted-foreground">·</span>

      {/* Miembros */}
      <div className="flex items-center gap-1.5">
        <div className="flex -space-x-2">
          {members.slice(0, 6).map((m) => (
            <span key={m.id} className="group relative">
              <UserAvatar initials={m.initials} color={m.color} size="sm" ring />
              {canManage ? (
                <button
                  onClick={() => start(() => removeChannelMember(channelId, m.id))}
                  className="absolute -right-1 -top-1 hidden size-3.5 items-center justify-center rounded-full bg-destructive text-[8px] text-white group-hover:flex"
                  title={`Quitar a ${m.name}`}
                >
                  <X className="size-2.5" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {members.length === 0 ? "Sin invitados" : `${members.length} invitado${members.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Añadir miembro */}
      {canManage ? (
        <div className="relative ml-auto">
          <button
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
          >
            <Plus className="size-3.5" /> Invitar
          </button>
          {adding ? (
            <div className="absolute right-0 z-10 mt-1 max-h-56 w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
              {candidates.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Todo el equipo ya está</p>
              ) : (
                candidates.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      start(() => addChannelMember(channelId, u.id));
                      setAdding(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <UserAvatar initials={u.initials} color={u.color} size="sm" />
                    {u.name}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
