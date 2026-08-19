"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CheckCheck, Loader2, Mail, MailOpen, Paperclip, RotateCcw, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { estrellaCorreo, marcarLeidosCorreo, moverCorreos } from "./acciones";
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

export function ListaHilos({ hilos, carpeta }: { hilos: HiloVM[]; carpeta: string }) {
  const router = useRouter();
  const [sel, setSel] = React.useState<Set<string>>(new Set()); // claves de hilo
  const [pendiente, arranca] = React.useTransition();

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
            <span className="ml-1 text-[12px] font-semibold text-primary">
              {pendiente ? <Loader2 className="inline size-3.5 animate-spin" /> : `${sel.size} seleccionada${sel.size > 1 ? "s" : ""}`}
            </span>
          </>
        ) : (
          <span className="text-[11.5px] text-muted-foreground">{hilos.length} conversaciones</span>
        )}
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {hilos.map((h) => (
          <FilaHilo key={h.clave} h={h} marcada={sel.has(h.clave)} enPapelera={enPapelera} enArchivo={enArchivo}
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

function FilaHilo({ h, marcada, enPapelera, enArchivo, onMarcar }: {
  h: HiloVM; marcada: boolean; enPapelera: boolean; enArchivo: boolean; onMarcar: (on: boolean) => void;
}) {
  const router = useRouter();
  const [estrella, setEstrella] = React.useState(h.destacado);
  const [, arranca] = React.useTransition();
  const noLeido = h.noLeidos > 0;

  const rapida = (fn: () => Promise<unknown>) => arranca(async () => { await fn(); router.refresh(); });

  return (
    <li className={cn("group relative flex h-11 items-center gap-1.5 px-3 transition-colors hover:bg-accent/40", marcada && "bg-primary/5", noLeido && !marcada && "bg-card")}>
      <input type="checkbox" checked={marcada} onChange={(e) => onMarcar(e.target.checked)} className="mx-1.5 shrink-0 accent-primary" />
      <button
        type="button" aria-label={estrella ? "Quitar estrella" : "Destacar"}
        onClick={() => { setEstrella(!estrella); void estrellaCorreo(h.ultimoId, !estrella); }}
        className={cn("shrink-0 rounded p-1", estrella ? "text-amber-400" : "text-muted-foreground/50 hover:text-muted-foreground")}
      >
        <Star className="size-4" fill={estrella ? "currentColor" : "none"} />
      </button>
      <Link href={h.href} prefetch={false} scroll={false} className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn("w-40 shrink-0 truncate text-[13px]", noLeido ? "font-bold" : "text-muted-foreground")}>
          {h.quien}{h.n > 1 ? <span className="font-normal text-muted-foreground"> ({h.n})</span> : null}
        </span>
        {h.cliente ? (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${h.cliente.hex}22`, color: h.cliente.hex }}>
            {h.cliente.nombre}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[13px]">
          <span className={cn(noLeido && "font-bold")}>{h.asunto}</span>
          <span className="text-muted-foreground"> — {h.snippet}</span>
        </span>
        {h.conAdjunto ? <Paperclip className="size-3.5 shrink-0 text-muted-foreground" /> : null}
        <span className={cn("w-14 shrink-0 text-right text-[11px] tabular-nums group-hover:invisible", noLeido ? "font-bold text-primary" : "text-muted-foreground")}>
          {h.cuando}
        </span>
      </Link>
      {/* Acciones al pasar el ratón, como Gmail: sin abrir el hilo. */}
      <span className="absolute right-2 hidden items-center gap-0.5 bg-inherit group-hover:flex">
        {!enPapelera ? (
          <BotonBarra title={enArchivo ? "Devolver a Recibidos" : "Archivar"} onClick={() => rapida(() => moverCorreos(h.ids, enArchivo ? "INBOX" : "ARCHIVO"))}>
            {enArchivo ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}
          </BotonBarra>
        ) : (
          <BotonBarra title="Restaurar" onClick={() => rapida(() => moverCorreos(h.ids, "INBOX"))}><RotateCcw className="size-4" /></BotonBarra>
        )}
        {!enPapelera ? (
          <BotonBarra title="Papelera" onClick={() => rapida(() => moverCorreos(h.ids, "PAPELERA"))}><Trash2 className="size-4" /></BotonBarra>
        ) : null}
        <BotonBarra title={noLeido ? "Marcar leído" : "Marcar no leído"} onClick={() => rapida(() => marcarLeidosCorreo(h.ids, noLeido))}>
          {noLeido ? <CheckCheck className="size-4" /> : <Mail className="size-4" />}
        </BotonBarra>
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

export function BarraHilo({ ids, carpeta, volverHref }: { ids: string[]; carpeta: string; volverHref: string }) {
  const router = useRouter();
  const [pendiente, arranca] = React.useTransition();
  const mover = (destino: "ARCHIVO" | "PAPELERA" | "INBOX") =>
    arranca(async () => {
      await moverCorreos(ids, destino);
      router.push(volverHref, { scroll: false });
    });
  return (
    <div className="flex min-h-11 items-center gap-1 border-b border-border px-2">
      <Link href={volverHref} scroll={false} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Volver">←</Link>
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
      {pendiente ? <Loader2 className="ml-1 size-3.5 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}
