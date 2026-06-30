"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Globe, Lock, X, Archive, ChevronDown, Users } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  setProjectVisibility,
  addProjectMember,
  removeProjectMember,
  archiveProject,
} from "@/app/(app)/proyectos/[id]/actions";

type Person = { id: string; name: string; initials: string | null; color: string | null };
type Member = Person & { role: string };

// Gestión del proyecto compartido (estilo Mattermost): visibilidad, equipo y RESPONSABLES.
// Solo se muestra a gestores (admin del sistema, responsable o miembro OWNER). Un proyecto puede
// tener VARIOS responsables (rol OWNER = co-responsable): gestionan el proyecto y pueden subir
// archivos. Asignar/quitar el rol de responsable es de admin o del responsable principal (lead).
export function ProjectSettings({
  projectId,
  isPrivate,
  leadId,
  members,
  team,
  canArchive = false,
  canAssignLead = false,
}: {
  projectId: string;
  isPrivate: boolean;
  leadId: string | null;
  members: Member[];
  team: Person[];
  canArchive?: boolean;
  canAssignLead?: boolean;
}) {
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();

  const onArchive = async () => {
    const ok = await confirm({
      title: "Mover a la papelera",
      message: "El proyecto saldrá de las listas pero NO se borra nada: se conserva todo y podrás restaurarlo desde la Papelera.",
      confirmLabel: "Mover a la papelera",
      danger: true,
    });
    if (!ok) return;
    const r = await archiveProject(projectId);
    if (r.ok) router.push("/proyectos");
    else await confirm({ title: "No se pudo", message: r.error ?? "Error al archivar.", confirmLabel: "Entendido" });
  };

  const memberIds = new Set(members.map((m) => m.id));
  const candidates = team.filter((u) => !memberIds.has(u.id) && u.id !== leadId);
  const responsables = members.filter((m) => m.role === "OWNER");
  const setRole = (userId: string, role: string) => start(() => addProjectMember(projectId, userId, role));

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

      {/* Equipo y responsables */}
      <details data-autoclose className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1 py-0.5 hover:bg-accent">
          <span className="flex -space-x-2">
            {members.slice(0, 6).map((m) => (
              <UserAvatar key={m.id} initials={m.initials} color={m.color} size="sm" ring />
            ))}
          </span>
          <span className="text-xs text-muted-foreground">
            {members.length === 0 ? "Sin miembros" : `${members.length} en el equipo`}
            {responsables.length ? ` · ${responsables.length} resp.` : ""}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </summary>

        <div className="absolute left-0 z-20 mt-1 w-72 rounded-lg border border-border bg-popover p-2 shadow-lg">
          <p className="flex items-center gap-1.5 px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="size-3" /> Equipo del proyecto
          </p>
          {members.length === 0 ? (
            <p className="px-1 py-1.5 text-xs text-muted-foreground">Aún sin miembros.</p>
          ) : (
            members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent">
                <UserAvatar initials={m.initials} color={m.color} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                {canAssignLead ? (
                  <select
                    value={m.role === "OWNER" ? "OWNER" : "MEMBER"}
                    disabled={pending}
                    onChange={(e) => setRole(m.id, e.target.value)}
                    className="rounded-md border border-border bg-background px-1.5 py-1 text-xs outline-none"
                    title="Rol en el proyecto"
                  >
                    <option value="OWNER">Responsable</option>
                    <option value="MEMBER">Miembro</option>
                  </select>
                ) : (
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", m.role === "OWNER" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    {m.role === "OWNER" ? "Responsable" : "Miembro"}
                  </span>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => removeProjectMember(projectId, m.id))}
                  className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  title={`Quitar a ${m.name}`}
                  aria-label={`Quitar a ${m.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))
          )}

          <div className="mt-1 border-t border-border pt-1.5">
            {candidates.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">Todo el equipo ya está en el proyecto.</p>
            ) : (
              <select
                defaultValue=""
                disabled={pending}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) {
                    setRole(id, "MEMBER");
                    e.target.value = "";
                  }
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none"
              >
                <option value="" disabled>Añadir persona al proyecto…</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
            {canAssignLead ? (
              <p className="px-1 pt-1.5 text-[11px] leading-snug text-muted-foreground">
                Marca a alguien como <span className="font-medium text-foreground">Responsable</span> para que pueda subir archivos y gestionar el proyecto (puedes tener varios).
              </p>
            ) : null}
          </div>
        </div>
      </details>

      {canArchive ? (
        <button
          type="button"
          onClick={onArchive}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
          title="Mover el proyecto a la papelera"
        >
          <Archive className="size-3.5" /> Archivar
        </button>
      ) : null}
      {dialog}
    </div>
  );
}
