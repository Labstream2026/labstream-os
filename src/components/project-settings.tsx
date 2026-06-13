"use client";

import * as React from "react";
import { Globe, Lock, Plus, X } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import {
  setProjectVisibility,
  addProjectMember,
  removeProjectMember,
} from "@/app/(app)/proyectos/[id]/actions";

type Person = { id: string; name: string; initials: string | null; color: string | null };
type Member = Person & { role: string };

// Gestión del proyecto compartido (estilo Mattermost): visibilidad y miembros.
// Solo se muestra a gestores (admin del sistema, responsable o miembro OWNER).
export function ProjectSettings({
  projectId,
  isPrivate,
  leadId,
  members,
  team,
}: {
  projectId: string;
  isPrivate: boolean;
  leadId: string | null;
  members: Member[];
  team: Person[];
}) {
  const [pending, start] = React.useTransition();
  const [adding, setAdding] = React.useState(false);
  const memberIds = new Set(members.map((m) => m.id));
  // candidatos: equipo que no es ya miembro ni el responsable
  const candidates = team.filter((u) => !memberIds.has(u.id) && u.id !== leadId);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
      <button
        disabled={pending}
        onClick={() => start(() => setProjectVisibility(projectId, !isPrivate))}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          !isPrivate
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
          pending && "opacity-70",
        )}
        title="Cambiar visibilidad del proyecto"
      >
        {!isPrivate ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
        {!isPrivate ? "Público para el equipo" : "Privado · solo miembros"}
      </button>

      <span className="text-xs text-muted-foreground">·</span>

      <div className="flex items-center gap-1.5">
        <div className="flex -space-x-2">
          {members.slice(0, 8).map((m) => (
            <span key={m.id} className="group relative">
              <UserAvatar initials={m.initials} color={m.color} size="sm" ring />
              <button
                onClick={() => start(() => removeProjectMember(projectId, m.id))}
                className="absolute -right-1 -top-1 hidden size-3.5 items-center justify-center rounded-full bg-destructive text-[8px] text-white group-hover:flex"
                title={`Quitar a ${m.name}`}
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {members.length === 0 ? "Sin miembros" : `${members.length} miembro${members.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="relative ml-auto">
        <button
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
        >
          <Plus className="size-3.5" /> Añadir miembro
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
                    start(() => addProjectMember(projectId, u.id, "MEMBER"));
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
    </div>
  );
}
