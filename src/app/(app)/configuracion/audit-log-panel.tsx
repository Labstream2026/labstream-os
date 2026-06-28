"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";

// Panel GLOBAL de auditoría (Configuración → Auditoría). Lee el ActivityLog que la app ya
// registra (cambios de tareas, archivos, miembros, y ahora acciones admin sobre usuarios).
// Filtra en cliente por texto (quién/qué) y por tipo de acción. Solo lectura.
export type AuditRow = {
  id: string;
  action: string;
  summary: string;
  entityType: string | null;
  when: string; // ISO
  userName: string | null;
  userInitials: string | null;
  userColor: string | null;
  projectName: string | null;
  clientName: string | null;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function AuditLogPanel({ rows }: { rows: AuditRow[] }) {
  const [q, setQ] = React.useState("");
  const [action, setAction] = React.useState("");

  // Acciones distintas presentes, para el selector (ordenadas).
  const actions = React.useMemo(
    () => [...new Set(rows.map((r) => r.action))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const shown = React.useMemo(() => {
    const term = norm(q.trim());
    return rows.filter((r) => {
      if (action && r.action !== action) return false;
      if (!term) return true;
      return (
        norm(r.summary).includes(term) ||
        norm(r.userName ?? "").includes(term) ||
        norm(r.action).includes(term) ||
        norm(r.projectName ?? "").includes(term) ||
        norm(r.clientName ?? "").includes(term)
      );
    });
  }, [rows, q, action]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por persona, acción o detalle…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          title="Filtrar por tipo de acción"
        >
          <option value="">Todas las acciones</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        {shown.length} de {rows.length} eventos (se muestran los 200 más recientes).
      </p>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No hay eventos que coincidan.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {shown.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-3 py-2.5 sm:px-4">
              <UserAvatar initials={r.userInitials} color={r.userColor} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{r.userName ?? "Alguien"}</span>{" "}
                  <span className="text-foreground/90">{r.summary}</span>
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{r.action}</span>
                  {r.projectName ? <span>· {r.projectName}</span> : null}
                  {r.clientName ? <span>· {r.clientName}</span> : null}
                  <span className="ml-auto whitespace-nowrap">{fmt(r.when)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
