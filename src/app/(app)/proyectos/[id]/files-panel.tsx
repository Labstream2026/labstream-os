"use client";

import * as React from "react";
import { FilePlus2, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { ArchivosPanel, type AlcanceArchivos } from "@/components/archivos/archivos-panel";
import type { ArchivoItem, CarpetaItem, OpsVivo } from "@/lib/archivos/tipos";
import { NewDocForm } from "./new-doc-form";
import { OpsFolderPicker } from "./ops-folder-picker";

// Pestaña Archivos del PROYECTO: un envoltorio delgado sobre el panel unificado
// (src/components/archivos/archivos-panel.tsx), que también sirve la ficha del cliente.
// Aquí solo vive lo exclusivo del proyecto: «Nuevo documento» y la carpeta del NAS.

export function FilesPanel({
  projectId,
  items,
  ahora,
  carpetas,
  ops = null,
  canUpload = false,
  canLinks = false,
  canRutas = false,
  canFolders = false,
  canLinkOps = false,
  canCreateDoc = false,
  canChunked = false,
  papelera = [],
  onlyoffice = false,
}: {
  projectId: string;
  items: ArchivoItem[];
  ahora: number;
  carpetas: CarpetaItem[];
  ops?: OpsVivo | null;
  canUpload?: boolean;
  canLinks?: boolean;
  canRutas?: boolean;
  canFolders?: boolean;
  canLinkOps?: boolean;
  canCreateDoc?: boolean;
  canChunked?: boolean;
  papelera?: ArchivoItem[];
  onlyoffice?: boolean;
}) {
  const [docAbierto, setDocAbierto] = React.useState(false);
  const [pickerAbierto, setPickerAbierto] = React.useState(false);
  const alcance: AlcanceArchivos = { tipo: "proyecto", projectId };

  return (
    <>
      <ArchivosPanel
        alcance={alcance}
        items={items}
        ahora={ahora}
        carpetas={carpetas}
        ops={ops}
        canUpload={canUpload}
        canLinks={canLinks}
        canRutas={canRutas}
        canFolders={canFolders}
        canChunked={canChunked}
        papelera={papelera}
        // Lo que solo existe en el proyecto entra al menú «Añadir» como DATOS, no como
        // botones ya hechos: así el panel decide dónde pintarlo. Vincular la carpeta del
        // NAS va marcada `ocasional` para que baje al fondo, separada — se usa una vez al
        // año y no tiene por qué competir con subir un archivo.
        accionesExtra={[
          ...(canCreateDoc
            ? [{ id: "doc", label: "Nuevo documento", icon: FilePlus2, onClick: () => setDocAbierto((v) => !v) }]
            : []),
          ...(canLinkOps
            ? [{
                id: "ops",
                label: ops ? "Cambiar carpeta del NAS" : "Vincular carpeta del NAS",
                icon: HardDrive,
                onClick: () => setPickerAbierto(true),
                ocasional: true,
              }]
            : []),
        ]}
        slotHerramientas={
          docAbierto && canCreateDoc ? (
            <NewDocForm projectId={projectId} folders={carpetas.map((f) => ({ id: f.id, name: f.name }))} onlyoffice={onlyoffice} />
          ) : null
        }
      />
      {pickerAbierto ? <OpsFolderPicker projectId={projectId} current={ops?.folder ?? null} onClose={() => setPickerAbierto(false)} /> : null}
    </>
  );
}
