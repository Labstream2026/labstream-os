"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { setWikiOwner, markWikiReviewed } from "../actions";
import { WIKI_REVIEW_STALE_DAYS } from "@/lib/wiki-templates";

type Member = { id: string; name: string };

// Barra de gobernanza de una página: dueño responsable + última revisión, con aviso
// "para revisar" si nadie la ha revisado en mucho tiempo.
export function GovernanceBar({
  pageId, ownerId, team, lastReviewedAt, lastReviewedByName,
}: {
  pageId: string;
  ownerId: string | null;
  team: Member[];
  lastReviewedAt: string | null;
  lastReviewedByName: string | null;
}) {
  const [pending, start] = React.useTransition();
  const reviewedMs = lastReviewedAt ? new Date(lastReviewedAt).getTime() : 0;
  const stale = Date.now() - reviewedMs > WIKI_REVIEW_STALE_DAYS * 86400000;
  const reviewedLabel = lastReviewedAt
    ? new Date(lastReviewedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Dueño:</span>
        <select
          defaultValue={ownerId ?? ""}
          disabled={pending}
          onChange={(e) => { const fd = new FormData(); fd.set("ownerId", e.target.value); start(() => setWikiOwner(pageId, fd)); }}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— Sin asignar</option>
          {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>

      <span className="flex items-center gap-1.5 text-muted-foreground">
        {stale ? <AlertTriangle className="size-3.5 text-amber-500" /> : <CheckCircle2 className="size-3.5 text-emerald-500" />}
        {reviewedLabel ? `Revisada el ${reviewedLabel}${lastReviewedByName ? ` por ${lastReviewedByName}` : ""}` : "Sin revisar nunca"}
        {stale ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">para revisar</span> : null}
      </span>

      <button
        onClick={() => start(() => markWikiReviewed(pageId))}
        disabled={pending}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-medium hover:bg-accent disabled:opacity-50"
      >
        <CheckCircle2 className="size-3.5" /> Marcar como revisada
      </button>
    </div>
  );
}
