"use client";

import * as React from "react";
import { Send, Copy, Check, Mail, Ban, Loader2, Server } from "lucide-react";
import { createProjectUploadLink, revokeProjectUploadLink, setProjectUploadDir, emailProjectUploadLink } from "./upload-actions";

// «Compartir link de subida» (solo equipo): genera/copia/envía por correo el enlace público
// /subir/[token] para que el cliente suba su material directo al proyecto, elige la carpeta del NAS
// donde cae, y permite revocar. El enlace ya existe por defecto (token firmado, inadivinable);
// revocar lo invalida.
export function UploadShare({
  projectId,
  initialLink,
  uploadDir,
  emailEnabled,
}: {
  projectId: string;
  initialLink: string | null;
  uploadDir: string | null;
  emailEnabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(initialLink);
  const [copied, setCopied] = React.useState(false);
  const [dir, setDir] = React.useState(uploadDir ?? "");
  const [to, setTo] = React.useState("");
  const [busy, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

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
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Server className="size-3.5" /> Carpeta en el NAS (opcional)</label>
            <div className="flex flex-wrap items-center gap-2">
              <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="p. ej. clientes/marca-x/reel-sept" className="min-w-48 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-ring" />
              <button type="button" onClick={saveDir} disabled={busy} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60">Guardar</button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Vacío = carpeta por defecto del proyecto. Para apuntarla a un volumen concreto del NAS, bind-montéalo como esta subcarpeta.</p>
          </div>

          {msg ? <p className={`text-xs ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{msg.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
