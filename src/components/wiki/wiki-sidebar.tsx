"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, FileText, Search, Boxes, HardDrive, KeyRound, LayoutTemplate, FileType2, BookOpen, Stethoscope, Library } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WikiGroup, WikiNode } from "@/lib/wiki-tree";
import { MisAtajos, type AtajoPagina } from "@/components/wiki/wiki-atajos";

// Barra lateral de la Wiki: el árbol de páginas (secciones → páginas → hijas) y las
// HERRAMIENTAS, separadas de la documentación porque no son lo mismo. Sustituye a las
// pestañas: aquí sí caben 30 páginas anidadas, y siempre se ve dónde estás.
//
// El plegado se recuerda en este navegador (localStorage): es una preferencia de
// navegación momentánea, no algo que merezca viajar a la base de datos.

const ABIERTOS_KEY = "wiki:tree:abiertos";

type Herramienta = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; alerta?: number };

export function WikiSidebar({
  grupos,
  todas = [],
  canSeePasswords = true,
  canBiblioteca = true,
  alertInventario = 0,
  alertMaterial = 0,
  alertSalud = 0,
  alertBiblioteca = 0,
}: {
  grupos: WikiGroup[];
  // Todas las páginas en plano: los atajos guardan ids y necesitan resolverlos a título.
  todas?: AtajoPagina[];
  canSeePasswords?: boolean;
  canBiblioteca?: boolean;
  alertInventario?: number;
  alertMaterial?: number;
  // Páginas vencidas o sin dueño: el chip lleva a arreglarlas.
  alertSalud?: number;
  // Discos activos sin verificar hace más de seis meses.
  alertBiblioteca?: number;
}) {
  const pathname = usePathname();
  const [filtro, setFiltro] = React.useState("");
  // `null` hasta leer localStorage: así el primer render del cliente coincide con el del
  // servidor (todo abierto) y no hay parpadeo ni aviso de hidratación.
  const [cerrados, setCerrados] = React.useState<Set<string> | null>(null);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(ABIERTOS_KEY);
      setCerrados(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setCerrados(new Set());
    }
  }, []);

  const alternar = (key: string) => {
    setCerrados((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem(ABIERTOS_KEY, JSON.stringify([...next])); } catch { /* sin localStorage: se pliega solo en esta sesión */ }
      return next;
    });
  };
  const estaCerrado = (key: string) => (cerrados ? cerrados.has(key) : false);

  const q = filtro.trim().toLowerCase();
  const coincide = (n: WikiNode): boolean =>
    !q || n.title.toLowerCase().includes(q) || n.hijos.some(coincide);

  const herramientas: Herramienta[] = [
    { href: "/wiki/salud", label: "Salud del conocimiento", icon: Stethoscope, alerta: alertSalud },
    ...(canBiblioteca ? [{ href: "/biblioteca", label: "Biblioteca", icon: Library, alerta: alertBiblioteca }] : []),
    { href: "/wiki/inventario", label: "Inventario", icon: Boxes, alerta: alertInventario },
    { href: "/wiki/ubicacion", label: "Material y discos", icon: HardDrive, alerta: alertMaterial },
    ...(canSeePasswords ? [{ href: "/wiki/contrasenas", label: "Contraseñas", icon: KeyRound }] : []),
    { href: "/plantillas", label: "Plantillas", icon: LayoutTemplate },
    { href: "/plantillas/documentos", label: "Plantillas de documento", icon: FileType2 },
  ];

  const nodo = (n: WikiNode, nivel: number): React.ReactNode => {
    if (!coincide(n)) return null;
    const activo = pathname === `/wiki/${n.id}`;
    const tieneHijos = n.hijos.length > 0;
    // Al filtrar, todo se despliega para que el resultado se vea.
    const plegado = tieneHijos && !q && estaCerrado(n.id);
    return (
      <li key={n.id}>
        <div className="flex items-stretch">
          {tieneHijos ? (
            <button
              type="button"
              onClick={() => alternar(n.id)}
              aria-label={plegado ? `Desplegar ${n.title}` : `Plegar ${n.title}`}
              aria-expanded={!plegado}
              className="grid w-4 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
              style={{ marginLeft: `${(nivel - 1) * 12}px` }}
            >
              <ChevronRight className={cn("size-3 transition-transform", !plegado && "rotate-90")} />
            </button>
          ) : (
            <span className="w-4 shrink-0" style={{ marginLeft: `${(nivel - 1) * 12}px` }} />
          )}
          <Link
            href={`/wiki/${n.id}`}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] transition-colors",
              activo ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-accent",
            )}
          >
            <span className="shrink-0 text-[13px] leading-none">
              {n.icon ?? <FileText className="size-3.5 text-muted-foreground" />}
            </span>
            <span className="truncate">{n.title}</span>
          </Link>
        </div>
        {tieneHijos && !plegado ? <ul className="mt-0.5 space-y-0.5">{n.hijos.map((h) => nodo(h, nivel + 1))}</ul> : null}
      </li>
    );
  };

  const gruposVisibles = grupos
    .map((g) => ({ ...g, paginas: g.paginas.filter(coincide) }))
    .filter((g) => g.paginas.length > 0);

  return (
    <nav aria-label="Páginas de la wiki" className="flex h-full flex-col gap-3 overflow-hidden border-r border-border bg-sidebar/40 px-3 py-4">
      <Link
        href="/wiki"
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors",
          pathname === "/wiki" ? "bg-primary/10 text-primary" : "hover:bg-accent",
        )}
      >
        <BookOpen className="size-4" /> Wiki del equipo
      </Link>

      <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar páginas…"
          aria-label="Filtrar páginas de la wiki"
          className="w-full bg-transparent text-xs outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!q ? <MisAtajos paginas={todas} /> : null}
        {gruposVisibles.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {q ? "Ninguna página coincide." : "Aún no hay páginas."}
          </p>
        ) : (
          gruposVisibles.map((g) => {
            const plegado = !q && estaCerrado(`s:${g.section}`);
            return (
              <div key={g.section} className="mb-3">
                <button
                  type="button"
                  onClick={() => alternar(`s:${g.section}`)}
                  aria-expanded={!plegado}
                  className="flex w-full items-center gap-1 px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className={cn("size-3 transition-transform", !plegado && "rotate-90")} />
                  <span className="truncate">{g.section}</span>
                  <span className="ml-auto tabular-nums opacity-70">{g.paginas.length}</span>
                </button>
                {!plegado ? <ul className="mt-0.5 space-y-0.5">{g.paginas.map((n) => nodo(n, 1))}</ul> : null}
              </div>
            );
          })
        )}
      </div>

      {/* Herramientas: tablas y bóvedas. Van abajo y separadas — no son documentación,
          aunque hasta ahora compartían la misma fila de pestañas. */}
      <div className="shrink-0 border-t border-border pt-3">
        <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Herramientas</p>
        <ul className="space-y-0.5">
          {herramientas.map((h) => {
            const activo = h.href === "/plantillas" ? pathname === h.href : pathname.startsWith(h.href);
            const Icon = h.icon;
            return (
              <li key={h.href}>
                <Link
                  href={h.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors",
                    activo ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{h.label}</span>
                  {h.alerta ? (
                    <span className="ml-auto rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold tabular-nums text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      {h.alerta}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
