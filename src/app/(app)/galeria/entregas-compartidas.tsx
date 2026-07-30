"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldOff, ShieldCheck, Eye, AlertTriangle, ChevronDown, Share2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { revocarEnlaceEntrega, reactivarEnlaceEntrega, olvidarEnlaceEntrega } from "./acciones";

export type EntregaVista = {
  folderRel: string;
  titulo: string;
  version: number;
  revocada: boolean;
  visitas: number;
  ultimaVisita: string | null; // ISO
  huerfana: boolean;
};

// Lo que se le ha compartido a los clientes, en un solo sitio. Antes esto no existía: el estado
// de una entrega solo se veía estando dentro de su carpeta, y una entrega cuya carpeta se
// renombró por SMB no se veía en ninguna parte — su revocación quedaba viva pero muda.
export function EntregasCompartidas({ entregas }: { entregas: EntregaVista[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  if (!entregas.length) return null;

  const huerfanas = entregas.filter((e) => e.huerfana);
  const vivas = entregas.filter((e) => !e.huerfana);

  return (
    // El id es el ancla del pie del índice («Entregas compartidas →»): un clic baja hasta aquí.
    <section id="entregas-compartidas" className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Cabecera con la misma identidad que los desplegables del Resumen del proyecto:
          tile de color + dato clave legible SIN abrir (cuántas, visitas, huérfanas). */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10">
          <Share2 className="size-[18px] text-sky-600 dark:text-sky-400" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-tight">
            Entregas compartidas
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-bold tabular-nums text-muted-foreground">{entregas.length}</span>
            {huerfanas.length ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                <AlertTriangle className="size-3" />
                {huerfanas.length} sin carpeta
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
            {entregas.reduce((n, e) => n + e.visitas, 0)} visitas en total · lo que los clientes tienen (o tuvieron) abierto
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
      </button>

      {abierto ? (
        <ul className="divide-y divide-border border-t border-border">
          {[...huerfanas, ...vivas].map((e) => (
            <li key={e.folderRel} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {e.titulo}
                  {e.revocada ? (
                    <span className="rounded-full bg-destructive/10 px-1.5 py-px text-[10px] font-semibold text-destructive">retirada</span>
                  ) : null}
                  {e.version > 1 ? (
                    <span
                      className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                      title={`Se ha compartido ${e.version} veces; los ${e.version - 1} enlaces anteriores ya no abren`}
                    >
                      v{e.version}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Eye className="size-3" />
                    {e.visitas === 0 ? "sin abrir todavía" : `${e.visitas} ${e.visitas === 1 ? "visita" : "visitas"}`}
                  </span>
                  {e.ultimaVisita ? <span>última: {new Date(e.ultimaVisita).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span> : null}
                  {e.huerfana ? (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                      <AlertTriangle className="size-3" />
                      la carpeta ya no está en LabTem — ¿la movieron o renombraron?
                    </span>
                  ) : (
                    <span className="truncate font-mono opacity-70">{e.folderRel}</span>
                  )}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {!e.huerfana ? (
                  <Link href={`/galeria?rel=${encodeURIComponent(e.folderRel)}`} className="text-xs text-primary hover:underline">
                    Abrir
                  </Link>
                ) : null}
                {e.revocada ? (
                  <form
                    action={async () => {
                      await reactivarEnlaceEntrega(e.folderRel);
                      router.refresh();
                    }}
                  >
                    <SubmitButton
                      pendingText="…"
                      title="Vuelve a abrir con el último enlace compartido (no genera uno nuevo)"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
                    >
                      <ShieldCheck className="size-3.5" /> Reactivar
                    </SubmitButton>
                  </form>
                ) : (
                  <form
                    action={async () => {
                      await revocarEnlaceEntrega(e.folderRel);
                      router.refresh();
                    }}
                  >
                    <SubmitButton
                      pendingText="…"
                      title="Corta el acceso ya, sin esperar a que el enlace caduque"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      <ShieldOff className="size-3.5" /> Retirar
                    </SubmitButton>
                  </form>
                )}
                {e.huerfana ? (
                  <form
                    action={async () => {
                      await olvidarEnlaceEntrega(e.folderRel);
                      router.refresh();
                    }}
                  >
                    <ConfirmSubmit
                      message={`¿Olvidar «${e.titulo}»? Su carpeta ya no existe en LabTem, así que este registro no protege nada. Si la carpeta vuelve con el mismo nombre, tendrás que compartirla de nuevo.`}
                      confirmLabel="Olvidar"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-destructive"
                      title="Quitar el registro de una entrega cuya carpeta ya no está"
                    >
                      <Trash2 className="size-3.5" />
                    </ConfirmSubmit>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
