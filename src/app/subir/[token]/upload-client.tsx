"use client";

import * as React from "react";
import { UploadCloud, CheckCircle2, Loader2, AlertCircle, Lock, Film, Image as ImageIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const MAX = 200 * 1024 * 1024;
const ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.mp4,.m4v,.mov,.webm,.mkv,.ogv";
const ALLOWED_RE = /\.(jpe?g|png|webp|gif|heic|heif|mp4|m4v|mov|webm|mkv|ogv)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

type Item = { key: string; name: string; size: number; status: "uploading" | "done" | "error"; progress: number; error?: string };

function fmtSize(n: number) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function UploadClient({
  token,
  projectName,
  projectEmoji,
  clientName,
}: {
  token: string;
  projectName: string;
  projectEmoji: string | null;
  clientName: string | null;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [name, setName] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const [items, setItems] = React.useState<Item[]>([]);
  const keySeq = React.useRef(0);

  React.useEffect(() => {
    setName((localStorage.getItem("upload_name") || "").trim());
  }, []);

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));

  const uploadOne = (file: File, key: string) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload/${token}`);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
    const who = name.trim();
    if (who) xhr.setRequestHeader("x-uploader", encodeURIComponent(who));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) patch(key, { progress: Math.round((e.loaded / e.total) * 100) }); };
    xhr.onload = () => {
      let ok = xhr.status >= 200 && xhr.status < 300;
      let error: string | undefined;
      try {
        const r = JSON.parse(xhr.responseText);
        ok = !!r.ok;
        if (!ok) error = r.error;
      } catch { /* respuesta no-JSON */ }
      patch(key, ok ? { status: "done", progress: 100 } : { status: "error", error: error ?? "No se pudo subir." });
    };
    xhr.onerror = () => patch(key, { status: "error", error: "Fallo de red. Reintenta." });
    xhr.send(file);
  };

  const add = (files: FileList | File[] | null) => {
    if (!files) return;
    const who = name.trim();
    if (who) localStorage.setItem("upload_name", who);
    for (const file of Array.from(files)) {
      const key = `f${keySeq.current++}`;
      if (!ALLOWED_RE.test(file.name)) {
        setItems((l) => [...l, { key, name: file.name, size: file.size, status: "error", progress: 0, error: "Tipo no permitido (solo imagen o video)." }]);
        continue;
      }
      if (file.size > MAX) {
        setItems((l) => [...l, { key, name: file.name, size: file.size, status: "error", progress: 0, error: "Supera los 200 MB." }]);
        continue;
      }
      setItems((l) => [...l, { key, name: file.name, size: file.size, status: "uploading", progress: 0 }]);
      uploadOne(file, key);
    }
  };

  const done = items.filter((i) => i.status === "done").length;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="text-center">
        <Logo className="mx-auto h-8" />
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Subir material</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Sube tu material para {projectName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {projectEmoji ? `${projectEmoji} ` : ""}{clientName ? `${clientName} · ` : ""}quedará directo en el proyecto
        </p>
      </div>

      <div className="mt-5">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Tu nombre (opcional)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Para saber quién envió el material"
          maxLength={80}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"}`}
      >
        <UploadCloud className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">Arrastra tus archivos aquí o haz clic</p>
        <p className="text-xs text-muted-foreground">JPG · PNG · WebP · MP4 · MOV — hasta 200 MB cada uno</p>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>

      {items.length ? (
        <div className="mt-4 space-y-2">
          {items.map((it) => {
            const isImg = IMAGE_RE.test(it.name);
            return (
              <div key={it.key} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${it.status === "error" ? "border-destructive/40 bg-destructive/5" : "border-border"}`}>
                {isImg ? <ImageIcon className="size-4 shrink-0 text-teal-600" /> : <Film className="size-4 shrink-0 text-orange-600" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{it.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{fmtSize(it.size)}</span>
                  </div>
                  {it.status === "uploading" ? (
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${it.progress}%` }} />
                    </div>
                  ) : it.status === "error" ? (
                    <p className="mt-0.5 text-[11px] text-destructive">{it.error}</p>
                  ) : null}
                </div>
                {it.status === "uploading" ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" /> : it.status === "done" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> : <AlertCircle className="size-4 shrink-0 text-destructive" />}
              </div>
            );
          })}
          {done > 0 ? <p className="pt-1 text-center text-xs text-emerald-600 dark:text-emerald-400">{done} {done === 1 ? "archivo enviado" : "archivos enviados"} al equipo ✓</p> : null}
        </div>
      ) : null}

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="size-3" /> No necesitas cuenta ni contraseña. El equipo verá tu material al instante.
      </p>
    </div>
  );
}
