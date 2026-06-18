"use client";

import { useTransition } from "react";
import { openDirectMessage } from "./actions";

// Selector para iniciar un mensaje directo con alguien del equipo.
export function DmStarter({ team }: { team: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <select
      defaultValue=""
      disabled={pending}
      onChange={(e) => { if (e.target.value) start(() => openDirectMessage(e.target.value)); }}
      className="min-w-0 max-w-[200px] truncate rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">+ Mensaje directo a…</option>
      {team.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
    </select>
  );
}
