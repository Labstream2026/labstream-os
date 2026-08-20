"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check, Copy, ExternalLink, FolderUp, Heart, Image as ImageIcon, Loader2, MessageSquare,
  MoreHorizontal, RefreshCw, Send, ShieldCheck, Star, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmailReviewButton } from "../../email-review-button";
import { BotonWa } from "@/app/(app)/revisiones/boton-wa";
import {
  borrarFotoSet, enviarSetAlCliente, enviarSetARevision,
  fijarSeccionFoto, hacerPortadaSet, toggleFotoExcluida, type ResultadoSet,
} from "./set-actions";

// ── El ESTUDIO de un set de fotos ──
// Una sola pantalla con los tres momentos del equipo: SUBIR (la carpeta completa, no foto a
// foto), CURAR (qué pasa al cliente, con un clic) y LEER lo que volvió (elegidas y comentarios).
// La galería del cliente vive aparte, en /review/[token]; esto es la trastienda.

export type FotoStudio = {
  id: string;
  filename: string;
  src: string;
  fullSrc: string;
  seccion: string | null;
  ar: number;
  excluida: boolean;
  pick: string; // PENDIENTE | ME_GUSTA | NO_ME_GUSTA
  note: string | null;
  esPortada: boolean;
};

type Subida = {
  key: string;
  name: string;
  seccion: string | null;
  file: File;
  estado: "cola" | "subiendo" | "lista" | "error";
  prog: number;
};

const IMG_RE = /\.(jpe?g|png|webp|gif|tiff?|avif|heic|heif|bmp)$/i;
const PARALELAS = 3;

// ── Traducir lo arrastrado a [archivo + sección] ──
// La regla que casa «subo la carpeta completa» con «me gusta cómo se agrupan»:
//   · UNA carpeta arrastrada → sus archivos directos van sin sección; cada SUBCARPETA es una
//     sección (anidados más profundos se aplanan a la primera subcarpeta).
//   · VARIAS carpetas (o carpetas + sueltas) → cada carpeta ES una sección con su nombre.
//   · Archivos sueltos → sin sección.
type Cosecha = { file: File; seccion: string | null };

async function leerEntry(entry: FileSystemEntry, seccion: string | null, out: Cosecha[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push({ file, seccion });
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries entrega por tandas de ~100: hay que llamar hasta que venga vacío.
    for (;;) {
      const tanda = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!tanda.length) break;
      for (const e of tanda) await leerEntry(e, seccion, out);
    }
  }
}

async function cosecharDrop(items: DataTransferItemList): Promise<Cosecha[]> {
  const entries: FileSystemEntry[] = [];
  const sueltos: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const f = item.getAsFile();
      if (f) sueltos.push(f);
    }
  }
  const out: Cosecha[] = [];
  const dirs = entries.filter((e) => e.isDirectory);
  const files = entries.filter((e) => e.isFile);
  if (dirs.length === 1 && files.length === 0 && sueltos.length === 0) {
    // Una sola carpeta: es la raíz. Directos → sin sección; cada subcarpeta → una sección.
    const reader = (dirs[0] as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const tanda = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!tanda.length) break;
      for (const e of tanda) {
        if (e.isDirectory) await leerEntry(e, e.name, out);
        else await leerEntry(e, null, out);
      }
    }
  } else {
    for (const e of dirs) await leerEntry(e, e.name, out);
    for (const e of files) await leerEntry(e, null, out);
    for (const f of sueltos) out.push({ file: f, seccion: null });
  }
  return out;
}

// El selector nativo de carpeta (webkitdirectory) entrega rutas relativas «Raíz/Sub/foto.jpg»:
// misma regla que el arrastre — un nivel = sin sección, dos o más = la primera subcarpeta.
function cosecharInput(files: FileList): Cosecha[] {
  return Array.from(files).map((f) => {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    const partes = rel.split("/").filter(Boolean);
    return { file: f, seccion: partes.length >= 3 ? partes[1] : null };
  });
}

export function SetStudio({
  setId,
  fotos,
  nextPos,
  canUpload,
  canManage,
  statusLabel,
  statusClass,
  linkAbierto,
  enRevision,
  reviewUrl,
  emailEnabled,
  wa,
}: {
  setId: string;
  fotos: FotoStudio[];
  nextPos: number;
  canUpload: boolean;
  canManage: boolean;
  statusLabel: string;
  statusClass: string;
  // true = el estado ya es de cara al cliente (su enlace abre la galería).
  linkAbierto: boolean;
  // true = está en pre-aprobación interna (bandeja de los revisores).
  enRevision: boolean;
  reviewUrl: string;
  emailEnabled: boolean;
  wa: { href: string; phone: string } | null;
}) {
  const router = useRouter();

  // Copia local con ajuste-durante-render: al llegar fotos nuevas del servidor (refresh tras
  // subir/curar) la copia se resetea; los toggles optimistas viven aquí mientras tanto.
  const [local, setLocal] = React.useState(fotos);
  const [prev, setPrev] = React.useState(fotos);
  if (fotos !== prev) {
    setPrev(fotos);
    setLocal(fotos);
  }

  const [filtro, setFiltro] = React.useState<"todas" | "cliente" | "excluidas" | "elegidas" | "comentadas">("todas");
  const [aviso, setAviso] = React.useState<{ ok: boolean; text: string } | null>(null);

  const visibles = local.filter((f) => !f.excluida);
  const elegidas = local.filter((f) => f.pick === "ME_GUSTA");
  const descartadas = local.filter((f) => f.pick === "NO_ME_GUSTA");
  const comentadas = local.filter((f) => (f.note ?? "").trim());

  const filtradas = local.filter((f) => {
    if (filtro === "cliente") return !f.excluida;
    if (filtro === "excluidas") return f.excluida;
    if (filtro === "elegidas") return f.pick === "ME_GUSTA";
    if (filtro === "comentadas") return !!(f.note ?? "").trim();
    return true;
  });

  // Secciones en orden de aparición (el servidor ya viene ordenado por posición).
  const secciones: { titulo: string | null; fotos: FotoStudio[] }[] = [];
  for (const f of filtradas) {
    const s = secciones.find((x) => x.titulo === (f.seccion ?? null));
    if (s) s.fotos.push(f);
    else secciones.push({ titulo: f.seccion ?? null, fotos: [f] });
  }
  const nombresSeccion = [...new Set(local.map((f) => f.seccion).filter(Boolean))] as string[];

  function toggleExcluida(f: FotoStudio) {
    if (!canManage) return;
    setLocal((cur) => cur.map((x) => (x.id === f.id ? { ...x, excluida: !x.excluida } : x)));
    void toggleFotoExcluida(f.id).then((r) => {
      if (!r.ok) setLocal((cur) => cur.map((x) => (x.id === f.id ? { ...x, excluida: f.excluida } : x)));
    });
  }

  return (
    <div className="space-y-5">
      <EnvioSet
        setId={setId}
        canManage={canManage}
        statusLabel={statusLabel}
        statusClass={statusClass}
        linkAbierto={linkAbierto}
        enRevision={enRevision}
        reviewUrl={reviewUrl}
        emailEnabled={emailEnabled}
        wa={wa}
        visibles={visibles.length}
        aviso={aviso}
        setAviso={setAviso}
      />

      {canUpload ? <SubidaCarpeta setId={setId} nextPos={nextPos} onListo={() => router.refresh()} /> : null}

      {/* ── Toolbar: contador de curaduría + filtros ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold">
          <ShieldCheck className="size-3.5 text-muted-foreground" />
          Al cliente: {visibles.length} de {local.length}
        </span>
        {(
          [
            ["todas", `Todas · ${local.length}`],
            ["cliente", `Al cliente · ${visibles.length}`],
            ["excluidas", `Excluidas · ${local.length - visibles.length}`],
            ["elegidas", `♥ Elegidas · ${elegidas.length}`],
            ["comentadas", `💬 Comentadas · ${comentadas.length}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFiltro(k)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              filtro === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
        {canManage ? (
          <span className="ml-auto hidden text-xs text-muted-foreground sm:block">clic en una foto = entra o sale de la entrega</span>
        ) : null}
      </div>

      {/* ── La cuadrícula de curaduría, por secciones ── */}
      {local.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          El set está vacío. Arrastra arriba la carpeta de la sesión y esto se organiza solo.
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nada con este filtro.
        </div>
      ) : (
        secciones.map((sec) => (
          <section key={sec.titulo ?? "·raiz"}>
            {sec.titulo || secciones.length > 1 ? (
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-sm font-semibold">{sec.titulo ?? "Sin sección"}</h3>
                <span className="text-xs text-muted-foreground">{sec.fotos.length} fotos</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 [--fh:9.5rem]">
              {sec.fotos.map((f) => (
                <TarjetaCuraduria
                  key={f.id}
                  foto={f}
                  canManage={canManage}
                  secciones={nombresSeccion}
                  onToggle={() => toggleExcluida(f)}
                  onCambio={() => router.refresh()}
                />
              ))}
              <span aria-hidden className="grow-[9999]" />
            </div>
          </section>
        ))
      )}

      {/* ── Lo que volvió del cliente ── */}
      {elegidas.length || comentadas.length || descartadas.length ? (
        <ResultadosSet elegidas={elegidas} comentadas={comentadas} descartadas={descartadas.length} total={visibles.length} />
      ) : null}
    </div>
  );
}

// ── Subir la carpeta completa ──
// El motor de la cola vive FUERA de los efectos (regla del repo: nada de setState en el cuerpo
// de un efecto): `bombear()` arranca subidas desde los manejadores de eventos y desde las
// continuaciones del XHR. El estado de React solo PINTA lo que el motor va haciendo.
function SubidaCarpeta({ setId, nextPos, onListo }: { setId: string; nextPos: number; onListo: () => void }) {
  const [cola, setCola] = React.useState<Subida[]>([]);
  const [arrastrando, setArrastrando] = React.useState(false);
  const [omitidas, setOmitidas] = React.useState(0);
  const pendientesRef = React.useRef<Subida[]>([]);
  const activasRef = React.useRef(0);
  const subidasRef = React.useRef(0);
  const posRef = React.useRef(nextPos);
  const inputCarpeta = React.useRef<HTMLInputElement>(null);
  const inputSueltas = React.useRef<HTMLInputElement>(null);

  const subiendo = cola.some((s) => s.estado === "cola" || s.estado === "subiendo");
  const listas = cola.filter((s) => s.estado === "lista").length;
  const errores = cola.filter((s) => s.estado === "error");

  function pinta(key: string, patch: Partial<Subida>) {
    setCola((cur) => cur.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function bombear() {
    while (activasRef.current < PARALELAS && pendientesRef.current.length) {
      const item = pendientesRef.current.shift()!;
      activasRef.current += 1;
      const pos = posRef.current++;
      pinta(item.key, { estado: "subiendo" });

      const fd = new FormData();
      fd.append("file", item.file);
      if (item.seccion) fd.append("section", item.seccion);
      fd.append("position", String(pos));

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/fotos/${setId}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) pinta(item.key, { prog: Math.round((e.loaded / e.total) * 100) });
      };
      const termina = (ok: boolean) => {
        activasRef.current -= 1;
        if (ok) subidasRef.current += 1;
        pinta(item.key, { estado: ok ? "lista" : "error", prog: ok ? 100 : undefined });
        if (pendientesRef.current.length || activasRef.current > 0) {
          bombear();
          return;
        }
        // Cola drenada: UNA línea de actividad con el total y refresh para traer la lista real.
        const n = subidasRef.current;
        subidasRef.current = 0;
        if (n > 0) {
          void fetch(`/api/fotos/${setId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ added: n }) }).catch(() => {});
          onListo();
        }
      };
      xhr.onload = () => termina(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => termina(false);
      xhr.send(fd);
    }
  }

  function encolar(cosecha: Cosecha[]) {
    const imagenes = cosecha.filter((c) => IMG_RE.test(c.file.name));
    setOmitidas((n) => n + (cosecha.length - imagenes.length));
    if (!imagenes.length) return;
    const nuevas: Subida[] = imagenes.map((c, i) => ({
      key: `${Date.now()}-${i}-${c.file.name}`,
      name: c.file.name,
      seccion: c.seccion,
      file: c.file,
      estado: "cola",
      prog: 0,
    }));
    pendientesRef.current.push(...nuevas);
    setCola((cur) => [...cur, ...nuevas]);
    bombear();
  }

  function reintentar(s: Subida) {
    pendientesRef.current.push({ ...s, estado: "cola", prog: 0 });
    pinta(s.key, { estado: "cola", prog: 0 });
    bombear();
  }

  const progTotal = cola.length ? Math.round(cola.reduce((a, s) => a + (s.estado === "lista" ? 100 : s.prog), 0) / cola.length) : 0;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          void cosecharDrop(e.dataTransfer.items).then(encolar);
        }}
        onClick={() => inputCarpeta.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputCarpeta.current?.click();
        }}
        className={cn(
          "cursor-pointer rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors",
          arrastrando ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        )}
      >
        <FolderUp className="mx-auto size-8 text-primary" />
        <p className="mt-2 text-sm font-semibold">Suelta aquí la carpeta de la sesión</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Las subcarpetas se vuelven secciones de la galería, solas. También puedes{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              inputSueltas.current?.click();
            }}
          >
            elegir fotos sueltas
          </button>
          .
        </p>
        {/* webkitdirectory: el selector nativo de CARPETA (no hay tipo estándar en React). */}
        <input
          ref={inputCarpeta}
          type="file"
          multiple
          className="hidden"
          // @ts-expect-error webkitdirectory no está en los tipos de React
          webkitdirectory=""
          onChange={(e) => {
            if (e.target.files?.length) encolar(cosecharInput(e.target.files));
            e.target.value = "";
          }}
        />
        <input
          ref={inputSueltas}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) encolar(Array.from(e.target.files).map((f) => ({ file: f, seccion: null })));
            e.target.value = "";
          }}
        />
      </div>

      {cola.length ? (
        <div className="mt-3 space-y-2 rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            {subiendo ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <Check className="size-3.5 text-emerald-600" />}
            <span>
              {listas} de {cola.length} {subiendo ? "subidas…" : "subidas"}
            </span>
            {omitidas > 0 ? <span className="text-muted-foreground">· {omitidas} omitidas (no eran imágenes)</span> : null}
            {!subiendo && errores.length === 0 ? (
              <button type="button" onClick={() => { setCola([]); setOmitidas(0); }} className="ml-auto text-muted-foreground hover:text-foreground">
                Limpiar
              </button>
            ) : null}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progTotal}%` }} />
          </div>
          {errores.length ? (
            <ul className="space-y-1 pt-1">
              {errores.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-xs text-destructive">
                  <X className="size-3" /> {s.name}
                  <button type="button" onClick={() => reintentar(s)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-foreground hover:bg-muted">
                    <RefreshCw className="size-3" /> Reintentar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Una foto en la cuadrícula de curaduría ──
function TarjetaCuraduria({
  foto,
  canManage,
  secciones,
  onToggle,
  onCambio,
}: {
  foto: FotoStudio;
  canManage: boolean;
  secciones: string[];
  onToggle: () => void;
  onCambio: () => void;
}) {
  const [pendiente, start] = React.useTransition();

  function correr(fn: () => Promise<ResultadoSet>) {
    start(async () => {
      const r = await fn();
      if (!r.ok && r.message) window.alert(r.message);
      else onCambio();
    });
  }

  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-border bg-card"
      style={{ height: "var(--fh)", flexGrow: foto.ar * 100, flexBasis: `calc(${foto.ar} * var(--fh))` }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!canManage}
        title={canManage ? (foto.excluida ? "Excluida — clic para incluirla en la entrega" : "Clic para sacarla de la entrega") : undefined}
        className="absolute inset-0 w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={foto.src}
          alt={foto.filename}
          loading="lazy"
          className={cn("size-full object-cover transition-[filter,opacity]", foto.excluida && "opacity-40 grayscale")}
        />
      </button>

      {/* Insignias de estado (izquierda): curaduría, portada, y lo que dijo el cliente. */}
      <div className="pointer-events-none absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
        {foto.excluida ? (
          <span className="rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">No va</span>
        ) : null}
        {foto.esPortada ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            <Star className="size-2.5 fill-current" /> Portada
          </span>
        ) : null}
        {foto.pick === "ME_GUSTA" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
            <Heart className="size-2.5 fill-current" /> Elegida
          </span>
        ) : foto.pick === "NO_ME_GUSTA" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
            <X className="size-2.5" /> No le gustó
          </span>
        ) : null}
        {(foto.note ?? "").trim() ? (
          <span title={foto.note ?? ""} className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <MessageSquare className="size-2.5" /> Nota
          </span>
        ) : null}
      </div>

      {/* Nombre abajo, al pasar el mouse. */}
      <span className="pointer-events-none absolute bottom-1 left-2 max-w-[85%] truncate text-[10px] text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100">
        {foto.filename}
      </span>

      {/* Menú ⋯ (patrón de la casa: details + data-autoclose). */}
      <details data-autoclose className="absolute right-1.5 top-1.5">
        <summary
          className="flex size-7 cursor-pointer list-none items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/75 group-hover:opacity-100 [[open]>&]:opacity-100"
          title="Opciones de la foto"
        >
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <MoreHorizontal className="size-4" />}
        </summary>
        <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg">
          <a
            href={foto.fullSrc}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            <ExternalLink className="size-4 text-muted-foreground" /> Ver grande ↗
          </a>
          {canManage ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.closest("details")?.removeAttribute("open");
                  correr(() => hacerPortadaSet(foto.id));
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <ImageIcon className="size-4 text-muted-foreground" /> Hacer portada del set
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.closest("details")?.removeAttribute("open");
                  const s = window.prompt(
                    secciones.length ? `Sección para esta foto (existentes: ${secciones.join(", ")}). Vacío = sin sección.` : "Nombre de la sección (vacío = sin sección):",
                    foto.seccion ?? "",
                  );
                  if (s === null) return;
                  correr(() => fijarSeccionFoto(foto.id, s));
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <FolderUp className="size-4 text-muted-foreground" /> Cambiar de sección…
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.closest("details")?.removeAttribute("open");
                  if (!window.confirm(`¿Borrar «${foto.filename}» del set? Esto también borra el archivo.`)) return;
                  correr(() => borrarFotoSet(foto.id));
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" /> Borrar foto
              </button>
            </>
          ) : null}
        </div>
      </details>
    </div>
  );
}

// ── Envío: los dos caminos de los videos, para el set ──
function EnvioSet({
  setId,
  canManage,
  statusLabel,
  statusClass,
  linkAbierto,
  enRevision,
  reviewUrl,
  emailEnabled,
  wa,
  visibles,
  aviso,
  setAviso,
}: {
  setId: string;
  canManage: boolean;
  statusLabel: string;
  statusClass: string;
  linkAbierto: boolean;
  enRevision: boolean;
  reviewUrl: string;
  emailEnabled: boolean;
  wa: { href: string; phone: string } | null;
  visibles: number;
  aviso: { ok: boolean; text: string } | null;
  setAviso: (a: { ok: boolean; text: string } | null) => void;
}) {
  const router = useRouter();
  const [pendiente, start] = React.useTransition();
  const [copiado, setCopiado] = React.useState(false);

  function correr(fn: () => Promise<ResultadoSet>) {
    setAviso(null);
    start(async () => {
      const r = await fn();
      setAviso({ ok: r.ok, text: r.message ?? (r.ok ? "Listo." : "No se pudo.") });
      if (r.ok) router.refresh();
    });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(reviewUrl);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      window.prompt("Copia el enlace:", reviewUrl);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", statusClass)}>{statusLabel}</span>
        <span className="text-xs text-muted-foreground">{visibles} fotos pasarán al cliente</span>
        <span className="ml-auto" />
        {canManage && !linkAbierto ? (
          <>
            {!enRevision ? (
              <button
                type="button"
                disabled={pendiente}
                onClick={() => correr(() => enviarSetARevision(setId))}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                title="Otro par de ojos del equipo pre-aprueba la galería antes del cliente"
              >
                <ShieldCheck className="size-3.5" /> A revisión interna
              </button>
            ) : null}
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => enviarSetAlCliente(setId))}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="size-3.5" /> Enviar al cliente
            </button>
          </>
        ) : null}
        {linkAbierto ? (
          <>
            <button
              type="button"
              onClick={() => void copiar()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              {copiado ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />} {copiado ? "Copiado" : "Copiar enlace"}
            </button>
            {emailEnabled ? <EmailReviewButton deliverableId={setId} /> : null}
            {wa ? <BotonWa deliverableId={setId} phone={wa.phone} href={wa.href} /> : null}
            <a href={reviewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">
              Ver como cliente <ExternalLink className="size-3.5" />
            </a>
          </>
        ) : null}
        {pendiente ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>
      {aviso ? (
        <p className={cn("mt-2 text-xs", aviso.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{aviso.text}</p>
      ) : null}
      {enRevision && !linkAbierto ? (
        <p className="mt-2 text-xs text-muted-foreground">
          En pre-aprobación interna: los revisores la tienen en su bandeja de <span className="font-medium text-foreground">/revisiones</span>. «Enviar al cliente» se la salta si corre prisa.
        </p>
      ) : null}
      {!linkAbierto && !enRevision ? (
        <p className="mt-2 text-xs text-muted-foreground">
          El enlace del cliente está cerrado hasta que el set se envíe (directo o tras la revisión interna): si alguien lo abre antes, ve «estamos trabajando en tu material».
        </p>
      ) : null}
    </div>
  );
}

// ── Lo que volvió del cliente ──
function ResultadosSet({
  elegidas,
  comentadas,
  descartadas,
  total,
}: {
  elegidas: FotoStudio[];
  comentadas: FotoStudio[];
  descartadas: number;
  total: number;
}) {
  const [copiado, setCopiado] = React.useState(false);
  const [fallback, setFallback] = React.useState<string | null>(null);

  // La lista que se pega en Lightroom o se manda al retocador: un nombre por línea.
  const lista = elegidas.map((f) => f.filename).join("\n");

  async function copiarLista() {
    try {
      await navigator.clipboard.writeText(lista);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      setFallback(lista); // sin portapapeles (permiso/contexto): se enseña para copiar a mano
    }
  }

  // Comentarios de fotos NO elegidas también importan (p. ej. «esta no, pero recorta la otra»).
  const soloComentadas = comentadas.filter((f) => f.pick !== "ME_GUSTA");

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">La selección del cliente</h3>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">♥ {elegidas.length} elegidas</span>
        {descartadas > 0 ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">✗ {descartadas}</span> : null}
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{total} enviadas</span>
        <span className="ml-auto" />
        {elegidas.length ? (
          <button
            type="button"
            onClick={() => void copiarLista()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            title="Un nombre de archivo por línea, para Lightroom o el retocador"
          >
            {copiado ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />} Copiar lista de archivos
          </button>
        ) : null}
      </div>

      {fallback ? (
        <textarea readOnly value={fallback} rows={4} onFocus={(e) => e.target.select()} className="mt-2 w-full rounded-md border border-input bg-background p-2 font-mono text-xs" />
      ) : null}

      {elegidas.length ? (
        <ul className="mt-3 divide-y divide-border">
          {elegidas.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.src} alt="" loading="lazy" className="h-9 w-12 shrink-0 rounded-md object-cover" />
              <span className="min-w-0 truncate font-medium">{f.filename}</span>
              {(f.note ?? "").trim() ? <span className="min-w-0 flex-1 truncate text-xs italic text-muted-foreground">«{f.note}»</span> : <span className="flex-1" />}
              <Heart className="size-3.5 shrink-0 fill-emerald-500 text-emerald-500" />
            </li>
          ))}
        </ul>
      ) : null}

      {soloComentadas.length ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted-foreground">Comentarios en otras fotos</p>
          <ul className="mt-1 divide-y divide-border">
            {soloComentadas.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.src} alt="" loading="lazy" className="h-9 w-12 shrink-0 rounded-md object-cover" />
                <span className="min-w-0 truncate">{f.filename}</span>
                <span className="min-w-0 flex-1 truncate text-xs italic text-muted-foreground">«{f.note}»</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
