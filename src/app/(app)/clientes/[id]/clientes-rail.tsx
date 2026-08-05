"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Plus, Search } from "lucide-react";
import { EntityEmoji } from "@/components/icons/marks";
import { cn } from "@/lib/utils";

// ── Rail de clientes (maestro-detalle, rediseño aprobado por prototipo) ──
// Columna izquierda de la ficha: todos los clientes a la vista, el activo resaltado con su color,
// y cada uno se despliega en SUS proyectos ahí mismo. Cambiar de cliente es un clic, sin volver a
// la galería. Cerrado, el estudio entero cabe en una columna. Es la navegación que la otra sesión
// estaba montando; ahora vive aquí, en una sola sesión.
//
// Solo escritorio (lg+): en móvil la ficha va a ancho completo y se navega por la galería /clientes.

export type RailProject = { id: string; name: string; emoji: string | null; done: boolean; overdue: boolean };
export type RailClient = {
  id: string;
  name: string;
  emoji: string | null;
  accentHex: string;
  count: number; // proyectos activos
  overdue: number; // proyectos vencidos
  projects: RailProject[];
};

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function Avatar({ ini, color }: { ini: string; color: string }) {
  return (
    <span
      className="grid size-6 shrink-0 place-items-center rounded-full text-[9.5px] font-bold text-white/95"
      style={{ background: color }}
    >
      {ini}
    </span>
  );
}

export function ClientesRail({ clientes, activeId, total }: { clientes: RailClient[]; activeId: string; total: number }) {
  const [q, setQ] = React.useState("");
  const [abiertos, setAbiertos] = React.useState<Set<string>>(new Set([activeId]));

  // Estado de despliegue tras montar (evita mismatch de hidratación). El cliente ACTIVO siempre
  // arranca abierto; lo demás se recuerda entre visitas (navegar a un cliente no debe cerrar lo
  // que dejaste abierto).
  React.useEffect(() => {
    let guardados: string[] = [];
    try {
      const s = window.localStorage.getItem("clientes-rail-open");
      if (s) guardados = s.split(",").filter(Boolean);
    } catch { /* sin localStorage */ }
    setAbiertos(new Set([activeId, ...guardados]));
  }, [activeId]);

  const alternar = (id: string) => {
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      try { window.localStorage.setItem("clientes-rail-open", [...n].join(",")); } catch { /* noop */ }
      return n;
    });
  };

  const visibles = q.trim() ? clientes.filter((c) => fold(c.name).includes(fold(q))) : clientes;

  const iniciales = (nombre: string) =>
    nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-muted-foreground">Clientes</span>
        <span className="text-[11px] tabular-nums text-muted-foreground/60">{total}</span>
        <Link
          href="/clientes/nuevo"
          title="Nuevo cliente"
          aria-label="Nuevo cliente"
          className="ml-auto grid size-6 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </Link>
      </div>

      <label className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm focus-within:border-primary/60">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente"
          className="w-full bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {visibles.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Nada coincide con «{q.trim()}».</p>
        ) : null}
        {visibles.map((c) => {
          const on = c.id === activeId;
          const open = abiertos.has(c.id);
          return (
            <div key={c.id} className="mb-0.5">
              <div
                className={cn(
                  "relative flex items-center gap-1.5 rounded-lg pr-2 transition-colors",
                  on ? "" : "hover:bg-muted",
                )}
                style={on ? { background: `${c.accentHex}1f` } : undefined}
              >
                {on ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r" style={{ background: c.accentHex }} /> : null}
                <button
                  type="button"
                  onClick={() => alternar(c.id)}
                  aria-label={open ? "Contraer" : "Desplegar"}
                  aria-expanded={open}
                  className="grid size-6 shrink-0 place-items-center text-muted-foreground"
                >
                  <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
                </button>
                <Link href={`/clientes/${c.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
                  <Avatar ini={iniciales(c.name)} color={c.accentHex} />
                  <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", on ? "font-semibold" : "font-medium")}>
                    {c.emoji ? <><EntityEmoji value={c.emoji} /> </> : null}{c.name}
                  </span>
                  {c.overdue > 0 ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-red-500" title={`${c.overdue} vencido${c.overdue === 1 ? "" : "s"}`} />
                  ) : null}
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">{c.count}</span>
                </Link>
              </div>

              {open ? (
                <div className="mb-1 ml-[30px] mt-0.5 space-y-px border-l border-border pl-2">
                  {c.projects.length === 0 ? (
                    <p className="px-2 py-1 text-[11px] text-muted-foreground/70">Sin proyectos</p>
                  ) : (
                    c.projects.map((p) => (
                      <Link
                        key={p.id}
                        href={`/proyectos/${p.id}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: p.overdue ? "#ef4444" : p.done ? "hsl(var(--muted-foreground))" : c.accentHex }}
                        />
                        <span className="min-w-0 flex-1 truncate">{p.emoji ? <><EntityEmoji value={p.emoji} /> </> : null}{p.name}</span>
                      </Link>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
