"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { HardDrive, Loader2, Film, Image as ImageIcon, FileText, X, Folder, FolderPlus, Upload, Search, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  nivelDeCarpetaCliente,
  crearVersionDesdeDisco,
  crearEntregableDesdeDisco,
  crearCarpetaExplorador,
  subirArchivoExplorador,
  crearCarpetaDelProyecto,
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
  const [escritura, setEscritura] = React.useState(false);
  const [proyecto, setProyecto] = React.useState<{ rel: string; existe: boolean } | null>(null);

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
      setEscritura(r.escritura);
      setProyecto(r.proyecto);
    },
    [projectId],
  );

  // Al abrir, siempre desde la carpeta base del cliente (estado fresco).
  React.useEffect(() => {
    if (abierto) void cargar(null);
  }, [abierto, cargar]);

  return {
    cargando,
    error,
    setError,
    base,
    rel,
    carpetas,
    piezas,
    escritura,
    proyecto,
    navegar: (destino: string | null) => void cargar(destino),
    // Releer el nivel actual sin moverse (tras subir o crear carpeta).
    recargar: () => void cargar(rel || null),
  };
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

// ── Cuerpo compartido: migas + buscador + herramientas + carpetas + piezas ──
function CuerpoDisco({
  projectId,
  nivel,
  elegida,
  onElegir,
}: {
  projectId: string;
  nivel: ReturnType<typeof useNivel>;
  elegida: NivelPieza | null;
  onElegir: (p: NivelPieza) => void;
}) {
  const { cargando, error, base, rel, carpetas, piezas, escritura, proyecto, navegar, recargar } = nivel;
  const [filtro, setFiltro] = React.useState("");
  // El filtro es DEL NIVEL: al cambiar de carpeta se limpia para no «esconder» contenido.
  React.useEffect(() => setFiltro(""), [rel]);

  // ── Escritura: subir aquí + nueva carpeta (solo con permiso; el servidor re-verifica) ──
  const [avisoNivel, setAvisoNivel] = React.useState<string | null>(null);
  React.useEffect(() => setAvisoNivel(null), [rel]);
  const archivoRef = React.useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = React.useState<{ hecho: number; total: number } | null>(null);
  const subirArchivos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAvisoNivel(null);
    setSubiendo({ hecho: 0, total: files.length });
    const errores: string[] = [];
    // De a UNO por petición: el body de una server action aguanta 100 MB, no un lote entero.
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.set("file", f);
      try {
        const r = await subirArchivoExplorador(projectId, rel, fd);
        if ("error" in r) errores.push(`«${f.name}»: ${r.error}`);
      } catch {
        errores.push(`«${f.name}» no se pudo subir (¿conexión cortada?).`);
      }
      setSubiendo((s) => (s ? { hecho: s.hecho + 1, total: s.total } : s));
    }
    setSubiendo(null);
    if (archivoRef.current) archivoRef.current.value = "";
    setAvisoNivel(errores.length ? errores.join(" · ") : `Listo: ${files.length === 1 ? "1 archivo subido" : `${files.length} archivos subidos`} a esta carpeta.`);
    recargar();
  };

  const [creandoCarpeta, setCreandoCarpeta] = React.useState(false);
  const [nombreCarpeta, setNombreCarpeta] = React.useState("");
  const [ocupadoCarpeta, setOcupadoCarpeta] = React.useState(false);
  const crearCarpeta = async () => {
    const n = nombreCarpeta.trim();
    if (!n || ocupadoCarpeta) return;
    setOcupadoCarpeta(true);
    setAvisoNivel(null);
    const r = await crearCarpetaExplorador(projectId, rel, n);
    setOcupadoCarpeta(false);
    if ("error" in r) return setAvisoNivel(r.error);
    setCreandoCarpeta(false);
    setNombreCarpeta("");
    navegar(r.rel); // entrar a la carpeta recién creada: lo siguiente es subirle contenido
  };

  // La subcarpeta del PROYECTO, creada desde aquí (para proyectos anteriores al alta automática).
  const [creandoProyecto, setCreandoProyecto] = React.useState(false);
  const crearDelProyecto = async () => {
    if (creandoProyecto) return;
    setCreandoProyecto(true);
    setAvisoNivel(null);
    const r = await crearCarpetaDelProyecto(projectId);
    setCreandoProyecto(false);
    if ("error" in r) return setAvisoNivel(r.error);
    navegar(r.rel);
  };

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
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex min-w-40 flex-1 items-center gap-1.5 rounded-md border border-input bg-background px-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar en esta carpeta…"
              className="w-full bg-transparent py-1.5 text-sm outline-none"
            />
          </label>
          {escritura ? (
            <>
              <button
                type="button"
                onClick={() => setCreandoCarpeta((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                title="Crear una subcarpeta aquí (p. ej. «Guiones»)"
              >
                <FolderPlus className="size-3.5" /> Nueva carpeta
              </button>
              <button
                type="button"
                onClick={() => archivoRef.current?.click()}
                disabled={!!subiendo}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                title="Subir guiones, PDFs o material a ESTA carpeta (hasta 100 MB por archivo; lo pesado va por SMB)"
              >
                {subiendo ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {subiendo ? `Subiendo ${subiendo.hecho}/${subiendo.total}…` : "Subir aquí"}
              </button>
              <input ref={archivoRef} type="file" multiple className="hidden" onChange={(e) => void subirArchivos(e.target.files)} />
            </>
          ) : null}
        </div>
        {creandoCarpeta ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={nombreCarpeta}
              onChange={(e) => setNombreCarpeta(e.target.value)}
              onKeyDown={(e) => {
                // Enter crea; Escape cierra el input SIN cerrar el modal.
                if (e.key === "Enter") void crearCarpeta();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setCreandoCarpeta(false);
                }
              }}
              placeholder="Nombre de la carpeta (p. ej. Guiones)…"
              className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => void crearCarpeta()}
              disabled={!nombreCarpeta.trim() || ocupadoCarpeta}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {ocupadoCarpeta ? <Loader2 className="size-3.5 animate-spin" /> : <FolderPlus className="size-3.5" />} Crear
            </button>
          </div>
        ) : null}
        {proyecto && rel === base && proyecto.rel !== base ? (
          proyecto.existe ? (
            <button
              type="button"
              onClick={() => navegar(proyecto.rel)}
              className="flex w-full items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
            >
              <Folder className="size-3.5" /> Ir a la carpeta de este proyecto
              <ChevronRight className="ml-auto size-3.5" />
            </button>
          ) : escritura ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1">Este proyecto aún no tiene su subcarpeta en el disco.</span>
              <button
                type="button"
                onClick={() => void crearDelProyecto()}
                disabled={creandoProyecto}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/40 bg-background px-2 py-1 font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                {creandoProyecto ? <Loader2 className="size-3.5 animate-spin" /> : <FolderPlus className="size-3.5" />} Crearla
              </button>
            </div>
          ) : null
        ) : null}
        {avisoNivel ? <p className="text-[11px] text-muted-foreground">{avisoNivel}</p> : null}
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
              // Un PAPEL (guion, PDF, hoja) vive aquí y se sube desde aquí, pero no se manda a
              // revisión: la sala solo reproduce video y foto. Se pinta sin selección.
              if (p.doc) {
                return (
                  <div
                    key={p.rel}
                    title="Los papeles del proyecto viven aquí; a revisión solo van videos y fotos."
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground/60" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">{fechaCorta(p.mtimeMs)}</span>
                  </div>
                );
              }
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
  estiloHero,
}: {
  projectId: string;
  tipos: [string, string][];
  // true = el disparador es la puerta GRANDE por defecto del formulario «Subir para revisión»
  // (tarjeta hero naranja); false = botón normal (donde se use suelto).
  estiloHero?: boolean;
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
      {estiloHero ? (
        /* La puerta por defecto: una tarjeta, un clic. El modal que abre ya pide nombre, tipo
           y notas — por eso en modo galería el formulario de fuera no muestra ningún campo. */
        <button
          type="button"
          onClick={() => setAbierto(true)}
          title="Crear el entregable eligiendo un video que ya está en la carpeta del cliente (LabTem) — sin subir nada"
          className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-[#F47A20]/50 bg-[#F47A20]/5 px-4 py-3.5 text-left transition-colors hover:border-[#F47A20] hover:bg-[#F47A20]/10"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#F47A20]/15">
            <HardDrive className="size-5 text-[#F47A20]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Elegir de la galería del cliente</span>
            <span className="block text-xs text-muted-foreground">
              El video ya vive en LabTem: se elige, se le pone nombre y arranca al instante — sin subir nada.
            </span>
          </span>
          <span className="hidden shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground group-hover:opacity-90 sm:inline-flex">
            Abrir la galería
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          title="Crear el entregable eligiendo un video que ya está en la carpeta del cliente (LabTem) — sin subir nada"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          <HardDrive className="size-4" /> Desde el disco (galería)
        </button>
      )}

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
        <CuerpoDisco projectId={projectId} nivel={nivel} elegida={elegida} onElegir={elegir} />
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
        <CuerpoDisco projectId={projectId} nivel={nivel} elegida={elegida} onElegir={setElegida} />
      </ModalDisco>
    </>
  );
}
