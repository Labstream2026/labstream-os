"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Folder, FolderPlus, HardDrive, Loader2, X } from "lucide-react";
import { setProjectUploadGaleriaFolder, crearCarpetaSubidaGaleria } from "./upload-actions";

type Dir = { rel: string; name: string };

// ── Elegir DÓNDE cae el material que sube el cliente ───────────────────────────
// Antes era un campo de texto donde había que escribir la ruta a mano, y esa ruta era relativa al
// disco de la app: escribías «clientes/marca-x/reel» y el material NO iba a la carpeta del NAS con
// ese nombre, iba a una carpeta distinta que se llamaba igual.
//
// Ahora es un mini-explorador EN VIVO de la galería que arranca en la carpeta del CLIENTE, con
// creación rápida de subcarpetas para poder ordenar sin salir a SMB. Mismo patrón que el selector
// de Operaciones_LAB, para que se aprenda una vez.
//
// La ruta elegida viaja al servidor y ALLÍ se vuelve a comprobar que cuelga de la carpeta del
// cliente o del proyecto: el navegador no es la autoridad, solo la comodidad.
export function UploadFolderPicker({
  projectId,
  raiz,
  raizLabel,
  actual,
  onClose,
}: {
  projectId: string;
  // Carpeta del cliente (o del proyecto): el explorador no sube por encima de aquí.
  raiz: string;
  raizLabel: string;
  actual: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  // Se arranca en la carpeta guardada si la hay (para ver dónde está puesta), y si no en la raíz.
  const [path, setPath] = React.useState(actual && actual.startsWith(raiz) ? actual : raiz);
  const [dirs, setDirs] = React.useState<Dir[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = React.useState<string | null>(null);

  // «Cargando» se DERIVA de qué carpeta se leyó por última vez, en vez de ser un estado que se
  // enciende dentro del efecto. Dos motivos: un setState sincrónico en el cuerpo de un efecto
  // provoca un render en cascada (y aquí lo prohíbe el lint), y sobre todo así el listado nunca
  // puede quedar desparejado de la carpeta — sobre NFS una lectura tarda, y bajando rápido por el
  // árbol la respuesta de la carpeta anterior podía llegar después y pintarse encima.
  const [leida, setLeida] = React.useState<string | null>(null);
  const cargando = leida !== path;

  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/galeria/carpetas?rel=${encodeURIComponent(path)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo) return;
        setDirs((j?.folders as Dir[]) || []);
        setLeida(path);
      })
      .catch(() => {
        if (!vivo) return;
        setDirs([]);
        setLeida(path);
      });
    return () => { vivo = false; };
  }, [path]);

  // Migas de pan RELATIVAS a la raíz: no se enseña (ni se puede pisar) lo que hay por encima de la
  // carpeta del cliente.
  const dentro = path === raiz ? "" : path.slice(raiz.length + 1);
  const tramos = dentro ? dentro.split("/") : [];

  async function guardar(rel: string) {
    setBusy(true);
    setError(null);
    const r = await setProjectUploadGaleriaFolder(projectId, rel);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "No se pudo guardar."); return; }
    onClose();
    router.refresh();
  }

  async function crearAqui() {
    const name = (nombreNuevo || "").trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const r = await crearCarpetaSubidaGaleria(projectId, path, name);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setNombreNuevo(null);
    // Entrar en la carpeta recién creada: casi siempre es justo la que se quiere elegir.
    setPath(r.rel);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[75vh] w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">¿Dónde cae el material del cliente?</p>
            <p className="text-xs text-muted-foreground">
              Dentro de la carpeta de <b className="font-medium text-foreground">{raizLabel}</b> en la galería. Crea subcarpetas para tener orden.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-1 text-xs">
          <button onClick={() => setPath(raiz)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <HardDrive className="size-3.5" /> {raizLabel}
          </button>
          {tramos.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <button onClick={() => setPath([raiz, ...tramos.slice(0, i + 1)].join("/"))} className="hover:text-foreground">{seg}</button>
            </span>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
          {cargando ? (
            <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Leyendo el disco…</p>
          ) : dirs.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Sin subcarpetas aquí. Puedes crear una abajo.</p>
          ) : (
            <ul className="divide-y divide-border">
              {dirs.map((d) => (
                <li key={d.rel} className="flex items-center">
                  <button onClick={() => setPath(d.rel)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                    <Folder className="size-4 shrink-0 text-[#F47A20]" />
                    <span className="truncate">{d.name}</span>
                    {actual === d.rel ? <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">aquí cae</span> : null}
                    <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => void guardar(d.rel)}
                    disabled={busy}
                    title={`Que el material caiga en «${d.name}»`}
                    className="mr-2 shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Elegir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {nombreNuevo !== null ? (
          <form
            onSubmit={(e) => { e.preventDefault(); void crearAqui(); }}
            className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5"
          >
            <Folder className="size-4 shrink-0 text-[#F47A20]" />
            <input autoFocus value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Nombre de la carpeta nueva" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            <button type="submit" disabled={busy} aria-label="Crear" className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"><Check className="size-3.5" /></button>
            <button type="button" onClick={() => setNombreNuevo(null)} aria-label="Cancelar" className="rounded-md border border-border px-2 py-1 text-xs"><X className="size-3.5" /></button>
          </form>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setNombreNuevo(nombreNuevo === null ? "" : null)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
            <FolderPlus className="size-3.5" /> Nueva carpeta aquí
          </button>
          <span className="ml-auto" />
          {actual ? (
            <button
              onClick={() => void guardar("")}
              disabled={busy}
              title="Volver a guardar en el disco de la app en vez de la galería"
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Quitar
            </button>
          ) : null}
          <button
            onClick={() => void guardar(path)}
            disabled={busy}
            title={`Que el material caiga en «${dentro || raizLabel}»`}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Elegir esta carpeta
          </button>
        </div>
      </div>
    </div>
  );
}
