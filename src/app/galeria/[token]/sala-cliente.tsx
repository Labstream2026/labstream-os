"use client";

import * as React from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Download, Film, Image as ImageIcon, Loader2, RefreshCw, X } from "lucide-react";
import type { GaleriaItem, GaleriaScan } from "@/lib/nas-galeria";
import { formatBogota } from "@/lib/bogota-time";
import { Logo } from "@/components/brand/logo";

// La sala del cliente: la misma línea de tiempo que ve el equipo (mes → día → cuadrícula), pero
// sin selector de carpetas —el cliente solo tiene la suya— y con lo que a él sí le importa:
// hasta cuándo puede descargar y qué pesa cada cosa.
//
// Todo se lee EN VIVO por /api/galeria-publica/*; el token viaja en la consulta y es el servidor
// quien decide qué carpeta es. El `rel` de una pieza solo sirve para señalar dentro de esa
// carpeta: si alguien lo manipula, la API lo rechaza. Aquí no hay estado que desincronizar.

// ── Contrato con la API pública ────────────────────────────────────────────────
// Un único sitio donde se arman las URLs: si mañana cambia el nombre de un parámetro, se cambia
// aquí y no en seis plantillas repartidas por el archivo. El token viaja como `t` (así lo leen
// las tres rutas de /api/galeria-publica).
function api(ruta: "list" | "thumb" | "media", token: string, params: Record<string, string> = {}): string {
  return `/api/galeria-publica/${ruta}?${new URLSearchParams({ t: token, ...params }).toString()}`;
}

type Respuesta =
  | { ok: true; ready: false; motivo: string; mensaje: string }
  | { ok: true; ready: true; rel: string; titulo?: string; scan: GaleriaScan }
  | { ok: false; motivo: string; mensaje: string };

function pesar(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / 1024 ** i;
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}

// «1 elemento», no «1 elementos». Detalle pequeño, pero es lo que separa una pantalla cuidada
// de una que parece a medio hacer — y esta la abre un cliente, no el equipo.
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

async function pedir(token: string): Promise<Respuesta> {
  const res = await fetch(api("list", token), { cache: "no-store" });
  // El enlace pudo caducar o revocarse mientras la pestaña estaba abierta: eso no es un error de
  // red, es un «ya no». Se traduce a un aviso amable en vez de a «reintentar» eternamente.
  if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
    return { ok: false, motivo: "sin_acceso", mensaje: "Este enlace dejó de estar disponible. Pídele uno nuevo a tu contacto en Labstream." };
  }
  // La API frena las recargas para no poner de rodillas al NAS: si el cliente insiste, se le
  // dice que espere, no que algo se rompió.
  if (res.status === 429) throw new Error("Estás recargando muy seguido. Espera un minuto y vuelve a intentarlo.");
  if (!res.ok) throw new Error("No pudimos cargar tu galería en este momento. Inténtalo otra vez en un rato.");
  return (await res.json()) as Respuesta;
}

export function SalaCliente({
  token,
  titulo,
  vence,
  venceCorto,
}: {
  token: string;
  titulo: string;
  vence: string | null;
  venceCorto: string | null;
}) {
  const [datos, setDatos] = React.useState<Respuesta | null>(null);
  const [cargando, setCargando] = React.useState(true);
  const [fallo, setFallo] = React.useState<string | null>(null);
  const [abierto, setAbierto] = React.useState<GaleriaItem | null>(null);
  const [vuelta, setVuelta] = React.useState(0); // subirlo = volver a pedir

  React.useEffect(() => {
    let cancelado = false;
    pedir(token)
      .then((d) => {
        if (cancelado) return;
        setDatos(d);
        setFallo(null);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setDatos(null);
        setFallo(e instanceof Error ? e.message : "No pudimos cargar tu galería. Revisa tu conexión e inténtalo otra vez.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [token, vuelta]);

  const recargar = () => {
    setCargando(true);
    setAbierto(null);
    setVuelta((n) => n + 1);
  };

  // Lista plana de todas las piezas: es lo que recorren las flechas del visor, que van de un día
  // al siguiente sin que el cliente tenga que cerrar y volver a abrir.
  const piezas = React.useMemo(() => {
    if (!datos || !datos.ok || !datos.ready) return [];
    return datos.scan.months.flatMap((m) => m.days.flatMap((d) => d.items));
  }, [datos]);

  const scan = datos && datos.ok && datos.ready ? datos.scan : null;

  return (
    <>
      <Cabecera titulo={titulo} vence={vence} venceCorto={venceCorto} scan={scan} />

      <main className="relative mx-auto w-full max-w-6xl px-3 py-5 sm:px-6">
        {cargando && !datos ? (
          <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Preparando tu galería…
          </div>
        ) : fallo ? (
          <Aviso titulo="No pudimos cargar tu galería" texto={fallo} onReintentar={recargar} />
        ) : datos && !datos.ok ? (
          // Sin botón de reintentar: aquí no hay nada que reintentar, el enlace ya no sirve.
          <Aviso titulo="Este enlace ya no está disponible" texto={datos.mensaje} />
        ) : datos && datos.ok && !datos.ready ? (
          // El mensaje lo escribe la API (habla de «tu galería», nunca del NAS ni del montaje):
          // se muestra tal cual para no tener dos versiones de la misma frase.
          <Aviso
            titulo="Tu galería no está disponible en este momento"
            texto={datos.mensaje || "Vuelve a intentarlo en unos minutos; si sigue igual, avísale a tu contacto."}
            onReintentar={recargar}
          />
        ) : scan ? (
          <Contenido scan={scan} token={token} onAbrir={setAbierto} onRecargar={recargar} cargando={cargando} />
        ) : null}
      </main>

      {abierto && (
        // `key` por pieza a propósito: al pasar a la siguiente el visor se monta de nuevo y su
        // estado (¿hay copia ligera?, ¿el navegador pudo pintarla?) arranca limpio, sin tener
        // que acordarse de resetear nada a mano.
        <Visor key={abierto.rel} token={token} item={abierto} piezas={piezas} onCerrar={() => setAbierto(null)} onCambiar={(x) => setAbierto(x)} />
      )}
    </>
  );
}

// ── Cabecera ───────────────────────────────────────────────────────────────────

function Cabecera({
  titulo,
  vence,
  venceCorto,
  scan,
}: {
  titulo: string;
  vence: string | null;
  venceCorto: string | null;
  scan: GaleriaScan | null;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-white/[0.04] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-3 sm:px-6 sm:py-3.5">
        <Logo className="hidden h-6 shrink-0 sm:block" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{titulo}</p>
          <p className="truncate text-xs text-muted-foreground">
            {scan
              ? `${plural(scan.photos, "foto", "fotos")} · ${plural(scan.videos, "video", "videos")} · ${pesar(scan.bytes)}`
              : "Tu material, listo para ver y descargar"}
          </p>
        </div>
        {vence && (
          // Lo primero que pregunta todo cliente: «¿hasta cuándo puedo bajarlo?». Que no tenga
          // que preguntarlo. En el teléfono va en corto para no comerse el título de la entrega.
          <span
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary"
            title={`El enlace deja de funcionar después del ${vence}`}
          >
            <CalendarClock className="size-3.5" />
            <span className="hidden sm:inline">Disponible hasta el {vence}</span>
            <span className="sm:hidden">hasta {venceCorto ?? vence}</span>
          </span>
        )}
      </div>
    </header>
  );
}

// ── Línea de tiempo ────────────────────────────────────────────────────────────

function Contenido({
  scan,
  token,
  onAbrir,
  onRecargar,
  cargando,
}: {
  scan: GaleriaScan;
  token: string;
  onAbrir: (i: GaleriaItem) => void;
  onRecargar: () => void;
  cargando: boolean;
}) {
  if (scan.total === 0) {
    return (
      <Aviso
        titulo="Tu galería todavía está vacía"
        texto="El equipo está subiendo el material. En cuanto esté, aparecerá aquí sin que tengas que hacer nada."
        onReintentar={onRecargar}
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Toca cualquier pieza para verla en grande y descargarla. {plural(scan.total, "elemento", "elementos")} en total.
        </p>
        <button
          onClick={onRecargar}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs text-muted-foreground transition hover:bg-white/10"
        >
          <RefreshCw className={`size-3.5 ${cargando ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      {scan.truncated && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Esta entrega es tan grande que no cabe entera en pantalla. Escríbele a tu contacto para que te la separe por jornadas.
        </p>
      )}

      {scan.months.map((mes) => (
        <section key={mes.month} className="mb-8">
          {/* El mes se pega JUSTO debajo de la cabecera (61 px en móvil, 65 en escritorio): así
              se sabe siempre qué se está mirando sin que nada quede tapado. */}
          <h2 className="sticky top-[61px] z-10 -mx-1 bg-background/90 px-1 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary backdrop-blur sm:top-[65px]">
            {mes.label} <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground">· {mes.count}</span>
          </h2>
          {mes.days.map((dia) => (
            <div key={dia.date} className="mt-4">
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-sm font-semibold capitalize">{titularDia(dia.date)}</h3>
                <span className="text-xs text-muted-foreground">{plural(dia.items.length, "elemento", "elementos")}</span>
              </div>
              {/* 3 columnas en el teléfono: el enlace llega por WhatsApp, así que la primera
                  visita casi siempre es móvil y la miniatura tiene que poder tocarse. */}
              <div className="grid grid-cols-3 gap-1 sm:grid-cols-5 lg:grid-cols-8">
                {dia.items.map((it) => (
                  <Ficha key={it.rel} token={token} item={it} onAbrir={() => onAbrir(it)} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

// ── Ficha de la cuadrícula ─────────────────────────────────────────────────────

function Ficha({ token, item, onAbrir }: { token: string; item: GaleriaItem; onAbrir: () => void }) {
  const [sinMiniatura, setSinMiniatura] = React.useState(false);
  const src = api("thumb", token, { rel: item.rel, v: item.takenAt });

  return (
    <button
      onClick={onAbrir}
      className="group relative aspect-square overflow-hidden rounded-md bg-white/5 transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
      title={item.name}
    >
      {sinMiniatura ? (
        // Todavía no hay copia ligera ni póster: se dice la verdad («preparando») en vez de
        // enseñar una imagen rota. La pieza sigue ahí y se puede abrir y descargar.
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
          {item.kind === "video" ? <Film className="size-4 text-muted-foreground" /> : <ImageIcon className="size-4 text-muted-foreground" />}
          <span className="line-clamp-2 text-[9px] leading-tight text-muted-foreground">{item.name}</span>
          <span className="text-[9px] text-muted-foreground/70">preparando</span>
        </span>
      ) : (
        <img
          src={src}
          alt={item.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setSinMiniatura(true)}
        />
      )}
      {item.kind === "video" && !sinMiniatura && (
        <span className="absolute bottom-1 left-1 grid size-5 place-items-center rounded-full bg-black/55">
          <span className="ml-[1px] border-y-[4px] border-l-[6px] border-y-transparent border-l-white" />
        </span>
      )}
    </button>
  );
}

// ── Visor ──────────────────────────────────────────────────────────────────────

function Visor({
  token,
  item,
  piezas,
  onCerrar,
  onCambiar,
}: {
  token: string;
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

  // Con el visor abierto el fondo no debe seguir corriendo bajo el dedo.
  React.useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  // Se MIRA la copia ligera (?copia=1): pesa poco y se abre en cualquier teléfono. Si LabTem aún
  // no la fabricó, la ruta cae sola al original — se ve igual, solo que gastando más datos.
  const ver = api("media", token, { rel: item.rel, copia: "1" });
  const bajarOriginal = api("media", token, { rel: item.rel, descargar: "1" });

  const [copiaBytes, setCopiaBytes] = React.useState<number | null>(null);
  const [sinVista, setSinVista] = React.useState(false);

  // ¿Existe de verdad la copia ligera? Preguntar «¿hay copia?» a secas mentiría, porque la ruta
  // de medios cae al original cuando todavía no la hay. Así que se pide UN byte con Range y se
  // mira el tamaño TOTAL que anuncia la respuesta: si es menor que el del original, lo que hay
  // al otro lado es la copia y el botón se puede ofrecer con su peso real. Si no, no se ofrece:
  // prometer «copia ligera» y entregar 2 GB es peor que no ofrecer nada.
  React.useEffect(() => {
    const ctrl = new AbortController();
    fetch(api("media", token, { rel: item.rel, copia: "1" }), { headers: { Range: "bytes=0-0" }, signal: ctrl.signal })
      .then((r) => {
        const rango = r.headers.get("Content-Range");
        const total = rango ? Number(rango.split("/")[1]) : Number(r.headers.get("Content-Length"));
        if (Number.isFinite(total) && total > 0 && total < item.size) setCopiaBytes(total);
      })
      .catch(() => {
        /* sin respuesta: simplemente no se ofrece la copia */
      });
    return () => ctrl.abort();
  }, [token, item.rel, item.size]);

  // Nombre de archivo de la copia: «toma.mxf» → «toma (ligero).mp4». El del original lo pone el
  // servidor; este lo ponemos nosotros porque el enlace es de vista y lo fuerza el navegador.
  const nombreCopia = React.useMemo(() => {
    const base = item.name.replace(/\.[^.]+$/, "");
    const ext = (item.proxyRel.split(".").pop() || "").toLowerCase();
    return `${base} (ligero).${ext || "mp4"}`;
  }, [item.name, item.proxyRel]);

  // El deslizar solo se escucha en fotos: sobre un video se pelearía con la barra de reproducción.
  const tocado = React.useRef<{ x: number; y: number } | null>(null);
  const swipe =
    item.kind === "video"
      ? {}
      : {
          onTouchStart: (e: React.TouchEvent) => {
            tocado.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          },
          onTouchEnd: (e: React.TouchEvent) => {
            const ini = tocado.current;
            tocado.current = null;
            if (!ini) return;
            const dx = e.changedTouches[0].clientX - ini.x;
            const dy = e.changedTouches[0].clientY - ini.y;
            if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return; // fue un scroll, no un pase
            mover(dx < 0 ? 1 : -1);
          },
        };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal="true">
      {/* Arriba solo se informa. Todo lo que se toca vive abajo, donde llega el pulgar. */}
      <div className="flex items-center gap-3 px-3 py-2.5 text-white sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="truncate text-[11px] text-white/55">
            {formatBogota(item.takenAt, { dateStyle: "long", timeStyle: "short" })}
            {!item.exact && " · fecha aproximada"}
          </p>
        </div>
        <button
          onClick={onCerrar}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Cerrar"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-1" {...swipe}>
        {sinVista ? (
          // Formatos que el navegador no sabe abrir (RAW, MXF, BRAW…) mientras LabTem no fabrica
          // la copia. Se explica y se deja el original a un toque de distancia.
          <div className="max-w-sm px-6 text-center">
            {item.kind === "video" ? <Film className="mx-auto size-8 text-white/40" /> : <ImageIcon className="mx-auto size-8 text-white/40" />}
            <p className="mt-3 text-sm text-white/85">Todavía estamos preparando esta pieza para verse aquí.</p>
            <p className="mt-1 text-xs text-white/50">Puedes descargar el original ahora mismo; la vista rápida aparecerá en un rato.</p>
          </div>
        ) : item.kind === "video" ? (
          <video key={item.rel} src={ver} controls autoPlay playsInline className="max-h-full max-w-full" onError={() => setSinVista(true)} />
        ) : (
          <img key={item.rel} src={ver} alt={item.name} className="max-h-full max-w-full object-contain" onError={() => setSinVista(true)} />
        )}

        {/* Flechas laterales grandes: cómodas con ratón, y en el teléfono el pase se hace con el dedo. */}
        <button
          onClick={() => mover(-1)}
          disabled={i <= 0}
          aria-label="Anterior"
          className="absolute left-1 hidden size-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-0 sm:grid"
        >
          <ChevronLeft className="size-6" />
        </button>
        <button
          onClick={() => mover(1)}
          disabled={i >= piezas.length - 1}
          aria-label="Siguiente"
          className="absolute right-1 hidden size-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-0 sm:grid"
        >
          <ChevronRight className="size-6" />
        </button>
      </div>

      {/* Barra de acciones al alcance del pulgar, respetando la franja del iPhone. */}
      <div className="border-t border-white/10 px-3 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-4">
        <div className="mb-2.5 flex items-center justify-center gap-5 text-white/70">
          <button onClick={() => mover(-1)} disabled={i <= 0} aria-label="Anterior" className="grid size-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20 disabled:opacity-30 sm:hidden">
            <ChevronLeft className="size-5" />
          </button>
          <span className="tabular-nums text-xs">
            {i + 1} de {piezas.length}
          </span>
          <button onClick={() => mover(1)} disabled={i >= piezas.length - 1} aria-label="Siguiente" className="grid size-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20 disabled:opacity-30 sm:hidden">
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* Dos descargas separadas y sin trampa: cada botón dice qué se lleva y cuánto pesa. */}
        <div className="mx-auto flex max-w-lg flex-col gap-2 sm:flex-row sm:justify-center">
          <a
            href={bajarOriginal}
            download={item.name}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Download className="size-4" /> Descargar original
            <span className="text-xs font-normal opacity-80">{pesar(item.size)}</span>
          </a>
          {copiaBytes !== null && (
            <a
              href={ver}
              download={nombreCopia}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-medium text-white transition hover:bg-white/10"
              title="Más liviana: sirve para revisar y compartir, no para imprimir ni volver a editar"
            >
              <Download className="size-4" /> Descargar copia ligera
              <span className="text-xs font-normal text-white/60">{pesar(copiaBytes)}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Piezas pequeñas ────────────────────────────────────────────────────────────

function Aviso({ titulo, texto, onReintentar }: { titulo: string; texto: string; onReintentar?: () => void }) {
  return (
    <div className="mx-auto flex min-h-[45vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <ImageIcon className="size-9 text-muted-foreground" />
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <p className="text-sm text-muted-foreground">{texto}</p>
      {onReintentar && (
        <button
          onClick={onReintentar}
          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-white/15 px-4 text-sm transition hover:bg-white/10"
        >
          <RefreshCw className="size-4" /> Reintentar
        </button>
      )}
    </div>
  );
}
