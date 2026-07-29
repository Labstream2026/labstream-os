"use client";

import * as React from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { ArchivosPanel } from "@/components/archivos/archivos-panel";
import type { ArchivoItem, ProyectoRef } from "@/lib/archivos/tipos";

// Vista «Archivos» de la ficha del CLIENTE: el panel unificado con alcance cliente.
// Muestra los archivos de TODOS sus proyectos visibles (cada uno con el chip de su proyecto)
// más el material de marca (ClientFile), que no pertenece a ningún proyecto.

export function ClientFilesPanel({
  clientId,
  items,
  ahora,
  proyectosEscribibles,
  // Proyectos que este usuario GESTIONA: sus enlaces de subida van en el pie.
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
    <ArchivosPanel
      alcance={{ tipo: "cliente", clientId, proyectosEscribibles }}
      items={items}
      ahora={ahora}
      canUpload={canEdit && proyectosEscribibles.length > 0}
      canLinks={canEdit}
      canRutas={canEdit}
      canEditMarca={canEdit}
      canChunked={canChunked}
      slotPie={
        <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-2.5 text-xs text-muted-foreground">
          <Send className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <div className="space-y-1.5">
            <p>
              ¿Necesitas que el cliente te <b className="text-foreground">mande material</b> (fotos, video)?{" "}
              {proyectosGestionados.length
                ? "Compártele el enlace de subida de su proyecto: sube sin cuenta y queda directo ahí."
                : "Pídele el enlace de subida a quien lidera el proyecto."}
            </p>
            {proyectosGestionados.length ? (
              <p className="flex flex-wrap gap-1.5">
                {proyectosGestionados.map((p) => (
                  <Link
                    key={p.id}
                    href={`/proyectos/${p.id}?tab=archivos`}
                    className="rounded-md border border-border bg-card px-2 py-1 font-medium text-primary hover:bg-accent"
                  >
                    Enlace de subida · {p.emoji ? `${p.emoji} ` : ""}{p.name}
                  </Link>
                ))}
              </p>
            ) : null}
          </div>
        </div>
      }
    />
  );
}
