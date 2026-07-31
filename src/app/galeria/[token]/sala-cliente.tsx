"use client";

import * as React from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Download, Film, Image as ImageIcon, Loader2, RefreshCw, X } from "lucide-react";
import type { GaleriaItem, GaleriaScan } from "@/lib/nas-galeria";
// Solo el TIPO: `import type` desaparece al compilar. La librería se carga con `import()` y
// únicamente cuando esta pieza tiene escalera (ver el efecto de la escalera adaptativa).
import type HlsPlayer from "hls.js";
import { ReproductorVivo, alturasUtiles, type VivoDatos } from "@/lib/vivo-cliente";
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

// Referencia estable para «esta pieza no ofrece calidades»: devolver `[]` recién creado en cada
// render haría que cualquier `useMemo` que dependa de la lista se recalculara siempre.
const SIN_CALIDADES: { alto: number; kbps: number }[] = [];

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

  // ── Escalera adaptativa ─────────────────────────────────────────────────────────────────
  // Si LabTem ya fabricó la escalera de esta pieza, el video se sirve troceado en varias
  // calidades y el reproductor va cambiando según la red que tenga delante. Aquí es donde más
  // se nota de toda la app: es la pantalla en la que un cliente abre su entrega desde el móvil.
  //
  // Primero se PREGUNTA si la escalera existe —medio kilobyte— y solo entonces se carga hls.js.
  // Sin esa pregunta, una pieza que la fábrica aún no ha procesado haría que el teléfono se
  // bajara medio mega de librería para acabar reproduciendo el MP4 de todas formas.
  //
  // Safari y iOS reproducen HLS de fábrica. Y pase lo que pase, el MP4 sigue puesto en `src`:
  // sin escalera, con la librería caída o en un navegador que no puede, se ve igual que antes.
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const hlsRef = React.useRef<HlsPlayer | null>(null);
  // Las calidades que ofrece la escalera y cuál se está viendo. Automático es el modo normal
  // —el reproductor mide la red y decide—, pero poder fijarla a mano importa por dos razones:
  // comprobar que la escalera funciona de verdad (en automático con buena red nunca baja, así
  // que no se ve), y dejar que quien está con datos limitados elija gastar menos.
  //
  // Van los tres ATADOS a la pieza, en un solo estado: al pasar a la siguiente valen lo que
  // deben ya en ESE render, sin tener que vaciarlos desde un efecto. La diferencia se nota al
  // pasar rápido con el dedo — el menú alcanzaba a enseñar las calidades de la foto anterior.
  const [escalera, setEscalera] = React.useState<{
    rel: string;
    lista: { alto: number; kbps: number }[];
    fijada: number; // -1 = automática
    enUso: number | null;
  } | null>(null);
  const [menuEn, setMenuEn] = React.useState<string | null>(null);
  const esc = escalera?.rel === item.rel ? escalera : null;
  const calidades = esc?.lista ?? SIN_CALIDADES;
  const calidadFijada = esc?.fijada ?? -1;
  const calidadEnUso = esc?.enUso ?? null;
  const menuCalidad = menuEn === item.rel;
  const setMenuCalidad = React.useCallback(
    (abierto: boolean) => setMenuEn(abierto ? item.rel : null),
    [item.rel],
  );

  // ── Al vuelo ───────────────────────────────────────────────────────────────────────────
  // La otra forma de conseguir una calidad: que la GPU de LabTem la haga MIENTRAS se ve. No
  // compite con la escalera —una copia hecha sirve a todo el mundo y no gasta tarjeta—, cubre
  // lo que la escalera no puede: una pieza recién subida que aún no tiene nada fabricado, o una
  // calidad que esa noche no tocó hacer (un vertical de 30 s no lleva escalera, dura menos del
  // mínimo). Antes de esto, ahí el cliente leía «se está preparando» y no había nada que hacer.
  //
  // Los dos estados van ATADOS a la pieza a la que pertenecen, en vez de vaciarse desde un
  // efecto al cambiar de foto. Así, en el render siguiente al pase ya valen null —sin ese
  // atado habría un instante enseñando las calidades de la pieza anterior sobre la nueva, y
  // pulsando rápido se podía pedir una conversión del vídeo equivocado—.
  const [vivoRes, setVivoRes] = React.useState<{ rel: string; datos: VivoDatos | null } | null>(null);
  const [vivoSel, setVivoSel] = React.useState<{ rel: string; alto: number } | null>(null);
  const vivoDatos = vivoRes?.rel === item.rel ? vivoRes.datos : null;
  const vivoAlto = vivoSel?.rel === item.rel ? vivoSel.alto : null;
  const setVivoAlto = React.useCallback(
    (alto: number | null) => setVivoSel(alto == null ? null : { rel: item.rel, alto }),
    [item.rel],
  );
  const vivoRef = React.useRef<ReproductorVivo | null>(null);
  const vivoOpciones = React.useMemo(() => alturasUtiles(vivoDatos), [vivoDatos]);

  const fijarCalidad = React.useCallback(
    (n: number) => {
      setEscalera((e) => (e && e.rel === item.rel ? { ...e, fijada: n } : e));
      setMenuCalidad(false);
      setVivoAlto(null); // volver a la escalera apaga el modo al vuelo
      // -1 le devuelve el mando al algoritmo; cualquier otro lo clava en ese peldaño.
      if (hlsRef.current) hlsRef.current.currentLevel = n;
    },
    [item.rel, setMenuCalidad, setVivoAlto],
  );

  const fijarVivo = React.useCallback(
    (alto: number) => {
      setMenuCalidad(false);
      setVivoAlto(alto);
    },
    [setMenuCalidad, setVivoAlto],
  );

  // ¿Qué admite esta pieza al vuelo? Se pregunta al abrirla, en paralelo con la escalera: son
  // dos preguntas independientes y encadenarlas solo añadiría espera. La respuesta la guarda el
  // servidor unos minutos por pieza, así que pasar dos veces por el mismo vídeo no cuesta nada.
  React.useEffect(() => {
    if (item.kind !== "video") return;
    const rel = item.rel;
    const ctrl = new AbortController();
    fetch(api("media", token, { rel, vivo: "info" }), { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VivoDatos | null) => setVivoRes({ rel, datos: d }))
      .catch(() => {
        /* sin servicio de conversión: el menú simplemente no ofrece esta parte */
      });
    return () => ctrl.abort();
  }, [token, item.rel, item.kind]);

  // El motor del modo al vuelo. Vive aparte del de la escalera y los dos nunca están puestos a
  // la vez: cada uno se apaga entero al entrar el otro, en vez de compartir el `<video>` y
  // pelearse por él.
  React.useEffect(() => {
    if (vivoAlto == null) return;
    const el = videoRef.current;
    const elegida = vivoOpciones.find((a) => a.alto === vivoAlto);
    if (!el || !elegida || !vivoDatos?.duracion) return;
    // Se retoma donde se estaba: cambiar de calidad no debería costar volver a buscar el punto.
    const punto = el.currentTime || 0;
    const motor = new ReproductorVivo({
      video: el,
      duracion: vivoDatos.duracion,
      codecs: elegida.codecs,
      url: (desde) => api("media", token, { rel: item.rel, vivo: String(vivoAlto), desde: String(desde) }),
      // Si la GPU está llena o el chorro se cae, no se deja al cliente mirando un reproductor
      // parado: se vuelve solo a la copia de disco, que es lo que había antes de elegir esto.
      alFallar: () => setVivoAlto(null),
    });
    vivoRef.current = motor;
    motor.arrancar(punto);
    void el.play().catch(() => {});
    return () => {
      vivoRef.current = null;
      const seguia = motor.puntoActual;
      motor.destruir();
      // Al salir del modo al vuelo se devuelve el `<video>` a la copia de disco y al mismo
      // segundo. Sin esto quedaría con una fuente muerta y la pieza dejaría de verse.
      // Se usa `el`, el elemento capturado al montar, y no `videoRef.current`: para cuando
      // corre la limpieza, el ref puede apuntar ya a otro vídeo —o a nada— y estaríamos
      // devolviendo esta fuente al reproductor equivocado.
      el.src = ver;
      el.load();
      const alCargar = () => {
        el.currentTime = seguia;
        el.removeEventListener("loadedmetadata", alCargar);
      };
      el.addEventListener("loadedmetadata", alCargar);
    };
  }, [vivoAlto, vivoOpciones, vivoDatos, token, item.rel, ver, setVivoAlto]);

  React.useEffect(() => {
    // Con el modo al vuelo puesto, la escalera no se toca: el `<video>` ya tiene dueño.
    if (item.kind !== "video" || vivoAlto != null) return;
    const rel = item.rel;
    const maestro = api("media", token, { rel, hls: "master.m3u8" });
    const ctrl = new AbortController();
    let vivo = true;

    const alMp4 = () => {
      const el = videoRef.current;
      if (vivo && el && el.src !== ver) {
        el.src = ver;
        el.load();
      }
    };

    fetch(maestro, { signal: ctrl.signal })
      .then(async (r) => {
        if (!vivo || !r.ok) return; // 404 = esta pieza todavía no tiene escalera
        const el = videoRef.current;
        if (!el) return;
        // QUIÉN reproduce se decide por MediaSource, NO por `canPlayType`. Chrome y Edge
        // contestan «maybe» a `application/vnd.apple.mpegurl` y no es verdad: el vídeo se
        // queda parado, y como NO lanza `error`, tampoco salta la caída al MP4 — la sala se
        // queda muda y el cliente ve un reproductor que no arranca. Comprobado en el
        // navegador; sin abrirlo esto no se veía, porque el servidor respondía perfecto.
        // Donde no hay MediaSource (iOS Safari) hls.js no puede trabajar y la única vía es
        // el HLS nativo, que ahí sí es de verdad.
        if (!("MediaSource" in window)) {
          if (el.canPlayType("application/vnd.apple.mpegurl")) el.src = maestro;
          return;
        }
        const { default: Hls } = await import("hls.js");
        const destino = videoRef.current;
        if (!vivo || !destino || !Hls.isSupported()) return;
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_evento, datos) => {
          // Los tropiezos normales los remonta hls.js solo; solo se suelta si es FATAL.
          if (!datos.fatal) return;
          try { hls.destroy(); } catch { /* noop */ }
          if (hlsRef.current === hls) hlsRef.current = null;
          alMp4();
        });
        // Qué calidades trae la escalera. Se leen del maestro, no se dan por sabidas: LabTem
        // decide los peldaños según el original (un vertical no da los mismos que un 4K, y un
        // 720p puede traer solo dos), así que el menú enseña lo que hay de verdad.
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!vivo) return;
          setEscalera({
            rel,
            lista: hls.levels.map((l) => ({ alto: l.height, kbps: Math.round(l.bitrate / 1000) })),
            fijada: -1,
            enUso: null,
          });
        });
        // Y cuál se está viendo AHORA, que en automático va cambiando sola.
        hls.on(Hls.Events.LEVEL_SWITCHED, (_evento, datos) => {
          if (vivo) setEscalera((e) => (e && e.rel === rel ? { ...e, enUso: datos.level } : e));
        });
        hls.loadSource(maestro);
        hls.attachMedia(destino);
      })
      .catch(() => {
        /* sin escalera o sin red para preguntarlo: el MP4 sigue sirviendo igual */
      });

    return () => {
      vivo = false;
      ctrl.abort();
      const h = hlsRef.current;
      hlsRef.current = null;
      try { h?.destroy(); } catch { /* noop */ }
    };
  }, [token, item.rel, item.kind, ver, vivoAlto]);

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
          <video
            key={item.rel}
            ref={videoRef}
            src={ver}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full"
            // Con la escalera puesta los fallos los lleva hls.js (tiene su propia recuperación
            // y su caída al MP4): dar la pieza por no reproducible aquí sería adelantarse.
            onError={() => { if (!hlsRef.current) setSinVista(true); }}
          />
        ) : (
          <img key={item.rel} src={ver} alt={item.name} className="max-h-full max-w-full object-contain" onError={() => setSinVista(true)} />
        )}

        {/* Selector de calidad. Aparece si hay algo que elegir: una escalera con más de un
            peldaño, o calidades que la GPU puede hacer al vuelo. En una pieza sin ninguna de
            las dos no hay nada que ofrecer y un menú vacío solo confunde.
            Va sobre el vídeo y no en la barra de abajo porque los controles nativos ocupan
            esa franja entera y no se pueden ampliar. */}
        {calidades.length > 1 || vivoOpciones.length > 0 ? (
          <div className="absolute right-4 top-3 z-10 text-right">
            <button
              onClick={() => setMenuCalidad(!menuCalidad)}
              className="rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white backdrop-blur transition hover:bg-black/75"
            >
              {vivoAlto != null
                ? `Al vuelo · ${vivoAlto}p`
                : calidades.length > 1
                  ? calidadFijada === -1
                    ? `Auto${calidadEnUso != null && calidades[calidadEnUso] ? ` · ${calidades[calidadEnUso].alto}p` : ""}`
                    : `${calidades[calidadFijada]?.alto}p`
                  : "Calidad"}
            </button>
            {menuCalidad ? (
              <div className="mt-1 overflow-hidden rounded-lg bg-black/85 backdrop-blur">
                {calidades.length > 1 ? (
                  <>
                    <button
                      onClick={() => fijarCalidad(-1)}
                      className={`block w-full px-4 py-1.5 text-left text-[11px] transition hover:bg-white/15 ${vivoAlto == null && calidadFijada === -1 ? "font-semibold text-white" : "text-white/70"}`}
                    >
                      Automática
                    </button>
                    {/* De mayor a menor, que es como se piensa en calidad. */}
                    {calidades.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => fijarCalidad(i)}
                        className={`block w-full whitespace-nowrap px-4 py-1.5 text-left text-[11px] transition hover:bg-white/15 ${vivoAlto == null && calidadFijada === i ? "font-semibold text-white" : "text-white/70"}`}
                      >
                        {c.alto}p · {c.kbps >= 1000 ? `${(c.kbps / 1000).toFixed(1)} Mbps` : `${c.kbps} kbps`}
                      </button>
                    ))}
                  </>
                ) : null}
                {vivoOpciones.length > 0 ? (
                  <>
                    {/* La separación importa: son dos cosas distintas y conviene que se note.
                        Arriba, calidades que ya existen hechas. Aquí, calidades que no existen
                        y se fabrican mientras se miran. */}
                    <p className="border-t border-white/15 px-4 pb-1 pt-2 text-left text-[9px] uppercase tracking-wide text-white/40">
                      Al vuelo
                    </p>
                    {vivoOpciones.map((a) => (
                      <button
                        key={`vivo-${a.alto}`}
                        onClick={() => fijarVivo(a.alto)}
                        className={`block w-full whitespace-nowrap px-4 py-1.5 text-left text-[11px] transition hover:bg-white/15 ${vivoAlto === a.alto ? "font-semibold text-white" : "text-white/70"}`}
                      >
                        {a.alto}p · {a.kbps >= 1000 ? `${(a.kbps / 1000).toFixed(1)} Mbps` : `${a.kbps} kbps`}
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

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
