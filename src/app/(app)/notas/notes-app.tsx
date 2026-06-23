"use client";

import * as React from "react";
import { Plus, Trash2, Search, Check, Loader2, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { saveNote, deleteNote } from "./actions";

export type NoteItem = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  source: string;
  createdAt: string; // ISO
};

const SOURCE_LABEL: Record<string, string> = { app: "App", chat: "Chat", whatsapp: "WhatsApp" };

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "";
  }
}
function snippet(content: string, title: string): string {
  const body = content.trim();
  // Si el contenido empieza con el título, muestra lo que sigue como vista previa.
  const rest = body.startsWith(title) ? body.slice(title.length).trim() : body;
  return (rest || "Sin texto adicional").replace(/\s+/g, " ");
}

// Vista de Notas estilo iCloud: lista a la izquierda (búsqueda + tarjetas), editor a la derecha
// con AUTOGUARDADO (debounce). Crear, editar y borrar sin recargar la página.
export function NotesApp({ initial }: { initial: NoteItem[] }) {
  const [notes, setNotes] = React.useState<NoteItem[]>(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(initial[0]?.id ?? null);
  const [draft, setDraft] = React.useState<{ id: string | null; title: string; content: string; category: string }>(
    initial[0] ? { id: initial[0].id, title: initial[0].title, content: initial[0].content, category: initial[0].category ?? "" } : { id: null, title: "", content: "", category: "" },
  );
  const [isNew, setIsNew] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, start] = React.useTransition();
  const { confirm, dialog } = useConfirmDialog();

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return notes;
    return notes.filter((n) => (n.title + " " + n.content + " " + (n.category ?? "")).toLowerCase().includes(needle));
  }, [notes, q]);

  // Persiste el borrador actual (crea o actualiza) y refleja el resultado en la lista.
  const persist = React.useCallback(
    (d: { id: string | null; title: string; content: string; category: string }) => {
      if (!d.content.trim() && !d.title.trim()) return; // nota vacía → no guardar
      setStatus("saving");
      start(async () => {
        const r = await saveNote({ id: d.id ?? undefined, title: d.title, content: d.content, category: d.category });
        if (r.ok && r.id) {
          const realId = r.id;
          const finalTitle = r.title ?? d.title;
          setDraft((cur) => (cur.id === d.id ? { ...cur, id: realId } : cur));
          if (selectedId === d.id || selectedId === null) setSelectedId(realId);
          setIsNew(false);
          setNotes((prev) => {
            const exists = prev.some((n) => n.id === realId);
            const updated: NoteItem = { id: realId, title: finalTitle, content: d.content, category: d.category || null, source: "app", createdAt: r.createdAt ?? new Date(0).toISOString() };
            const list = exists ? prev.map((n) => (n.id === realId ? { ...n, ...updated } : n)) : [updated, ...prev];
            return list;
          });
          setStatus("saved");
          setTimeout(() => setStatus("idle"), 1200);
        } else {
          setStatus("idle");
        }
      });
    },
    [selectedId],
  );

  // Cambio en cualquier campo → actualiza borrador y programa guardado (debounce 700ms).
  function onChange(patch: Partial<{ title: string; content: string; category: string }>) {
    setDraft((cur) => {
      const next = { ...cur, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => persist(next), 700);
      return next;
    });
  }

  function flushThen(fn: () => void) {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (draft.content.trim() || draft.title.trim()) persist(draft);
    fn();
  }

  function selectNote(n: NoteItem) {
    flushThen(() => {
      setSelectedId(n.id);
      setIsNew(false);
      setDraft({ id: n.id, title: n.title, content: n.content, category: n.category ?? "" });
    });
  }

  function newNote() {
    flushThen(() => {
      setSelectedId(null);
      setIsNew(true);
      setDraft({ id: null, title: "", content: "", category: "" });
    });
  }

  function removeNote(id: string) {
    start(async () => {
      await deleteNote(id);
      setNotes((prev) => {
        const rest = prev.filter((n) => n.id !== id);
        if (selectedId === id) {
          if (rest[0]) { setSelectedId(rest[0].id); setDraft({ id: rest[0].id, title: rest[0].title, content: rest[0].content, category: rest[0].category ?? "" }); }
          else { setSelectedId(null); setDraft({ id: null, title: "", content: "", category: "" }); setIsNew(false); }
        }
        return rest;
      });
    });
  }

  const editing = isNew || selectedId !== null;

  return (
    <div className="flex h-[78vh] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* ── Lista (izquierda) ── */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-muted/20">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-sm font-semibold"><StickyNote className="size-4 text-amber-500" /> Notas</span>
          <button type="button" onClick={newNote} title="Nueva nota" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="size-4" />
          </button>
        </div>
        <div className="relative px-2.5 py-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {isNew ? (
            <div className="mb-1 rounded-lg bg-amber-100 px-3 py-2 dark:bg-amber-500/15">
              <p className="truncate text-sm font-medium">{draft.title || "Nueva nota"}</p>
              <p className="truncate text-xs text-muted-foreground">Escribiendo…</p>
            </div>
          ) : null}
          {filtered.length === 0 && !isNew ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{q ? "Sin resultados." : "No tienes notas."}</p>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => selectNote(n)}
                className={cn("mb-1 block w-full rounded-lg px-3 py-2 text-left transition-colors", selectedId === n.id && !isNew ? "bg-amber-100 dark:bg-amber-500/15" : "hover:bg-accent")}
              >
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  <span className="truncate">{n.title}</span>
                  {n.source !== "app" ? <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-300">{SOURCE_LABEL[n.source] ?? n.source}</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground"><span className="text-foreground/70">{fmtDate(n.createdAt)}</span> · {snippet(n.content, n.title)}</p>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Editor (derecha) ── */}
      <section className="flex min-w-0 flex-1 flex-col">
        {editing ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                {status === "saving" ? <><Loader2 className="size-3.5 animate-spin" /> Guardando…</> : status === "saved" ? <><Check className="size-3.5 text-emerald-500" /> Guardado</> : draft.id ? "Autoguardado" : "Nota nueva"}
              </span>
              {draft.id ? (
                <button
                  type="button"
                  title="Eliminar nota"
                  onClick={async () => { const id = draft.id as string; if (await confirm({ message: `¿Eliminar la nota «${draft.title || "sin título"}»?`, danger: true })) removeNote(id); }}
                  className="flex size-7 items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 px-5 py-4">
              <input
                value={draft.title}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder="Título"
                className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
              />
              <input
                value={draft.category}
                onChange={(e) => onChange({ category: e.target.value })}
                placeholder="Categoría (opcional)"
                className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/50"
              />
              <textarea
                value={draft.content}
                onChange={(e) => onChange({ content: e.target.value })}
                placeholder="Escribe tu nota…"
                className="min-h-0 flex-1 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <StickyNote className="size-8 text-muted-foreground/40" />
            Selecciona una nota o crea una nueva.
          </div>
        )}
      </section>
      {dialog}
    </div>
  );
}
