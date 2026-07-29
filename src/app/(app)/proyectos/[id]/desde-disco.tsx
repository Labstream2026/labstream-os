"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HardDrive, Loader2, Film, Image as ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { piezasDeCarpetaProyecto, crearVersionDesdeDisco, type PiezaDisco } from "./version-disco-actions";

// «Desde el disco»: la versión del entregable apunta a un archivo que YA vive en la carpeta
// del proyecto en la galería (LabTem) — sin subir ni copiar nada. La sala de revisión lo
// reproduce por la copia ligera H.264 que fabricó LabTem, así que arranca al instante.
export function VersionDesdeDisco({ deliverableId, projectId }: { deliverableId: string; projectId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [carpeta, setCarpeta] = React.useState("");
  const [piezas, setPiezas] = React.useState<PiezaDisco[]>([]);
  const [elegida, setElegida] = React.useState<string | null>(null);
  const [notas, setNotas] = React.useState("");
  const [creando, setCreando] = React.useState(false);

  const abrir = async () => {
    setAbierto(true);
    setCargando(true);
    setError(null);
    const r = await piezasDeCarpetaProyecto(projectId);
    setCargando(false);
    if ("error" in r) return setError(r.error);
    setCarpeta(r.carpeta);
    // Video primero (es lo que se manda a corrección); las fotos quedan al final por si acaso.
    setPiezas([...r.piezas.filter((p) => p.video), ...r.piezas.filter((p) => !p.video)]);
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
        onClick={() => void abrir()}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        title="Elegir un archivo que ya está en la carpeta del proyecto en la galería (LabTem)"
      >
        <HardDrive className="size-4" /> Desde el disco
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">
          Material del proyecto en el disco{carpeta ? <span className="ml-1 font-normal text-muted-foreground">({carpeta})</span> : null}
        </p>
        <button type="button" onClick={() => setAbierto(false)} className="rounded p-1 hover:bg-accent">
          <X className="size-4" />
        </button>
      </div>

      {cargando ? (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Leyendo la carpeta del proyecto…
        </p>
      ) : error ? (
        <p className="py-2 text-sm text-destructive">{error}</p>
      ) : piezas.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">La carpeta del proyecto está vacía (o todavía no tiene videos).</p>
      ) : (
        <>
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {piezas.map((p) => (
              <label
                key={p.rel}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                  elegida === p.rel && "bg-accent font-medium",
                )}
              >
                <input type="radio" name="pieza" checked={elegida === p.rel} onChange={() => setElegida(p.rel)} className="accent-primary" />
                {p.video ? <Film className="size-4 shrink-0 text-muted-foreground" /> : <ImageIcon className="size-4 shrink-0 text-muted-foreground" />}
                <span className="truncate">{p.name}</span>
              </label>
            ))}
          </div>
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
