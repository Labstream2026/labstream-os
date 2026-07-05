"use client";

import * as React from "react";
import { X, Plus, ExternalLink, Trash2 } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { tone, TONES } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { TeamMember } from "./task-shared";
import {
  addTaskTag,
  removeTaskTag,
  getTaskLinks,
  addTaskLink,
  removeTaskLink,
  type TaskLinkItem,
  getTaskWatchers,
  addTaskWatcher,
  removeTaskWatcher,
  type TaskWatcherItem,
} from "./actions";

type Tag = { id: string; label: string; color: string };

// Bloques EXTRA del detalle de tarea: etiquetas, enlaces/referencias y seguidores. Todo optimista
// (se ve al instante) y persiste con server actions. Las etiquetas se siembran desde la tarea (la
// tarjeta se actualiza al revalidar); enlaces y seguidores se cargan con sus getters.
export function TaskExtras({
  taskId,
  projectId,
  team,
  tags: initialTags,
}: {
  taskId: string;
  projectId: string;
  team: TeamMember[];
  tags: Tag[];
}) {
  const [, start] = React.useTransition();

  // ── Etiquetas ──
  const [tags, setTags] = React.useState<Tag[]>(initialTags);
  const [tagLabel, setTagLabel] = React.useState("");
  const [tagColor, setTagColor] = React.useState("slate");
  function addTag(e: React.FormEvent) {
    e.preventDefault();
    const label = tagLabel.trim();
    if (!label) return;
    const fd = new FormData();
    fd.set("label", label);
    fd.set("color", tagColor);
    setTags((p) => [...p, { id: `tmp-${label}-${Date.now()}`, label, color: tagColor }]);
    setTagLabel("");
    start(() => addTaskTag(taskId, projectId, fd));
  }
  function delTag(id: string) {
    setTags((p) => p.filter((t) => t.id !== id));
    if (!id.startsWith("tmp-")) start(() => removeTaskTag(id, projectId));
  }

  // ── Enlaces / referencias ──
  const [links, setLinks] = React.useState<TaskLinkItem[] | null>(null);
  const [linkUrl, setLinkUrl] = React.useState("");
  const [linkLabel, setLinkLabel] = React.useState("");
  React.useEffect(() => {
    let alive = true;
    getTaskLinks(taskId).then((l) => { if (alive) setLinks(l); }).catch(() => { if (alive) setLinks([]); });
    return () => { alive = false; };
  }, [taskId]);
  function addLink(e: React.FormEvent) {
    e.preventDefault();
    const url = linkUrl.trim();
    if (!url) return;
    const fd = new FormData();
    fd.set("url", url);
    if (linkLabel.trim()) fd.set("label", linkLabel.trim());
    setLinkUrl("");
    setLinkLabel("");
    start(async () => {
      const saved = await addTaskLink(taskId, projectId, fd);
      if (saved) setLinks((p) => [...(p ?? []), saved]);
    });
  }
  function delLink(id: string) {
    setLinks((p) => (p ?? []).filter((l) => l.id !== id));
    start(() => removeTaskLink(id, projectId));
  }

  // ── Seguidores ──
  const [watchers, setWatchers] = React.useState<TaskWatcherItem[] | null>(null);
  React.useEffect(() => {
    let alive = true;
    getTaskWatchers(taskId).then((w) => { if (alive) setWatchers(w); }).catch(() => { if (alive) setWatchers([]); });
    return () => { alive = false; };
  }, [taskId]);
  function addWatcher(userId: string) {
    if (!userId) return;
    const u = team.find((t) => t.id === userId);
    if (!u || (watchers ?? []).some((w) => w.id === userId)) return;
    setWatchers((p) => [...(p ?? []), { id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }]);
    start(() => addTaskWatcher(taskId, projectId, userId));
  }
  function delWatcher(userId: string) {
    setWatchers((p) => (p ?? []).filter((w) => w.id !== userId));
    start(() => removeTaskWatcher(taskId, projectId, userId));
  }

  return (
    <>
      {/* Etiquetas */}
      <div className="border-t border-border pt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Etiquetas</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.length === 0 ? <span className="text-xs text-muted-foreground">Sin etiquetas.</span> : null}
          {tags.map((t) => (
            <span key={t.id} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", tone(t.color).chip)}>
              {t.label}
              <button type="button" onClick={() => delTag(t.id)} title="Quitar etiqueta" className="opacity-60 hover:opacity-100">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={addTag} className="mt-2 flex items-center gap-1.5">
          <input value={tagLabel} onChange={(e) => setTagLabel(e.target.value)} placeholder="+ etiqueta" className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
          <select value={tagColor} onChange={(e) => setTagColor(e.target.value)} title="Color" className="rounded-md border border-border bg-card px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
            {TONES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <button type="submit" disabled={!tagLabel.trim()} title="Añadir etiqueta" className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50">
            <Plus className="size-3.5" />
          </button>
        </form>
      </div>

      {/* Enlaces y referencias */}
      <div className="border-t border-border pt-4">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Enlaces y referencias <span className="font-normal">· también quedan en Archivos, ligados a esta tarea</span></p>
        <div className="space-y-1.5">
          {links === null ? (
            <p className="text-xs text-muted-foreground">Cargando…</p>
          ) : links.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin enlaces. Pega aquí el reel, un Drive, etc.</p>
          ) : (
            links.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                <ExternalLink className={cn("size-3.5 shrink-0", l.kind === "DRIVE" ? "text-emerald-600" : "text-muted-foreground")} />
                <a href={l.url ?? "#"} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-primary hover:underline" title={l.url ?? undefined}>{l.label || l.url}</a>
                <button type="button" onClick={() => delLink(l.id)} title="Quitar enlace" className="rounded p-1 text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
        <form onSubmit={addLink} className="mt-2 space-y-1.5">
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://… (pega el enlace)" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
          <div className="flex items-center gap-1.5">
            <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Nombre (opcional)" className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
            <button type="submit" disabled={!linkUrl.trim()} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50">Añadir</button>
          </div>
        </form>
      </div>

      {/* Seguidores */}
      <div className="border-t border-border pt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Seguidores <span className="font-normal">· reciben los avisos de la tarea</span></p>
        <div className="flex flex-wrap items-center gap-1.5">
          {watchers === null ? (
            <span className="text-xs text-muted-foreground">Cargando…</span>
          ) : watchers.length === 0 ? (
            <span className="text-xs text-muted-foreground">Nadie sigue esta tarea todavía.</span>
          ) : (
            watchers.map((w) => (
              <span key={w.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-0.5 pr-1.5 text-[11px]">
                <UserAvatar initials={w.initials} color={w.color} size="sm" />
                <span className="max-w-24 truncate">{w.name.split(" ")[0]}</span>
                <button type="button" onClick={() => delWatcher(w.id)} title="Quitar seguidor" className="opacity-60 hover:opacity-100">
                  <X className="size-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <select value="" onChange={(e) => addWatcher(e.target.value)} className="mt-2 w-full cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
          <option value="">+ Añadir seguidor…</option>
          {team.filter((u) => !(watchers ?? []).some((w) => w.id === u.id)).map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>
    </>
  );
}
