"use client";

import * as React from "react";
import { Plus, Trash2, Search, Check, Loader2, StickyNote, ChevronLeft, Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { saveNote, deleteNote, togglePinNote } from "./actions";

export type NoteItem = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  source: string;
  pinned: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
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
  const rest = body.startsWith(title) ? body.slice(title.length).trim() : body;
  return (rest || "Sin texto adicional").replace(/\s+/g, " ");
}

// Vista de Notas estilo iCloud, a PANTALLA COMPLETA (llena la ventana, sin caja exterior).
// Dos paneles en escritorio (lista + editor); en móvil, la lista ocupa todo y al tocar una nota
// se abre el editor a pantalla completa con botón «atrás». Autoguardado con debounce.
export function NotesApp({ initial }: { initial: NoteItem[] }) {
  const [notes, setNotes] = React.useState<NoteItem[]>(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(initial[0]?.id ?? null);
  const [draft, setDraft] = React.useState<{ id: string | null; title: string; content: string; category: string }>(
    initial[0] ? { id: initial[0].id, title: initial[0].title, content: initial[0].content, category: initial[0].category ?? "" } : { id: null, title: "", content: "", category: "" },
  );
  const [isNew, setIsNew] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [catFilter, setCatFilter] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  // En móvil: false = se ve la lista; true = se ve el editor. En escritorio se ven ambos.
  const [mobileEditorOpen, setMobileEditorOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, start] = React.useTransition();
  const { confirm, dialog } = useConfirmDialog();

  // Categorías presentes (para los chips de filtro).
  const categories = React.useMemo(
    () => [...new Set(notes.map((n) => (n.category ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [notes],
  );

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const byCat = catFilter ? notes.filter((n) => (n.category ?? "").trim() === catFilter) : notes;
    const bySearch = needle
      ? byCat.filter((n) => (n.title + " " + n.content + " " + (n.category ?? "")).toLowerCase().includes(needle))
      : byCat;
    // Fijadas arriba; luego por última edición (desc) — ISO compara bien lexicográficamente.
    return [...bySearch].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, q, catFilter]);

  const persist = React.useCallback(
    (d: { id: string | null; title: string; content: string; category: string }) => {
      if (!d.content.trim() && !d.title.trim()) return;
      setStatus("saving");
      start(async () => {
        const r = await saveNote({ id: d.id ?? undefined, title: d.title, content: d.content, category: d.category });
        if (r.ok && r.id) {
          const realId = r.id;
          const finalTitle = r.title ?? d.title;
          setDraft((cur) => (cur.id === d.id ? { ...cur, id: realId } : cur));
          if (selectedId === d.id || selectedId === null) setSelectedId(realId);
          setIsNew(false);
          const updatedAt = r.updatedAt ?? new Date().toISOString();
          setNotes((prev) => {
            const exists = prev.some((n) => n.id === realId);
            return exists
              ? prev.map((n) => (n.id === realId ? { ...n, title: finalTitle, content: d.content, category: d.category || null, updatedAt } : n))
              : [{ id: realId, title: finalTitle, content: d.content, category: d.category || null, source: "app", pinned: false, createdAt: r.createdAt ?? updatedAt, updatedAt }, ...prev];
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
      setMobileEditorOpen(true);
    });
  }

  function newNote() {
    flushThen(() => {
      setSelectedId(null);
      setIsNew(true);
      setDraft({ id: null, title: "", content: "", category: "" });
      setMobileEditorOpen(true);
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
      setMobileEditorOpen(false);
    });
  }

  function togglePin(n: NoteItem) {
    setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)));
    start(async () => { await togglePinNote(n.id); });
  }

  const editing = isNew || selectedId !== null;

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* ── Lista (izquierda) ── llena todo en móvil; columna fija en escritorio */}
      <aside className={cn("flex min-h-0 w-full flex-col border-r border-border lg:flex lg:w-80 lg:shrink-0", mobileEditorOpen ? "hidden lg:flex" : "flex")}>
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <span className="flex items-center gap-2 text-base font-semibold"><StickyNote className="size-5 text-amber-500" /> Notas</span>
          <button type="button" onClick={newNote} title="Nueva nota" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="size-5" />
          </button>
        </div>
        <div className="relative px-3 pb-2">
          <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="w-full rounded-md border border-input bg-muted/40 py-2 pl-7 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        {categories.length ? (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            <button type="button" onClick={() => setCatFilter(null)} className={cn("rounded-full px-2.5 py-1 text-xs font-medium transition-colors", !catFilter ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground hover:bg-accent")}>Todas</button>
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCatFilter(catFilter === c ? null : c)} className={cn("rounded-full px-2.5 py-1 text-xs font-medium transition-colors", catFilter === c ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground hover:bg-accent")}>{c}</button>
            ))}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{q ? "Sin resultados." : "No tienes notas. Toca + para crear una."}</p>
          ) : (
            filtered.map((n) => (
              <div
                key={n.id}
                className={cn("group relative mb-0.5 rounded-lg transition-colors", selectedId === n.id && !isNew ? "bg-amber-100 dark:bg-amber-500/15" : "hover:bg-accent")}
              >
                <button type="button" onClick={() => selectNote(n)} className="block w-full rounded-lg px-3 py-2.5 pr-9 text-left">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {n.pinned ? <Pin className="size-3 shrink-0 fill-amber-500 text-amber-500" /> : null}
                    <span className="truncate">{n.title}</span>
                    {n.source !== "app" ? <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-300">{SOURCE_LABEL[n.source] ?? n.source}</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground"><span className="text-foreground/70">{fmtDate(n.updatedAt)}</span> · {snippet(n.content, n.title)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => togglePin(n)}
                  title={n.pinned ? "Desfijar" : "Fijar arriba"}
                  aria-label={n.pinned ? "Desfijar nota" : "Fijar nota arriba"}
                  className={cn(
                    "absolute right-1.5 top-2 flex size-7 items-center justify-center rounded-md hover:bg-background hover:text-amber-600",
                    n.pinned ? "text-amber-600 opacity-100" : "text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100",
                  )}
                >
                  {n.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Editor (derecha) ── pantalla completa en móvil cuando hay nota abierta */}
      <section className={cn("min-h-0 min-w-0 flex-1 flex-col", mobileEditorOpen ? "flex" : "hidden lg:flex")}>
        {editing ? (
          <>
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setMobileEditorOpen(false)} className="-ml-1 flex items-center gap-0.5 rounded-md px-1 py-0.5 hover:bg-accent hover:text-foreground lg:hidden" title="Volver a la lista">
                  <ChevronLeft className="size-4" /> Notas
                </button>
                <span className="inline-flex items-center gap-1.5">
                  {status === "saving" ? <><Loader2 className="size-3.5 animate-spin" /> Guardando…</> : status === "saved" ? <><Check className="size-3.5 text-emerald-500" /> Guardado</> : draft.id ? "Autoguardado" : "Nota nueva"}
                </span>
              </div>
              {draft.id ? (
                <button
                  type="button"
                  title="Eliminar nota"
                  onClick={async () => { const id = draft.id as string; if (await confirm({ message: `¿Eliminar la nota «${draft.title || "sin título"}»?`, danger: true })) removeNote(id); }}
                  className="flex size-8 items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
            <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-2 px-5 pb-6 pt-2 sm:px-8">
              <input
                value={draft.title}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder="Título"
                className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40 sm:text-3xl"
              />
              <input
                value={draft.category}
                onChange={(e) => onChange({ category: e.target.value })}
                placeholder="Categoría (opcional)"
                className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              />
              <textarea
                value={draft.content}
                onChange={(e) => onChange({ content: e.target.value })}
                placeholder="Escribe tu nota…"
                className="min-h-0 w-full flex-1 resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <StickyNote className="size-10 text-muted-foreground/30" />
            Selecciona una nota o crea una nueva.
          </div>
        )}
      </section>
      {dialog}
    </div>
  );
}
