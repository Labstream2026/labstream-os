"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert, Trash2, X } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { restoreProject, purgeProject, getProjectPurgePreflight, type ProjectPurgePreflight } from "@/app/(app)/proyectos/[id]/actions";
import { restoreClient, purgeClient, getClientPurgePreflight, type ClientPurgePreflight } from "@/app/(app)/clientes/actions";

// Acciones de una fila de la papelera: Restaurar (vuelve a las listas) y Borrar definitivamente.
// El borrado definitivo abre un diálogo de PURGA que dice CON NÚMEROS qué muere (y qué se
// conserva) y exige ESCRIBIR EL NOMBRE para habilitar el botón — es la única acción realmente
// irreversible de la app, así que se gana su fricción.
export function PapeleraActions({ kind, id, name }: { kind: "project" | "client"; id: string; name: string }) {
  const [pending, start] = React.useTransition();
  const [purgeOpen, setPurgeOpen] = React.useState(false);
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();

  const restore = () =>
    start(async () => {
      if (kind === "project") {
        // Puede negarse: si el CLIENTE del proyecto sigue en la papelera, primero se restaura
        // el cliente (eso revive de una los proyectos que arrastró).
        const r = await restoreProject(id);
        if (!r.ok) {
          await confirm({ title: "No se pudo restaurar", message: r.error ?? "Error al restaurar.", confirmLabel: "Entendido" });
          return;
        }
      } else {
        await restoreClient(id);
      }
      router.refresh();
    });

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={restore}
        disabled={pending}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
      >
        Restaurar
      </button>
      <button
        type="button"
        onClick={() => setPurgeOpen(true)}
        disabled={pending}
        title="Borrar definitivamente"
        className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
      >
        <Trash2 className="size-3.5" /> Borrar
      </button>
      {dialog}
      <PurgeDialog kind={kind} id={id} name={name} open={purgeOpen} onClose={() => setPurgeOpen(false)} />
    </div>
  );
}

// Diálogo de PURGA definitiva. Carga el pre-vuelo al abrir (setState asíncrono en .then) y
// solo habilita «Borrar para siempre» cuando lo escrito coincide con el nombre (sin acentos
// ni mayúsculas: pedir exactitud de tildes sería fricción sin seguridad extra).
const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function PurgeDialog({
  kind,
  id,
  name,
  open,
  onClose,
}: {
  kind: "project" | "client";
  id: string;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [proj, setProj] = React.useState<ProjectPurgePreflight | null>(null);
  const [cli, setCli] = React.useState<ClientPurgePreflight | null>(null);
  const [typed, setTyped] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (kind === "project") {
      getProjectPurgePreflight(id)
        .then((d) => { if (!cancelled) setProj(d); })
        .catch(() => { if (!cancelled) setProj(null); });
    } else {
      getClientPurgePreflight(id)
        .then((d) => { if (!cancelled) setCli(d); })
        .catch(() => { if (!cancelled) setCli(null); });
    }
    return () => { cancelled = true; };
  }, [open, kind, id]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const loaded = kind === "project" ? proj !== null : cli !== null;
  const match = norm(typed) === norm(name);

  const doPurge = () => {
    setError(null);
    startTransition(async () => {
      const r = kind === "project" ? await purgeProject(id) : await purgeClient(id);
      if (r.ok) { onClose(); router.refresh(); }
      else setError(r.error ?? "No se pudo borrar.");
    });
  };

  const li = (n: number, label: string) => (n > 0 ? <li>{n} {label}</li> : null);

  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Borrar definitivamente ${name}`}
        className="absolute left-1/2 top-1/2 w-[min(29rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-destructive/40 bg-card p-5 shadow-2xl duration-200 animate-in fade-in zoom-in-95"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10">
            <ShieldAlert className="size-4.5 text-destructive" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">Borrar «{name}» para siempre</h2>
            <p className="text-xs text-muted-foreground">Esta acción NO se puede deshacer. No hay papelera después de esto.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {!loaded ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Contando lo que se borraría…</p>
        ) : kind === "project" && proj ? (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-[13px]">
            <p className="font-medium text-destructive">Se borra en cascada:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {li(proj.tasks, "tareas (con sus horas y comentarios)")}
              {li(proj.files, "archivos")}
              {li(proj.deliverables, "entregables (con versiones y revisiones)")}
              <li>el canal de chat del proyecto</li>
            </ul>
            {proj.quotes || proj.invoices ? (
              <p className="mt-2 text-muted-foreground">Se conservan (desvinculadas): {proj.quotes} cotización{proj.quotes === 1 ? "" : "es"} y {proj.invoices} factura{proj.invoices === 1 ? "" : "s"} — los registros financieros no se pierden.</p>
            ) : null}
          </div>
        ) : cli ? (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-[13px]">
            <p className="font-medium text-destructive">Se borra en cascada TODO lo del cliente:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {li(cli.projects, "proyectos completos")}
              {li(cli.tasks, "tareas")}
              {li(cli.files, "archivos")}
              {li(cli.deliverables, "entregables")}
              {li(cli.quotes, "cotizaciones")}
              {li(cli.invoices, "facturas (incluidos registros de cobro)")}
              {li(cli.channels, "canales de chat (con sus mensajes)")}
              {li(cli.portalMembers, "accesos del portal")}
            </ul>
          </div>
        ) : null}

        <label className="mt-4 block text-xs font-medium text-muted-foreground">
          Escribe <span className="select-all font-semibold text-foreground">{name}</span> para confirmar:
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={name}
            autoFocus
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-destructive"
          />
        </label>

        {error ? <p className="mt-3 text-xs font-medium text-destructive">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="rounded-lg border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60">
            Cancelar
          </button>
          <button onClick={doPurge} disabled={pending || !loaded || !match} className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3.5 py-1.5 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Borrar para siempre
          </button>
        </div>
      </div>
    </div>
  );
}
