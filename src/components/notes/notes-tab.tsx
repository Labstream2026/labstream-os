"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, ListChecks, Loader2, Plus, StickyNote, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { quickNote } from "@/app/(app)/notas/quick-actions";

// ── Pestaña «Notas» de un proyecto o de un cliente ──
// Hasta ahora, vincular una nota a un proyecto o a un cliente no servía de nada: ese dato no
// se leía en ningún lado. Aquí SE LEE: cada proyecto y cada cliente enseñan sus notas, y se
// puede apuntar una nueva sin salir de la página. Editar sigue siendo cosa de /notas (una
// sola pantalla de edición, un solo autoguardado), así que cada fila lleva allí.

export type TabNote = {
  id: string;
  title: string;
  snippet: string;
  when: string; // «25 de jul, 02:15 p. m.» (lo formatea el servidor)
  category: string | null;
  done: number;
  total: number;
  reminder: string | null; // «28 de jul, 09:30 a. m.» o null
  ownerName: string | null; // null = es mía
};

export function NotesTab({
  notes,
  projectId = null,
  clientId = null,
  canWrite,
}: {
  notes: TabNote[];
  projectId?: string | null;
  clientId?: string | null;
  canWrite: boolean;
}) {
  const [rows, setRows] = React.useState<TabNote[]>(notes);
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, start] = React.useTransition();

  function save() {
    const body = text.trim();
    if (!body) return;
    setError(null);
    start(async () => {
      const r = await quickNote({ text: body, projectId, clientId });
      if (r.ok && r.note) {
        setRows((prev) => [{ id: r.note!.id, title: r.note!.title, snippet: r.note!.snippet, when: "ahora", category: null, done: 0, total: 0, reminder: null, ownerName: null }, ...prev]);
        setText("");
      } else {
        setError(r.error ?? "No se pudo guardar la nota");
      }
    });
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); } }}
            rows={2}
            placeholder={`Apunta algo de ${projectId ? "este proyecto" : "este cliente"}… La primera línea será el título.`}
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{error ?? "⌘/Ctrl + Enter para guardar"}</span>
            <button
              type="button"
              onClick={save}
              disabled={saving || !text.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Guardar nota
            </button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          <StickyNote className="size-8 text-muted-foreground/30" />
          Sin notas todavía.
          {canWrite ? <span className="text-xs">Lo que apuntes aquí también aparece en Notas.</span> : null}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((n) => (
            <li key={n.id}>
              <Link href={`/notas?nota=${n.id}`} className="block px-4 py-3 transition-colors hover:bg-accent">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  <span className="truncate">{n.title}</span>
                  {n.ownerName ? (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"><Users className="size-2.5" /> {n.ownerName}</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground"><span className="text-foreground/70">{n.when}</span>{n.snippet ? ` · ${n.snippet}` : ""}</p>
                {(n.category || n.total > 0 || n.reminder) ? (
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {n.category ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{n.category}</span> : null}
                    {n.total > 0 ? (
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", n.done === n.total ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                        <ListChecks className="size-2.5" /> {n.done}/{n.total}
                      </span>
                    ) : null}
                    {n.reminder ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"><Bell className="size-2.5" /> {n.reminder}</span> : null}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
