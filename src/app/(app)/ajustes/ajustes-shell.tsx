"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Shell de AJUSTES ──
// Una sola página para lo que antes eran /perfil y /configuracion: menú lateral agrupado
// (Mi cuenta / Equipo / Sistema) + buscador de ajustes que filtra el menú. Cada sección
// monta el panel que YA existía — este shell solo organiza y navega.
// Deep-link: /ajustes?s=<clave> (la URL se actualiza al navegar, sin recargar).

export type AjustesSection = {
  key: string;
  label: string;
  group: "cuenta" | "equipo" | "sistema";
  icon?: React.ReactNode;
  admin?: boolean;
  node: React.ReactNode;
};

const GROUP_LABEL: Record<AjustesSection["group"], string> = {
  cuenta: "Mi cuenta",
  equipo: "Equipo",
  sistema: "Sistema",
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function AjustesShell({ sections, initial }: { sections: AjustesSection[]; initial?: string }) {
  const first = sections[0]?.key ?? "";
  const [active, setActive] = React.useState(sections.some((s) => s.key === initial) ? (initial as string) : first);
  const [q, setQ] = React.useState("");

  const go = (key: string) => {
    setActive(key);
    // Mantiene la URL compartible sin recargar la página.
    try { window.history.replaceState(null, "", `/ajustes?s=${key}`); } catch {}
  };

  const visible = q.trim() ? sections.filter((s) => fold(s.label).includes(fold(q))) : sections;
  const groups = (["cuenta", "equipo", "sistema"] as const)
    .map((g) => ({ g, items: visible.filter((s) => s.group === g) }))
    .filter(({ items }) => items.length > 0);
  const current = sections.find((s) => s.key === active) ?? sections[0];

  return (
    <div className="flex flex-col gap-5 md:grid md:grid-cols-[240px_minmax(0,1fr)] md:items-start">
      {/* Menú lateral (en móvil va arriba, plegado en chips por grupo) */}
      <nav className="md:sticky md:top-4">
        <label className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm focus-within:border-primary">
          <Search className="size-4 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar un ajuste…"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        {groups.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">Nada coincide con «{q.trim()}».</p>
        ) : null}
        {groups.map(({ g, items }) => (
          <div key={g} className="mb-3">
            <p className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{GROUP_LABEL[g]}</p>
            <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
              {items.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => go(s.key)}
                  aria-current={active === s.key}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13.5px] font-medium transition-colors md:w-full",
                    active === s.key
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/80 hover:bg-muted hover:text-foreground",
                  )}
                >
                  {s.icon ? <span className="grid size-5 shrink-0 place-items-center [&_svg]:size-[18px]">{s.icon}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  {s.admin ? (
                    <span className="rounded border border-border px-1 py-px text-[8.5px] font-extrabold tracking-wider text-muted-foreground">ADMIN</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Contenido de la sección activa — cabecera con chip de icono en acento (estilo unificado) */}
      <section className="min-w-0">
        <div className="mb-5 flex items-start gap-3">
          {current.icon ? (
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-6">
              {current.icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Ajustes › {GROUP_LABEL[current.group]}</p>
            <h2 className="text-xl font-semibold tracking-tight">{current.label}</h2>
          </div>
        </div>
        <div key={current.key} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
          {current.node}
        </div>
      </section>
    </div>
  );
}
