"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Home, ListChecks, MessagesSquare, LayoutGrid, CalendarDays, Sparkles, LayoutTemplate, FileText, BookOpen, Boxes, HardDrive, KeyRound, Library, Settings, Building2, Rocket } from "lucide-react";
import type { SidebarClient } from "@/components/layout/sidebar";

type Item = { id: string; label: string; sub?: string; href: string; icon: React.ComponentType<{ className?: string }>; group: string };

// Páginas de la Wiki indexadas para el buscador (se cargan en el layout).
export type WikiSearchItem = { id: string; title: string; section: string | null };

const PAGES: Item[] = [
  { id: "p-home", label: "Inicio", href: "/", icon: Home, group: "Ir a" },
  { id: "p-tasks", label: "Mis tareas", href: "/mis-tareas", icon: ListChecks, group: "Ir a" },
  { id: "p-chats", label: "Chats", href: "/chat", icon: MessagesSquare, group: "Ir a" },
  { id: "p-proj", label: "Proyectos", href: "/proyectos", icon: LayoutGrid, group: "Ir a" },
  { id: "p-cal", label: "Calendario", href: "/calendario", icon: CalendarDays, group: "Ir a" },
  { id: "p-tpl", label: "Plantillas", href: "/plantillas", icon: LayoutTemplate, group: "Ir a" },
  { id: "p-quote", label: "Cotizaciones", href: "/cotizaciones", icon: FileText, group: "Ir a" },
  { id: "p-wiki", label: "Wiki del equipo", href: "/wiki", icon: BookOpen, group: "Ir a" },
  { id: "p-inv", label: "Inventario", sub: "Wiki", href: "/wiki/inventario", icon: Boxes, group: "Ir a" },
  { id: "p-ubi", label: "Ubicación del material", sub: "Wiki", href: "/wiki/ubicacion", icon: HardDrive, group: "Ir a" },
  { id: "p-pass", label: "Usuarios y contraseñas", sub: "Wiki", href: "/wiki/contrasenas", icon: KeyRound, group: "Ir a" },
  { id: "p-lib", label: "Biblioteca", href: "/biblioteca", icon: Library, group: "Ir a" },
  { id: "p-cfg", label: "Configuración", href: "/configuracion", icon: Settings, group: "Ir a" },
];

export function CommandPalette({ clients, wikiPages = [], open, onClose }: { clients: SidebarClient[]; wikiPages?: WikiSearchItem[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);

  React.useEffect(() => { if (open) { setQ(""); setActive(0); } }, [open]);

  const items = React.useMemo(() => {
    const clientItems: Item[] = clients.map((c) => ({ id: `c-${c.id}`, label: c.name, sub: "Cliente", href: `/clientes/${c.id}`, icon: Building2, group: "Clientes" }));
    const projectItems: Item[] = clients.flatMap((c) => c.projects.map((p) => ({ id: `pr-${p.id}`, label: p.name, sub: c.name, href: `/proyectos/${p.id}`, icon: Rocket, group: "Proyectos" })));
    const wikiItems: Item[] = wikiPages.map((w) => ({ id: `w-${w.id}`, label: w.title, sub: w.section ?? "Wiki", href: `/wiki/${w.id}`, icon: FileText, group: "Wiki" }));
    const term = q.trim().toLowerCase();
    // Las páginas de la Wiki solo se listan al buscar (pueden ser muchas); sin
    // término mostramos navegación, clientes y proyectos.
    const all = term ? [...PAGES, ...clientItems, ...projectItems, ...wikiItems] : [...PAGES, ...clientItems, ...projectItems];
    if (!term) return all;
    return all.filter((i) => i.label.toLowerCase().includes(term) || (i.sub ?? "").toLowerCase().includes(term));
  }, [clients, wikiPages, q]);

  React.useEffect(() => { if (active >= items.length) setActive(0); }, [items.length, active]);

  const go = (i: Item) => { onClose(); router.push(i.href); };

  if (!open) return null;

  // Agrupar para mostrar encabezados.
  const groups: { name: string; items: Item[] }[] = [];
  for (const it of items) {
    let g = groups.find((x) => x.name === it.group);
    if (!g) { g = { name: it.group, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-3.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); if (items[active]) go(items[active]); }
              else if (e.key === "Escape") { onClose(); }
            }}
            placeholder="Buscar proyectos, clientes, páginas…"
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Sin resultados para «{q}».</p>
          ) : (
            groups.map((g) => (
              <div key={g.name} className="mb-1">
                <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</p>
                {g.items.map((it) => {
                  flatIndex++;
                  const idx = flatIndex;
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.id}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(it)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${idx === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}`}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.sub ? <span className="shrink-0 text-xs text-muted-foreground">{it.sub}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
