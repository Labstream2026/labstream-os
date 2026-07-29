"use client";

import * as React from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// Atajos personales de la Wiki: FAVORITOS (los fijas tú) y RECIENTES (las últimas que
// abriste). Viven en este navegador, no en la base de datos: son una comodidad de
// navegación, no información de la empresa, y así no hacen falta ni tabla ni migración.

const FAV_KEY = "wiki:favoritos";
const REC_KEY = "wiki:recientes";
const MAX_RECIENTES = 5;

export type AtajoPagina = { id: string; title: string; icon: string | null };

function leer(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function guardar(key: string, ids: string[]) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* sin localStorage: los atajos duran esta sesión */ }
  // Avisa a las demás piezas de la misma pestaña (el evento `storage` solo llega a OTRAS).
  window.dispatchEvent(new CustomEvent("wiki-atajos"));
}

/** Ids favoritos, en vivo: se refresca cuando cambian aquí o en otra pestaña. */
export function useAtajos(key: string): string[] {
  const [ids, setIds] = React.useState<string[]>([]);
  React.useEffect(() => {
    const refrescar = () => setIds(leer(key));
    refrescar();
    window.addEventListener("wiki-atajos", refrescar);
    window.addEventListener("storage", refrescar);
    return () => {
      window.removeEventListener("wiki-atajos", refrescar);
      window.removeEventListener("storage", refrescar);
    };
  }, [key]);
  return ids;
}

/** Botón de favorito de una página (⭐). */
export function BotonFavorito({ pageId }: { pageId: string }) {
  const favs = useAtajos(FAV_KEY);
  // Hasta que monta, se pinta apagado: el servidor no sabe qué hay en localStorage y
  // pintar otra cosa daría un aviso de hidratación.
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => setMontado(true), []);
  const activo = montado && favs.includes(pageId);

  return (
    <button
      type="button"
      onClick={() => {
        const actuales = leer(FAV_KEY);
        guardar(FAV_KEY, actuales.includes(pageId) ? actuales.filter((x) => x !== pageId) : [pageId, ...actuales].slice(0, 20));
      }}
      aria-pressed={activo}
      title={activo ? "Quitar de mis atajos" : "Añadir a mis atajos"}
      className={cn(
        "inline-flex items-center gap-1 text-xs transition-colors",
        activo ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Star className={cn("size-3.5", activo && "fill-current")} />
      {activo ? "En atajos" : "Fijar"}
    </button>
  );
}

/** Registra la página como «vista recientemente». No pinta nada. */
export function RegistrarVisita({ pageId }: { pageId: string }) {
  React.useEffect(() => {
    const previas = leer(REC_KEY).filter((x) => x !== pageId);
    guardar(REC_KEY, [pageId, ...previas].slice(0, MAX_RECIENTES));
  }, [pageId]);
  return null;
}

/** Bloque «Mis atajos» del árbol: favoritos primero, luego las vistas hace poco. */
export function MisAtajos({ paginas }: { paginas: AtajoPagina[] }) {
  const favs = useAtajos(FAV_KEY);
  const recientes = useAtajos(REC_KEY);
  const porId = React.useMemo(() => new Map(paginas.map((p) => [p.id, p])), [paginas]);

  // Se resuelven contra las páginas que existen: una borrada desaparece sola del atajo.
  const listaFav = favs.map((id) => porId.get(id)).filter((p): p is AtajoPagina => !!p);
  const listaRec = recientes
    .filter((id) => !favs.includes(id))
    .map((id) => porId.get(id))
    .filter((p): p is AtajoPagina => !!p)
    .slice(0, 3);

  if (!listaFav.length && !listaRec.length) return null;

  const fila = (p: AtajoPagina, fav: boolean) => (
    <li key={p.id}>
      <Link
        href={`/wiki/${p.id}`}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-foreground transition-colors hover:bg-accent"
      >
        {fav ? <Star className="size-3 shrink-0 fill-current text-amber-500" /> : <span className="w-3 shrink-0" />}
        <span className="shrink-0 text-[13px] leading-none">{p.icon ?? "📄"}</span>
        <span className="truncate">{p.title}</span>
      </Link>
    </li>
  );

  return (
    <div className="mb-3">
      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mis atajos</p>
      <ul className="space-y-0.5">
        {listaFav.map((p) => fila(p, true))}
        {listaRec.map((p) => fila(p, false))}
      </ul>
    </div>
  );
}
