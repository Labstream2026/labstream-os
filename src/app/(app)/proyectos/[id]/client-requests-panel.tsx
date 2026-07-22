"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wrench, CheckCircle2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { REQUEST_TYPES, REQUEST_STATUS } from "@/lib/client-portal";
import { setRequestStatus } from "@/app/(app)/solicitudes/actions";

export type RequestRow = {
  id: string;
  type: string;
  title: string;
  details: string | null;
  status: string;
  responseNote: string | null;
  creatorName: string;
  createdAtLabel: string;
};

// Panel del EQUIPO en el Resumen del proyecto: las solicitudes que el cliente envió desde su
// portal. Tomar (En curso) avisa al cliente; Resolver cierra con una nota que él ve en su lista.
export function ClientRequestsPanel({ requests, canWrite }: { requests: RequestRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [resolving, setResolving] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const open = requests.filter((r) => r.status !== "RESUELTA");
  const closed = requests.filter((r) => r.status === "RESUELTA");

  const act = (id: string, status: "EN_CURSO" | "RESUELTA", n?: string) => {
    setError(null);
    start(async () => {
      const r = await setRequestStatus(id, status, n);
      if (!r.ok) {
        setError(r.error ?? "No se pudo actualizar.");
        return;
      }
      setResolving(null);
      setNote("");
      router.refresh();
    });
  };

  const Row = ({ r }: { r: RequestRow }) => {
    const meta = REQUEST_TYPES[r.type] ?? { label: r.type, emoji: "📝" };
    const st = REQUEST_STATUS[r.status] ?? { label: r.status, className: "bg-muted text-muted-foreground" };
    return (
      <div className={cn("rounded-lg border border-border px-3 py-2.5", r.status === "RESUELTA" && "opacity-70")}>
        <div className="flex flex-wrap items-start gap-2.5">
          <span>{meta.emoji}</span>
          <div className="min-w-44 flex-1">
            <p className="text-sm font-medium">{r.title}</p>
            <p className="text-xs text-muted-foreground">
              {r.creatorName} · {meta.label} · {r.createdAtLabel}
            </p>
            {r.details ? <p className="mt-1 whitespace-pre-line text-xs text-foreground/75">{r.details}</p> : null}
            {r.responseNote ? <p className="mt-1 text-xs text-muted-foreground">Respuesta: {r.responseNote}</p> : null}
          </div>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", st.className)}>{st.label}</span>
          {canWrite && r.status !== "RESUELTA" ? (
            <div className="flex shrink-0 gap-1.5">
              {r.status === "RECIBIDA" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(r.id, "EN_CURSO")}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50"
                >
                  <Wrench className="size-3" /> Tomar
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setResolving(resolving === r.id ? null : r.id);
                  setNote("");
                }}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"
              >
                <CheckCircle2 className="size-3" /> Resolver…
              </button>
            </div>
          ) : null}
        </div>
        {resolving === r.id ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              autoFocus
              placeholder="Respuesta para el cliente (opcional): qué se hizo o qué sigue…"
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => act(r.id, "RESUELTA", note)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />} Resolver
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2.5 flex items-center gap-2">
        <Inbox className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Solicitudes del cliente</h3>
        {open.length ? (
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
            {open.length} abierta{open.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      {error ? <p className="mb-2 text-xs text-destructive">{error}</p> : null}
      <div className="space-y-2">
        {open.map((r) => (
          <Row key={r.id} r={r} />
        ))}
        {closed.length ? (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Resueltas · {closed.length}
            </summary>
            <div className="mt-2 space-y-2">
              {closed.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
