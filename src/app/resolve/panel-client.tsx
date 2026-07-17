"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveReviewComment } from "@/app/(app)/proyectos/[id]/actions";

// Componentes cliente del panel /resolve. El «puente» window.labstream lo inyecta el
// plugin de Workflow Integration de Resolve (preload.js): si existe, los timecodes saltan
// el cabezal y «Sincronizar marcadores» pinta el timeline; si no (navegador normal), el
// panel sigue siendo útil como checklist y avisa cómo obtener la integración completa.

export type MarkerItem = {
  id: string;
  seconds: number | null;
  body: string;
  author: string;
  priority: string;
  resolved: boolean;
  version: number | null;
  hasDrawing: boolean;
};

type Bridge = {
  shell: string;
  version: string;
  jump: (args: { seconds: number; offsetSeconds: number }) => Promise<{ ok: boolean; timecode?: string; error?: string }>;
  syncMarkers: (args: {
    items: MarkerItem[];
    opts: { offsetSeconds: number; includeResolved: boolean };
  }) => Promise<{ ok: boolean; created?: number; removed?: number; failed?: number; error?: string }>;
  info: () => Promise<{ ok: boolean; timeline?: string; fps?: number; error?: string }>;
};

declare global {
  interface Window {
    labstream?: Bridge;
  }
}

const OFFSET_KEY = "lsResolveOffsetSeconds";

function getOffset(): number {
  if (typeof window === "undefined") return 0;
  const v = parseFloat(window.localStorage.getItem(OFFSET_KEY) ?? "0");
  return Number.isFinite(v) ? v : 0;
}

// El puente lo inyecta el preload ANTES de que cargue la página: su referencia es estable.
// useSyncExternalStore evita el mismatch de hidratación (en el servidor no existe window).
const noopSubscribe = () => () => {};
function useBridge(): Bridge | null {
  return useSyncExternalStore(noopSubscribe, () => window.labstream ?? null, () => null);
}
function useStoredOffset(): string {
  return useSyncExternalStore(noopSubscribe, () => window.localStorage.getItem(OFFSET_KEY) ?? "0", () => "0");
}

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
      title="Refrescar"
    >
      {pending ? "…" : "⟳"}
    </button>
  );
}

// Chip de timecode: en Resolve salta el cabezal; fuera, solo referencia visual.
export function JumpButton({ seconds, label }: { seconds: number; label: string }) {
  const [flash, setFlash] = useState<string | null>(null);
  async function jump() {
    const b = window.labstream;
    if (!b) {
      setFlash("solo en Resolve");
      setTimeout(() => setFlash(null), 1500);
      return;
    }
    try {
      const r = await b.jump({ seconds, offsetSeconds: getOffset() });
      setFlash(r.ok ? "▶" : r.error ?? "no se pudo");
    } catch {
      setFlash("no se pudo");
    }
    setTimeout(() => setFlash(null), 1500);
  }
  return (
    <button
      type="button"
      onClick={jump}
      className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[11px] font-medium text-indigo-300 hover:bg-indigo-500/30"
      title="Ir a este momento en el timeline"
    >
      {flash ?? label}
    </button>
  );
}

// Marcar hecha / reabrir — usa la MISMA server action que la web del equipo
// (resolveReviewComment: sesión + canWriteProject + aviso in-app al equipo).
export function ResolveToggle({ commentId, projectId, resolved }: { commentId: string; projectId: string; resolved: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await resolveReviewComment(commentId, projectId, !resolved);
            router.refresh();
          } catch {
            setError(true);
            setTimeout(() => setError(false), 2000);
          }
        })
      }
      className={`rounded px-2 py-0.5 text-[10px] font-medium ${
        resolved
          ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/30"
      } disabled:opacity-50`}
      title={resolved ? "Volver a dejarla como pendiente" : "Marcar como realizada"}
    >
      {error ? "sin permiso" : pending ? "…" : resolved ? "Reabrir" : "✓ Hecha"}
    </button>
  );
}

// Captura/dibujo del cliente: miniatura inline + zoom a pantalla del panel.
export function ZoomImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- data-URL de BD, no pasa por el optimizador */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onClick={() => setOpen(true)}
        className="mt-1.5 max-h-44 w-auto cursor-zoom-in rounded-md border border-zinc-800"
      />
      {open ? (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-3"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full rounded" />
        </div>
      ) : null}
    </>
  );
}

// Barra fija inferior: estado del puente, offset y sincronización de marcadores.
export function MarkersBar({ items, deliverableId }: { items: MarkerItem[]; deliverableId: string }) {
  const bridge = useBridge();
  const storedOffset = useStoredOffset();
  const [editedOffset, setEditedOffset] = useState<string | null>(null);
  const offset = editedOffset ?? storedOffset;
  const [includeResolved, setIncludeResolved] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function saveOffset(v: string) {
    setEditedOffset(v);
    const n = parseFloat(v.replace(",", "."));
    window.localStorage.setItem(OFFSET_KEY, String(Number.isFinite(n) ? n : 0));
  }

  async function sync() {
    if (!bridge) return;
    setBusy(true);
    setStatus("Sincronizando…");
    try {
      const payload = includeResolved ? items : items.filter((i) => !i.resolved);
      const r = await bridge.syncMarkers({
        items: payload,
        opts: { offsetSeconds: getOffset(), includeResolved },
      });
      setStatus(
        r.ok
          ? `Marcadores: ${r.created ?? 0} pintados, ${r.removed ?? 0} retirados${r.failed ? `, ${r.failed} sin sitio` : ""}.`
          : r.error ?? "No se pudo sincronizar.",
      );
    } catch {
      setStatus("No se pudo hablar con Resolve.");
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 px-3 py-2 backdrop-blur">
      <div className="mx-auto flex w-full max-w-xl flex-wrap items-center gap-2 text-[11px]">
        {bridge ? (
          <>
            <button
              type="button"
              onClick={sync}
              disabled={busy}
              className="rounded bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Sincronizar marcadores
            </button>
            <label className="flex items-center gap-1 text-zinc-400">
              <input
                type="checkbox"
                checked={includeResolved}
                onChange={(e) => setIncludeResolved(e.target.checked)}
                className="accent-indigo-500"
              />
              incluir hechas (verde)
            </label>
            <label className="flex items-center gap-1 text-zinc-400">
              Offset (s)
              <input
                value={offset}
                onChange={(e) => saveOffset(e.target.value)}
                inputMode="decimal"
                className="w-12 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-200"
              />
            </label>
          </>
        ) : (
          <span className="text-zinc-500">
            Ábrelo dentro de Resolve (Workspace ▸ Workflow Integrations) para saltar al timeline y pintar marcadores.
          </span>
        )}
        <span className="grow" />
        <a
          href={`/revisiones/${deliverableId}`}
          target="_blank"
          rel="noreferrer"
          className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
        >
          Abrir en la web
        </a>
      </div>
      {status ? <p className="mx-auto mt-1 w-full max-w-xl text-[11px] text-zinc-400">{status}</p> : null}
    </div>
  );
}
