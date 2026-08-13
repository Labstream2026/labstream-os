"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Send } from "lucide-react";
import { ArchivosPanel } from "@/components/archivos/archivos-panel";
import { EntityEmoji } from "@/components/icons/marks";
import type { ArchivoItem, ProyectoRef } from "@/lib/archivos/tipos";

// Vista «Archivos» de la ficha del CLIENTE: el panel unificado con alcance cliente.
// Muestra los archivos de TODOS sus proyectos visibles (cada uno con el chip de su proyecto)
// más el material de marca (ClientFile), que no pertenece a ningún proyecto.
//
// «Pedir material» vive ARRIBA como un botón discreto (antes era un cartel permanente al pie
// del panel: ocupaba tres líneas siempre, se usara o no). El botón despliega los enlaces de
// subida por proyecto; sin proyectos gestionados, apunta a quién pedírselo.

export function ClientFilesPanel({
  clientId,
  items,
  ahora,
  proyectosEscribibles,
  // Proyectos que este usuario GESTIONA: sus enlaces de subida viven en el botón de arriba.
  proyectosGestionados,
  canEdit,
  canChunked = false,
}: {
  clientId: string;
  items: ArchivoItem[];
  ahora: number;
  proyectosEscribibles: ProyectoRef[];
  proyectosGestionados: ProyectoRef[];
  canEdit: boolean;
  canChunked?: boolean;
}) {
  return (
    <div className="space-y-3">
      {canEdit ? (
        <div className="flex justify-end">
          <details data-autoclose className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-primary/30 bg-primary/[0.06] px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10">
              <Send className="size-3.5" />
              Pedir material al cliente
              <ChevronDown className="size-3 opacity-70" />
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-border bg-popover p-3 shadow-lg">
              <p className="text-xs text-muted-foreground">
                Compártele el <b className="text-foreground">enlace de subida</b> de su proyecto: sube fotos y video
                sin cuenta y todo queda directo ahí.
              </p>
              {proyectosGestionados.length ? (
                <div className="mt-2 space-y-1">
                  {proyectosGestionados.map((p) => (
                    <Link
                      key={p.id}
                      href={`/proyectos/${p.id}?tab=archivos`}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-accent"
                    >
                      {p.emoji ? <EntityEmoji value={p.emoji} /> : null}
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">enlace de subida →</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  No gestionas ningún proyecto de esta cuenta: pídele el enlace a quien lidera el proyecto.
                </p>
              )}
            </div>
          </details>
        </div>
      ) : null}

      <ArchivosPanel
        alcance={{ tipo: "cliente", clientId, proyectosEscribibles }}
        items={items}
        ahora={ahora}
        canUpload={canEdit && proyectosEscribibles.length > 0}
        canLinks={canEdit}
        canRutas={canEdit}
        canEditMarca={canEdit}
        canChunked={canChunked}
      />
    </div>
  );
}
