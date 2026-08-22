"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, CheckCircle2, Loader2, AlertCircle, Film, Image as ImageIcon } from "lucide-react";

// ── Subir material desde el PORTAL (cliente autenticado) ──
// Dropzone que envía cada archivo a /api/materiales/[projectId] (la hermana con sesión del enlace
// público). Al terminar una tanda, refresca para que el material recién subido aparezca en la lista.

const MAX = 200 * 1024 * 1024;
const ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.mp4,.m4v,.mov,.webm,.mkv,.ogv";
const ALLOWED_RE = /\.(jpe?g|png|webp|gif|heic|heif|mp4|m4v|mov|webm|mkv|ogv)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

type Item = { key: string; name: string; size: number; status: "uploading" | "done" | "error"; progress: number; error?: string };

function fmtSize(n: number) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function MaterialUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [items, setItems] = React.useState<Item[]>([]);
  const keySeq = React.useRef(0);
  const pending = React.useRef(0);

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));

  const uploadOne = (file: File, key: string) => {
    pending.current += 1;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/materiales/${projectId}`);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) patch(key, { progress: Math.round((e.loaded / e.total) * 100) });
    };
    const settle = (ok: boolean, error?: string) => {
      patch(key, ok ? { status: "done", progress: 100 } : { status: "error", error: error ?? "No se pudo subir." });
      pending.current -= 1;
      // Cuando cae el último en vuelo y hubo al menos un éxito, refresca para ver el material nuevo.
      if (pending.current === 0 && ok) router.refresh();
    };
    xhr.onload = () => {
      let ok = xhr.status >= 200 && xhr.status < 300;
      let error: string | undefined;
      try {
        const r = JSON.parse(xhr.responseText);
        ok = !!r.ok;
        if (!ok) error = r.error;
      } catch {
        /* respuesta no-JSON */
      }
      settle(ok, error);
    };
    xhr.onerror = () => settle(false, "Fallo de red. Reintenta.");
    xhr.send(file);
  };

  const add = (files: FileList | File[] | null) => {
    if (!files) return;
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
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"
        }`}
      >
        <UploadCloud className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">Arrastra tus archivos aquí o haz clic</p>
        <p className="text-xs text-muted-foreground">Imágenes y video · hasta 200 MB cada uno — le llegan al equipo al instante</p>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>

      {items.length ? (
        <div className="mt-3 space-y-2">
          {items.map((it) => {
            const isImg = IMAGE_RE.test(it.name);
            return (
              <div key={it.key} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${it.status === "error" ? "border-destructive/40 bg-destructive/5" : "border-border"}`}>
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
                {it.status === "uploading" ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                ) : it.status === "done" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                ) : (
                  <AlertCircle className="size-4 shrink-0 text-destructive" />
                )}
              </div>
            );
          })}
          {done > 0 ? <p className="pt-0.5 text-center text-xs text-emerald-600 dark:text-emerald-400">{done} {done === 1 ? "archivo enviado" : "archivos enviados"} al equipo ✓</p> : null}
        </div>
      ) : null}
    </div>
  );
}
