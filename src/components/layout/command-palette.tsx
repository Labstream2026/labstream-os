"use client";

import * as React from "react";
import { quickAddTask } from "@/app/(app)/proyectos/[id]/actions";
import { useRouter } from "next/navigation";
import { Search, FileText, Loader2, Plus } from "lucide-react";
import {
  IconInicio, IconTareas, IconChat, IconProyectos, IconCalendario, IconCotizacion, IconWiki,
  IconArchivo, IconConfiguracion, IconBiblioteca, IconCliente, IconRevisiones, IconFacturacion, IconNotas,
} from "@/components/icons";
import type { SidebarClient } from "@/components/layout/sidebar";
import { globalSearch } from "./search-action";

type Item = { id: string; label: string; sub?: string; href: string; icon: React.ComponentType<{ className?: string }>; group: string; finished?: boolean; run?: () => Promise<void> };

// Normaliza sin acentos (NFD + quita diacríticos), en minúsculas. Igual que el filtro,
// pero a nivel de módulo para reusarlo en el resaltado. Los combinantes van escapados
// (̀-ͯ) a propósito: escribir el rango literal ensucia el archivo con bytes raros.
const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Ubica el término (ya normalizado) dentro del texto ORIGINAL, ignorando acentos y
// mayúsculas, y devuelve el rango [inicio, fin) en índices del original para poder
// resaltar sin perder tildes ni la capitalización real. Devuelve null si no hay match.
function matchRange(label: string, term: string): [number, number] | null {
  if (!term) return null;
  let norm = "";
  const map: number[] = []; // map[i] = índice en `label` que produjo norm[i]
  for (let i = 0; i < label.length; i++) {
    const n = stripAccents(label[i]);
    for (let k = 0; k < n.length; k++) { norm += n[k]; map.push(i); }
  }
  const idx = norm.indexOf(term);
  if (idx === -1) return null;
  return [map[idx], map[idx + term.length - 1] + 1];
}

// Resalta la coincidencia en negrita/azul; el resto del texto queda igual.
function Highlighted({ text, term }: { text: string; term: string }) {
  const r = matchRange(text, term);
  if (!r) return <>{text}</>;
  return (
    <>
      {text.slice(0, r[0])}
      <mark className="bg-transparent font-semibold text-primary">{text.slice(r[0], r[1])}</mark>
      {text.slice(r[1])}
    </>
  );
}

// Ícono por tipo de contenido devuelto por la búsqueda del servidor (set propio de Labstream).
const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  task: IconTareas, deliverable: IconRevisiones, quote: IconCotizacion, invoice: IconFacturacion, proposal: IconCotizacion, file: IconArchivo, note: IconNotas, chat: IconChat,
  library: IconBiblioteca, disk: IconBiblioteca,
};

// Páginas de la Wiki indexadas para el buscador (se cargan en el layout).
export type WikiSearchItem = { id: string; title: string; section: string | null };

const PAGES: Item[] = [
  { id: "p-home", label: "Inicio", href: "/", icon: IconInicio, group: "Ir a" },
  { id: "p-tasks", label: "Mis tareas", href: "/mis-tareas", icon: IconTareas, group: "Ir a" },
  { id: "p-chats", label: "Chats", href: "/chat", icon: IconChat, group: "Ir a" },
  { id: "p-proj", label: "Proyectos", href: "/proyectos", icon: IconProyectos, group: "Ir a" },
  { id: "p-cal", label: "Calendario", href: "/calendario", icon: IconCalendario, group: "Ir a" },
  { id: "p-tpl", label: "Plantillas", href: "/plantillas", icon: IconProyectos, group: "Ir a" },
  { id: "p-quote", label: "Cotizaciones", href: "/cotizaciones", icon: IconCotizacion, group: "Ir a" },
  { id: "p-wiki", label: "Wiki del equipo", href: "/wiki", icon: IconWiki, group: "Ir a" },
  { id: "p-inv", label: "Inventario", sub: "Wiki", href: "/wiki/inventario", icon: IconArchivo, group: "Ir a" },
  { id: "p-ubi", label: "Ubicación del material", sub: "Wiki", href: "/wiki/ubicacion", icon: IconArchivo, group: "Ir a" },
  { id: "p-pass", label: "Usuarios y contraseñas", sub: "Wiki", href: "/wiki/contrasenas", icon: IconConfiguracion, group: "Ir a" },
  { id: "p-lib", label: "Biblioteca", href: "/biblioteca", icon: IconBiblioteca, group: "Ir a" },
  { id: "p-cfg", label: "Configuración", href: "/configuracion", icon: IconConfiguracion, group: "Ir a" },
];

export function CommandPalette({ clients, wikiPages = [], open, onClose }: { clients: SidebarClient[]; wikiPages?: WikiSearchItem[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);

  React.useEffect(() => { if (open) { setQ(""); setActive(0); } }, [open]);

  const items = React.useMemo(() => {
    const clientItems: Item[] = clients.map((c) => ({ id: `c-${c.id}`, label: c.name, sub: "Cliente", href: `/clientes/${c.id}`, icon: IconCliente, group: "Clientes" }));
    const projectItems: Item[] = clients.flatMap((c) => c.projects.map((p) => ({ id: `pr-${p.id}`, label: p.name, sub: c.name, href: `/proyectos/${p.id}`, icon: IconProyectos, group: "Proyectos", finished: p.finished })));
    const wikiItems: Item[] = wikiPages.map((w) => ({ id: `w-${w.id}`, label: w.title, sub: w.section ?? "Wiki", href: `/wiki/${w.id}`, icon: FileText, group: "Wiki" }));
    // Normaliza quitando acentos (NFD + strip diacríticos): "diseno" encuentra "Diseño",
    // "cotizacion" encuentra "Cotización". Antes una tilde de más/menos no encontraba nada.
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const term = norm(q.trim());
    // Las páginas de la Wiki solo se listan al buscar (pueden ser muchas); sin
    // término mostramos navegación, clientes y proyectos.
    const all = term ? [...PAGES, ...clientItems, ...projectItems, ...wikiItems] : [...PAGES, ...clientItems, ...projectItems];
    if (!term) return all;
    return all.filter((i) => norm(i.label).includes(term) || norm(i.sub ?? "").includes(term));
  }, [clients, wikiPages, q]);

  // Búsqueda de CONTENIDO en el servidor (tareas, entregables, facturas, propuestas, archivos,
  // notas): acotada por permisos y acceso en search-action.ts. Se dispara con debounce a partir
  // de 2 caracteres; se ignoran respuestas obsoletas si el término cambió.
  const [serverHits, setServerHits] = React.useState<Item[]>([]);
  const [searching, setSearching] = React.useState(false);
  React.useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) { setServerHits([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const hits = await globalSearch(term);
        if (!cancelled) setServerHits(hits.map((h) => ({ id: h.id, label: h.label, sub: h.sub, href: h.href, icon: KIND_ICON[h.kind] ?? FileText, group: h.group, finished: h.finished })));
      } catch {
        if (!cancelled) setServerHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, open]);

  // Navegación (páginas/clientes/proyectos/wiki, instantáneo) + contenido del servidor.
  // Tareas 2.0: con 3+ letras escritas, SIEMPRE se ofrece crear la tarea con ese texto — el
  // parser del quick-add entiende fechas, @persona, #etiquetas, !prioridad y estimación.
  const [createErr, setCreateErr] = React.useState<string | null>(null);
  const allItems = React.useMemo(() => {
    const base = [...items, ...serverHits];
    const term = q.trim();
    if (term.length >= 3) {
      base.push({
        id: "quick-task",
        label: `＋ Crear tarea: «${term}»`,
        sub: "fechas, @persona, #tag, 2h…",
        href: "/mis-tareas",
        icon: Plus,
        group: "Crear",
      });
    }
    return base;
  }, [items, serverHits, q]);

  React.useEffect(() => { if (active >= allItems.length) setActive(0); }, [allItems.length, active]);

  const go = (i: Item) => {
    if (i.id === "quick-task") {
      const term = q.trim();
      setCreateErr(null);
      void quickAddTask(term).then((r) => {
        if (r.ok) { onClose(); router.push("/mis-tareas"); router.refresh(); }
        else setCreateErr(r.error ?? "No se pudo crear la tarea.");
      });
      return;
    }
    onClose();
    router.push(i.href);
  };

  if (!open) return null;

  // Agrupar para mostrar encabezados.
  const groups: { name: string; items: Item[] }[] = [];
  for (const it of allItems) {
    let g = groups.find((x) => x.name === it.group);
    if (!g) { g = { name: it.group, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  let flatIndex = -1;
  const hlTerm = stripAccents(q.trim()); // término normalizado para resaltar coincidencias

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
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(allItems.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); if (allItems[active]) go(allItems[active]); }
              else if (e.key === "Escape") { onClose(); }
            }}
            placeholder="Buscar tareas, entregables, facturas, proyectos…"
            // El aro azul de accesibilidad global (globals.css :focus-visible) va SIN @layer,
            // así que gana a cualquier utilidad focus-visible:outline-none. El estilo inline sí
            // lo vence (mismo truco que notes-app.tsx). Se anula SOLO aquí: el input se
            // autoenfoca dentro de un modal que ya atrapa el foco, el aro sobra y ensucia.
            style={{ outline: "none" }}
            className="w-full bg-transparent py-3 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {searching ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" /> : null}
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Esc</kbd>
        </div>
        {createErr ? <p className="border-b border-border px-3.5 py-1.5 text-xs font-medium text-destructive">{createErr}</p> : null}
        <div className="max-h-80 overflow-y-auto p-1.5">
          {allItems.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{searching ? "Buscando…" : `Sin resultados para «${q}».`}</p>
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
                      <span className="flex-1 truncate">{it.id === "quick-task" ? it.label : <Highlighted text={it.label} term={hlTerm} />}</span>
                      {/* Ciclo de vida: lo que vive en un proyecto TERMINADO se marca — sigue
                          encontrable (archivo consultable) pero nadie lo confunde con activo. */}
                      {it.finished ? <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Terminado</span> : null}
                      {it.sub ? <span className="shrink-0 text-xs text-muted-foreground">{it.sub}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        {/* Pie con atajos: enseña la navegación por teclado sin ensuciar (solo con resultados). */}
        {allItems.length > 0 ? (
          <div className="flex items-center gap-4 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> abrir</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Tecla estilizada, reutilizada en el pie de atajos.
function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{children}</kbd>;
}
