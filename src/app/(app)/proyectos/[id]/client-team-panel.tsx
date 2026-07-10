"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Users } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { addClientProjectMember, getClientTeamCandidates, type ClientTeamCandidate } from "../actions";

type Member = { id: string; name: string; title: string | null; initials: string | null; color: string | null };

// Tarjeta «Equipo del proyecto» del PORTAL DEL CLIENTE: ve quiénes están y puede añadir
// personas del equipo que YA conoce (mismo criterio que al crear su proyecto) para poder
// asignarles tareas. Los candidatos se cargan al abrir el selector (no descubren nada más:
// el server action limita la lista a dirección/responsables/equipo de sus clientes).
export function ClientTeamPanel({ projectId, members: initialMembers }: { projectId: string; members: Member[] }) {
  const router = useRouter();
  const [, start] = React.useTransition();
  const [members, setMembers] = React.useState<Member[]>(initialMembers);
  const [candidates, setCandidates] = React.useState<ClientTeamCandidate[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function loadCandidates() {
    if (candidates !== null) return;
    getClientTeamCandidates(projectId)
      .then(setCandidates)
      .catch(() => setCandidates([]));
  }

  function add(userId: string) {
    if (!userId) return;
    const c = (candidates ?? []).find((x) => x.id === userId);
    if (!c || members.some((m) => m.id === userId)) return;
    setError(null);
    setMembers((p) => [...p, { id: c.id, name: c.name, title: c.title, initials: c.initials, color: c.color }]);
    setCandidates((p) => (p ?? []).map((x) => (x.id === userId ? { ...x, isMember: true } : x)));
    start(async () => {
      const r = await addClientProjectMember(projectId, userId);
      if (!r.ok) {
        // Revierte el optimismo si el servidor lo rechazó.
        setMembers((p) => p.filter((m) => m.id !== userId));
        setCandidates((p) => (p ?? []).map((x) => (x.id === userId ? { ...x, isMember: false } : x)));
        setError(r.error ?? "No se pudo añadir.");
      } else {
        router.refresh();
      }
    });
  }

  const available = (candidates ?? []).filter((c) => !c.isMember && !members.some((m) => m.id === c.id));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold">
        <Users className="size-4 shrink-0 text-muted-foreground" />
        Equipo del proyecto
        <span className="text-xs font-normal text-muted-foreground">· añade personas para asignarles tareas</span>
      </div>
      <div className="space-y-3 border-t border-border p-4">
        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {members.length === 0 ? <span className="text-xs text-muted-foreground">Aún no hay nadie del equipo en este proyecto.</span> : null}
          {members.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 text-xs" title={m.title ?? undefined}>
              <UserAvatar initials={m.initials} color={m.color} size="sm" />
              <span className="max-w-36 truncate">{m.name}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 shrink-0 text-muted-foreground" />
          <select
            value=""
            onFocus={loadCandidates}
            onChange={(e) => add(e.target.value)}
            className="min-w-0 flex-1 cursor-pointer rounded-md border border-border bg-card px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">
              {candidates === null ? "+ Añadir persona del equipo…" : available.length === 0 ? "No hay más personas disponibles" : "+ Añadir persona del equipo…"}
            </option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.title ? ` · ${c.title}` : ""}</option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Solo aparecen personas de Labstream que ya trabajan contigo (dirección, responsables de tu cuenta o
          equipo de tus proyectos). Quien añadas recibirá un aviso y podrás asignarle tareas.
        </p>
      </div>
    </div>
  );
}
