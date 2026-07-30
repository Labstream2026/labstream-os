"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Copy, Download, Film, Image as ImageIcon, Link2, Loader2, RefreshCw, ShieldOff, X } from "lucide-react";
import { crearEnlaceEntrega, revocarEnlaceEntrega } from "./acciones";
import { IndiceCarpetas, type DuenoIndice } from "./indice-carpetas";
import { BarraSeleccion } from "./seleccion";
import { TIRA_FOTOGRAMAS } from "@/lib/galeria-tira";
import type { GaleriaFolder, GaleriaItem, GaleriaKind, GaleriaScan } from "@/lib/nas-galeria";

// Galería de entregas: la línea de tiempo del material que hay en LabTem.
// Todo se lee EN VIVO por /api/galeria/*; aquí no hay estado que se pueda desincronizar.
//
// NAVEGACIÓN: una sola fuente de verdad, la URL (?rel=). Este componente recibe `rel` del
// servidor y navega con router.push; la barra de herramientas de arriba hace lo mismo. La
// versión anterior guardaba su PROPIA copia de la carpeta en useState y navegaba con
// replaceState: la barra y la cuadrícula podían quedar cada una en una carpeta distinta
// (los chips cambiaban la URL pero la cuadrícula ni se enteraba, y al revés).
//
// ESTADO POR CARPETA: lo cargado, el fallo, la selección y el visor se guardan CON la
// carpeta a la que pertenecen y se descartan al comparar con la actual. Así una respuesta
// lenta de la carpeta anterior no puede pintar la equivocada, y volver atrás con el
// navegador no arrastra la selección ni reabre el visor de otra entrega.

type Respuesta =
  | { ok: true; ready: false; motivo: string; mensaje: string }
  | { ok: true; ready: true; rel: ""; folders: GaleriaFolder[] }
  | { ok: true; ready: true; rel: string; scan: GaleriaScan };

function pesar(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / 1024 ** i;
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}

// «1 elemento», no «1 elementos». Detalle pequeño, pero es lo que separa una pantalla
// cuidada de una que parece a medio hacer.
function plural(n: number, uno: string, varios: string): string {
  return `${n.toLocaleString("es-CO")} ${n === 1 ? uno : varios}`;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function titularDia(iso: string): string {
  // iso viene como YYYY-MM-DD; se parte a mano para no depender de la zona horaria del navegador.
  const [y, m, d] = iso.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  return `${DIAS[fecha.getDay()]} ${d}`;
}

async function pedir(rel: string): Promise<Respuesta> {
  const res = await fetch(`/api/galeria/list?rel=${encodeURIComponent(rel)}`, { cache: "no-store" });
  if (!res.ok) throw new Error((await res.text()) || "No se pudo leer la carpeta");
  return (await res.json()) as Respuesta;
}

type Filtro = "todo" | GaleriaKind;

export function GaleriaCliente({
  rel,
  puedeEscribir,
  duenos,
}: {
  rel: string;
  puedeEscribir: boolean;
  duenos: Record<string, DuenoIndice>;
}) {
  const router = useRouter();
  const [cargado, setCargado] = React.useState<{ rel: string; datos: Respuesta } | null>(null);
  const [fallo, setFallo] = React.useState<{ rel: string; msg: string } | null>(null);
  const [refrescando, setRefrescando] = React.useState(false);
  const [vuelta, setVuelta] = React.useState(0); // subirlo = volver a pedir
  const [seleccion, setSeleccion] = React.useState<{ rel: string; rels: string[] }>({ rel: "", rels: [] });
  const [abierto, setAbierto] = React.useState<{ rel: string; item: GaleriaItem } | null>(null);
  const [filtro, setFiltro] = React.useState<Filtro>("todo");
  // Ancla del Shift: la última pieza marcada a mano. Sin ella, «marcar el rango» no tiene
  // desde dónde contar.
  const anclaRef = React.useRef<string | null>(null);

  // Todo lo guardado se valida contra la carpeta ACTUAL; lo de otra carpeta no existe aquí.
  const datos = cargado?.rel === rel ? cargado.datos : null;
  const error = fallo?.rel === rel ? fallo.msg : null;
  const cargando = !datos && !error;

  React.useEffect(() => {
    let cancelado = false;
    pedir(rel)
      .then((d) => {
        if (cancelado) return;
        setCargado({ rel, datos: d });
        setFallo(null);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setFallo({ rel, msg: e instanceof Error ? e.message : "No se pudo leer la carpeta" });
        setCargado((c) => (c?.rel === rel ? null : c));
      })
      .finally(() => {
        if (!cancelado) setRefrescando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [rel, vuelta]);

  // Navegar = cambiar la URL. El servidor re-renderiza la página entera (barra incluida) y
  // este componente recibe el `rel` nuevo: imposible que las dos mitades discrepen.
  const abrirCarpeta = (r: string) => {
    setAbierto(null);
    router.push(r ? `/galeria?rel=${encodeURIComponent(r)}` : "/galeria");
  };
  const recargar = () => {
    setRefrescando(true);
    setVuelta((n) => n + 1);
  };

  const scan = datos && datos.ready && "scan" in datos ? datos.scan : null;

  // La vista filtrada (solo fotos / solo videos) se deriva del escaneo: meses y días se
  // recortan y los que quedan vacíos desaparecen. El visor y el Shift trabajan sobre lo
  // VISIBLE, que es lo que cualquiera espera: «siguiente» va a la siguiente que se ve.
  const scanVisible = React.useMemo(() => {
    if (!scan || filtro === "todo") return scan;
    const months = scan.months
      .map((m) => {
        const days = m.days
          .map((d) => ({ ...d, items: d.items.filter((i) => i.kind === filtro) }))
          .filter((d) => d.items.length > 0);
        return { ...m, days, count: days.reduce((n, d) => n + d.items.length, 0) };
      })
      .filter((m) => m.days.length > 0);
    return { ...scan, months };
  }, [scan, filtro]);

  const piezas = React.useMemo(() => {
    if (!scan) return [];
    return scan.months.flatMap((m) => m.days.flatMap((d) => d.items));
  }, [scan]);

  const piezasVisibles = React.useMemo(() => {
    if (!scanVisible) return [];
    return scanVisible.months.flatMap((m) => m.days.flatMap((d) => d.items));
  }, [scanVisible]);

  // Selección de ESTA carpeta (la de otra no cuenta ni se arrastra). En useMemo para que
  // el `[]` del caso vacío sea estable y no invalide los memos que cuelgan de él.
  const rels = React.useMemo(() => (seleccion.rel === rel ? seleccion.rels : []), [seleccion, rel]);
  // Conjunto, no array: la cuadrícula pregunta «¿está marcada?» una vez por pieza, y con
  // 20.000 piezas un `includes` por cada una es cuadrático.
  const marcadas = React.useMemo(() => new Set(rels), [rels]);

  // El peso de lo seleccionado se suma de las piezas reales (para la barra de abajo).
  const pesoSeleccion = React.useMemo(() => {
    if (rels.length === 0) return 0;
    const porRel = new Map(piezas.map((p) => [p.rel, p.size]));
    return rels.reduce((n, r) => n + (porRel.get(r) ?? 0), 0);
  }, [rels, piezas]);

  const marcar = (r: string, rango: boolean) => {
    // Shift: se marca todo el tramo entre el ancla y esta pieza, en el orden en que se ven.
    if (rango && anclaRef.current) {
      const orden = piezasVisibles.map((p) => p.rel);
      const a = orden.indexOf(anclaRef.current);
      const b = orden.indexOf(r);
      if (a >= 0 && b >= 0) {
        const [i, j] = a < b ? [a, b] : [b, a];
        setSeleccion({ rel, rels: Array.from(new Set([...rels, ...orden.slice(i, j + 1)])) });
        return;
      }
    }
    anclaRef.current = r;
    setSeleccion({ rel, rels: rels.includes(r) ? rels.filter((x) => x !== r) : [...rels, r] });
  };

  // Marca o desmarca un día entero. También es la puerta de entrada a la selección en
  // táctil, donde no hay hover para descubrir la casilla ni Ctrl para empezar.
  const marcarDia = (items: GaleriaItem[]) => {
    const delDia = items.map((i) => i.rel);
    const todos = delDia.every((d) => marcadas.has(d));
    setSeleccion({
      rel,
      rels: todos ? rels.filter((x) => !delDia.includes(x)) : Array.from(new Set([...rels, ...delDia])),
    });
    if (!todos && delDia.length > 0) anclaRef.current = delDia[delDia.length - 1]!;
  };

  const limpiarSeleccion = () => {
    setSeleccion({ rel, rels: [] });
    anclaRef.current = null;
  };

  // El visor solo vive si su pieza sigue en la carpeta actual: si se borró (o se volvió con
  // el navegador a otra entrega), se cierra solo en vez de quedarse enseñando un 404.
  const abiertoReal = abierto && abierto.rel === rel && piezas.some((p) => p.rel === abierto.item.rel) ? abierto.item : null;

  // Escape quita la selección — solo cuando el visor no está abierto (su propio Escape lo
  // cierra a él primero; dos Escapes = cerrar visor y luego limpiar, como en el Finder).
  React.useEffect(() => {
    if (rels.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !abiertoReal) limpiarSeleccion();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- limpiarSeleccion cambia en cada render
  }, [rels.length, abiertoReal, rel]);

  if (cargando) {
    return rel ? <EsqueletoCuadricula /> : (
      <div>
        <Cabecera titulo="Galería de entregas" sub="El material que vive en LabTem, listo para entregar." />
        <EsqueletoIndice />
      </div>
    );
  }

  if (error) {
    return <Aviso titulo="No se pudo leer la carpeta" texto={error} onReintentar={recargar} />;
  }

  if (datos && !datos.ready) {
    return <Aviso titulo="La galería no está disponible" texto={datos.mensaje} onReintentar={recargar} />;
  }

  // ── Carpetas de entrega ──────────────────────────────────────────────────────
  if (datos && datos.ready && "folders" in datos) {
    return (
      <div>
        <Cabecera titulo="Galería de entregas" sub="El material que vive en LabTem, listo para entregar." />
        {datos.folders.length === 0 ? (
          <Aviso
            titulo="Todavía no hay nada"
            texto="Copia el material dentro de la carpeta compartida Entregas_LAB del NAS y aparecerá aquí, sin tener que importar nada."
            onReintentar={recargar}
          />
        ) : (
          <IndiceCarpetas folders={datos.folders} duenos={duenos} onAbrir={abrirCarpeta} />
        )}
      </div>
    );
  }

  // ── Línea de tiempo de una entrega ───────────────────────────────────────────
  if (!scan || !scanVisible) return null;

  return (
    <div>
      <div className="mb-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">{(rel.split("/").pop() ?? "").replace(/_/g, " ")}</h1>
            <p className="text-xs text-muted-foreground">
              {plural(scan.total, "elemento", "elementos")} · {plural(scan.photos, "foto", "fotos")} ·{" "}
              {plural(scan.videos, "video", "videos")} · {pesar(scan.bytes)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* key: al cambiar de entrega el componente se remonta y el enlace de la anterior
                desaparece solo. Enseñar el enlace de otra carpeta sería el peor error aquí. */}
            <Compartir key={rel} rel={rel} />
            <button
              onClick={recargar}
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-accent"
              title="Volver a leer la carpeta"
            >
              <RefreshCw className={`size-4 ${refrescando ? "animate-spin" : ""}`} /> Actualizar
            </button>
          </div>
        </div>

        {/* Filtro por tipo: solo aparece cuando la entrega MEZCLA fotos y videos (si es todo
            del mismo tipo, unos chips que no filtran nada son ruido). */}
        {scan.photos > 0 && scan.videos > 0 && (
          <div className="mt-3 flex items-center gap-1">
            {(
              [
                { id: "todo", etiqueta: "Todo", n: scan.total },
                { id: "photo", etiqueta: "Fotos", n: scan.photos },
                { id: "video", etiqueta: "Videos", n: scan.videos },
              ] as { id: Filtro; etiqueta: string; n: number }[]
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  filtro === f.id
                    ? "border-primary/40 bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {f.etiqueta} · {f.n.toLocaleString("es-CO")}
              </button>
            ))}
          </div>
        )}
      </div>

      {scan.truncated && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          La carpeta tiene más piezas de las que se muestran. Conviene partirla en subcarpetas por jornada.
        </p>
      )}

      {scan.total === 0 ? (
        <Aviso
          titulo="Esta entrega está vacía"
          texto="No hay fotos ni videos dentro. Si acabas de copiarlos, pulsa Actualizar."
          onReintentar={recargar}
        />
      ) : (
        scanVisible.months.map((mes) => (
          <section key={mes.month} className="mb-8">
            <h2 className="sticky top-0 z-10 -mx-1 bg-background/90 px-1 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary backdrop-blur">
              {mes.label} <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground">· {mes.count}</span>
            </h2>
            {mes.days.map((dia) => {
              const todosDia = dia.items.every((i) => marcadas.has(i.rel));
              return (
                <div key={dia.date} className="group/dia mt-4">
                  <div className="mb-2 flex items-baseline gap-2">
                    <h3 className="text-sm font-semibold capitalize">{titularDia(dia.date)}</h3>
                    <span className="text-xs text-muted-foreground">{plural(dia.items.length, "elemento", "elementos")}</span>
                    {dia.items.every((i) => !i.exact) && (
                      <span className="text-[11px] text-muted-foreground/70" title="Ninguna pieza traía fecha de disparo; se usa la del archivo">
                        fecha aproximada
                      </span>
                    )}
                    <button
                      onClick={() => marcarDia(dia.items)}
                      className={`ml-auto text-[11px] transition hover:text-primary focus:opacity-100 ${
                        rels.length > 0 ? "opacity-100" : "opacity-0 group-hover/dia:opacity-100"
                      } ${todosDia && rels.length > 0 ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {todosDia && rels.length > 0 ? "Quitar el día" : "Seleccionar el día"}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 sm:grid-cols-5 lg:grid-cols-8">
                    {dia.items.map((it) => (
                      <Ficha
                        key={it.rel}
                        item={it}
                        onAbrir={() => setAbierto({ rel, item: it })}
                        marcada={marcadas.has(it.rel)}
                        haySeleccion={rels.length > 0}
                        onMarcar={(rango) => marcar(it.rel, rango)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        ))
      )}

      <BarraSeleccion
        seleccion={rels}
        peso={rels.length > 0 && pesoSeleccion > 0 ? pesar(pesoSeleccion) : null}
        onLimpiar={limpiarSeleccion}
        onHecho={recargar}
        puedeEscribir={puedeEscribir}
      />

      {abiertoReal && (
        <Visor
          item={abiertoReal}
          piezas={piezasVisibles}
          onCerrar={() => setAbierto(null)}
          onCambiar={(x) => setAbierto({ rel, item: x })}
        />
      )}
    </div>
  );
}

// ── Compartir con el cliente ───────────────────────────────────────────────────

function Compartir({ rel }: { rel: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [copiado, setCopiado] = React.useState(false);
  const [ocupado, setOcupado] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [retirada, setRetirada] = React.useState(false);

  const generar = async () => {
    setOcupado(true);
    setError(null);
    const r = await crearEnlaceEntrega(rel);
    setOcupado(false);
    if ("error" in r) setError(r.error);
    else {
      setUrl(`${window.location.origin}${r.url}`);
      setRetirada(false);
    }
  };

  const retirar = async () => {
    setOcupado(true);
    setError(null);
    const r = await revocarEnlaceEntrega(rel);
    setOcupado(false);
    if ("error" in r) setError(r.error);
    else {
      setRetirada(true);
      setUrl(null);
    }
  };

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setError("El navegador no dejó copiar; selecciona el enlace a mano.");
    }
  };

  return (
    <div className="relative">
      {url ? (
        <div className="flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1.5">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-44 bg-transparent text-xs text-muted-foreground outline-none sm:w-64"
          />
          <button onClick={copiar} className="rounded-md p-1 transition hover:bg-accent" title="Copiar enlace">
            {copiado ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
          </button>
          <button onClick={retirar} disabled={ocupado} className="rounded-md p-1 transition hover:bg-accent" title="Retirar el acceso ya">
            <ShieldOff className="size-4 text-destructive" />
          </button>
        </div>
      ) : (
        <button
          onClick={generar}
          disabled={ocupado}
          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition hover:bg-accent disabled:opacity-50"
          title="Genera un enlace para que el cliente vea esta entrega sin cuenta"
        >
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
          {retirada ? "Acceso retirado · volver a compartir" : "Compartir con el cliente"}
        </button>
      )}
      {error && <p className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Ficha de la cuadrícula ─────────────────────────────────────────────────────

function Ficha({
  item,
  onAbrir,
  marcada,
  haySeleccion,
  onMarcar,
}: {
  item: GaleriaItem;
  onAbrir: () => void;
  marcada: boolean;
  haySeleccion: boolean;
  onMarcar: (rango: boolean) => void;
}) {
  const [sinMiniatura, setSinMiniatura] = React.useState(false);
  const src = `/api/galeria/thumb?rel=${encodeURIComponent(item.rel)}&v=${encodeURIComponent(item.takenAt)}`;

  // ── Barrido del video con el ratón ──
  // La tira (20 fotogramas en una fila) la fabrica LabTem junto al póster. Se pide SOLO al
  // entrar el ratón: pedirla para las 300 piezas de una entrega al pintar movería megas que
  // casi nadie va a mirar. `fotograma === null` = no se está barriendo (se ve el póster).
  const esVideo = item.kind === "video";
  const [tira, setTira] = React.useState<"no" | "cargando" | "lista" | "sin">("no");
  const [fotograma, setFotograma] = React.useState<number | null>(null);
  const tiraSrc = `/api/galeria/tira?rel=${encodeURIComponent(item.rel)}&v=${encodeURIComponent(item.takenAt)}`;

  const entrar = () => {
    if (!esVideo || sinMiniatura || tira !== "no") return;
    setTira("cargando");
    const img = new Image();
    img.onload = () => setTira("lista");
    // Sin tira (clip muy corto, o LabTem no la ha hecho): se queda el póster y no se reintenta.
    img.onerror = () => setTira("sin");
    img.src = tiraSrc;
  };

  const barrer = (e: React.MouseEvent<HTMLElement>) => {
    if (tira !== "lista") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / (r.width || 1);
    setFotograma(Math.min(TIRA_FOTOGRAMAS - 1, Math.max(0, Math.floor(x * TIRA_FOTOGRAMAS))));
  };

  return (
    <button
      onClick={(e) => {
        // Con algo ya marcado, el clic suelto sigue marcando: es lo que espera cualquiera
        // que venga del Finder o del Explorador. Ctrl/Cmd marca, Shift extiende el rango.
        if (haySeleccion || e.ctrlKey || e.metaKey || e.shiftKey) {
          e.preventDefault();
          onMarcar(e.shiftKey);
          return;
        }
        onAbrir();
      }}
      onMouseEnter={entrar}
      onMouseMove={barrer}
      onMouseLeave={() => setFotograma(null)}
      className={`group relative aspect-square overflow-hidden rounded-md bg-muted transition focus:outline-none focus:ring-2 focus:ring-primary ${
        marcada ? "ring-2 ring-primary" : ""
      }`}
      title={item.name}
    >
      {/* La casilla aparece al pasar por encima, y se queda fija en lo ya marcado. */}
      <span
        role="checkbox"
        aria-checked={marcada}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onMarcar(e.shiftKey);
        }}
        className={`absolute left-1 top-1 z-10 grid size-4 place-items-center rounded border transition ${
          marcada
            ? "border-primary bg-primary text-primary-foreground opacity-100"
            : "border-white/70 bg-black/40 opacity-0 group-hover:opacity-100"
        }`}
      >
        {marcada && <Check className="size-3" />}
      </span>
      {sinMiniatura ? (
        // Ni copia ligera ni póster todavía: se dice la verdad en vez de mostrar algo roto.
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
          {item.kind === "video" ? <Film className="size-4 text-muted-foreground" /> : <ImageIcon className="size-4 text-muted-foreground" />}
          <span className="line-clamp-2 text-[9px] leading-tight text-muted-foreground">{item.name}</span>
          <span className="text-[9px] text-muted-foreground/70">preparando</span>
        </span>
      ) : (
        <>
          <img
            src={src}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={() => setSinMiniatura(true)}
          />
          {/* La tira, encima del póster mientras se barre. Se pinta con background-position:
              20 fotogramas = 2000 % de ancho, y cada paso desplaza un ancho completo. */}
          {fotograma !== null && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-no-repeat"
              style={{
                backgroundImage: `url(${tiraSrc})`,
                backgroundSize: `${TIRA_FOTOGRAMAS * 100}% 100%`,
                backgroundPositionX: `-${fotograma * 100}%`,
              }}
            />
          )}
          {/* Dónde estás dentro del clip: sin esto el barrido desorienta. */}
          {fotograma !== null && (
            <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/25">
              <span className="block h-full bg-primary" style={{ width: `${((fotograma + 1) / TIRA_FOTOGRAMAS) * 100}%` }} />
            </span>
          )}
          {/* Al pasar por encima: nombre y peso, sin esperar al tooltip del sistema. */}
          <span className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-1.5 pt-5 text-left transition ${fotograma !== null ? "opacity-0" : "opacity-0 group-hover:opacity-100"}`}>
            <span className="block truncate text-[10px] font-medium leading-tight text-white">{item.name}</span>
            <span className="block text-[9px] text-white/70">{pesar(item.size)}</span>
          </span>
        </>
      )}
      {item.kind === "video" && !sinMiniatura && (
        <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-black/55">
          <span className="ml-[1px] border-y-[3px] border-l-[5px] border-y-transparent border-l-white" />
        </span>
      )}
    </button>
  );
}

// ── Visor ──────────────────────────────────────────────────────────────────────

function Visor({
  item,
  piezas,
  onCerrar,
  onCambiar,
}: {
  item: GaleriaItem;
  piezas: GaleriaItem[];
  onCerrar: () => void;
  onCambiar: (x: GaleriaItem) => void;
}) {
  const i = piezas.findIndex((p) => p.rel === item.rel);
  const mover = React.useCallback(
    (paso: number) => {
      const j = i + paso;
      if (j >= 0 && j < piezas.length) onCambiar(piezas[j]);
    },
    [i, piezas, onCambiar],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      else if (e.key === "ArrowRight") mover(1);
      else if (e.key === "ArrowLeft") mover(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar, mover]);

  // Se reproduce/mira la COPIA LIGERA (?copia=1). Si LabTem no la ha hecho todavía, la ruta
  // cae sola al original: el cliente ve algo igual, solo que pesa más.
  const ver = `/api/galeria/media?rel=${encodeURIComponent(item.rel)}&copia=1`;
  const bajar = `/api/galeria/media?rel=${encodeURIComponent(item.rel)}&descargar=1`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal="true">
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
        <span className="hidden text-xs text-white/60 sm:block">
          {new Date(item.takenAt).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}
          {!item.exact && " (fecha del archivo)"}
        </span>
        <span className="text-xs text-white/60">{pesar(item.size)}</span>
        <a
          href={bajar}
          className="flex items-center gap-1.5 rounded-lg border border-white/25 px-2.5 py-1.5 text-xs text-white transition hover:bg-white/10"
        >
          <Download className="size-3.5" /> Original
        </a>
        <button onClick={onCerrar} className="rounded-lg p-1.5 text-white transition hover:bg-white/10" aria-label="Cerrar">
          <X className="size-5" />
        </button>
      </div>

      {/* Clic en el fondo negro = cerrar (clic en la foto/video no, que ahí se pausa). */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCerrar();
        }}
      >
        {i > 0 && (
          <button
            onClick={() => mover(-1)}
            aria-label="Anterior"
            className="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/25 sm:grid"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}
        {item.kind === "video" ? (
          <video key={item.rel} src={ver} controls autoPlay playsInline className="max-h-full max-w-full" />
        ) : (
          <img key={item.rel} src={ver} alt={item.name} className="max-h-full max-w-full object-contain" />
        )}
        {i < piezas.length - 1 && (
          <button
            onClick={() => mover(1)}
            aria-label="Siguiente"
            className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/25 sm:grid"
          >
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 pb-4 text-sm text-white/70">
        <button onClick={() => mover(-1)} disabled={i <= 0} className="disabled:opacity-30 sm:hidden">
          ← Anterior
        </button>
        <span className="tabular-nums text-xs">
          {i + 1} de {piezas.length}
        </span>
        <button onClick={() => mover(1)} disabled={i >= piezas.length - 1} className="disabled:opacity-30 sm:hidden">
          Siguiente →
        </button>
      </div>
    </div>
  );
}

// ── Piezas pequeñas ────────────────────────────────────────────────────────────

function Cabecera({ titulo, sub }: { titulo: string; sub: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

function Aviso({ titulo, texto, onReintentar }: { titulo: string; texto: string; onReintentar: () => void }) {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-3 text-center">
      <ImageIcon className="size-9 text-muted-foreground" />
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <p className="text-sm text-muted-foreground">{texto}</p>
      <button onClick={onReintentar} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition hover:bg-accent">
        <RefreshCw className="size-4" /> Reintentar
      </button>
    </div>
  );
}

// ── Esqueletos de carga ────────────────────────────────────────────────────────
// Un esqueleto con la forma del contenido dice «esto viene ya»; el spinner centrado de
// antes decía «espera», que se siente el doble de largo.

function EsqueletoIndice() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border bg-card">
          <div className="aspect-[16/9] animate-pulse bg-muted" />
          <div className="space-y-2 p-3">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EsqueletoCuadricula() {
  return (
    <div>
      <div className="mb-1 h-6 w-56 animate-pulse rounded bg-muted" />
      <div className="mb-5 h-3.5 w-72 animate-pulse rounded bg-muted" />
      <div className="mb-2 h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-5 lg:grid-cols-8">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    </div>
  );
}
