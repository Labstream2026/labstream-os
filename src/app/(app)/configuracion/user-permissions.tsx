"use client";

import * as React from "react";
import { SlidersHorizontal, X, LayoutGrid, Building2, CalendarDays, FileText, Sparkles, BookOpen, Library, BarChart3, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUserPermissionState, setUserPermissionOverride } from "./actions";

type Perm = { key: string; label: string; category: string };
type State = "inherit" | "grant" | "revoke";

// Accesos rápidos a las secciones navegables (permisos "ver_*"). Permiten conceder o
// retirar el acceso a cada área de un vistazo: p. ej. dejar solo la Wiki encendida.
const SECTIONS: { key: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "ver_proyectos", label: "Proyectos", Icon: LayoutGrid },
  { key: "ver_clientes", label: "Clientes", Icon: Building2 },
  { key: "ver_calendario", label: "Calendario", Icon: CalendarDays },
  { key: "ver_cotizaciones", label: "Cotizaciones", Icon: FileText },
  { key: "ver_asistente", label: "Asistente IA", Icon: Sparkles },
  { key: "ver_wiki", label: "Wiki", Icon: BookOpen },
  { key: "ver_biblioteca", label: "Biblioteca", Icon: Library },
  { key: "ver_reportes", label: "Reportes", Icon: BarChart3 },
  { key: "ver_cumplimiento", label: "Cumplimiento", Icon: Target },
];

export function UserPermissions({
  userId,
  userName,
  permissions,
  categories,
}: {
  userId: string;
  userName: string;
  permissions: Perm[];
  categories: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [roleName, setRoleName] = React.useState("");
  const [rolePerms, setRolePerms] = React.useState<Set<string>>(new Set());
  const [overrides, setOverrides] = React.useState<Record<string, boolean>>({});

  function load() {
    setLoading(true);
    getUserPermissionState(userId)
      .then((r) => {
        if (r.ok) {
          setIsAdmin(!!r.isAdmin);
          setRoleName(r.roleName ?? "");
          setRolePerms(new Set(r.rolePerms ?? []));
          setOverrides(r.overrides ?? {});
        }
      })
      .finally(() => setLoading(false));
  }

  function openPanel() {
    setOpen(true);
    load();
  }

  function setState(key: string, state: State) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (state === "inherit") delete next[key];
      else next[key] = state === "grant";
      return next;
    });
    start(() => { void setUserPermissionOverride(userId, key, state); });
  }

  // Estado efectivo de un permiso = override si existe, si no lo que trae el rol.
  function effectiveOf(key: string): boolean {
    const ov = overrides[key];
    return ov === undefined ? rolePerms.has(key) : ov;
  }

  // Interruptor simple por sección: si el destino coincide con el rol, vuelve a heredar
  // (sin override); si no, concede/revoca explícitamente.
  function toggleSection(key: string) {
    const target = !effectiveOf(key);
    const inRole = rolePerms.has(key);
    setState(key, target === inRole ? "inherit" : target ? "grant" : "revoke");
  }

  const sections = SECTIONS.filter((s) => permissions.some((p) => p.key === s.key));

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        title="Permisos individuales"
        className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
      >
        <SlidersHorizontal className="mr-1 inline size-3.5" />
        Permisos
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">Permisos de {userName}</h3>
                <p className="text-xs text-muted-foreground">Rol: {roleName || "…"} · ajusta permisos individuales encima del rol</p>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
            </div>

            <div className="overflow-y-auto p-4">
              {loading ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : isAdmin ? (
                <p className="text-sm text-muted-foreground">Este usuario es Administrador: tiene acceso total y no necesita permisos individuales.</p>
              ) : (
                <div className="space-y-4">
                  {/* Accesos rápidos: enciende/apaga cada sección de un vistazo. */}
                  {sections.length ? (
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs font-semibold">Accesos a secciones</p>
                      <p className="mb-2.5 mt-0.5 text-[11px] text-muted-foreground">
                        Da o quita el acceso a cada área. Para «solo la Wiki», deja únicamente esa encendida.
                      </p>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {sections.map(({ key, label, Icon }) => {
                          const on = effectiveOf(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              disabled={pending}
                              onClick={() => toggleSection(key)}
                              aria-pressed={on}
                              className={cn(
                                "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors disabled:opacity-60",
                                on ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted",
                              )}
                            >
                              <Icon className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
                              <span className="flex-1 font-medium">{label}</span>
                              <span className={cn("relative h-4 w-7 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-muted-foreground/30")}>
                                <span className={cn("absolute top-0.5 size-3 rounded-full bg-white transition-all", on ? "left-3.5" : "left-0.5")} />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {categories.map((cat) => {
                    const perms = permissions.filter((p) => p.category === cat);
                    if (!perms.length) return null;
                    return (
                      <div key={cat}>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{cat}</p>
                        <div className="space-y-1">
                          {perms.map((p) => {
                            const fromRole = rolePerms.has(p.key);
                            const ov = overrides[p.key];
                            const state: State = ov === undefined ? "inherit" : ov ? "grant" : "revoke";
                            const effective = ov === undefined ? fromRole : ov;
                            return (
                              <div key={p.key} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium">
                                    <span className={cn("mr-1.5 inline-block size-1.5 rounded-full align-middle", effective ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                                    {p.label}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">{fromRole ? "Incluido en el rol" : "No incluido en el rol"}</p>
                                </div>
                                <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border text-[11px]">
                                  {(["inherit", "grant", "revoke"] as State[]).map((s) => (
                                    <button
                                      key={s}
                                      type="button"
                                      disabled={pending}
                                      onClick={() => setState(p.key, s)}
                                      className={cn(
                                        "px-2 py-1 font-medium transition-colors",
                                        state === s
                                          ? s === "grant"
                                            ? "bg-emerald-500 text-white"
                                            : s === "revoke"
                                              ? "bg-destructive text-white"
                                              : "bg-primary text-primary-foreground"
                                          : "bg-card text-muted-foreground hover:bg-muted",
                                      )}
                                    >
                                      {s === "inherit" ? "Hereda" : s === "grant" ? "Sí" : "No"}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
