"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CheckCheck, Clapperboard, Clock, Loader2, Mail, MailOpen, Paperclip, RotateCcw, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { asignarProyectoHilo, estrellaCorreo, marcarLeidosCorreo, moverCorreos, posponerCorreos } from "./acciones";
import { useCompositor, type PrefillCompositor } from "./compositor";

// ── La lista de CONVERSACIONES y la barra de acciones (estilo Gmail) ────────
// El servidor agrupa y serializa; aquí solo se pinta, se selecciona y se dispara. Las filas
// son hilos: remitente (n), asunto — fragmento, etiqueta del cliente, estrella, y acciones
// al pasar el ratón. La selección enciende la barra de lote.

export type HiloVM = {
  clave: string;
  href: string; // enlace a la vista del hilo (conserva carpeta y filtros)
  quien: string;
  n: number; // mensajes en el hilo
  asunto: string;
  snippet: string;
  cuando: string;
  noLeidos: number;
  destacado: boolean;
  conAdjunto: boolean;
  cliente: { nombre: string; hex: string } | null;
  ids: string[]; // todos los mensajes del hilo (para lote)
  ultimoId: string; // al que se le pone/quita la estrella
};

export function ListaHilos({ hilos, carpeta, hiloActivo }: { hilos: HiloVM[]; carpeta: string; hiloActivo?: string | null }) {
  const router = useRouter();
  const [sel, setSel] = React.useState<Set<string>>(new Set()); // claves de hilo
  const [pendiente, arranca] = React.useTransition();
  // Cursor de teclado (j/k de Gmail): -1 = sin cursor hasta la primera pulsación.
  const [cursor, setCursor] = React.useState(-1);
  const hilosRef = React.useRef(hilos);
  hilosRef.current = hilos;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      const lista = hilosRef.current;
      if (!lista.length) return;
      if (e.key === "j") setCursor((c) => Math.min(c + 1, lista.length - 1));
      else if (e.key === "k") setCursor((c) => Math.max(c - 1, 0));
      else if (e.key === "Enter") {
        setCursor((c) => {
          if (c >= 0 && lista[c]) router.push(lista[c].href, { scroll: false });
          return c;
        });
      } else if (e.key === "e") {
        setCursor((c) => {
          const h = c >= 0 ? lista[c] : null;
          if (h) void moverCorreos(h.ids, "ARCHIVO").then(() => router.refresh());
          return c;
        });
      } else if (e.key === "s") {
        setCursor((c) => {
          const h = c >= 0 ? lista[c] : null;
          if (h) void estrellaCorreo(h.ultimoId, !h.destacado).then(() => router.refresh());
          return c;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const idsSeleccionados = hilos.filter((h) => sel.has(h.clave)).flatMap((h) => h.ids);
  const limpiar = () => setSel(new Set());

  const lote = (fn: () => Promise<unknown>) =>
    arranca(async () => {
      await fn();
      limpiar();
      router.refresh();
    });

  const enPapelera = carpeta === "papelera";
  const enArchivo = carpeta === "archivo";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Barra: seleccionar todo + acciones de lote (aparecen con la selección). */}
      <div className="flex min-h-11 items-center gap-1 border-b border-border px-3">
        <input
          type="checkbox"
          title="Seleccionar todo"
          checked={sel.size > 0 && sel.size === hilos.length}
          onChange={(e) => setSel(e.target.checked ? new Set(hilos.map((h) => h.clave)) : new Set())}
          className="mx-1.5 accent-primary"
        />
        {sel.size > 0 ? (
          <>
            {!enPapelera ? (
              <BotonBarra title={enArchivo ? "Devolver a Recibidos" : "Archivar"} onClick={() => lote(() => moverCorreos(idsSeleccionados, enArchivo ? "INBOX" : "ARCHIVO"))}>
                {enArchivo ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}
              </BotonBarra>
            ) : (
              <BotonBarra title="Restaurar a Recibidos" onClick={() => lote(() => moverCorreos(idsSeleccionados, "INBOX"))}>
                <RotateCcw className="size-4" />
              </BotonBarra>
            )}
            {!enPapelera ? (
              <BotonBarra title="Enviar a la papelera" onClick={() => lote(() => moverCorreos(idsSeleccionados, "PAPELERA"))}>
                <Trash2 className="size-4" />
              </BotonBarra>
            ) : null}
            <BotonBarra title="Marcar como leído" onClick={() => lote(() => marcarLeidosCorreo(idsSeleccionados, true))}>
              <MailOpen className="size-4" />
            </BotonBarra>
            <BotonBarra title="Marcar como no leído" onClick={() => lote(() => marcarLeidosCorreo(idsSeleccionados, false))}>
              <Mail className="size-4" />
            </BotonBarra>
            <MenuPosponer ids={idsSeleccionados} quitar={carpeta === "pospuestos"} onHecho={() => { limpiar(); router.refresh(); }} />
            <span className="ml-1 text-[12px] font-semibold text-primary">
              {pendiente ? <Loader2 className="inline size-3.5 animate-spin" /> : `${sel.size} seleccionada${sel.size > 1 ? "s" : ""}`}
            </span>
          </>
        ) : (
          <span className="text-[11.5px] text-muted-foreground">{hilos.length} conversaciones</span>
        )}
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
        {hilos.map((h, i) => (
          <FilaHilo key={h.clave} h={h} marcada={sel.has(h.clave)} conCursor={i === cursor} activa={hiloActivo != null && h.ids.join(".") === hiloActivo}
            enPapelera={enPapelera} enArchivo={enArchivo} carpeta={carpeta}
            onMarcar={(on) => setSel((p) => { const s = new Set(p); if (on) s.add(h.clave); else s.delete(h.clave); return s; })} />
        ))}
        {hilos.length === 0 ? <li className="px-4 py-12 text-center text-[12.5px] text-muted-foreground">Nada por aquí.</li> : null}
      </ul>
    </div>
  );
}

function BotonBarra({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
      {children}
    </button>
  );
}

// Menú de POSPONER: tres presets calculados en el servidor (hora de Bogotá), como Gmail.
// «Pospuesto» es solo de la app: el webmail de MailPlus lo sigue mostrando.
function MenuPosponer({ ids, quitar, onHecho }: { ids: string[]; quitar?: boolean; onHecho: () => void }) {
  const [abierto, setAbierto] = React.useState(false);
  const disparar = (preset: "tarde" | "manana" | "lunes" | "quitar") => {
    setAbierto(false);
    void posponerCorreos(ids, preset).then(onHecho);
  };
  if (quitar) {
    return (
      <BotonBarra title="Devolver a Recibidos ahora" onClick={() => disparar("quitar")}>
        <Clock className="size-4" />
      </BotonBarra>
    );
  }
  return (
    <span className="relative">
      <BotonBarra title="Posponer hasta…" onClick={() => setAbierto((v) => !v)}>
        <Clock className="size-4" />
      </BotonBarra>
      {abierto ? (
        <span className="absolute right-0 top-9 z-30 flex w-44 flex-col overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
          {([["tarde", "En 3 horas"], ["manana", "Mañana 9:00 a. m."], ["lunes", "El lunes 9:00 a. m."]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => disparar(k)} className="px-3 py-1.5 text-left text-[12.5px] hover:bg-muted">
              {l}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

// Fila de DOS líneas (remitente + fecha arriba; asunto — fragmento abajo): funciona igual de
// bien a todo lo ancho que en la columna estrecha del panel de lectura, que es donde vive la
// mayor parte del tiempo. La fila activa (el hilo abierto al lado) se marca con la regleta.
function FilaHilo({ h, marcada, conCursor, activa, enPapelera, enArchivo, carpeta, onMarcar }: {
  h: HiloVM; marcada: boolean; conCursor: boolean; activa?: boolean; enPapelera: boolean; enArchivo: boolean; carpeta: string; onMarcar: (on: boolean) => void;
}) {
  const router = useRouter();
  const [estrella, setEstrella] = React.useState(h.destacado);
  const [, arranca] = React.useTransition();
  const noLeido = h.noLeidos > 0;

  const rapida = (fn: () => Promise<unknown>) => arranca(async () => { await fn(); router.refresh(); });

  return (
    <li className={cn(
      "group relative px-2 py-1.5 transition-colors hover:bg-accent/40",
      marcada && "bg-primary/5",
      noLeido && !marcada && "bg-card",
      activa && "bg-accent/60",
      (conCursor || activa) && "shadow-[inset_3px_0_0] shadow-primary",
    )}>
      <div className="flex items-start gap-1">
        <span className="flex shrink-0 items-center pt-0.5">
          <input type="checkbox" checked={marcada} onChange={(e) => onMarcar(e.target.checked)} className="mx-1 accent-primary opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" style={marcada ? { opacity: 1 } : undefined} />
          <button
            type="button" aria-label={estrella ? "Quitar estrella" : "Destacar"}
            onClick={() => { setEstrella(!estrella); void estrellaCorreo(h.ultimoId, !estrella); }}
            className={cn("rounded p-0.5", estrella ? "text-amber-400" : "text-muted-foreground/40 hover:text-muted-foreground")}
          >
            <Star className="size-3.5" fill={estrella ? "currentColor" : "none"} />
          </button>
        </span>
        <Link href={h.href} prefetch={false} scroll={false} className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-[13px]", noLeido ? "font-bold" : "text-muted-foreground")}>
              {h.quien}{h.n > 1 ? <span className="font-normal text-muted-foreground"> ({h.n})</span> : null}
            </span>
            {h.conAdjunto ? <Paperclip className="size-3 shrink-0 text-muted-foreground" /> : null}
            <span className={cn("shrink-0 text-[11px] tabular-nums group-hover:invisible", noLeido ? "font-bold text-primary" : "text-muted-foreground")}>
              {h.cuando}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            {h.cliente ? (
              <span className="size-2 shrink-0 rounded-full" title={h.cliente.nombre} style={{ background: h.cliente.hex }} />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-[12.5px]">
              <span className={cn(noLeido && "font-semibold")}>{h.asunto}</span>
              <span className="text-muted-foreground"> — {h.snippet}</span>
            </span>
          </span>
        </Link>
      </div>
      {/* Acciones al pasar el ratón, como Gmail: sin abrir el hilo. */}
      <span className="absolute right-2 top-1 hidden items-center gap-0 rounded-md border border-border bg-card shadow-sm group-hover:flex">
        {!enPapelera ? (
          <BotonBarra title={enArchivo ? "Devolver a Recibidos" : "Archivar"} onClick={() => rapida(() => moverCorreos(h.ids, enArchivo ? "INBOX" : "ARCHIVO"))}>
            {enArchivo ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}
          </BotonBarra>
        ) : (
          <BotonBarra title="Restaurar" onClick={() => rapida(() => moverCorreos(h.ids, "INBOX"))}><RotateCcw className="size-3.5" /></BotonBarra>
        )}
        {!enPapelera ? (
          <BotonBarra title="Papelera" onClick={() => rapida(() => moverCorreos(h.ids, "PAPELERA"))}><Trash2 className="size-3.5" /></BotonBarra>
        ) : null}
        <BotonBarra title={noLeido ? "Marcar leído" : "Marcar no leído"} onClick={() => rapida(() => marcarLeidosCorreo(h.ids, noLeido))}>
          {noLeido ? <CheckCheck className="size-3.5" /> : <Mail className="size-3.5" />}
        </BotonBarra>
        <MenuPosponer ids={h.ids} quitar={carpeta === "pospuestos"} onHecho={() => router.refresh()} />
      </span>
    </li>
  );
}

// ── Piezas de la vista de HILO ──────────────────────────────────────────────

/** Marca leídos los mensajes del hilo al ABRIRLO (efecto cliente, no el render del servidor:
 *  el prefetch de Next marcaría leído medio buzón por asomarse). */
export function MarcarHiloLeido({ ids }: { ids: string[] }) {
  const idsRef = React.useRef(ids);
  React.useEffect(() => {
    if (idsRef.current.length) void marcarLeidosCorreo(idsRef.current, true);
  }, []);
  return null;
}

export function BotonesRespuesta({ prefills }: { prefills: { responder: PrefillCompositor; todos: PrefillCompositor | null; reenviar: PrefillCompositor } }) {
  const { abrir } = useCompositor();
  const cls = "inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className={cls} onClick={() => abrir(prefills.responder)}>↩️ Responder</button>
      {prefills.todos ? <button type="button" className={cls} onClick={() => abrir(prefills.todos!)}>↩️↩️ Responder a todos</button> : null}
      <button type="button" className={cls} onClick={() => abrir(prefills.reenviar)}>➡️ Reenviar</button>
    </div>
  );
}

export type ProyectoAsignable = { id: string; nombre: string };

export function BarraHilo({ ids, carpeta, volverHref, proyectos, proyectoActual, remitente }: {
  ids: string[];
  carpeta: string;
  volverHref: string;
  /** Proyectos donde este hilo se puede colgar (los del cliente detectado primero). */
  proyectos?: ProyectoAsignable[];
  proyectoActual?: { id: string; nombre: string } | null;
  /** Remitente del hilo, para la regla «siempre a este proyecto». */
  remitente?: string | null;
}) {
  const router = useRouter();
  const [pendiente, arranca] = React.useTransition();
  const mover = (destino: "ARCHIVO" | "PAPELERA" | "INBOX") =>
    arranca(async () => {
      await moverCorreos(ids, destino);
      router.push(volverHref, { scroll: false });
    });
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1 border-b border-border px-2">
      {/* En pantallas anchas la lista sigue visible al lado: «volver» solo hace falta abajo. */}
      <Link href={volverHref} scroll={false} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground xl:hidden" title="Volver">←</Link>
      {carpeta !== "papelera" ? (
        <>
          <BotonBarra title="Archivar" onClick={() => mover("ARCHIVO")}><Archive className="size-4" /></BotonBarra>
          <BotonBarra title="Enviar a la papelera" onClick={() => mover("PAPELERA")}><Trash2 className="size-4" /></BotonBarra>
        </>
      ) : (
        <BotonBarra title="Restaurar a Recibidos" onClick={() => mover("INBOX")}><RotateCcw className="size-4" /></BotonBarra>
      )}
      <BotonBarra title="Marcar como no leído" onClick={() => arranca(async () => { await marcarLeidosCorreo(ids, false); router.push(volverHref, { scroll: false }); })}>
        <Mail className="size-4" />
      </BotonBarra>
      {proyectos?.length || proyectoActual ? (
        <AsignarProyecto ids={ids} proyectos={proyectos ?? []} actual={proyectoActual ?? null} remitente={remitente ?? null} />
      ) : null}
      {pendiente ? <Loader2 className="ml-1 size-3.5 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}

// ── Colgar el hilo de un PROYECTO ───────────────────────────────────────────
// Asignar lo expone en la sección Correo de ese proyecto (decisión explícita de compartirlo)
// y lo que llegue después al hilo hereda solo. La casilla deja además la REGLA: todo lo
// futuro de este remitente cae directo en el proyecto.
function AsignarProyecto({ ids, proyectos, actual, remitente }: {
  ids: string[];
  proyectos: ProyectoAsignable[];
  actual: { id: string; nombre: string } | null;
  remitente: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [regla, setRegla] = React.useState(false);
  const [pendiente, arranca] = React.useTransition();

  const asigna = (projectId: string | null) =>
    arranca(async () => {
      await asignarProyectoHilo(ids, projectId, { reglaRemitente: regla ? remitente : null });
      setAbierto(false);
      router.refresh();
    });

  return (
    <span className="relative ml-1">
      <button type="button" onClick={() => setAbierto((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium",
          actual ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
        )}>
        <Clapperboard className="size-3.5" />
        {pendiente ? "Guardando…" : actual ? actual.nombre : "Asignar a proyecto"}
      </button>
      {abierto ? (
        <span className="absolute left-0 top-9 z-30 flex w-64 flex-col overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl">
          <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">El hilo se verá en el proyecto</span>
          <span className="max-h-48 overflow-y-auto">
            {proyectos.map((p) => (
              <button key={p.id} type="button" onClick={() => asigna(p.id)}
                className={cn("block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-muted", actual?.id === p.id && "font-bold text-primary")}>
                {p.nombre}
              </button>
            ))}
            {proyectos.length === 0 ? <span className="block px-3 py-2 text-[11.5px] text-muted-foreground">No hay proyectos vivos donde colgarlo.</span> : null}
          </span>
          {remitente ? (
            <label className="flex cursor-pointer items-center gap-2 border-t border-border px-3 py-2 text-[11.5px] text-muted-foreground">
              <input type="checkbox" checked={regla} onChange={(e) => setRegla(e.target.checked)} className="accent-primary" />
              Siempre para <b className="max-w-36 truncate">{remitente}</b>
            </label>
          ) : null}
          {actual ? (
            <button type="button" onClick={() => asigna(null)} className="border-t border-border px-3 py-1.5 text-left text-[12px] text-destructive hover:bg-muted">
              Quitar del proyecto
            </button>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
