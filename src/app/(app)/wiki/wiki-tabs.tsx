"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Boxes, HardDrive, KeyRound, LayoutTemplate, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

// Pestañas de la Wiki. Van en DOS grupos separados por una barra, porque son dos cosas
// distintas: la DOCUMENTACIÓN (páginas que se leen y se escriben) y las HERRAMIENTAS
// (tablas y bóvedas que se consultan). Antes las seis pestañas se veían iguales, y dos de
// ellas ni siquiera viven en la Wiki: llevan a /plantillas y desde allí ya no hay vuelta.
const DOCS = [{ href: "/wiki", label: "Documentación", icon: BookOpen, exact: true }];

const TOOLS = [
  { href: "/wiki/inventario", label: "Inventario", icon: Boxes, alert: "inventario" as const },
  { href: "/wiki/ubicacion", label: "Material y discos", icon: HardDrive, alert: "material" as const },
  { href: "/wiki/contrasenas", label: "Contraseñas", icon: KeyRound, gated: true },
  { href: "/plantillas", label: "Plantillas", icon: LayoutTemplate },
  { href: "/plantillas/documentos", label: "Plantillas de documento", icon: FileText },
];

export function WikiTabs({
  canSeePasswords = true,
  alertInventario = 0,
  alertMaterial = 0,
}: {
  canSeePasswords?: boolean;
  // Cuántos equipos requieren atención / cuántos respaldos están por vencer. Viajan como
  // chip en su pestaña: el aviso vive donde se actúa, sin repetir tarjetas en el índice.
  alertInventario?: number;
  alertMaterial?: number;
}) {
  const pathname = usePathname();
  const all = [...DOCS, ...TOOLS];
  // Con rutas anidadas (/plantillas y /plantillas/documentos) varias pestañas encajan a la vez:
  // gana la MÁS específica, si no se encenderían dos.
  const activa = all
    .filter((t) => ("exact" in t && t.exact ? pathname === t.href : pathname.startsWith(t.href)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const tab = (t: (typeof all)[number]) => {
    const active = t.href === activa;
    const Icon = t.icon;
    const alerta = "alert" in t ? (t.alert === "inventario" ? alertInventario : alertMaterial) : 0;
    return (
      <Link
        key={t.href}
        href={t.href}
        className={cn(
          "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
          active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="size-4" /> {t.label}
        {alerta > 0 ? (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            {alerta}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    // Solo en pantallas estrechas: en escritorio la navegación la da el árbol lateral
    // (WikiSidebar), que además muestra la jerarquía. Aquí siguen porque el árbol se
    // esconde en móvil y, sin ellas, no habría forma de llegar a las herramientas.
    <div className="mb-6 flex items-stretch gap-1 overflow-x-auto border-b border-border lg:hidden">
      {DOCS.map(tab)}
      <span className="my-2 w-px shrink-0 bg-border" aria-hidden />
      {TOOLS.map((t) => (t.gated && !canSeePasswords ? null : tab(t)))}
    </div>
  );
}
