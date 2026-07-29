"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { HardDrive, Loader2, Film, Image as ImageIcon, X, Folder, Search, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  nivelDeCarpetaCliente,
  crearVersionDesdeDisco,
  crearEntregableDesdeDisco,
  type NivelCarpeta,
  type NivelPieza,
} from "./version-disco-actions";

// «Desde el disco»: el material YA vive en la carpeta del CLIENTE en la galería (LabTem) —
// sin subir ni copiar nada. La sala de revisión reproduce la copia ligera H.264 que fabricó
// LabTem, así que arranca al instante.
//
// El selector es un MODAL centrado que navega por carpetas (migas + subcarpetas clicables +
// buscador del nivel), no una lista plana: el disco del cliente se recorre con el mismo orden
// con el que el equipo lo guardó. Va por portal a <body>: nunca queda dentro del <form> del
// panel (un Enter en sus campos no dispara el submit ajeno) ni lo recorta un overflow.
//
// Dos puertas comparten el modal:
//  · CrearDesdeDisco   — crear el entregable NUEVO con su v1 apuntando al NAS (un paso).
//  · VersionDesdeDisco — añadir una versión a un entregable existente.

// ── Estado del nivel actual (carpeta que se está mirando) ──
function useNivel(projectId: string, abierto: boolean) {
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [base, setBase] = React.useState("");
  const [rel, setRel] = React.useState("");
  const [carpetas, setCarpetas] = React.useState<NivelCarpeta[]>([]);
  const [piezas, setPiezas] = React.useState<NivelPieza[]>([]);

  const cargar = React.useCallback(
    async (destino: string | null) => {
      setCargando(true);
      setError(null);
      const r = await nivelDeCarpetaCliente(projectId, destino);
      setCargando(false);
      if ("error" in r) return setError(r.error);
      setBase(r.base);
      setRel(r.rel);
      setCarpetas(r.carpetas);
      setPiezas(r.piezas);
    },
    [projectId],
  );

  // Al abrir, siempre desde la carpeta base del cliente (estado fresco).
  React.useEffect(() => {
    if (abierto) void cargar(null);
  }, [abierto, cargar]);

  return { cargando, error, setError, base, rel, carpetas, piezas, navegar: (destino: string | null) => void cargar(destino) };
}

function fechaCorta(ms: number): string {
  return new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

// ── El cascarón del modal (overlay + panel centrado, por portal) ──
function ModalDisco({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  children,
  footer,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  subtitulo: string | null;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => setMontado(true), []);
  React.useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, onCerrar]);

  if (!abierto || !montado) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HardDrive className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{titulo}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {subtitulo ? <>Carpeta del cliente en LabTem · {subtitulo.replace(/_/g, " ")}</> : "Galería de entregas (LabTem)"}
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        {children}
        <div className="border-t border-border bg-muted/30 px-4 py-3">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

// ── Cuerpo compartido: migas + buscador + carpetas + piezas ──
function CuerpoDisco({
  nivel,
  elegida,
  onElegir,
}: {
  nivel: ReturnType<typeof useNivel>;
  elegida: NivelPieza | null;
  onElegir: (p: NivelPieza) => void;
}) {
  const { cargando, error, base, rel, carpetas, piezas, navegar } = nivel;
  const [filtro, setFiltro] = React.useState("");
  // El filtro es DEL NIVEL: al cambiar de carpeta se limpia para no «esconder» contenido.
  React.useEffect(() => setFiltro(""), [rel]);

  if (cargando) {
    return (
      <div className="flex flex-1 items-center justify-center py-14">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Leyendo la carpeta del cliente…
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex-1 px-4 py-8">
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">{error}</p>
      </div>
    );
  }

  const baseNombre = (base.split("/").pop() || base).replace(/_/g, " ");
  const dentro = rel.length > base.length ? rel.slice(base.length + 1).split("/") : [];
  const f = filtro.trim().toLowerCase();
  const carpetasVisibles = f ? carpetas.filter((c) => c.name.toLowerCase().includes(f)) : carpetas;
  const piezasVisibles = f ? piezas.filter((p) => p.name.toLowerCase().includes(f)) : piezas;

  return (
    <>
      <div className="space-y-2 px-4 pt-3">
        {/* Migas: la base del cliente y el camino hacia abajo */}
        <div className="flex flex-wrap items-center gap-0.5 text-xs">
          <button
            type="button"
            onClick={() => navegar(null)}
            className={cn("max-w-[12rem] truncate rounded px-1.5 py-0.5 hover:bg-accent", dentro.length === 0 ? "font-semibold" : "text-muted-foreground")}
          >
            {baseNombre}
          </button>
          {dentro.map((seg, i) => {
            const destino = `${base}/${dentro.slice(0, i + 1).join("/")}`;
            const ultimo = i === dentro.length - 1;
            return (
              <React.Fragment key={destino}>
                <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
                <button
                  type="button"
                  onClick={() => navegar(destino)}
                  className={cn("max-w-[11rem] truncate rounded px-1.5 py-0.5 hover:bg-accent", ultimo ? "font-semibold" : "text-muted-foreground")}
                >
                  {seg.replace(/_/g, " ")}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <label className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar en esta carpeta…"
            className="w-full bg-transparent py-1.5 text-sm outline-none"
          />
        </label>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
        {carpetasVisibles.length === 0 && piezasVisibles.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {f ? <>Nada coincide con «{filtro}».</> : "Esta carpeta está vacía (ni videos ni subcarpetas)."}
          </p>
        ) : (
          <>
            {carpetasVisibles.map((c) => (
              <button
                key={c.rel}
                type="button"
                onClick={() => navegar(c.rel)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
              >
                <Folder className="size-4 shrink-0 text-amber-500/80" />
                <span className="min-w-0 flex-1 truncate font-medium">{c.name.replace(/_/g, " ")}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
              </button>
            ))}
            {piezasVisibles.length > 0 ? (
              <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Material de esta carpeta
              </p>
            ) : null}
            {piezasVisibles.map((p) => {
              const on = elegida?.rel === p.rel;
              return (
                <button
                  key={p.rel}
                  type="button"
                  onClick={() => onElegir(p)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm",
                    on ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : "hover:bg-accent",
                  )}
                >
                  {p.video ? (
                    <Film className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
                  ) : (
                    <ImageIcon className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
                  )}
                  <span className={cn("min-w-0 flex-1 truncate", on && "font-medium")}>{p.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{fechaCorta(p.mtimeMs)}</span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}

// ── Crear el entregable NUEVO desde el disco (un paso) ──
// El pie del modal pide lo mínimo: nombre (se prellena con el del archivo), tipo y notas.
export function CrearDesdeDisco({
  projectId,
  tipos,
  estiloTab,
}: {
  projectId: string;
  tipos: [string, string][];
  // true = el disparador se pinta como una pestaña más del grupo «¿De dónde sale el material?»
  estiloTab?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const nivel = useNivel(projectId, abierto);
  const [elegida, setElegida] = React.useState<NivelPieza | null>(null);
  const [nombre, setNombre] = React.useState("");
  const [nombreTocado, setNombreTocado] = React.useState(false);
  const [tipo, setTipo] = React.useState(tipos[0]?.[0] ?? "REEL");
  const [notas, setNotas] = React.useState("");
  const [creando, setCreando] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);

  const cerrar = () => {
    setAbierto(false);
    setElegida(null);
    setNombre("");
    setNombreTocado(false);
    setNotas("");
    setAviso(null);
  };

  const elegir = (p: NivelPieza) => {
    setElegida(p);
    // El nombre del archivo (sin extensión) casi siempre ES el nombre de la pieza: se
    // prellena mientras el editor no haya escrito el suyo.
    if (!nombreTocado) setNombre(p.name.replace(/\.[^.]+$/, "").replace(/_/g, " "));
  };

  const crear = async () => {
    if (!elegida || !nombre.trim() || creando) return;
    setCreando(true);
    setAviso(null);
    const r = await crearEntregableDesdeDisco(projectId, elegida.rel, nombre, tipo, notas);
    setCreando(false);
    if ("error" in r) return setAviso(r.error);
    cerrar();
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Crear el entregable eligiendo un video que ya está en la carpeta del cliente (LabTem) — sin subir nada"
        className={
          estiloTab
            ? "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            : "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        }
      >
        <HardDrive className={estiloTab ? "size-3.5" : "size-4"} /> Desde el disco{estiloTab ? "" : " (galería)"}
      </button>

      <ModalDisco
        abierto={abierto}
        onCerrar={cerrar}
        titulo="Crear entregable desde el disco"
        subtitulo={nivel.base || null}
        footer={
          <div className="space-y-2">
            {aviso ? <p className="text-xs text-destructive">{aviso}</p> : null}
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-44 flex-1 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                Nombre del entregable
                <input
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    setNombreTocado(true);
                  }}
                  placeholder="Se prellena al elegir el archivo…"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                Tipo
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground">
                  {tipos.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Notas de la v1 (opcional)"
                className="min-w-36 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {elegida ? <>Elegido: <span className="font-medium text-foreground">{elegida.name}</span></> : "Elige un video de la lista."}
              </p>
              <button
                type="button"
                onClick={() => void crear()}
                disabled={!elegida || !nombre.trim() || creando}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creando ? <Loader2 className="size-4 animate-spin" /> : <HardDrive className="size-4" />} Crear y mandar a pre-aprobación
              </button>
            </div>
          </div>
        }
      >
        <CuerpoDisco nivel={nivel} elegida={elegida} onElegir={elegir} />
      </ModalDisco>
    </>
  );
}

// ── Añadir VERSIÓN a un entregable existente desde el disco ──
export function VersionDesdeDisco({ deliverableId, projectId }: { deliverableId: string; projectId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const nivel = useNivel(projectId, abierto);
  const [elegida, setElegida] = React.useState<NivelPieza | null>(null);
  const [notas, setNotas] = React.useState("");
  const [creando, setCreando] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);

  const cerrar = () => {
    setAbierto(false);
    setElegida(null);
    setNotas("");
    setAviso(null);
  };

  const crear = async () => {
    if (!elegida || creando) return;
    setCreando(true);
    setAviso(null);
    const r = await crearVersionDesdeDisco(deliverableId, projectId, elegida.rel, notas);
    setCreando(false);
    if ("error" in r) return setAviso(r.error);
    cerrar();
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        title="Elegir un archivo que ya está en la carpeta del cliente en la galería (LabTem)"
      >
        <HardDrive className="size-4" /> Desde el disco
      </button>

      <ModalDisco
        abierto={abierto}
        onCerrar={cerrar}
        titulo="Nueva versión desde el disco"
        subtitulo={nivel.base || null}
        footer={
          <div className="space-y-2">
            {aviso ? <p className="text-xs text-destructive">{aviso}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="¿Qué cambió en esta versión?"
                className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => void crear()}
                disabled={!elegida || creando}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creando ? <Loader2 className="size-4 animate-spin" /> : <HardDrive className="size-4" />} Usar este archivo
              </button>
            </div>
          </div>
        }
      >
        <CuerpoDisco nivel={nivel} elegida={elegida} onElegir={setElegida} />
      </ModalDisco>
    </>
  );
}
