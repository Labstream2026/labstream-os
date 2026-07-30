"use client";

import * as React from "react";
import { Send, Copy, Check, Mail, Ban, Loader2, Server, FolderOpen, Pencil } from "lucide-react";
import { createProjectUploadLink, revokeProjectUploadLink, setProjectUploadDir, emailProjectUploadLink } from "./upload-actions";
import { UploadFolderPicker } from "./upload-folder-picker";

// «Compartir link de subida» (solo equipo): genera/copia/envía por correo el enlace público
// /subir/[token] para que el cliente suba su material directo al proyecto, elige la carpeta del NAS
// donde cae, y permite revocar. El enlace ya existe por defecto (token firmado, inadivinable);
// revocar lo invalida.
export function UploadShare({
  projectId,
  initialLink,
  uploadDir,
  uploadGaleriaFolder,
  galeriaRaiz,
  galeriaRaizLabel,
  galeriaEscribible,
  emailEnabled,
}: {
  projectId: string;
  initialLink: string | null;
  uploadDir: string | null;
  // Carpeta de la galería donde cae el material (null = disco de la app, como antes).
  uploadGaleriaFolder: string | null;
  // Carpeta del cliente en la galería: la raíz del navegador. Null = el cliente no tiene carpeta
  // vinculada, así que no hay nada que navegar y se cae al campo de texto de siempre.
  galeriaRaiz: string | null;
  galeriaRaizLabel: string;
  // ¿El disco acepta escritura? Si no, elegir carpeta no sirve: las subidas del cliente fallarían.
  galeriaEscribible: boolean;
  emailEnabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(initialLink);
  const [copied, setCopied] = React.useState(false);
  const [dir, setDir] = React.useState(uploadDir ?? "");
  const [to, setTo] = React.useState("");
  const [busy, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pickerAbierto, setPickerAbierto] = React.useState(false);
  // Escape de emergencia: si alguien necesita la ruta a pelo del disco de la app (el caso del
  // bind mount de antes), el campo de texto sigue estando, plegado.
  const [rutaManual, setRutaManual] = React.useState(false);

  const generate = () => start(async () => {
    const r = await createProjectUploadLink(projectId);
    if (r.ok && r.url) { setLink(r.url); setMsg(null); } else setMsg({ ok: false, text: r.error ?? "No se pudo generar el enlace." });
  });
  const revoke = () => start(async () => {
    const r = await revokeProjectUploadLink(projectId);
    if (r.ok) { setLink(null); setMsg({ ok: true, text: "Enlace revocado. Puedes generar uno nuevo cuando quieras." }); } else setMsg({ ok: false, text: r.error ?? "Error." });
  });
  const saveDir = () => start(async () => {
    const r = await setProjectUploadDir(projectId, dir);
    setMsg(r.ok ? { ok: true, text: "Carpeta guardada." } : { ok: false, text: r.error ?? "Error." });
  });
  const email = () => start(async () => {
    const fd = new FormData();
    fd.set("to", to.trim());
    const r = await emailProjectUploadLink(projectId, fd);
    setMsg(r.ok ? { ok: true, text: "Enlace enviado al cliente." } : { ok: false, text: r.error ?? "Error." });
  });
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sin portapapeles */ }
  };

  return (
    <div className="mb-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left text-sm font-medium">
        <Send className="size-4 text-primary" /> Compartir link de subida con el cliente
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${link ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{link ? "activo" : "revocado"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            El cliente abre el enlace y sube su material directo al proyecto, sin cuenta. Imágenes (JPG, PNG, WebP) o video (MP4, MOV) hasta 200 MB por archivo.
          </p>

          {link ? (
            <>
              <div className="flex items-center gap-2">
                <input readOnly value={link} className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none" />
                <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              {emailEnabled ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Correo del cliente" className="min-w-40 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                  <button type="button" onClick={email} disabled={busy || !to.trim()} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60">
                    <Mail className="size-3.5" /> Enviar
                  </button>
                </div>
              ) : null}
              <button type="button" onClick={revoke} disabled={busy} className="inline-flex items-center gap-1.5 text-xs text-destructive hover:underline disabled:opacity-60">
                <Ban className="size-3.5" /> Revocar enlace
              </button>
            </>
          ) : (
            <button type="button" onClick={generate} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Generar enlace
            </button>
          )}

          <div className="border-t border-border pt-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Server className="size-3.5" /> ¿Dónde cae el material?
            </label>

            {/* El disco no acepta escritura: decirlo ANTES de elegir carpeta y mandar el enlace. */}
            {galeriaRaiz && !galeriaEscribible ? (
              <p className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
                <b className="font-semibold">El disco de la galería está en solo lectura ahora mismo.</b> Puedes elegir la
                carpeta, pero hasta que se habilite la escritura (montaje NFS en lectura-escritura y el archivo
                <code className="mx-1 font-mono">.labstream-escritura</code>) las subidas del cliente fallarían.
              </p>
            ) : null}

            {galeriaRaiz ? (
              <>
                {/* Lo que está PUESTO, y un botón para cambiarlo. La ruta ya no se escribe: se
                    navega, porque escribirla a mano apuntaba al disco de la app y no al NAS. */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs">
                    <FolderOpen className="size-3.5 shrink-0 text-[#F47A20]" />
                    {uploadGaleriaFolder ? (
                      <span className="truncate font-mono">{uploadGaleriaFolder}</span>
                    ) : (
                      <span className="text-muted-foreground">Disco de la app (carpeta por defecto)</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerAbierto(true)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    <FolderOpen className="size-3.5" /> {uploadGaleriaFolder ? "Cambiar carpeta" : "Elegir carpeta"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {uploadGaleriaFolder
                    ? "El material del cliente se guarda directo en esa carpeta del NAS, y aparece en Archivos."
                    : `Elige una subcarpeta dentro de la carpeta de ${galeriaRaizLabel} en la galería. Puedes crear carpetas desde ahí.`}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Este cliente no tiene carpeta vinculada en la galería, así que no hay dónde navegar.
                Vincúlasela en su ficha y aquí podrás elegir la subcarpeta.
              </p>
            )}

            {/* El campo de texto de antes queda como escape, plegado: apunta al disco de la APP
                (STORAGE_DIR), que es un sitio distinto del NAS — por eso ya no es lo primero. */}
            <button
              type="button"
              onClick={() => setRutaManual((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3" /> {rutaManual ? "Ocultar" : "Escribir una ruta del disco de la app"}
            </button>
            {rutaManual ? (
              <div className="mt-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="p. ej. clientes/marca-x/reel-sept" className="min-w-48 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-ring" />
                  <button type="button" onClick={saveDir} disabled={busy} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60">Guardar</button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Relativa al disco de la app, NO al NAS. Solo hace falta si tienes ese disco bind-montado a un volumen.
                  {uploadGaleriaFolder ? " Ahora mismo manda la carpeta de la galería de arriba." : ""}
                </p>
              </div>
            ) : null}
          </div>

          {msg ? <p className={`text-xs ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{msg.text}</p> : null}
        </div>
      ) : null}

      {pickerAbierto && galeriaRaiz ? (
        <UploadFolderPicker
          projectId={projectId}
          raiz={galeriaRaiz}
          raizLabel={galeriaRaizLabel}
          actual={uploadGaleriaFolder}
          onClose={() => setPickerAbierto(false)}
        />
      ) : null}
    </div>
  );
}
