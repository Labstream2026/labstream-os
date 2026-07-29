"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Folder, FolderPlus, Link2, ExternalLink, X, Loader2, AlertTriangle, Images } from "lucide-react";
import { cn } from "@/lib/utils";
import { tone } from "@/lib/colors";
import { crearCarpetaClienteGaleria } from "../galeria-actions";
import { vincularCarpetaCliente } from "@/app/(app)/galeria/herramientas-actions";

// ── Ajustes → «Carpeta en la Galería» ──
// La regla de la casa hecha tarjeta: todo cliente tiene su carpeta en la raíz de Entregas_LAB
// (LabTem) y de ella cuelgan las subcarpetas automáticas de sus proyectos. Aquí se ve cuál es
// (teñida con el color del cliente), se abre, se crea con un clic, se vincula una existente o
// se desvincula — sin tener que ir a la Galería a buscar el botón.

export type CarpetaDisponible = { rel: string; name: string; ocupadaPor: string | null };

export function ClientGaleria({
  clientId,
  clientName,
  color,
  folder,
  folderExists,
  puedeEscribir,
  escrituraLista,
  disponibles,
}: {
  clientId: string;
  clientName: string;
  color: string | null; // key de la paleta (accentColor): tiñe el chip de la carpeta
  folder: string | null; // rel vinculada dentro de la galería
  folderExists: boolean; // false = vinculada pero ya no está en el disco
  puedeEscribir: boolean; // escribir_discos + editar este cliente
  escrituraLista: boolean; // montaje rw + centinela en LabTem
  disponibles: CarpetaDisponible[]; // carpetas de la raíz, para «vincular una existente»
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [eligiendo, setEligiendo] = React.useState(false);
  const [confirmando, setConfirmando] = React.useState(false);

  const t = color ? tone(color) : null;

  const corre = (fn: () => Promise<{ error?: string } | { ok: true; rel?: string }>) => {
    setAviso(null);
    start(async () => {
      const r = await fn();
      if ("error" in r && r.error) setAviso(r.error);
      else router.refresh();
    });
  };

  const crear = () => corre(() => crearCarpetaClienteGaleria(clientId));
  const vincular = (rel: string) => {
    setEligiendo(false);
    if (rel) corre(() => vincularCarpetaCliente(clientId, rel));
  };
  const desvincular = () => {
    setConfirmando(false);
    corre(() => vincularCarpetaCliente(clientId, null));
  };

  const botonCls =
    "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";
  const soloLectura = !escrituraLista ? "La galería está en solo lectura (falta el montaje rw + el centinela en LabTem)." : undefined;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Images className="size-4 text-muted-foreground" /> Carpeta en la Galería
        </h3>
        {pending ? <Loader2 className="size-4 animate-spin opacity-60" /> : null}
      </div>

      {folder ? (
        <>
          {/* Carpeta vinculada: chip con el COLOR del cliente (así se pinta también en la Galería). */}
          <div className={cn("flex items-center gap-2.5 rounded-lg border p-3", t ? t.chip : "border-border bg-muted/40")}>
            <Folder className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{folder.replace(/_/g, " ")}</p>
              <p className="text-[11px] opacity-80">Sus proyectos crean subcarpetas automáticas aquí dentro.</p>
            </div>
            <Link
              href={`/galeria?rel=${encodeURIComponent(folder)}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-black/10 bg-background/60 px-2 py-1 text-[11px] font-medium hover:bg-background"
            >
              <ExternalLink className="size-3" /> Abrir
            </Link>
          </div>

          {!folderExists ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">La carpeta vinculada ya no está en el disco (¿la movieron por SMB?).</span>
              {puedeEscribir ? (
                <button type="button" onClick={crear} disabled={pending || !escrituraLista} title={soloLectura} className={botonCls}>
                  <FolderPlus className="size-3.5" /> Crearla de nuevo
                </button>
              ) : null}
            </div>
          ) : null}

          {puedeEscribir ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {eligiendo ? (
                <select
                  autoFocus
                  defaultValue=""
                  onChange={(e) => vincular(e.target.value)}
                  onBlur={() => setEligiendo(false)}
                  className="h-8 max-w-full rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="" disabled>¿A qué carpeta de la raíz se cambia?</option>
                  {disponibles
                    .filter((d) => d.rel !== folder)
                    .map((d) => (
                      <option key={d.rel} value={d.rel} disabled={!!d.ocupadaPor}>
                        {d.name.replace(/_/g, " ")}{d.ocupadaPor ? ` · de ${d.ocupadaPor}` : ""}
                      </option>
                    ))}
                </select>
              ) : (
                <button type="button" onClick={() => setEligiendo(true)} disabled={pending || !escrituraLista} title={soloLectura} className={botonCls}>
                  <Link2 className="size-3.5" /> Cambiar de carpeta
                </button>
              )}
              {confirmando ? (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  ¿Desvincular? El material no se toca, solo se suelta el vínculo.
                  <button type="button" onClick={desvincular} disabled={pending} className={cn(botonCls, "border-destructive/40 text-destructive hover:bg-destructive/10")}>Sí</button>
                  <button type="button" onClick={() => setConfirmando(false)} className={botonCls}>No</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmando(true)} disabled={pending} className={cn(botonCls, "text-muted-foreground")}>
                  <X className="size-3.5" /> Desvincular
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Sin carpeta vinculada. Todo cliente debería tener la suya en la <strong>raíz</strong> de la Galería: ahí vive el material
            de sus entregas y sus proyectos crean subcarpetas automáticas.
          </p>
          {puedeEscribir ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={crear}
                disabled={pending || !escrituraLista}
                title={soloLectura}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <FolderPlus className="size-3.5" />} Crear carpeta «{clientName}»
              </button>
              {eligiendo ? (
                <select
                  autoFocus
                  defaultValue=""
                  onChange={(e) => vincular(e.target.value)}
                  onBlur={() => setEligiendo(false)}
                  className="h-8 max-w-full rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="" disabled>¿Cuál carpeta de la raíz es de este cliente?</option>
                  {disponibles.map((d) => (
                    <option key={d.rel} value={d.rel} disabled={!!d.ocupadaPor}>
                      {d.name.replace(/_/g, " ")}{d.ocupadaPor ? ` · de ${d.ocupadaPor}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <button type="button" onClick={() => setEligiendo(true)} disabled={pending || !escrituraLista} title={soloLectura} className={botonCls}>
                  <Link2 className="size-3.5" /> Vincular una existente
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Para crearla o vincularla hace falta el permiso «Escribir en los discos».
            </p>
          )}
        </>
      )}

      {aviso ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {aviso}
          <button type="button" onClick={() => setAviso(null)} className="ml-2 underline">cerrar</button>
        </p>
      ) : null}
    </div>
  );
}

// ── Aviso en la FICHA (debajo de la portada) cuando el cliente aún no tiene carpeta ──
// La carpeta es «casi obligatoria»: este empujón conecta los clientes históricos con un clic.
// Solo lo ve quien puede actuar (escribir_discos + editar), y desaparece al crearla.
export function ClientGaleriaAviso({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [aviso, setAviso] = React.useState<string | null>(null);

  const crear = () => {
    setAviso(null);
    start(async () => {
      const r = await crearCarpetaClienteGaleria(clientId);
      if ("error" in r) setAviso(r.error);
      else router.refresh();
    });
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <Images className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        {aviso ?? <>Este cliente aún no tiene su carpeta en la Galería.</>}
      </span>
      <button
        type="button"
        onClick={crear}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <FolderPlus className="size-3.5" />} Crear carpeta «{clientName}»
      </button>
      <a href="#acceso" className="text-xs text-muted-foreground underline-offset-2 hover:underline">más opciones</a>
    </div>
  );
}
