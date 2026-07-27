"use client";

import * as React from "react";
import { Plus, Trash2, Search, Check, Loader2, StickyNote, ChevronLeft, Pin, PinOff, Tag, FolderOpen, Eye, Pencil, Bell, BellOff, Users, Lock, RotateCcw, ArrowLeft, AlertTriangle, ListChecks } from "lucide-react";
import { IconNotas, IconPapelera, IconTareas } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { renderMarkdown } from "@/lib/markdown";
import { toggleNoteTask, countNoteTasks, noteTaskLines, noteTaskKey } from "@/lib/note-tasks";
import { saveNote, deleteNote, togglePinNote, restoreNote, purgeNote, emptyNoteTrash } from "./actions";
import { createTaskFromNoteLine, createTaskFromNote, setNoteTaskDone } from "./task-actions";
import { setNoteReminder, clearNoteReminder, type NoteReminder } from "./reminder-actions";

export type NoteItem = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  source: string;
  pinned: boolean;
  projectId: string | null;
  clientId: string | null;
  color: string | null;
  remindAt: string | null; // ISO | null
  visibility: string; // private | project | team
  mine: boolean; // ¿la creó el usuario actual? (las ajenas compartidas van en solo lectura)
  ownerName: string | null; // nombre del dueño cuando es una nota compartida por otro
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

const VISIBILITY_LABEL: Record<string, string> = { private: "Privada", project: "Proyecto", team: "Equipo" };

// Paleta de color por nota (clave guardada → hex para pintar). Funciona en claro/oscuro.
const NOTE_COLORS: { key: string; hex: string }[] = [
  { key: "amber", hex: "#eda100" },
  { key: "blue", hex: "#2a78d6" },
  { key: "green", hex: "#1d9e75" },
  { key: "violet", hex: "#7f77dd" },
  { key: "rose", hex: "#e24b4a" },
  { key: "gray", hex: "#888780" },
];
const noteHex = (key: string | null): string | null => NOTE_COLORS.find((c) => c.key === key)?.hex ?? null;

// ISO → valor de <input type="datetime-local"> ("YYYY-MM-DDTHH:mm") en hora local.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtReminder(iso: string | null): string {
  if (!iso) return "";
  try { return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return ""; }
}

// Nota en la PAPELERA: solo lo justo para listarla, restaurarla o eliminarla de verdad.
// `archivedAgo` («hoy», «hace 3 días») lo calcula el servidor: aquí no se lee el reloj
// durante el render (regla de pureza de React).
export type TrashedNote = {
  id: string;
  title: string;
  snippet: string;
  category: string | null;
  clientId: string | null;
  color: string | null;
  archivedAt: string | null; // ISO
  archivedAgo: string;
  updatedAt: string; // ISO
};

// Tarea nacida de una línea de la nota. La clave del mapa es el TEXTO normalizado de la
// línea (`noteTaskKey`), no su número: así el vínculo aguanta que la nota se reordene.
export type NoteTaskLink = { id: string; label: string; href: string; done: boolean };
// Referencia estable para las notas sin tareas (no crear un objeto nuevo en cada render).
const EMPTY_LINKS: Record<string, NoteTaskLink> = {};

export type NoteProject = { id: string; name: string; emoji: string | null };
export type NoteClient = { id: string; name: string; emoji: string | null; accentColor: string | null };

type GroupBy = "cliente" | "categoria";

const SOURCE_LABEL: Record<string, string> = { app: "App", chat: "Chat", whatsapp: "WhatsApp", api: "API" };

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "";
  }
}
function snippet(content: string, title: string): string {
  const body = content.trim();
  const rest = body.startsWith(title) ? body.slice(title.length).trim() : body;
  return (rest || "Sin texto adicional").replace(/\s+/g, " ");
}

// `baseUpdatedAt` = la versión de la nota sobre la que se está escribiendo. Viaja en cada
// guardado para detectar que alguien la editó en otro dispositivo (control de concurrencia).
// El recordatorio YA NO viaja en el borrador: vive en su propio `Reminder` (ver
// reminder-actions.ts). Así un autoguardado con datos viejos no puede pisarlo.
type Draft = { id: string | null; title: string; content: string; category: string; projectId: string; clientId: string; color: string; visibility: string; baseUpdatedAt: string | null };
const draftOf = (n: NoteItem): Draft => ({ id: n.id, title: n.title, content: n.content, category: n.category ?? "", projectId: n.projectId ?? "", clientId: n.clientId ?? "", color: n.color ?? "", visibility: n.visibility, baseUpdatedAt: n.updatedAt });
const emptyDraft: Draft = { id: null, title: "", content: "", category: "", projectId: "", clientId: "", color: "", visibility: "private", baseUpdatedAt: null };

// Lo que se manda al servidor en cada guardado (server action o sendBeacon: el mismo cuerpo).
const savePayload = (d: Draft) => ({
  id: d.id ?? undefined,
  title: d.title,
  content: d.content,
  category: d.category,
  projectId: d.projectId || null,
  clientId: d.clientId || null,
  color: d.color || null,
  visibility: d.visibility,
  baseUpdatedAt: d.baseUpdatedAt,
});

// Vista de Notas estilo iCloud, a PANTALLA COMPLETA (llena la ventana, sin caja exterior).
// Dos paneles en escritorio (lista + editor); en móvil la lista ocupa todo y al tocar una nota
// se abre el editor a pantalla completa con botón «atrás». Autoguardado con debounce.
// La lista se AGRUPA por cliente o por categoría (tags) para encontrar fácil; el cliente y la
// categoría son tags grandes y editables en el editor. Selección neutra (sin recuadro naranja).
export function NotesApp({ initial, initialId, trashed, taskLinks, noteReminders, projects, clients, canCreateTasks }: { initial: NoteItem[]; initialId: string | null; trashed: TrashedNote[]; taskLinks: Record<string, Record<string, NoteTaskLink>>; noteReminders: Record<string, NoteReminder>; projects: NoteProject[]; clients: NoteClient[]; canCreateTasks: boolean }) {
  const projectsById = React.useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const projOf = (id: string | null) => (id ? projectsById.get(id) ?? null : null);
  const clientsById = React.useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const clientOf = (id: string | null) => (id ? clientsById.get(id) ?? null : null);

  const [notes, setNotes] = React.useState<NoteItem[]>(initial);
  // Papelera: notas borradas que TODAVÍA se pueden recuperar. `trashOpen` cambia la lista
  // por la papelera sin salir de la pantalla.
  const [trash, setTrash] = React.useState<TrashedNote[]>(trashed);
  const [trashOpen, setTrashOpen] = React.useState(false);
  // La nota abierta: la de `?nota=<id>` si vino en el enlace, o la primera de la lista.
  const opened = (initialId ? initial.find((n) => n.id === initialId) : null) ?? initial[0] ?? null;
  const [selectedId, setSelectedId] = React.useState<string | null>(opened?.id ?? null);
  const [draft, setDraft] = React.useState<Draft>(opened ? draftOf(opened) : emptyDraft);
  const [isNew, setIsNew] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [catFilter, setCatFilter] = React.useState<string | null>(null);
  const [groupBy, setGroupBy] = React.useState<GroupBy>("cliente");
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  // En móvil: false = se ve la lista; true = se ve el editor. En escritorio se ven ambos.
  const [mobileEditorOpen, setMobileEditorOpen] = React.useState(false);
  // Cuerpo: editar (textarea Markdown) o vista (render con checkboxes interactivos).
  const [bodyMode, setBodyMode] = React.useState<"edit" | "view">("edit");
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, start] = React.useTransition();
  const { confirm, dialog } = useConfirmDialog();
  // Versión del servidor cuando alguien editó la misma nota en otro lado (aviso de conflicto).
  const [conflict, setConflict] = React.useState<{ title: string; content: string; updatedAt: string } | null>(null);
  // Vínculos nota→tarea por nota (clave: texto normalizado de la línea) y el último mensaje
  // de esa maquinaria («Tarea creada: …» o el motivo por el que no se pudo).
  const [links, setLinksAll] = React.useState<Record<string, Record<string, NoteTaskLink>>>(taskLinks);
  const [taskNote, setTaskNote] = React.useState<string | null>(null);
  // Recordatorio vigente de cada nota (el de verdad, no el campo suelto de antes).
  const [reminders, setReminders] = React.useState<Record<string, NoteReminder>>(noteReminders);
  // ¿Hay tecleo sin guardar? Lo usa el envío de emergencia al cerrar/ocultar la pestaña.
  const dirty = React.useRef(false);
  const latest = React.useRef<Draft>(emptyDraft);
  const readOnlyRef = React.useRef(false);

  // Categorías presentes (para autocompletar y los chips de filtro).
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

  // Agrupación por cliente o por categoría: los grupos "Sin …" van al final.
  const groups = React.useMemo(() => {
    const map = new Map<string, { key: string; label: string; color: string | null; emoji: string | null; notes: NoteItem[] }>();
    const order: string[] = [];
    for (const n of filtered) {
      let key: string, label: string, color: string | null = null, emoji: string | null = null;
      if (groupBy === "cliente") {
        const c = clientOf(n.clientId);
        key = c ? `c:${c.id}` : "c:none";
        label = c ? c.name : "Sin cliente";
        color = c?.accentColor ?? null;
        emoji = c?.emoji ?? null;
      } else {
        const cat = (n.category ?? "").trim();
        key = cat ? `k:${cat}` : "k:none";
        label = cat || "Sin categoría";
      }
      if (!map.has(key)) { map.set(key, { key, label, color, emoji, notes: [] }); order.push(key); }
      map.get(key)!.notes.push(n);
    }
    return order
      .map((k) => map.get(k)!)
      .sort((a, b) => Number(a.key.endsWith(":none")) - Number(b.key.endsWith(":none")));
  }, [filtered, groupBy, clientsById]);

  // Nota abierta y si es de SOLO LECTURA (compartida por otra persona). En ese caso no se
  // edita ni autoguarda; se muestra en modo vista.
  const currentNote = selectedId ? notes.find((n) => n.id === selectedId) ?? null : null;
  const readOnly = !isNew && !!currentNote && !currentNote.mine;

  const persist = React.useCallback(
    (d: Draft, force = false) => {
      if (!d.content.trim() && !d.title.trim()) return;
      setStatus("saving");
      start(async () => {
        const r = await saveNote(savePayload(d), force ? { force: true } : undefined);
        if (r.ok) {
          const realId = r.id;
          const finalTitle = r.title;
          const updatedAt = r.updatedAt;
          dirty.current = false;
          setConflict(null);
          setDraft((cur) => (cur.id === d.id ? { ...cur, id: realId, baseUpdatedAt: updatedAt } : cur));
          if (selectedId === d.id || selectedId === null) setSelectedId(realId);
          setIsNew(false);
          setNotes((prev) => {
            const exists = prev.some((n) => n.id === realId);
            return exists
              ? prev.map((n) => (n.id === realId ? { ...n, title: finalTitle, content: d.content, category: d.category || null, projectId: d.projectId || null, clientId: d.clientId || null, color: d.color || null, visibility: d.visibility, updatedAt } : n))
              : [{ id: realId, title: finalTitle, content: d.content, category: d.category || null, source: "app", pinned: false, projectId: d.projectId || null, clientId: d.clientId || null, color: d.color || null, remindAt: null, visibility: d.visibility, mine: true, ownerName: null, createdAt: r.createdAt, updatedAt }, ...prev];
          });
          setStatus("saved");
          setTimeout(() => setStatus("idle"), 1200);
        } else {
          // La nota cambió en otro dispositivo: no se pisa nada, se pregunta.
          if (r.conflict && r.server) setConflict(r.server);
          setStatus("idle");
        }
      });
    },
    [selectedId],
  );

  function onChange(patch: Partial<Omit<Draft, "id">>) {
    if (readOnly) return; // las notas compartidas por otros no se editan aquí
    dirty.current = true;
    setDraft((cur) => {
      const next = { ...cur, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => persist(next), 700);
      return next;
    });
  }

  function flushThen(fn: () => void) {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!readOnly && (draft.content.trim() || draft.title.trim())) persist(draft);
    setConflict(null);
    fn();
  }

  // Clic en la vista renderizada. Dos botones viven ahí dentro (HTML del render):
  //  · la casilla → marca/desmarca la línea (y completa/reabre su tarea, si tiene);
  //  · «＋ tarea» → crea la tarea con el texto de esa línea.
  function onViewClick(e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly) return;
    const target = e.target as HTMLElement;

    const add = target.closest<HTMLElement>("[data-md-task-add]");
    if (add) {
      e.preventDefault();
      const line = Number(add.dataset.mdTaskAdd);
      if (Number.isInteger(line)) makeTaskFromLine(line);
      return;
    }

    const btn = target.closest<HTMLElement>("[data-md-task]");
    if (!btn) return;
    const line = Number(btn.dataset.mdTask);
    if (!Number.isInteger(line)) return;
    const rows = noteTaskLines(draft.content);
    const row = rows.find((r) => r.line === line);
    const next = toggleNoteTask(draft.content, line);
    if (next === draft.content) return;
    onChange({ content: next });
    // Si esa línea tiene tarea, el estado viaja también al tablero.
    const link = row ? myLinks[noteTaskKey(row.text)] : undefined;
    if (link && row) {
      const done = !row.done;
      setLinks((prev) => ({ ...prev, [noteTaskKey(row.text)]: { ...link, done } }));
      start(async () => {
        const r = await setNoteTaskDone(link.id, done);
        if (!r.ok) { setLinks((prev) => ({ ...prev, [noteTaskKey(row.text)]: link })); setTaskNote(r.error ?? "No se pudo actualizar la tarea"); }
      });
    }
  }

  // Una línea → una tarea, con el mismo motor de captura rápida de Mis tareas.
  function makeTaskFromLine(line: number) {
    const noteId = draft.id;
    if (!noteId) return; // una nota sin guardar todavía no tiene de dónde colgar la tarea
    const row = noteTaskLines(draft.content).find((r) => r.line === line);
    if (!row) return;
    setTaskNote(null);
    start(async () => {
      const r = await createTaskFromNoteLine(noteId, line);
      if (r.ok && r.task) {
        setLinks((prev) => ({ ...prev, [r.task!.key]: { id: r.task!.id, label: r.task!.title, href: r.task!.href, done: r.task!.done } }));
        setTaskNote(`Tarea creada: ${r.task.title}`);
      } else {
        setTaskNote(r.error ?? "No se pudo crear la tarea");
      }
    });
  }

  // ── Recordatorio de la nota ──
  // Poner/cambiar la fecha crea o actualiza un Reminder atado a la nota. La lista sigue
  // pintando su chip desde `remindAt`, que el servidor mantiene como espejo.
  function applyReminder(local: string, frequency: string) {
    const noteId = draft.id;
    if (!noteId) return;
    if (!local) { dropReminder(); return; }
    const [date, time] = local.split("T");
    if (!date || !time) return;
    start(async () => {
      const r = await setNoteReminder(noteId, { date, time: time.slice(0, 5), frequency });
      if (r.ok && r.reminder) {
        setReminders((prev) => ({ ...prev, [noteId]: r.reminder! }));
        setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, remindAt: r.reminder!.whenIso } : n)));
      } else {
        setTaskNote(r.error ?? "No se pudo poner el recordatorio");
      }
    });
  }

  function dropReminder() {
    const noteId = draft.id;
    if (!noteId) return;
    setReminders((prev) => { const next = { ...prev }; delete next[noteId]; return next; });
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, remindAt: null } : n)));
    start(async () => { await clearNoteReminder(noteId); });
  }

  // La nota entera → una tarea, con sus casillas como checklist.
  function makeTaskFromNote() {
    const noteId = draft.id;
    if (!noteId) return;
    setTaskNote(null);
    start(async () => {
      const r = await createTaskFromNote(noteId);
      setTaskNote(r.ok ? (r.items ? `Tarea creada con ${r.items} ${r.items === 1 ? "ítem" : "ítems"} de checklist` : "Tarea creada") : (r.error ?? "No se pudo crear la tarea"));
    });
  }

  // ── Resolver un conflicto ──
  // «Conservar lo mío»: se guarda el borrador pisando la otra versión (force).
  // «Traer lo de allá»: se descarta el borrador y se carga lo que hay en el servidor.
  function keepMine() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    persist(draft, true);
  }
  function takeTheirs() {
    if (!conflict) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const server = conflict;
    dirty.current = false;
    setConflict(null);
    setDraft((cur) => ({ ...cur, title: server.title, content: server.content, baseUpdatedAt: server.updatedAt }));
    setNotes((prev) => prev.map((n) => (n.id === draft.id ? { ...n, title: server.title, content: server.content, updatedAt: server.updatedAt } : n)));
  }

  function selectNote(n: NoteItem) {
    flushThen(() => {
      setSelectedId(n.id);
      setIsNew(false);
      setDraft(draftOf(n));
      setMobileEditorOpen(true);
      // La dirección sigue a la nota abierta: se puede copiar y compartir el enlace.
      try { window.history.replaceState(null, "", `/notas?nota=${n.id}`); } catch { /* da igual */ }
    });
  }

  function newNote() {
    flushThen(() => {
      setSelectedId(null);
      setIsNew(true);
      // Hereda el cliente/categoría del filtro o grupo activo para crear "dentro" de él.
      setDraft({ ...emptyDraft, category: catFilter ?? "" });
      setMobileEditorOpen(true);
    });
  }

  // Borrar = mandar a la papelera (recuperable). La nota salta de la lista a `trash` en el acto.
  function removeNote(id: string) {
    const gone = notes.find((n) => n.id === id);
    start(async () => {
      await deleteNote(id);
      if (gone) {
        setTrash((prev) => [
          { id: gone.id, title: gone.title, snippet: gone.content.trim().replace(/\s+/g, " ").slice(0, 120), category: gone.category, clientId: gone.clientId, color: gone.color, archivedAt: null, archivedAgo: "hoy", updatedAt: gone.updatedAt },
          ...prev.filter((t) => t.id !== id),
        ]);
      }
      setNotes((prev) => {
        const rest = prev.filter((n) => n.id !== id);
        if (selectedId === id) {
          if (rest[0]) { setSelectedId(rest[0].id); setDraft(draftOf(rest[0])); }
          else { setSelectedId(null); setDraft(emptyDraft); setIsNew(false); }
        }
        return rest;
      });
      setMobileEditorOpen(false);
    });
  }

  // Restaurar desde la papelera: vuelve a la lista y se abre para que se vea que volvió.
  function undelete(t: TrashedNote) {
    setTrash((prev) => prev.filter((x) => x.id !== t.id));
    start(async () => {
      const r = await restoreNote(t.id);
      if (!r.ok) { setTrash((prev) => [t, ...prev]); return; }
      // La lista se recompone del servidor al refrescar; mientras tanto la mostramos con
      // lo que sabemos (título, cliente, color) para no dejar un hueco.
      setNotes((prev) => prev.some((n) => n.id === t.id) ? prev : [{ id: t.id, title: t.title, content: t.snippet, category: t.category, source: "app", pinned: false, projectId: null, clientId: t.clientId, color: t.color, remindAt: null, visibility: "private", mine: true, ownerName: null, createdAt: t.updatedAt, updatedAt: t.updatedAt }, ...prev]);
      setTrashOpen(false);
    });
  }

  function purge(t: TrashedNote) {
    setTrash((prev) => prev.filter((x) => x.id !== t.id));
    start(async () => { await purgeNote(t.id); });
  }

  function emptyTrash() {
    const backup = trash;
    setTrash([]);
    start(async () => { const r = await emptyNoteTrash(); if (!r.ok) setTrash(backup); });
  }

  function togglePin(n: NoteItem) {
    setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)));
    start(async () => { await togglePinNote(n.id); });
  }

  const editing = isNew || selectedId !== null;
  const draftClient = clientOf(draft.clientId || null);
  const draftTasks = React.useMemo(() => countNoteTasks(draft.content), [draft.content]);
  // Tareas ya creadas desde ESTA nota (por texto de línea) y cómo actualizarlas.
  const myLinks: Record<string, NoteTaskLink> = (draft.id ? links[draft.id] : undefined) ?? EMPTY_LINKS;
  // Recordatorio de la nota abierta y su valor para el <input type="datetime-local">.
  const myReminder: NoteReminder | null = (draft.id ? reminders[draft.id] : undefined) ?? null;
  const remInput = toLocalInput(myReminder?.whenIso ?? null);
  function setLinks(fn: (prev: Record<string, NoteTaskLink>) => Record<string, NoteTaskLink>) {
    const id = draft.id;
    if (!id) return;
    setLinksAll((all) => ({ ...all, [id]: fn(all[id] ?? {}) }));
  }

  // Las notas compartidas por otros se muestran siempre en modo vista.
  React.useEffect(() => { if (readOnly) setBodyMode("view"); }, [readOnly, selectedId]);

  // ── Nada de texto perdido al salir ──
  // El autoguardado espera 700 ms tras la última tecla. Si en ese momento se cierra la
  // pestaña, se cambia de app o se navega a otra sección, ese tramo se perdía. Aquí se manda
  // el último borrador por `sendBeacon`, que el navegador entrega aunque la página ya se esté
  // yendo (un server action normal no llegaría: la página muere antes de la respuesta).
  React.useEffect(() => { latest.current = draft; readOnlyRef.current = readOnly; });

  const flushOnExit = React.useCallback(() => {
    if (!dirty.current || readOnlyRef.current) return;
    const d = latest.current;
    if (!d.content.trim() && !d.title.trim()) return;
    try {
      const body = new Blob([JSON.stringify(savePayload(d))], { type: "application/json" });
      if (navigator.sendBeacon("/api/notas/autosave", body)) dirty.current = false;
    } catch {
      // Si el navegador lo rechaza, el autoguardado normal lo intentará al volver.
    }
  }, []);

  React.useEffect(() => {
    const onHidden = () => { if (document.visibilityState === "hidden") flushOnExit(); };
    window.addEventListener("pagehide", flushOnExit);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flushOnExit);
      document.removeEventListener("visibilitychange", onHidden);
      flushOnExit(); // al salir de /notas navegando dentro de la app
    };
  }, [flushOnExit]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* ── Lista (izquierda) ── llena todo en móvil; columna fija en escritorio */}
      <aside className={cn("flex min-h-0 w-full flex-col border-r border-border lg:flex lg:w-80 lg:shrink-0", mobileEditorOpen ? "hidden lg:flex" : "flex")}>
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          {trashOpen ? (
            <button type="button" onClick={() => setTrashOpen(false)} className="-ml-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-base font-semibold hover:bg-accent">
              <ArrowLeft className="size-4 text-muted-foreground" /> Papelera
            </button>
          ) : (
            <span className="flex items-center gap-2 text-base font-semibold"><IconNotas className="size-5" /> Notas</span>
          )}
          {trashOpen ? (
            trash.length ? (
              <button
                type="button"
                onClick={async () => { if (await confirm({ message: `¿Eliminar definitivamente ${trash.length === 1 ? "la nota de la papelera" : `las ${trash.length} notas de la papelera`}? Esto no se puede deshacer.`, danger: true })) emptyTrash(); }}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                Vaciar
              </button>
            ) : null
          ) : (
            <button type="button" onClick={newNote} title="Nueva nota" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <Plus className="size-5" />
            </button>
          )}
        </div>

        {/* ── Papelera ── notas borradas que todavía se pueden recuperar */}
        {trashOpen ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {trash.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">La papelera está vacía.</p>
            ) : (
              trash.map((t) => (
                <div key={t.id} className="group mb-0.5 rounded-lg px-3 py-2.5 hover:bg-accent">
                  <p className="truncate text-sm font-semibold text-muted-foreground">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground/80">{t.archivedAgo}{t.snippet ? ` · ${t.snippet}` : ""}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button type="button" onClick={() => undelete(t)} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium hover:bg-accent">
                      <RotateCcw className="size-3" /> Restaurar
                    </button>
                    <button
                      type="button"
                      onClick={async () => { if (await confirm({ message: `¿Eliminar definitivamente «${t.title}»? Esto no se puede deshacer.`, danger: true })) purge(t); }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3" /> Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
        <>
        <div className="relative px-3 pb-2">
          <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="w-full rounded-md border border-input bg-muted/40 py-2 pl-7 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>

        {/* Agrupar por (tags): cliente o categoría. */}
        <div className="flex items-center gap-2 px-3 pb-2">
          <span className="text-[11px] text-muted-foreground">Agrupar:</span>
          <div className="inline-flex overflow-hidden rounded-md border border-border text-[11px]">
            {(["cliente", "categoria"] as GroupBy[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupBy(g)}
                className={cn("px-2.5 py-1 font-medium capitalize transition-colors", groupBy === g ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}
              >
                {g === "cliente" ? "Cliente" : "Categoría"}
              </button>
            ))}
          </div>
        </div>

        {categories.length ? (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            <button type="button" onClick={() => setCatFilter(null)} className={cn("rounded-full px-2.5 py-1 text-xs font-medium transition-colors", !catFilter ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:bg-accent")}>Todas</button>
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCatFilter(catFilter === c ? null : c)} className={cn("rounded-full px-2.5 py-1 text-xs font-medium transition-colors", catFilter === c ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:bg-accent")}>{c}</button>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{q ? "Sin resultados." : "No tienes notas. Toca + para crear una."}</p>
          ) : (
            groups.map((grp) => (
              <div key={grp.key} className="mb-2">
                <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                  {groupBy === "cliente" ? (
                    <span className="size-2 shrink-0 rounded-[3px]" style={{ background: grp.color ?? "hsl(var(--muted-foreground))" }} />
                  ) : null}
                  <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{grp.emoji ? `${grp.emoji} ` : ""}{grp.label}</span>
                  <span className="text-[10px] text-muted-foreground/70">{grp.notes.length}</span>
                </div>
                {grp.notes.map((n) => {
                  const selected = selectedId === n.id && !isNew;
                  // En la vista por cliente mostramos la categoría como subtag (y viceversa).
                  const sub = groupBy === "cliente" ? (n.category ?? "").trim() : (clientOf(n.clientId)?.name ?? "");
                  const tasks = countNoteTasks(n.content);
                  return (
                    <div key={n.id} className={cn("group relative mb-0.5 rounded-lg transition-colors", selected ? "bg-muted" : "hover:bg-accent")}>
                      {selected ? <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" /> : noteHex(n.color) ? <span className="absolute inset-y-1 left-0 w-1 rounded-full" style={{ background: noteHex(n.color)! }} /> : null}
                      <button type="button" onClick={() => selectNote(n)} className="block w-full rounded-lg px-3 py-2.5 pr-9 text-left">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                          {n.pinned ? <Pin className="size-3 shrink-0 fill-amber-500 text-amber-500" /> : null}
                          <span className="truncate">{n.title}</span>
                          {n.source !== "app" ? <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{SOURCE_LABEL[n.source] ?? n.source}</span> : null}
                          {!n.mine ? <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground" title={`Compartida por ${n.ownerName ?? "otro"}`}><Eye className="size-2.5" /> {n.ownerName ?? "Compartida"}</span> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground"><span className="text-foreground/70">{fmtDate(n.updatedAt)}</span> · {snippet(n.content, n.title)}</p>
                        {(sub || n.remindAt || tasks.total > 0) ? (
                          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {sub ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{sub}</span> : null}
                            {/* Cuántas casillas van hechas: se ve sin abrir la nota. */}
                            {tasks.total > 0 ? (
                              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", tasks.done === tasks.total ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                                <ListChecks className="size-2.5" /> {tasks.done}/{tasks.total}
                              </span>
                            ) : null}
                            {n.remindAt ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"><Bell className="size-2.5" /> {fmtReminder(n.remindAt)}</span> : null}
                          </span>
                        ) : null}
                      </button>
                      {n.mine ? (
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
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        </>
        )}

        {/* Pie: acceso a la papelera (solo si hay algo que recuperar o ya estamos en ella) */}
        {!trashOpen && trash.length > 0 ? (
          <button
            type="button"
            onClick={() => setTrashOpen(true)}
            className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <IconPapelera className="size-3.5" /> Papelera <span className="text-muted-foreground/70">({trash.length})</span>
          </button>
        ) : null}
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
                  {readOnly ? <><Eye className="size-3.5" /> Compartida por {currentNote?.ownerName ?? "otro"} · solo lectura</> : status === "saving" ? <><Loader2 className="size-3.5 animate-spin" /> Guardando…</> : status === "saved" ? <><Check className="size-3.5 text-emerald-500" /> Guardado</> : draft.id ? "Autoguardado" : "Nota nueva"}
                </span>
              </div>
              {draft.id && !readOnly ? (
                <button
                  type="button"
                  title="Mandar a la papelera"
                  onClick={async () => { const id = draft.id as string; if (await confirm({ message: `¿Mandar «${draft.title || "sin título"}» a la papelera? Podrás restaurarla desde ahí.` })) removeNote(id); }}
                  className="flex size-8 items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
            {/* Conflicto: la misma nota se editó en otro dispositivo. No se pisa nada sin preguntar. */}
            {conflict ? (
              <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
                <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
                  <p className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="size-4 shrink-0 text-amber-600" /> Esta nota cambió en otro lugar
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Se guardó otra versión el {fmtDate(conflict.updatedAt)} — para no perder nada, elige cuál se queda.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" onClick={keepMine} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90">Conservar lo mío</button>
                    <button type="button" onClick={takeTheirs} className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent">Traer lo de allá</button>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 px-5 pb-6 pt-2 sm:px-8">
              <input
                value={draft.title}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder="Título"
                // El outline global :focus-visible (color --ring) pinta una caja alrededor de
                // esta superficie grande de texto; aquí el cursor ya indica el foco, así que la
                // suprimimos para un editor más limpio (no afecta el outline del resto de la app).
                style={{ outline: "none" }}
                className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40 sm:text-3xl"
              />
              {/* Tags grandes: cliente + categoría (+ proyecto opcional). */}
              <div className="flex flex-wrap items-center gap-2">
                {clients.length ? (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40" title="Cliente de la nota">
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: draftClient?.accentColor ?? "hsl(var(--muted-foreground))" }} />
                    <select value={draft.clientId} onChange={(e) => onChange({ clientId: e.target.value })} className="cursor-pointer bg-transparent outline-none">
                      <option value="">Sin cliente</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ""}{c.name}</option>)}
                    </select>
                  </label>
                ) : null}
                <label className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors focus-within:border-primary/40" title="Categoría (escribe para crear o elige una)">
                  <Tag className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    list="note-categories"
                    value={draft.category}
                    onChange={(e) => onChange({ category: e.target.value })}
                    placeholder="Categoría"
                    className="w-28 bg-transparent outline-none placeholder:text-muted-foreground/50"
                  />
                </label>
                <datalist id="note-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                {projects.length ? (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40" title="Vincular a un proyecto">
                    <FolderOpen className="size-3.5 shrink-0" />
                    <select value={draft.projectId} onChange={(e) => onChange({ projectId: e.target.value })} className="max-w-[40vw] cursor-pointer bg-transparent outline-none">
                      <option value="">Sin proyecto</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.emoji ? `${p.emoji} ` : ""}{p.name}</option>)}
                    </select>
                  </label>
                ) : null}
                {/* Recordatorio */}
                {/* Recordatorio DE VERDAD: crea un Reminder atado a la nota (sale en
                    /recordatorios, se pospone, se repite y su aviso abre esta nota). */}
                <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors", myReminder ? "border-primary/40 text-foreground" : "border-border text-muted-foreground hover:border-primary/40")} title={draft.id ? "Recordatorio de esta nota" : "Guarda la nota para poder ponerle un recordatorio"}>
                  {myReminder ? <Bell className="size-3.5 shrink-0 text-primary" /> : <BellOff className="size-3.5 shrink-0" />}
                  <input
                    type="datetime-local"
                    value={remInput}
                    disabled={!draft.id}
                    onChange={(e) => applyReminder(e.target.value, myReminder?.frequency ?? "UNA_VEZ")}
                    className="bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-60 [color-scheme:light] dark:[color-scheme:dark]"
                  />
                  {myReminder ? (
                    <>
                      <select
                        value={myReminder.frequency}
                        onChange={(e) => applyReminder(remInput, e.target.value)}
                        title="Cada cuánto vuelve a avisar"
                        className="cursor-pointer bg-transparent text-xs text-muted-foreground outline-none"
                      >
                        <option value="UNA_VEZ">una vez</option>
                        <option value="DIARIO">cada día</option>
                        <option value="SEMANAL">cada semana</option>
                        <option value="MENSUAL">cada mes</option>
                      </select>
                      <button type="button" onClick={(e) => { e.preventDefault(); dropReminder(); }} aria-label="Quitar recordatorio" className="text-muted-foreground hover:text-foreground">×</button>
                    </>
                  ) : null}
                </label>
                {/* Color de la nota */}
                <div className="flex items-center gap-1.5">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => onChange({ color: draft.color === c.key ? "" : c.key })}
                      title={`Color ${c.key}`}
                      aria-label={`Color ${c.key}`}
                      className={cn("size-5 rounded-full border border-black/10 transition hover:scale-110", draft.color === c.key && "ring-2 ring-foreground/40 ring-offset-2 ring-offset-background")}
                      style={{ background: c.hex }}
                    />
                  ))}
                </div>
                {/* Visibilidad: privada / proyecto / equipo */}
                <label className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40" title="Quién puede ver esta nota">
                  {draft.visibility === "team" ? <Users className="size-3.5 shrink-0 text-muted-foreground" /> : draft.visibility === "project" ? <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" /> : <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
                  <select value={draft.visibility} disabled={readOnly} onChange={(e) => onChange({ visibility: e.target.value })} className="cursor-pointer bg-transparent outline-none disabled:cursor-default">
                    <option value="private">Privada</option>
                    <option value="project">Proyecto</option>
                    <option value="team">Equipo</option>
                  </select>
                </label>
              </div>
              {/* Cuerpo: solo lectura (compartida por otro) o editar/ver Markdown con checkboxes */}
              {readOnly ? (
                <div className="min-h-0 flex-1 overflow-y-auto text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: draft.content.trim() ? renderMarkdown(draft.content) : '<p class="text-muted-foreground">Esta nota no tiene contenido.</p>' }} />
              ) : (
                <>
                  <div className="flex items-center gap-1 border-b border-border pb-1.5">
                    <button type="button" onClick={() => setBodyMode("edit")} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors", bodyMode === "edit" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-accent")}><Pencil className="size-3.5" /> Editar</button>
                    <button type="button" onClick={() => setBodyMode("view")} className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors", bodyMode === "view" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-accent")}><Eye className="size-3.5" /> Vista</button>
                    {/* Progreso de las casillas + atajo a la vista, donde se pueden marcar. */}
                    {draftTasks.total > 0 ? (
                      <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <ListChecks className="size-3.5" />
                        {draftTasks.done} de {draftTasks.total} {draftTasks.done === draftTasks.total ? "· todo listo" : "hechas"}
                        {bodyMode === "edit" ? <button type="button" onClick={() => setBodyMode("view")} className="rounded px-1 underline underline-offset-2 hover:text-foreground">marcar</button> : null}
                      </span>
                    ) : null}
                    {/* La nota entera → una tarea (con sus casillas como checklist). */}
                    {canCreateTasks && draft.id ? (
                      <button
                        type="button"
                        onClick={makeTaskFromNote}
                        title="Crea una tarea con el título de la nota; sus casillas quedan como checklist"
                        className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", draftTasks.total > 0 ? "" : "ml-auto")}
                      >
                        <IconTareas className="size-3.5" /> Convertir en tarea
                      </button>
                    ) : null}
                  </div>
                  {/* Resultado de la última acción de tareas (creada, o por qué no se pudo). */}
                  {taskNote ? (
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <ListChecks className="size-3 shrink-0" /> {taskNote}
                      <button type="button" onClick={() => setTaskNote(null)} aria-label="Ocultar aviso" className="rounded px-1 hover:bg-accent">×</button>
                    </p>
                  ) : null}
                  {bodyMode === "edit" ? (
                    <textarea
                      ref={bodyRef}
                      value={draft.content}
                      onChange={(e) => onChange({ content: e.target.value })}
                      placeholder="Escribe tu nota… Markdown: **negrita**, # título, - lista."
                      // Sin caja de foco naranja (outline global) en el cuerpo de la nota; el
                      // cursor ya indica dónde estás escribiendo. Editor más limpio.
                      style={{ outline: "none" }}
                      className="min-h-0 w-full flex-1 resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/40"
                    />
                  ) : (
                    // Vista: las casillas «- [ ]» son BOTONES de verdad. El clic sube por el
                    // contenedor (delegación), se lee el nº de línea de `data-md-task` y se
                    // alterna [ ]↔[x] en el texto — con su autoguardado, como cualquier edición.
                    <div
                      onClick={onViewClick}
                      className="min-h-0 flex-1 overflow-y-auto text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: draft.content.trim() ? renderMarkdown(draft.content, { interactiveTasks: true, taskActions: canCreateTasks && !!draft.id, taskLinks: myLinks }) : '<p class="text-muted-foreground">Nada que mostrar todavía.</p>' }}
                    />
                  )}
                </>
              )}
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
