"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HardDrive, Loader2, Film, Image as ImageIcon, X, Folder, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  piezasDeCarpetaProyecto,
  crearVersionDesdeDisco,
  crearEntregableDesdeDisco,
  type PiezaDisco,
} from "./version-disco-actions";

// «Desde el disco»: el material YA vive en la carpeta del CLIENTE en la galería (LabTem) —
// sin subir ni copiar nada. La sala de revisión reproduce la copia ligera H.264 que fabricó
// LabTem, así que arranca al instante. Dos puertas comparten este selector:
//  · VersionDesdeDisco — añadir una versión a un entregable existente.
//  · CrearDesdeDisco   — crear el entregable NUEVO con su v1 apuntando al NAS (un paso).

// ── Selector compartido: lista con subcarpeta + buscador ──
function usePiezas(projectId: string) {
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [carpeta, setCarpeta] = React.useState("");
  const [piezas, setPiezas] = React.useState<PiezaDisco[]>([]);

  const cargar = React.useCallback(async () => {
    setCargando(true);
    setError(null);
    const r = await piezasDeCarpetaProyecto(projectId);
    setCargando(false);
    if ("error" in r) return setError(r.error);
    setCarpeta(r.carpeta);
    setPiezas(r.piezas); // ya vienen videos primero desde el servidor
  }, [projectId]);

  return { cargando, error, setError, carpeta, piezas, cargar };
}

function ListaPiezas({
  piezas,
  elegida,
  onElegir,
}: {
  piezas: PiezaDisco[];
  elegida: string | null;
  onElegir: (p: PiezaDisco) => void;
}) {
  const [filtro, setFiltro] = React.useState("");
  const f = filtro.trim().toLowerCase();
  const visibles = f
    ? piezas.filter((p) => p.name.toLowerCase().includes(f) || p.dir.toLowerCase().includes(f))
    : piezas;

  return (
    <>
      {piezas.length > 8 ? (
        <label className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar por nombre o subcarpeta…"
            className="w-full bg-transparent py-1.5 text-sm outline-none"
          />
        </label>
      ) : null}
      <div className="max-h-64 space-y-0.5 overflow-y-auto">
        {visibles.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nada coincide con «{filtro}».</p>
        ) : (
          visibles.map((p) => (
            <label
              key={p.rel}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                elegida === p.rel && "bg-accent font-medium",
              )}
            >
              <input type="radio" name="pieza" checked={elegida === p.rel} onChange={() => onElegir(p)} className="accent-primary" />
              {p.video ? <Film className="size-4 shrink-0 text-muted-foreground" /> : <ImageIcon className="size-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.dir ? (
                <span className="inline-flex max-w-[11rem] shrink-0 items-center gap-1 truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title={p.dir}>
                  <Folder className="size-3 shrink-0" /> <span className="truncate">{p.dir.replace(/_/g, " ")}</span>
                </span>
              ) : null}
            </label>
          ))
        )}
      </div>
    </>
  );
}

// ── Añadir VERSIÓN a un entregable existente desde el disco ──
export function VersionDesdeDisco({ deliverableId, projectId }: { deliverableId: string; projectId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const { cargando, error, setError, carpeta, piezas, cargar } = usePiezas(projectId);
  const [elegida, setElegida] = React.useState<string | null>(null);
  const [notas, setNotas] = React.useState("");
  const [creando, setCreando] = React.useState(false);

  const abrir = () => {
    setAbierto(true);
    void cargar();
  };

  const crear = async () => {
    if (!elegida) return;
    setCreando(true);
    setError(null);
    const r = await crearVersionDesdeDisco(deliverableId, projectId, elegida, notas);
    setCreando(false);
    if ("error" in r) return setError(r.error);
    setAbierto(false);
    setElegida(null);
    setNotas("");
    router.refresh();
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        title="Elegir un archivo que ya está en la carpeta del cliente en la galería (LabTem)"
      >
        <HardDrive className="size-4" /> Desde el disco
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">
          Material del cliente en el disco{carpeta ? <span className="ml-1 font-normal text-muted-foreground">({carpeta})</span> : null}
        </p>
        <button type="button" onClick={() => setAbierto(false)} className="rounded p-1 hover:bg-accent">
          <X className="size-4" />
        </button>
      </div>

      {cargando ? (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Leyendo la carpeta del cliente…
        </p>
      ) : error ? (
        <p className="py-2 text-sm text-destructive">{error}</p>
      ) : piezas.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">La carpeta del cliente está vacía (o todavía no tiene videos).</p>
      ) : (
        <>
          <ListaPiezas piezas={piezas} elegida={elegida} onElegir={(p) => setElegida(p.rel)} />
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="¿Qué cambió en esta versión?"
              className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => void crear()}
              disabled={!elegida || creando}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creando ? <Loader2 className="size-4 animate-spin" /> : <HardDrive className="size-4" />} Usar este archivo
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Crear el entregable NUEVO desde el disco (un paso) ──
// Vive en la tarjeta «Subir para revisión»: elegir el video de la carpeta del cliente,
// nombre (se prellena con el del archivo) y tipo → v1 directa a pre-aprobación interna.
export function CrearDesdeDisco({ projectId, tipos }: { projectId: string; tipos: [string, string][] }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const { cargando, error, setError, carpeta, piezas, cargar } = usePiezas(projectId);
  const [elegida, setElegida] = React.useState<string | null>(null);
  const [nombre, setNombre] = React.useState("");
  const [nombreTocado, setNombreTocado] = React.useState(false);
  const [tipo, setTipo] = React.useState(tipos[0]?.[0] ?? "REEL");
  const [notas, setNotas] = React.useState("");
  const [creando, setCreando] = React.useState(false);

  const abrir = () => {
    setAbierto(true);
    void cargar();
  };

  const elegir = (p: PiezaDisco) => {
    setElegida(p.rel);
    // El nombre del archivo (sin extensión) es casi siempre el nombre de la pieza: se
    // prellena mientras el editor no haya escrito el suyo.
    if (!nombreTocado) setNombre(p.name.replace(/\.[^.]+$/, "").replace(/_/g, " "));
  };

  const crear = async () => {
    if (!elegida || !nombre.trim()) return;
    setCreando(true);
    setError(null);
    const r = await crearEntregableDesdeDisco(projectId, elegida, nombre, tipo, notas);
    setCreando(false);
    if ("error" in r) return setError(r.error);
    setAbierto(false);
    setElegida(null);
    setNombre("");
    setNombreTocado(false);
    setNotas("");
    router.refresh();
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        title="Crear el entregable eligiendo un video que ya está en la carpeta del cliente (LabTem) — sin subir nada"
      >
        <HardDrive className="size-4" /> Desde el disco (galería)
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">
          Crear entregable desde el disco{carpeta ? <span className="ml-1 font-normal text-muted-foreground">({carpeta})</span> : null}
        </p>
        <button type="button" onClick={() => setAbierto(false)} className="rounded p-1 hover:bg-accent">
          <X className="size-4" />
        </button>
      </div>

      {cargando ? (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Leyendo la carpeta del cliente…
        </p>
      ) : error ? (
        <p className="py-2 text-sm text-destructive">{error}</p>
      ) : piezas.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">La carpeta del cliente está vacía (o todavía no tiene videos).</p>
      ) : (
        <>
          <ListaPiezas piezas={piezas} elegida={elegida} onElegir={elegir} />
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
            <label className="flex min-w-44 flex-1 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Nombre del entregable
              <input
                value={nombre}
                onChange={(e) => {
                  setNombre(e.target.value);
                  setNombreTocado(true);
                }}
                placeholder="Se prellena al elegir el archivo…"
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground">
                {tipos.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas de la v1 (opcional)"
              className="min-w-36 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => void crear()}
              disabled={!elegida || !nombre.trim() || creando}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creando ? <Loader2 className="size-4 animate-spin" /> : <HardDrive className="size-4" />} Crear y mandar a pre-aprobación
            </button>
          </div>
        </>
      )}
    </div>
  );
}
