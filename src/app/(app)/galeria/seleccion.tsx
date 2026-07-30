"use client";

import * as React from "react";
import { Check, ChevronRight, Copy, Download, FolderInput, Link2, Loader2, Pencil, ShieldOff, Trash2, X } from "lucide-react";
import { borrarGaleria, moverGaleria, renombrarGaleria } from "./herramientas-actions";
import { crearEnlaceSeleccion, revocarEnlaceSeleccion } from "./acciones";
import type { GaleriaFolder } from "@/lib/nas-galeria";

// ── Barra de selección ─────────────────────────────────────────────────────────
// Lo que faltaba para que la galería fuera algo más que un escaparate: poder tocar el
// material sin entrar al NAS por SMB. Aparece flotando abajo en cuanto hay algo marcado.
//
// Borrar NO destruye: manda a la papelera de red del NAS (#recycle), recuperable desde
// File Station. Por eso la confirmación avisa de dónde queda, en vez de dar el miedo
// genérico de «esto no se puede deshacer», que además sería mentira.

type Props = {
  seleccion: string[];
  // Peso total ya formateado («3,4 GB»). Importa al decidir: mover 12 piezas no dice nada,
  // mover 40 GB sí — sobre NFS eso es tiempo, y borrarlo es saber cuánto se recupera.
  peso?: string | null;
  onLimpiar: () => void;
  onHecho: () => void; // releer la carpeta: el material cambió
  puedeEscribir: boolean;
};

function nombreDe(rel: string): string {
  return rel.split("/").pop() || rel;
}

export function BarraSeleccion({ seleccion, peso, onLimpiar, onHecho, puedeEscribir }: Props) {
  const [ocupado, setOcupado] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogo, setDialogo] = React.useState<null | "borrar" | "mover" | "renombrar" | "compartir">(null);

  if (seleccion.length === 0) return null;
  const uno = seleccion.length === 1;

  const cerrar = () => {
    setDialogo(null);
    setError(null);
  };

  const tras = (r: { ok: true; hechos: number; fallos: string[] } | { error: string }) => {
    setOcupado(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    if (r.fallos.length > 0) {
      setError(`${r.hechos} listo(s). No se pudo con: ${r.fallos.slice(0, 3).join(" · ")}${r.fallos.length > 3 ? "…" : ""}`);
      onHecho();
      return;
    }
    cerrar();
    onLimpiar();
    onHecho();
  };

  const borrar = async () => {
    setOcupado(true);
    setError(null);
    tras(await borrarGaleria(seleccion));
  };

  const mover = async (destino: string) => {
    setOcupado(true);
    setError(null);
    tras(await moverGaleria(seleccion, destino));
  };

  const renombrar = async (nombre: string) => {
    setOcupado(true);
    setError(null);
    const r = await renombrarGaleria(seleccion[0]!, nombre);
    setOcupado(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    cerrar();
    onLimpiar();
    onHecho();
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl border bg-card/95 p-1.5 shadow-lg backdrop-blur">
          <span className="px-2 text-sm font-medium tabular-nums">
            {seleccion.length} {uno ? "seleccionado" : "seleccionados"}
            {peso && <span className="ml-1.5 font-normal text-muted-foreground">· {peso}</span>}
          </span>
          <span className="mx-0.5 h-5 w-px bg-border" />

          {uno ? (
            <a
              href={`/api/galeria/media?rel=${encodeURIComponent(seleccion[0]!)}&descargar=1`}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition hover:bg-accent"
              title="Descargar el original"
            >
              <Download className="size-4" /> Descargar
            </a>
          ) : (
            // Varias piezas → UN zip. Formulario de verdad, no fetch: la respuesta trae
            // Content-Disposition y Content-Length exacto, así que el navegador la baja con
            // su barra de progreso real sin que la página se mueva de donde está.
            <form method="POST" action="/api/galeria/zip" className="contents">
              <input type="hidden" name="rels" value={JSON.stringify(seleccion)} />
              <button type="submit" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition hover:bg-accent" title="Empaqueta los originales en un solo .zip">
                <Download className="size-4" /> Descargar .zip{peso ? ` (${peso})` : ""}
              </button>
            </form>
          )}

          <button
            onClick={() => setDialogo("compartir")}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition hover:bg-accent"
            title="Enlace para que el cliente vea SOLO estas piezas, sin cuenta"
          >
            <Link2 className="size-4" /> Compartir
          </button>

          {puedeEscribir && (
            <>
              {uno && (
                <button
                  onClick={() => setDialogo("renombrar")}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition hover:bg-accent"
                >
                  <Pencil className="size-4" /> Renombrar
                </button>
              )}
              <button
                onClick={() => setDialogo("mover")}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition hover:bg-accent"
              >
                <FolderInput className="size-4" /> Mover
              </button>
              <button
                onClick={() => setDialogo("borrar")}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-destructive transition hover:bg-destructive/10"
              >
                <Trash2 className="size-4" /> Borrar
              </button>
            </>
          )}

          <span className="mx-0.5 h-5 w-px bg-border" />
          <button onClick={onLimpiar} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-accent" title="Quitar la selección">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {dialogo === "borrar" && (
        <Modal titulo={uno ? "Borrar esta pieza" : `Borrar ${seleccion.length} piezas`} onCerrar={cerrar}>
          <p className="text-sm text-muted-foreground">
            {uno ? (
              <>
                Se moverá <strong className="text-foreground">{nombreDe(seleccion[0]!)}</strong> a la papelera de red del NAS.
              </>
            ) : (
              <>Se moverán {seleccion.length} elementos a la papelera de red del NAS.</>
            )}{" "}
            No se borra de verdad: se puede recuperar desde File Station.
          </p>
          {error && <Fallo texto={error} />}
          <div className="mt-4 flex justify-end gap-2">
            <Boton onClick={cerrar}>Cancelar</Boton>
            <Boton onClick={borrar} ocupado={ocupado} destructivo>
              Mover a la papelera
            </Boton>
          </div>
        </Modal>
      )}

      {dialogo === "mover" && (
        <Modal titulo={uno ? "Mover a…" : `Mover ${seleccion.length} elementos a…`} onCerrar={cerrar}>
          <SelectorCarpeta ocupado={ocupado} onElegir={mover} />
          {error && <Fallo texto={error} />}
          <div className="mt-4 flex justify-end">
            <Boton onClick={cerrar}>Cancelar</Boton>
          </div>
        </Modal>
      )}

      {dialogo === "renombrar" && (
        <Modal titulo="Renombrar" onCerrar={cerrar}>
          <FormRenombrar actual={nombreDe(seleccion[0]!)} ocupado={ocupado} onGuardar={renombrar} />
          {error && <Fallo texto={error} />}
        </Modal>
      )}

      {dialogo === "compartir" && <DialogoCompartir rels={seleccion} onCerrar={cerrar} />}
    </>
  );
}

// ── Compartir una selección con el cliente ─────────────────────────────────────
// El diseño aprobado (opción A): caducidad a elegir, UN enlace que abre la sala del cliente
// acotada a estas piezas, y botón de retirar ahí mismo. Lo usan la barra de selección y el
// visor (para compartir la pieza abierta sin pasar por la selección).

const DIAS_OPCIONES = [7, 30, 90] as const;

export function DialogoCompartir({ rels, onCerrar }: { rels: string[]; onCerrar: () => void }) {
  const [dias, setDias] = React.useState<number>(30);
  const [ocupado, setOcupado] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [listo, setListo] = React.useState<{ url: string; id: string } | null>(null);
  const [copiado, setCopiado] = React.useState(false);
  const [retirada, setRetirada] = React.useState(false);
  const una = rels.length === 1;

  const generar = async () => {
    setOcupado(true);
    setError(null);
    const r = await crearEnlaceSeleccion(rels, dias);
    setOcupado(false);
    if ("error" in r) return setError(r.error);
    setListo({ url: `${window.location.origin}${r.url}`, id: r.id ?? "" });
  };

  const retirar = async () => {
    if (!listo) return;
    setOcupado(true);
    setError(null);
    const r = await revocarEnlaceSeleccion(listo.id);
    setOcupado(false);
    if ("error" in r) return setError(r.error);
    setRetirada(true);
  };

  const copiar = async () => {
    if (!listo) return;
    try {
      await navigator.clipboard.writeText(listo.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setError("El navegador no dejó copiar; selecciona el enlace a mano.");
    }
  };

  return (
    <Modal titulo={una ? "Compartir esta pieza" : `Compartir ${rels.length} piezas`} onCerrar={onCerrar}>
      {retirada ? (
        <p className="text-sm text-muted-foreground">
          Enlace retirado: ya no abre. Si hace falta otro, genera uno nuevo desde la selección.
        </p>
      ) : listo ? (
        <>
          <div className="flex items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5">
            <input
              readOnly
              value={listo.url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent text-xs text-muted-foreground outline-none"
            />
            <button onClick={copiar} className="rounded-md p-1 transition hover:bg-accent" title="Copiar enlace">
              {copiado ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
            </button>
            <button onClick={retirar} disabled={ocupado} className="rounded-md p-1 transition hover:bg-accent" title="Retirar el acceso ya">
              <ShieldOff className="size-4 text-destructive" />
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Vence en {dias} días · quedó registrado quién lo generó. Retirarlo lo cierra al instante.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            El cliente ve <strong className="text-foreground">solo {una ? "esta pieza" : "estas piezas"}</strong>, sin cuenta, en su
            sala de siempre. El enlace se puede retirar cuando quieras.
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            {DIAS_OPCIONES.map((d) => (
              <button
                key={d}
                onClick={() => setDias(d)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  dias === d ? "border-primary/50 bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {d} días
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Boton onClick={onCerrar}>Cancelar</Boton>
            <Boton onClick={generar} ocupado={ocupado}>
              Generar enlace
            </Boton>
          </div>
        </>
      )}
      {error && <Fallo texto={error} />}
    </Modal>
  );
}

// ── Elegir carpeta destino ─────────────────────────────────────────────────────
// Un navegador, no un desplegable: el árbol tiene varios niveles y una lista plana con
// «Cliente/Entrega/Jornada 2» no se lee. Se entra carpeta a carpeta y se suelta donde toque.

function SelectorCarpeta({ onElegir, ocupado }: { onElegir: (rel: string) => void; ocupado: boolean }) {
  const [dir, setDir] = React.useState("");
  // Lo cargado se guarda CON la carpeta a la que pertenece, y «cargando» se deduce de que
  // esa carpeta no sea la actual. Así no hace falta un setState de reseteo dentro del
  // efecto —que dispara un renderizado en cascada— ni puede pintarse el contenido de una
  // carpeta bajo el nombre de otra si dos respuestas se cruzan.
  const [cargado, setCargado] = React.useState<{ dir: string; folders: GaleriaFolder[] } | null>(null);
  const subs = cargado && cargado.dir === dir ? cargado.folders : null;

  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/galeria/list?solo=carpetas&rel=${encodeURIComponent(dir)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new globalThis.Error("no se pudo leer"))))
      .then((d: { folders?: GaleriaFolder[] }) => {
        if (vivo) setCargado({ dir, folders: d.folders ?? [] });
      })
      .catch(() => {
        if (vivo) setCargado({ dir, folders: [] });
      });
    return () => {
      vivo = false;
    };
  }, [dir]);

  const tramos = dir ? dir.split("/") : [];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <button onClick={() => setDir("")} className="rounded px-1.5 py-0.5 transition hover:bg-accent hover:text-foreground">
          Entregas
        </button>
        {tramos.map((t, i) => (
          <React.Fragment key={`${t}-${i}`}>
            <ChevronRight className="size-3" />
            <button
              onClick={() => setDir(tramos.slice(0, i + 1).join("/"))}
              className="max-w-[12rem] truncate rounded px-1.5 py-0.5 transition hover:bg-accent hover:text-foreground"
            >
              {t}
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border">
        {subs === null ? (
          <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Leyendo…
          </p>
        ) : subs.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">Esta carpeta no tiene subcarpetas.</p>
        ) : (
          subs.map((f) => (
            <button
              key={f.rel}
              onClick={() => setDir(f.rel)}
              className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm transition last:border-0 hover:bg-accent"
            >
              <span className="truncate">{f.name}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {dir ? <>Destino: <strong className="text-foreground">{dir}</strong></> : "Elige una carpeta: en la raíz no se sueltan archivos."}
        </p>
        <Boton onClick={() => onElegir(dir)} ocupado={ocupado} disabled={!dir}>
          Mover aquí
        </Boton>
      </div>
    </div>
  );
}

function FormRenombrar({ actual, onGuardar, ocupado }: { actual: string; onGuardar: (n: string) => void; ocupado: boolean }) {
  const [valor, setValor] = React.useState(actual);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valor.trim() && valor !== actual) onGuardar(valor.trim());
      }}
    >
      <input
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/60"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">La extensión se conserva aunque no la escribas.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Boton type="submit" ocupado={ocupado} disabled={!valor.trim() || valor === actual}>
          Guardar
        </Boton>
      </div>
    </form>
  );
}

// ── Piezas sueltas de interfaz ─────────────────────────────────────────────────

function Modal({ titulo, children, onCerrar }: { titulo: string; children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-semibold">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

// No se llama `Error` a propósito: ese nombre sombrea al global, y dentro de este mismo
// archivo hay un `new Error(...)` que pasaría a apuntar al componente.
function Fallo({ texto }: { texto: string }) {
  return <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{texto}</p>;
}

function Boton({
  children,
  onClick,
  ocupado,
  destructivo,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ocupado?: boolean;
  destructivo?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={ocupado || disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
        destructivo ? "bg-destructive text-white hover:bg-destructive/90" : "border hover:bg-accent"
      }`}
    >
      {ocupado && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}
