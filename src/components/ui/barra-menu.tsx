"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Una barra de mandos, con lo secundario recogido en menús ────────────────────
// Cuatro pantallas (Revisiones, Notas, Mis tareas, Mensajes) habían crecido igual: cada grupo de
// mandos en su propia fila. Con dos filas se lee; con cuatro, el trabajo empieza tan abajo que hay
// que hacer scroll para verlo. Esto son las piezas para dejar UNA fila por pantalla.
//
// La regla que ordena qué se ve y qué se guarda: **lo que está puesto se ve; lo que sirve para
// ponerlo se guarda**. Un desplegable que dice «Todos los clientes» ocupa lo mismo que uno que
// dice «LATINOLOGIA», pero solo el segundo cuenta algo — así que el primero se va al menú y el
// segundo sale como pastilla con ✕.
//
// Se apoya en <details data-autoclose>: DetailsAutoClose (montado una vez en el shell) lo cierra
// al pulsar fuera, con Escape y al enviar un formulario de dentro. Aquí no hace falta ni estado de
// «abierto» ni listeners. Las clases son LAS MISMAS que el panel de Archivos para que las cinco
// superficies se vean como una sola cosa.

export const MENU_ITEM =
  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted";
export const MENU_CAJA =
  "absolute z-30 mt-1 w-60 rounded-lg border border-border bg-popover p-1 shadow-lg";
export const MENU_GRUPO =
  "px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70";

// Cierra el <details> que contiene al elemento. Los menús se cierran al elegir: dejarlos abiertos
// tapando la lista que acabas de filtrar es de las cosas que más molestan. Hace falta hacerlo a
// mano porque `open` es estado del DOM y React no lo toca al re-renderizar — ni al navegar.
export function cerrarMenu(e: React.MouseEvent<HTMLElement>) {
  e.currentTarget.closest("details")?.removeAttribute("open");
}

// ── La barra ───────────────────────────────────────────────────────────────────
// `pegajosa` la mantiene arriba al bajar por listas largas (extra 1). A propósito SIN
// backdrop-blur: un ancestro con backdrop-filter se vuelve bloque contenedor de los descendientes
// `fixed`, y eso ya nos rompió el visor de portadas. Fondo sólido y nos ahorramos esa clase de fallo.
export function BarraMandos({
  children,
  pegajosa = false,
  className,
}: {
  children: React.ReactNode;
  pegajosa?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        pegajosa && "sticky top-0 z-20 -mx-1 bg-background px-1 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Un menú de la barra ────────────────────────────────────────────────────────
// `activos` > 0 tiñe el botón y pone el número: un filtro puesto nunca queda escondido.
// `clave` la lee AtajosBarra para abrirlo con el teclado ("filtrar" → f, "vista" → v).
// `icono` es un ELEMENTO (<Search />), no un componente: estas piezas se usan desde pantallas del
// servidor, y una función no cruza la frontera servidor→cliente («Functions cannot be passed
// directly to Client Components»). Un elemento sí. Es además el patrón que ya usan PageHeader y
// ViewTabs, y el tamaño se fija aquí con [&_svg] para que quien llama solo escriba <Search />.
export function MenuBarra({
  etiqueta,
  icono,
  activos = 0,
  alineado = "izquierda",
  ancho,
  tono = "borde",
  clave,
  titulo,
  children,
}: {
  etiqueta?: string;
  icono?: React.ReactNode;
  activos?: number;
  alineado?: "izquierda" | "derecha";
  ancho?: string;
  tono?: "borde" | "primario" | "icono";
  clave?: string;
  titulo?: string;
  children: React.ReactNode;
}) {
  const encendido = activos > 0;
  return (
    <details data-autoclose data-barra-menu={clave} className="relative shrink-0">
      <summary
        title={titulo}
        aria-label={titulo ?? etiqueta}
        className={cn(
          "flex cursor-pointer list-none items-center gap-1.5 rounded-md transition-colors",
          tono === "primario"
            ? "bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            : tono === "icono"
              ? "size-8 justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
              : cn(
                  "border px-2.5 py-1.5 text-xs font-medium",
                  encendido
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                ),
        )}
      >
        {icono ? (
          <span className={cn("shrink-0", tono === "primario" ? "[&_svg]:size-4" : "[&_svg]:size-3.5")}>{icono}</span>
        ) : null}
        {etiqueta}
        {encendido ? (
          <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-bold tabular-nums">{activos}</span>
        ) : null}
        {tono === "icono" ? null : <ChevronDown className="size-3 opacity-70" />}
      </summary>
      <div className={cn(MENU_CAJA, alineado === "derecha" && "right-0", ancho)}>{children}</div>
    </details>
  );
}

// ── Una opción del menú ────────────────────────────────────────────────────────
// Acepta `href` (navega, para pantallas que filtran en el servidor) u `onClick` (estado de
// cliente). En los dos casos el menú se cierra al elegir. La marca ✓ ocupa sitio incluso cuando
// no está puesta, para que las etiquetas queden alineadas y la lista no baile al cambiar de opción.
export function MenuOpcion({
  activa = false,
  icono,
  pista,
  href,
  onClick,
  peligro = false,
  marca = true,
  children,
}: {
  activa?: boolean;
  // Elemento, no componente: ver la nota de MenuBarra sobre la frontera servidor→cliente.
  icono?: React.ReactNode;
  pista?: React.ReactNode;
  href?: string;
  // OJO: `onClick` solo desde componentes de CLIENTE. Una pantalla del servidor usa `href`.
  onClick?: () => void;
  peligro?: boolean;
  marca?: boolean;
  children: React.ReactNode;
}) {
  const clase = cn(
    MENU_ITEM,
    activa && "font-semibold text-primary",
    peligro && "text-destructive hover:bg-destructive/10",
  );
  const dentro = (
    <>
      {marca ? (
        activa ? <Check className="size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0" />
      ) : null}
      {icono ? (
        <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icono}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {pista != null ? (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{pista}</span>
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={clase} onClick={cerrarMenu}>
        {dentro}
      </Link>
    );
  }
  return (
    <button type="button" className={clase} onClick={(e) => { cerrarMenu(e); onClick?.(); }}>
      {dentro}
    </button>
  );
}

export function MenuGrupo({ children }: { children: React.ReactNode }) {
  return <p className={MENU_GRUPO}>{children}</p>;
}

export function MenuSeparador() {
  return <div className="my-1 h-px bg-border" />;
}

// ── Pastilla de filtro puesto ──────────────────────────────────────────────────
// El precio de esconder los mandos es que un filtro puede quedar activo sin que se vea. Esto lo
// paga: cada filtro puesto sale como pastilla con ✕, y quitarlo es un clic.
export function ChipFiltro({
  children,
  href,
  onQuitar,
}: {
  children: React.ReactNode;
  href?: string;
  onQuitar?: () => void;
}) {
  const cuerpo = (
    <>
      <span className="min-w-0 truncate">{children}</span>
      <X className="size-3 shrink-0 opacity-60" />
    </>
  );
  const clase =
    "inline-flex max-w-[14rem] items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20";
  return href ? (
    <Link href={href} className={clase} aria-label="Quitar este filtro">{cuerpo}</Link>
  ) : (
    <button type="button" className={clase} onClick={onQuitar} aria-label="Quitar este filtro">{cuerpo}</button>
  );
}

// ── Franja de resumen ──────────────────────────────────────────────────────────
// Sustituye a las rejillas de cuatro cuadros (Revisiones, Mis tareas): una línea en vez de ~110 px.
// Y cada tramo FILTRA al pulsarlo — antes los cuadros solo informaban, así que veías «3 vencidas»
// y te tocaba armar el filtro a mano (extra 7).
export type TramoResumen = {
  key: string;
  label: string;
  valor: number;
  tono?: "neutro" | "rose" | "amber" | "sky" | "teal" | "violet" | "emerald";
  href?: string;
  // OJO: `onClick` solo desde componentes de CLIENTE — una función no cruza la frontera
  // servidor→cliente. Una pantalla del servidor (como /revisiones) pasa `href`.
  onClick?: () => void;
  activo?: boolean;
};

const TRAMO_TONO: Record<string, string> = {
  neutro: "bg-muted text-muted-foreground hover:bg-accent",
  rose: "bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-400",
  amber: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400",
  sky: "bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-400",
  teal: "bg-teal-500/10 text-teal-700 hover:bg-teal-500/20 dark:text-teal-400",
  violet: "bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:text-violet-400",
  emerald: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400",
};

export function FranjaResumen({ tramos, className }: { tramos: TramoResumen[]; className?: string }) {
  const conAlgo = tramos.filter((t) => t.valor > 0);
  if (conAlgo.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {conAlgo.map((t) => {
        const clase = cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
          TRAMO_TONO[t.tono ?? "neutro"],
          t.activo && "ring-1 ring-current",
        );
        const cuerpo = (
          <>
            <b className="font-bold tabular-nums">{t.valor}</b> {t.label}
          </>
        );
        if (t.href) return <Link key={t.key} href={t.href} className={clase}>{cuerpo}</Link>;
        if (t.onClick) return <button key={t.key} type="button" className={clase} onClick={t.onClick}>{cuerpo}</button>;
        return <span key={t.key} className={clase}>{cuerpo}</span>;
      })}
    </div>
  );
}

// ── Buscador de la barra ───────────────────────────────────────────────────────
// `data-barra-buscador` es lo que AtajosBarra enfoca con «/». Escape lo limpia y suelta el foco.
export function BuscadorBarra({
  value,
  onChange,
  placeholder = "Buscar",
  tecla = "/",
  className,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tecla?: string | null;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className={cn("relative min-w-0 flex-1 basis-40", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        data-barra-buscador
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          if (value) { e.stopPropagation(); onChange(""); }
          else e.currentTarget.blur();
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar la búsqueda"
          className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
      {!value && tecla ? (
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
          {tecla}
        </kbd>
      ) : null}
    </div>
  );
}

// ── Los mismos atajos en las cuatro pantallas (extra 3) ────────────────────────
// Hoy cada superficie tiene su propio atajo o ninguno: Notas usa ⌘F y las otras tres, nada.
//   /  enfoca el buscador de la barra   ·   f  abre Filtrar   ·   v  abre Vista
// Busca por atributos del DOM en vez de props, así sirve igual en una pantalla del servidor
// (Revisiones) que en una de cliente, sin enhebrar refs por medio árbol.
// Escape lo maneja cada pieza: DetailsAutoClose cierra los menús y BuscadorBarra limpia el texto.
export function AtajosBarra() {
  React.useEffect(() => {
    const escribiendo = (el: EventTarget | null): boolean => {
      const n = el as HTMLElement | null;
      if (!n?.tagName) return false;
      return (
        n.tagName === "INPUT" ||
        n.tagName === "TEXTAREA" ||
        n.tagName === "SELECT" ||
        n.isContentEditable === true
      );
    };
    const onKey = (e: KeyboardEvent) => {
      // Con modificadores no: ⌘F es «buscar en la página» del navegador y no se le quita.
      if (e.metaKey || e.ctrlKey || e.altKey || escribiendo(e.target)) return;
      if (e.key === "/") {
        const input = document.querySelector<HTMLInputElement>("main [data-barra-buscador]");
        if (!input) return;
        e.preventDefault();
        input.focus();
        input.select();
        return;
      }
      if (e.key !== "f" && e.key !== "v") return;
      const clave = e.key === "f" ? "filtrar" : "vista";
      const menu = document.querySelector<HTMLDetailsElement>(`main [data-barra-menu="${clave}"]`);
      if (!menu) return;
      e.preventDefault();
      // Cerrar los demás primero: dos menús abiertos a la vez se solapan.
      document.querySelectorAll<HTMLDetailsElement>("details[open][data-autoclose]").forEach((d) => {
        if (d !== menu) d.open = false;
      });
      menu.open = !menu.open;
      if (menu.open) menu.querySelector<HTMLElement>("a, button")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

// ── Recordar cómo lo dejaste (extra 2) ─────────────────────────────────────────
// Para la VISTA (agrupación, densidad, qué se esconde) basta el navegador: es instantáneo, no
// cuesta un viaje al servidor y es lo que ViewTabs ya hace con su storageKey. Los FILTROS, en
// cambio, viven en la URL — así el enlace es compartible (extra 6) y las vistas guardadas son
// solo una cadena de query con nombre.
// localStorage es un almacén EXTERNO a React, así que se lee con useSyncExternalStore y no con
// useState+useEffect: es para lo que existe, evita el render en cascada de un setState dentro de un
// efecto, resuelve la hidratación con `getServerSnapshot` (el servidor no puede saber lo guardado)
// y de paso sincroniza entre pestañas gratis, por el evento `storage`.
const oyentes = new Set<() => void>();

export function usePreferenciaLocal<T extends string>(clave: string, inicial: T): [T, (v: T) => void] {
  const suscribir = React.useCallback((avisar: () => void) => {
    // Dos fuentes: otra pestaña (evento `storage`) y otro componente de ESTA pestaña, que el
    // evento no cubre porque el navegador no se lo manda a quien escribió.
    oyentes.add(avisar);
    window.addEventListener("storage", avisar);
    return () => {
      oyentes.delete(avisar);
      window.removeEventListener("storage", avisar);
    };
  }, []);
  // Devuelve una cadena, no un objeto nuevo: si la instantánea cambiara de identidad en cada
  // lectura, useSyncExternalStore entraría en un bucle de renders.
  const leer = React.useCallback((): T => {
    try { return (window.localStorage.getItem(clave) as T | null) || inicial; }
    catch { return inicial; } // modo privado o almacenamiento lleno
  }, [clave, inicial]);
  const enServidor = React.useCallback(() => inicial, [inicial]);
  const valor = React.useSyncExternalStore(suscribir, leer, enServidor);

  const poner = React.useCallback(
    (v: T) => {
      try { window.localStorage.setItem(clave, v); } catch { /* idem */ }
      oyentes.forEach((avisar) => avisar());
    },
    [clave],
  );
  return [valor, poner];
}
