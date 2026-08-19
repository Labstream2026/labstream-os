"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveReviewComment } from "@/app/(app)/proyectos/[id]/actions";
import { esNoAutorizado } from "@/lib/authz-error";
import { avisarAppVieja, esAccionDeOtraVersion } from "@/lib/accion-error";

// Componentes cliente del panel /resolve. El «puente» window.labstream lo inyecta el
// plugin de Workflow Integration de Resolve (preload.js): si existe, los timecodes saltan
// el cabezal y «Sincronizar marcadores» pinta el timeline; si no (navegador normal), el
// panel sigue siendo útil como checklist y avisa cómo obtener la integración completa.

export type MarkerItem = {
  id: string;
  seconds: number | null;
  body: string;
  author: string;
  priority: string;
  resolved: boolean;
  version: number | null;
  hasDrawing: boolean;
};

type Bridge = {
  shell: string;
  version: string;
  jump: (args: { seconds: number; offsetSeconds: number }) => Promise<{ ok: boolean; timecode?: string; error?: string }>;
  // Presentes solo desde la versión 2.1 del puente; el panel comprueba antes de llamarlas.
  update?: () => Promise<{ ok: boolean; state?: string; version?: string; error?: string }>;
  syncMarkers: (args: {
    items: MarkerItem[];
    opts: { offsetSeconds: number; includeResolved: boolean };
  }) => Promise<{ ok: boolean; created?: number; removed?: number; failed?: number; error?: string }>;
  info: () => Promise<{ ok: boolean; timeline?: string; fps?: number; error?: string }>;
};

declare global {
  interface Window {
    labstream?: Bridge;
  }
}

const OFFSET_KEY = "lsResolveOffsetSeconds";

function getOffset(): number {
  if (typeof window === "undefined") return 0;
  const v = parseFloat(window.localStorage.getItem(OFFSET_KEY) ?? "0");
  return Number.isFinite(v) ? v : 0;
}

// El puente lo inyecta el preload ANTES de que cargue la página: su referencia es estable.
// useSyncExternalStore evita el mismatch de hidratación (en el servidor no existe window).
const noopSubscribe = () => () => {};
function useBridge(): Bridge | null {
  return useSyncExternalStore(noopSubscribe, () => window.labstream ?? null, () => null);
}
function useStoredOffset(): string {
  return useSyncExternalStore(noopSubscribe, () => window.localStorage.getItem(OFFSET_KEY) ?? "0", () => "0");
}

// ── Autodetección del video que se está editando ──────────────────────────────
// La fricción #1 del panel era llegar en frío: elegir cliente → proyecto → video, tres toques,
// teniendo ESE video abierto en Resolve. El puente ya sabe cómo se llama el timeline; con eso
// el servidor busca a qué entregable corresponde y saltamos directo a sus correcciones.
//
// Solo actúa en la pantalla de inicio y una vez por sesión de ventana: si el editor navega a
// mano a otro video, no se lo volvemos a mover bajo los pies. Ante duda (dos videos con
// nombre parecido), el servidor devuelve `null` y no pasa nada — mejor no adivinar que abrir
// el video equivocado y marcar correcciones ajenas.
const YA_DETECTADO = "lsResolveAutodetectHecho";

export function AutoDetect() {
  const router = useRouter();
  const [estado, setEstado] = useState<"buscando" | "quieto">("quieto");

  useEffect(() => {
    const b = window.labstream;
    if (!b) return; // navegador normal: no hay timeline que mirar
    if (window.sessionStorage.getItem(YA_DETECTADO)) return;
    window.sessionStorage.setItem(YA_DETECTADO, "1");

    let cancelado = false;
    (async () => {
      setEstado("buscando");
      try {
        const info = await b.info();
        const nombre = info?.ok ? info.timeline : null;
        if (!nombre) return;
        const r = await fetch(`/api/resolve-plugin/match?timeline=${encodeURIComponent(nombre)}`);
        const data = (await r.json()) as { ok: boolean; match?: { deliverableId: string } | null };
        if (!cancelado && data.ok && data.match) {
          router.replace(`/resolve?d=${data.match.deliverableId}&auto=1`);
        }
      } catch {
        /* sin detección: el editor elige a mano, como siempre */
      } finally {
        if (!cancelado) setEstado("quieto");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [router]);

  if (estado !== "buscando") return null;
  return (
    <p className="mb-2 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] text-indigo-200">
      Buscando el video que tienes abierto en Resolve…
    </p>
  );
}

// Cinta que explica de dónde salió la vista cuando llegaste por autodetección.
export function AutoBanner({ timelineName }: { timelineName?: string | null }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] text-indigo-200">
      <span className="size-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,.2)]" />
      <span className="min-w-0 truncate">
        Abierto por tu timeline{timelineName ? <> · <span className="text-indigo-300">{timelineName}</span></> : null}
      </span>
      <a href="/resolve" className="ml-auto shrink-0 text-indigo-300 underline-offset-2 hover:underline">
        cambiar
      </a>
    </div>
  );
}

// ── Aviso de versión nueva del plugin ─────────────────────────────────────────
// La INTERFAZ del panel se actualiza sola (es esta página: lo que despliego llega al instante).
// Lo que no puede actualizarse solo del todo es el puente nativo, que vive en una carpeta del
// sistema. El puente 2.1+ se descarga la versión nueva a una carpeta del usuario y la estrena al
// reiniciar Resolve; a los puentes viejos —que no saben hacerlo— se les ofrece el instalador.
// ── Miniatura de un video ─────────────────────────────────────────────────────
// Vive en el cliente por una sola razón: `onError`. La cadena de respaldo (portada → fotograma
// → logo del cliente → emoji) la decide el servidor, pero solo sabe si el archivo EXISTE, no si
// la petición va a salir bien: el fotograma de un formato del que no se puede sacar da 404, y
// el logo de un cliente al que no tienes acceso también. Sin esto quedaba el cuadro roto del
// navegador justo donde el comentario prometía que nunca habría un hueco.
export function Thumb({ src, fallback, color }: { src: string | null; fallback: React.ReactNode; color: string | null }) {
  const [rota, setRota] = useState(false);
  const caja = "h-11 w-20 shrink-0 overflow-hidden rounded border border-zinc-800 bg-zinc-900";
  if (!src || rota) {
    return (
      <div className={`${caja} flex items-center justify-center text-lg`} style={color ? { backgroundColor: `${color}22` } : undefined}>
        {fallback}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" onError={() => setRota(true)} className={`${caja} object-cover`} />;
}

// ── Filtro por cliente ────────────────────────────────────────────────────────
// Desplegable para quedarse SOLO con lo pendiente de un cliente, aunque el editor tenga más
// videos en sus proyectos. Navega con la URL (?cli=) en vez de estado propio: así el filtro
// sobrevive a recargas, se puede compartir y las pestañas lo conservan.
export function FiltroCliente({ opciones, actual, vista }: {
  opciones: { id: string; nombre: string; n: number }[];
  actual: string | null;
  vista: "mios" | "equipo";
}) {
  const router = useRouter();
  return (
    <label className="mb-2 flex items-center gap-2 text-[11px] text-zinc-500">
      <span className="shrink-0">Cliente</span>
      <select
        value={actual ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          const q = new URLSearchParams();
          if (vista === "equipo") q.set("vista", "equipo");
          if (v) q.set("cli", v);
          const s = q.toString();
          router.push(s ? `/resolve?${s}` : "/resolve");
        }}
        className="w-full min-w-0 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[12px] text-zinc-100"
      >
        <option value="">Todos los clientes</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre} · {o.n}
          </option>
        ))}
        {/* Si el cliente filtrado no tiene pendientes en ESTA pestaña, no está entre las
            opciones — sin esta entrada el <select> quedaría mostrando «Todos los clientes»
            mientras la lista aparece vacía por un filtro invisible. */}
        {actual && !opciones.some((o) => o.id === actual) ? (
          <option value={actual}>Cliente sin pendientes aquí</option>
        ) : null}
      </select>
    </label>
  );
}

const CADA_30_MIN = 30 * 60 * 1000;

// Qué versiones ya se intentaron descargar. Vive FUERA del componente a propósito: como useRef
// se perdía en cada remontaje, y UpdateBanner se monta de nuevo en cada vista del panel
// (pendientes, todos, el video en foco), así que navegar volvía a bajar el puente entero una y
// otra vez. Un módulo se evalúa una sola vez por carga de página, que es justo la vida útil que
// necesita esta memoria.
const yaIntentadas = new Set<string>();

export function UpdateBanner() {
  const bridge = useBridge();
  const [info, setInfo] = useState<{ version: string; notes?: string; url?: string } | null>(null);
  const [fase, setFase] = useState<"descargando" | "lista" | "error" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ¿Hay versión nueva? Se mira al abrir y cada media hora: el panel se queda abierto toda la
  // jornada dentro de Resolve, así que mirar solo al arrancar significaba que quien no cerrara
  // Resolve en tres días no se enteraba de nada.
  useEffect(() => {
    if (!bridge) return;
    let vivo = true;
    const mirar = async () => {
      try {
        const r = await fetch("/api/resolve-plugin/version", { cache: "no-store" });
        const d = (await r.json()) as { ok: boolean; version?: string; notes?: string; url?: string };
        if (!vivo || !d.ok || !d.version) return;
        // Compara TODOS los componentes ("2.1.1" > "2.1"), igual que comparaVersion() en el
        // puente. Mirar solo los dos primeros hacía que una versión de parche no se anunciara
        // nunca: el aviso callaba y el editor se quedaba con la vieja creyendo estar al día.
        const num = (s: string) => s.split(".").map((n) => parseInt(n, 10) || 0);
        const [a, b] = [num(d.version), num(bridge.version || "0")];
        let nuevo = false;
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          if ((a[i] ?? 0) !== (b[i] ?? 0)) {
            nuevo = (a[i] ?? 0) > (b[i] ?? 0);
            break;
          }
        }
        if (nuevo) setInfo({ version: d.version, notes: d.notes, url: d.url });
      } catch {
        /* sin red: no molestamos con avisos */
      }
    };
    mirar();
    const t = setInterval(mirar, CADA_30_MIN);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [bridge]);

  // Descarga SOLA en cuanto detecta la versión nueva, sin pedir permiso. Es lo que hace que
  // esto sea de verdad automático: al editor no le toca decidir nada, solo reiniciar Resolve
  // cuando le venga bien. Puede hacerlo sin administrador porque escribe en la carpeta del
  // usuario, y lo que baja va verificado contra el sha256 que anunció el servidor.
  useEffect(() => {
    if (!info || typeof bridge?.update !== "function") return;
    if (yaIntentadas.has(info.version)) return;
    yaIntentadas.add(info.version);
    let vivo = true;
    (async () => {
      setFase("descargando");
      try {
        const r = await bridge.update!();
        if (!vivo) return;
        if (r.ok) setFase("lista");
        else {
          setFase("error");
          setError(r.error ?? null);
        }
      } catch {
        if (vivo) setFase("error");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [info, bridge]);

  if (!info) return null;
  const puedeSolo = typeof bridge?.update === "function";

  // Ya descargada: el único paso que queda es reiniciar Resolve. Verde, no ámbar — no hay nada
  // que arreglar, es una buena noticia.
  if (fase === "lista") {
    return (
      <div className="mb-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-100">
        <p className="font-medium">Plugin {info.version} listo</p>
        <p className="mt-0.5 text-emerald-200/80">Se activa la próxima vez que abras DaVinci Resolve. No tienes que hacer nada más.</p>
      </div>
    );
  }

  if (fase === "descargando") {
    return (
      <div className="mb-2 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-[11px] text-zinc-300">
        Actualizando el plugin a la versión {info.version}…
      </div>
    );
  }

  // Queda el camino manual: o el puente es viejo y no sabe actualizarse, o lo intentó y falló.
  return (
    <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100">
      <p className="font-medium">Hay una versión nueva del plugin ({info.version})</p>
      {info.notes ? <p className="mt-0.5 text-amber-200/80">{info.notes}</p> : null}
      {fase === "error" ? (
        <p className="mt-0.5 text-amber-200/80">No se pudo actualizar sola{error ? `: ${error}` : "."} Se instala a mano en un minuto.</p>
      ) : !puedeSolo ? (
        <p className="mt-0.5 text-amber-200/80">Tu plugin es anterior a la actualización automática: esta es la última vez que hay que instalarlo a mano.</p>
      ) : null}
      <div className="mt-1.5">
        <a
          href={info.url ?? "/plugin/instalar"}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded bg-amber-500 px-2 py-1 font-medium text-amber-950 hover:bg-amber-400"
        >
          Cómo instalarla
        </a>
      </div>
    </div>
  );
}

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
      title="Refrescar"
    >
      {pending ? "…" : "⟳"}
    </button>
  );
}

// Chip de timecode: en Resolve salta el cabezal; fuera, solo referencia visual.
export function JumpButton({ seconds, label }: { seconds: number; label: string }) {
  const [flash, setFlash] = useState<string | null>(null);
  async function jump() {
    const b = window.labstream;
    if (!b) {
      setFlash("solo en Resolve");
      setTimeout(() => setFlash(null), 1500);
      return;
    }
    try {
      const r = await b.jump({ seconds, offsetSeconds: getOffset() });
      setFlash(r.ok ? "▶" : r.error ?? "no se pudo");
    } catch {
      setFlash("no se pudo");
    }
    setTimeout(() => setFlash(null), 1500);
  }
  return (
    <button
      type="button"
      onClick={jump}
      className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[11px] font-medium text-indigo-300 hover:bg-indigo-500/30"
      title="Ir a este momento en el timeline"
    >
      {flash ?? label}
    </button>
  );
}

// Marcar hecha / reabrir — usa la MISMA server action que la web del equipo
// (resolveReviewComment: sesión + canWriteProject + aviso in-app al equipo).
export function ResolveToggle({ commentId, projectId, resolved }: { commentId: string; projectId: string; resolved: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // El mensaje DISTINGUE la causa: antes cualquier fallo (red, sesión caída, error del
  // servidor) se etiquetaba «sin permiso» y era imposible saber qué pasaba de verdad.
  const [error, setError] = useState<string | null>(null);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            setError(null);
            await resolveReviewComment(commentId, projectId, !resolved);
            router.refresh();
          } catch (e) {
            const err = e as (Error & { digest?: string }) | null;
            // Panel de otra versión (hubo deploy debajo): reintentar jamás cura una página
            // vieja — se avisa y RecargaSiVieja recarga la ventana; el clic siguiente entra.
            if (esAccionDeOtraVersion(err)) {
              setError("panel viejo — recargando…");
              avisarAppVieja();
              return;
            }
            setError(
              esNoAutorizado(err)
                ? "sin permiso"
                : typeof navigator !== "undefined" && navigator.onLine === false
                  ? "sin conexión"
                  : "falló, reintenta",
            );
            setTimeout(() => setError(null), 3000);
          }
        })
      }
      className={`rounded px-2 py-0.5 text-[10px] font-medium ${
        error
          ? "bg-rose-500/20 text-rose-300"
          : resolved
            ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/30"
      } disabled:opacity-50`}
      title={resolved ? "Volver a dejarla como pendiente" : "Marcar como realizada"}
    >
      {error ?? (pending ? "…" : resolved ? "Reabrir" : "✓ Hecha")}
    </button>
  );
}

// ── La lista de correcciones, manejable con el teclado ────────────────────────
// Un editor tiene las dos manos en el teclado y el ratón lejos. Aquí:
//   ↑ ↓        moverse por la lista
//   Enter      saltar el cabezal a esa corrección
//   Espacio    marcarla hecha / reabrirla
//   J          igual que Enter (costumbre de Resolve)
// Y la FILA ENTERA salta al timecode: antes había que apuntarle a un chip de 40 px, cuando
// «llévame ahí» es lo que uno quiere el 90 % de las veces.
//
// El foco vive en el <li>: así el lector de pantalla anuncia la corrección completa y el
// navegador se encarga del scroll. La lista no roba el teclado si estás escribiendo en un campo.
export type FilaCorreccion = {
  id: string;
  seconds: number | null;
  tcLabel: string | null;
  body: string;
  author: string;
  fromClient: boolean;
  priority: string;
  resolved: boolean;
  version: number | null;
  editedAt: boolean;
  drawing: string | null;
  resolvedInfo: string | null;
  replies: { id: string; author: string; body: string }[];
};

export function CorrectionsList({ items, projectId }: { items: FilaCorreccion[]; projectId: string }) {
  const [sel, setSel] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const bridge = useBridge();

  const saltar = useCallback(
    async (i: number) => {
      const it = items[i];
      if (!it || it.seconds == null) return;
      const b = window.labstream;
      if (!b) return;
      try {
        await b.jump({ seconds: it.seconds, offsetSeconds: getOffset() });
      } catch {
        /* el aviso ya lo da el chip; aquí no interrumpimos */
      }
    },
    [items],
  );

  const mover = useCallback(
    (delta: number) => {
      setSel((s) => {
        const n = Math.max(0, Math.min(items.length - 1, s + delta));
        refs.current[n]?.focus();
        return n;
      });
    },
    [items.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      // Si se está escribiendo (claqueta, búsqueda), el teclado es del campo.
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      // Y si el foco está sobre algo activable, Enter es SUYO: pulsar un botón o seguir un
      // enlace es la acción por defecto de ese keydown, así que robarla con preventDefault
      // dejaba muertos con el teclado «✓ Hecha», «Sincronizar marcadores», los chips de
      // versión, «Ocultar hechas» y el «←» de volver — justo el modo de trabajo con las dos
      // manos en el teclado que esta función existe para servir.
      if (t?.closest("button, a[href], select, summary, [role='button'], [role='link']")) return;
      if (e.key === "ArrowDown") { e.preventDefault(); mover(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); mover(-1); }
      else if (e.key === "Enter" || e.key === "j" || e.key === "J") { e.preventDefault(); saltar(sel); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mover, saltar, sel]);

  if (items.length === 0) return null;

  return (
    <>
      <ol className="space-y-2">
        {items.map((c, i) => (
          <li
            key={c.id}
            ref={(el) => { refs.current[i] = el; }}
            tabIndex={0}
            onFocus={() => setSel(i)}
            onClick={() => { setSel(i); saltar(i); }}
            title={c.seconds != null ? "Clic o Enter: llevar el cabezal aquí" : undefined}
            className={`rounded-lg border p-2.5 outline-none transition-colors ${
              c.seconds != null ? "cursor-pointer" : ""
            } ${
              sel === i
                ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500"
                : c.resolved
                  ? "border-emerald-500/25 bg-emerald-500/5"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
            }`}
          >
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {c.tcLabel && c.seconds != null ? <JumpButton seconds={c.seconds} label={c.tcLabel} /> : null}
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${c.priority === "SUGERENCIA" ? "bg-zinc-800 text-zinc-400" : "bg-orange-500/15 text-orange-300"}`}>
                {c.priority === "SUGERENCIA" ? "Sugerencia" : "Obligatoria"}
              </span>
              <span className="text-zinc-500">{c.author}{c.fromClient ? " · cliente" : " · equipo"}</span>
              {c.version != null ? <span className="text-zinc-600">v{c.version}</span> : null}
              {c.editedAt ? <span className="italic text-zinc-600">editado</span> : null}
              <span className="grow" />
              {/* El botón no debe disparar el salto de la fila. */}
              <span onClick={(e) => e.stopPropagation()}>
                <ResolveToggle commentId={c.id} projectId={projectId} resolved={c.resolved} />
              </span>
            </div>
            <p className={`mt-1 whitespace-pre-wrap text-sm ${c.resolved ? "text-zinc-400 line-through" : "text-zinc-100"}`}>{c.body}</p>
            {c.drawing ? (
              <span onClick={(e) => e.stopPropagation()}>
                <ZoomImage src={c.drawing} alt="Captura del cliente" />
              </span>
            ) : null}
            {c.resolvedInfo ? <p className="mt-1 text-[10px] text-emerald-400/80">{c.resolvedInfo}</p> : null}
            {c.replies.map((r) => (
              <div key={r.id} className="mt-1.5 border-l-2 border-zinc-700 pl-2 text-[13px]">
                <span className="text-[11px] text-zinc-500">{r.author}:</span> <span className="text-zinc-300">{r.body}</span>
              </div>
            ))}
          </li>
        ))}
      </ol>
      {bridge ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-600">
          <Kbd>↑</Kbd><Kbd>↓</Kbd> moverse · <Kbd>Enter</Kbd> saltar al timecode
        </p>
      ) : null}
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-zinc-700 border-b-2 bg-zinc-900 px-1.5 font-mono text-[10px] text-zinc-400">{children}</span>;
}

// Captura/dibujo del cliente: miniatura inline + zoom a pantalla del panel.
export function ZoomImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- data-URL de BD, no pasa por el optimizador */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onClick={() => setOpen(true)}
        className="mt-1.5 max-h-44 w-auto cursor-zoom-in rounded-md border border-zinc-800"
      />
      {open ? (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-3"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full rounded" />
        </div>
      ) : null}
    </>
  );
}

// Barra fija inferior: estado del puente, offset y sincronización de marcadores.
export function MarkersBar({ items, deliverableId }: { items: MarkerItem[]; deliverableId: string }) {
  const bridge = useBridge();
  const storedOffset = useStoredOffset();
  const [editedOffset, setEditedOffset] = useState<string | null>(null);
  const offset = editedOffset ?? storedOffset;
  const [includeResolved, setIncludeResolved] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // El offset se acota a ±2 h: un valor absurdo (o texto) mandaba TODOS los marcadores al
  // final del timeline sin avisar. Lo escrito se conserva en pantalla; lo guardado es lo válido.
  function saveOffset(v: string) {
    setEditedOffset(v);
    const n = parseFloat(v.replace(",", "."));
    const safe = Number.isFinite(n) ? Math.max(-7200, Math.min(7200, n)) : 0;
    window.localStorage.setItem(OFFSET_KEY, String(safe));
  }
  const offsetInvalid = offset.trim() !== "" && !Number.isFinite(parseFloat(offset.replace(",", ".")));

  async function sync() {
    if (!bridge) return;
    setBusy(true);
    setStatus("Sincronizando…");
    try {
      const payload = includeResolved ? items : items.filter((i) => !i.resolved);
      const r = await bridge.syncMarkers({
        items: payload,
        opts: { offsetSeconds: getOffset(), includeResolved },
      });
      setStatus(
        r.ok
          ? `Marcadores: ${r.created ?? 0} pintados, ${r.removed ?? 0} retirados${
              r.failed ? `. ${r.failed} no cupieron: caen fuera del timeline o su frame ya estaba ocupado (revisa el offset).` : "."
            }`
          : r.error ?? "No se pudo sincronizar.",
      );
    } catch {
      setStatus("No se pudo hablar con Resolve.");
    }
    setBusy(false);
  }

  // «Limpiar» reutiliza la misma ruta: el puente SIEMPRE retira los marcadores lsos:* antes de
  // pintar, así que sincronizar con lista vacía los quita todos sin tocar los del editor.
  async function clear() {
    if (!bridge) return;
    setBusy(true);
    setStatus("Retirando marcadores…");
    try {
      const r = await bridge.syncMarkers({ items: [], opts: { offsetSeconds: 0, includeResolved: true } });
      setStatus(r.ok ? `Retirados ${r.removed ?? 0} marcadores de Labstream.` : r.error ?? "No se pudo limpiar.");
    } catch {
      setStatus("No se pudo hablar con Resolve.");
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 px-3 py-2 backdrop-blur">
      <div className="mx-auto flex w-full max-w-xl flex-wrap items-center gap-2 text-[11px]">
        {bridge ? (
          <>
            <button
              type="button"
              onClick={sync}
              disabled={busy}
              className="rounded bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Sincronizar marcadores
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              title="Quita del timeline los marcadores de Labstream (no toca los tuyos)"
              className="rounded border border-zinc-700 px-2 py-1 font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Limpiar
            </button>
            <label className="flex items-center gap-1 text-zinc-400">
              <input
                type="checkbox"
                checked={includeResolved}
                onChange={(e) => setIncludeResolved(e.target.checked)}
                className="accent-indigo-500"
              />
              incluir hechas (verde)
            </label>
            {/* «Offset (s)» no lo entendía nadie que no supiera qué es una claqueta. El campo
                es el mismo; lo que cambia es que ahora dice para qué sirve. */}
            <label className="flex items-center gap-1 text-zinc-400" title="Si el video que revisó el cliente empieza con claqueta o cuenta regresiva, escribe cuántos segundos duran: los timecodes se corren esa cantidad.">
              Claqueta
              <input
                value={offset}
                onChange={(e) => saveOffset(e.target.value)}
                inputMode="decimal"
                aria-label="Segundos de claqueta antes del contenido"
                className={`w-12 rounded border bg-zinc-900 px-1 py-0.5 text-zinc-200 ${offsetInvalid ? "border-rose-500" : "border-zinc-700"}`}
              />
              <span className="text-zinc-600">s</span>
            </label>
          </>
        ) : (
          <span className="text-zinc-500">
            Ábrelo dentro de Resolve (Workspace ▸ Workflow Integrations) para saltar al timeline y pintar marcadores.
          </span>
        )}
        <span className="grow" />
        <a
          href={`/revisiones/${deliverableId}`}
          target="_blank"
          rel="noreferrer"
          className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
        >
          Abrir en la web
        </a>
      </div>
      {status ? <p className="mx-auto mt-1 w-full max-w-xl text-[11px] text-zinc-400">{status}</p> : null}
    </div>
  );
}
