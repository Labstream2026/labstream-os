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
        slotHerramientas={
          <>
            {canCreateDoc ? (
              <BotonHerramienta active={docAbierto} onClick={() => setDocAbierto((v) => !v)} icon={FilePlus2}>
                Nuevo documento
              </BotonHerramienta>
            ) : null}
            {canLinkOps ? (
              <BotonHerramienta active={pickerAbierto} onClick={() => setPickerAbierto(true)} icon={HardDrive}>
                {ops ? "Cambiar carpeta del NAS" : "Vincular carpeta del NAS"}
              </BotonHerramienta>
            ) : null}
            {docAbierto && canCreateDoc ? (
              <div className="basis-full">
                <NewDocForm projectId={projectId} folders={carpetas.map((f) => ({ id: f.id, name: f.name }))} onlyoffice={onlyoffice} />
              </div>
            ) : null}
          </>
        }
      />
      {pickerAbierto ? <OpsFolderPicker projectId={projectId} current={ops?.folder ?? null} onClose={() => setPickerAbierto(false)} /> : null}
    </>
  );
}

function BotonHerramienta({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4" /> {children}
    </button>
  );
}
