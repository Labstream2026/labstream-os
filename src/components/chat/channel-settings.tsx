"use client";

import * as React from "react";
import { Globe, Lock, Plus, X, Crown, Trash2, Pencil, Check } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { setChannelVisibility, addChannelMember, removeChannelMember, setChannelMemberRole, deleteChannel, renameChannel } from "@/app/(app)/chat/actions";

type Member = { id: string; name: string; initials: string | null; color: string | null; role?: string };

export function ChannelSettings({
  channelId,
  isPublic,
  members,
  team,
  canManage,
  type = "GENERAL",
  channelName = "",
}: {
  channelId: string;
  isPublic: boolean;
  members: Member[];
  team: Member[];
  canManage: boolean;
  type?: string;
  channelName?: string;
}) {
  const [pending, start] = React.useTransition();
  const [adding, setAdding] = React.useState(false);
  const { confirm, dialog } = useConfirmDialog();
  const memberIds = new Set(members.map((m) => m.id));
  const candidates = team.filter((u) => !memberIds.has(u.id));

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
      {dialog}
      {/* Renombrar (solo grupos creados en el chat) */}
      {canManage && type === "GENERAL" ? <RenameControl channelId={channelId} initial={channelName} /> : null}
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
          {members.slice(0, 8).map((m) => (
            <span key={m.id} className="group relative">
              <UserAvatar
                initials={m.initials}
                color={m.color}
                size="sm"
                ring
                className={m.role === "ADMIN" ? "ring-amber-400" : undefined}
              />
              {m.role === "ADMIN" ? (
                <Crown className="absolute -left-1 -top-1.5 size-3 text-amber-500" />
              ) : null}
              {canManage ? (
                <>
                  <button
                    onClick={() => start(() => setChannelMemberRole(channelId, m.id, m.role !== "ADMIN"))}
                    className="absolute -left-1 -top-1 hidden size-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] text-white group-hover:flex"
                    title={m.role === "ADMIN" ? `Quitar admin a ${m.name}` : `Hacer admin a ${m.name}`}
                  >
                    <Crown className="size-2.5" />
                  </button>
                  <button
                    onClick={() => start(() => removeChannelMember(channelId, m.id))}
                    className="absolute -right-1 -top-1 hidden size-3.5 items-center justify-center rounded-full bg-destructive text-[8px] text-white group-hover:flex"
                    title={`Quitar a ${m.name}`}
                  >
                    <X className="size-2.5" />
                  </button>
                </>
              ) : null}
            </span>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {members.length === 0 ? "Sin invitados" : `${members.length} invitado${members.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Borrar grupo (solo canales generales; los de proyecto/cliente se borran con su entidad) */}
      {canManage && type === "GENERAL" ? (
        <button
          disabled={pending}
          onClick={async () => {
            if (await confirm({ title: "Borrar grupo", message: `¿Borrar el grupo «${channelName}»? Se elimina para todo el equipo junto con sus mensajes. No se puede deshacer.`, confirmLabel: "Borrar grupo", danger: true })) {
              start(() => deleteChannel(channelId));
            }
          }}
          className="order-last inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          title="Borrar grupo"
        >
          <Trash2 className="size-3.5" /> Borrar grupo
        </button>
      ) : null}

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

// Renombrar el grupo en línea: botón "Renombrar" → input + Guardar.
function RenameControl({ channelId, initial }: { channelId: string; initial: string }) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(initial);
  const [pending, start] = React.useTransition();
  React.useEffect(() => setName(initial), [initial]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
        title="Renombrar grupo"
      >
        <Pencil className="size-3.5" /> Renombrar
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const clean = name.trim();
        if (!clean) return;
        start(async () => {
          await renameChannel(channelId, clean);
          setEditing(false);
        });
      }}
      className="inline-flex items-center gap-1.5"
    >
      <input
        autoFocus
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        className="w-44 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      <button disabled={pending} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60">
        <Check className="size-3.5" /> Guardar
      </button>
      <button type="button" onClick={() => { setName(initial); setEditing(false); }} className="text-xs text-muted-foreground hover:text-foreground">
        Cancelar
      </button>
    </form>
  );
}
