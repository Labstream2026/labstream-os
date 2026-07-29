"use client";

import * as React from "react";
import { Folder, Image as ImageIcon, Search, SortAsc } from "lucide-react";
import type { GaleriaFolder } from "@/lib/nas-galeria";

// ── El índice de entregas ──────────────────────────────────────────────────────
// Antes era una lista de tarjetas iguales, con un icono de carpeta y la fecha de la
// CARPETA. Esa fecha resultó ser un dato falso: cualquier cosa que escriba dentro la
// actualiza entera, y una pasada de la fábrica de copias dejó 30 entregas con la misma
// fecha y el índice sin orden posible.
//
// Ahora cada tarjeta enseña su portada, cuántas piezas tiene, cuánto pesa y la fecha de
// su material MÁS NUEVO —lo que de verdad ordena—. Eso hay que ir a buscarlo al disco, así
// que la lista se pinta al instante con lo que ya se sabe (el nombre) y cada tarjeta se
// completa cuando llega su resumen, de cuatro en cuatro para no ahogar el NFS.

type Resumen = {
  piezas: number;
  bytes: number;
  ultimoMs: number;
  portadaRel: string | null;
  truncado: boolean;
};

type Orden = "reciente" | "nombre" | "tamano";

const ORDENES: { id: Orden; etiqueta: string }[] = [
  { id: "reciente", etiqueta: "Más reciente" },
  { id: "nombre", etiqueta: "Nombre" },
  { id: "tamano", etiqueta: "Tamaño" },
];

const A_LA_VEZ = 4;

function pesar(bytes: number): string {
  if (bytes <= 0) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / 1024 ** i;
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}

function fecha(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" });
}

// Quita tildes y pasa a minúsculas: buscar «filarmonica» tiene que encontrar «Filarmónica».
function plano(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function IndiceCarpetas({ folders, onAbrir }: { folders: GaleriaFolder[]; onAbrir: (rel: string) => void }) {
  const [resumenes, setResumenes] = React.useState<Record<string, Resumen>>({});
  const [orden, setOrden] = React.useState<Orden>("reciente");
  const [busca, setBusca] = React.useState("");

  // Los resúmenes se piden en tandas y el resultado se guarda por carpeta. `vivo` corta el
  // goteo si se sale de la pantalla a media carga: sin él, seguiría pidiendo carpeta a
  // carpeta contra el NAS después de que nadie mire.
  React.useEffect(() => {
    let vivo = true;
    const pendientes = folders.map((f) => f.rel);
    (async () => {
      for (let i = 0; i < pendientes.length; i += A_LA_VEZ) {
        if (!vivo) return;
        const tanda = pendientes.slice(i, i + A_LA_VEZ);
        const hechos = await Promise.all(
          tanda.map(async (rel) => {
            try {
              const res = await fetch(`/api/galeria/resumen?rel=${encodeURIComponent(rel)}`, { cache: "no-store" });
              if (!res.ok) return null;
              return { rel, datos: (await res.json()) as Resumen };
            } catch {
              return null; // una carpeta ilegible no puede tumbar el índice entero
            }
          }),
        );
        if (!vivo) return;
        setResumenes((prev) => {
          const siguiente = { ...prev };
          for (const h of hechos) if (h) siguiente[h.rel] = h.datos;
          return siguiente;
        });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [folders]);

  const visibles = React.useMemo(() => {
    const q = plano(busca.trim());
    const lista = q ? folders.filter((f) => plano(f.name).includes(q)) : folders.slice();
    lista.sort((a, b) => {
      const ra = resumenes[a.rel];
      const rb = resumenes[b.rel];
      if (orden === "nombre") return a.name.localeCompare(b.name, "es");
      if (orden === "tamano") return (rb?.bytes ?? 0) - (ra?.bytes ?? 0);
      // Por reciente: manda la fecha del material. Mientras un resumen no ha llegado se usa
      // la de la carpeta, que es lo único que hay, y la tarjeta se recoloca sola al llegar.
      return (rb?.ultimoMs || b.mtimeMs) - (ra?.ultimoMs || a.mtimeMs);
    });
    return lista;
  }, [folders, resumenes, orden, busca]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar entrega…"
            className="w-full rounded-lg border bg-background py-1.5 pl-8 pr-2.5 text-sm outline-none transition focus:border-primary/60"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          <SortAsc className="ml-1.5 size-3.5 text-muted-foreground" />
          {ORDENES.map((o) => (
            <button
              key={o.id}
              onClick={() => setOrden(o.id)}
              className={`rounded-md px-2 py-1 text-xs transition ${
                orden === o.id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {visibles.length === folders.length
            ? `${folders.length} entregas`
            : `${visibles.length} de ${folders.length}`}
        </span>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Ninguna entrega se llama así.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((f) => {
            const r = resumenes[f.rel];
            return (
              <button
                key={f.rel}
                onClick={() => onAbrir(f.rel)}
                className="group overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary/50 hover:bg-accent"
              >
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                  {r?.portadaRel ? (
                    // La miniatura la sirve nuestra propia ruta leyendo del NAS: el
                    // optimizador de next/image no puede con ella, así que va <img> pelado.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/galeria/thumb?rel=${encodeURIComponent(r.portadaRel)}&v=${r.ultimoMs}`}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      {r ? (
                        <ImageIcon className="size-7 text-muted-foreground/40" />
                      ) : (
                        <div className="size-full animate-pulse bg-muted-foreground/10" />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2.5 p-3">
                  <Folder className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{f.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r ? (
                        <>
                          {r.piezas > 0
                            ? `${r.truncado ? "+" : ""}${r.piezas.toLocaleString("es-CO")} ${r.piezas === 1 ? "pieza" : "piezas"}`
                            : "vacía"}
                          {r.bytes > 0 && ` · ${pesar(r.bytes)}`}
                          {r.ultimoMs > 0 && ` · ${fecha(r.ultimoMs)}`}
                        </>
                      ) : (
                        "leyendo…"
                      )}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
