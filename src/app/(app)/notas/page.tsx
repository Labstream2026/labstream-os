import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createNote, deleteNote } from "./actions";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { StickyNote, Trash2 } from "lucide-react";
import { formatShortDate } from "@/lib/ui";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = { app: "App", chat: "Chat", whatsapp: "WhatsApp" };

export default async function NotasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const notes = await db.note.findMany({
    where: { createdById: session.id },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, title: true, content: true, category: true, source: true, createdAt: true, project: { select: { name: true, emoji: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <StickyNote className="size-6 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Notas</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Tus apuntes e ideas. Puedes crearlas aquí, pedírselas a Marcebot en el chat o por WhatsApp.
      </p>

      {/* Crear nota */}
      <form action={createNote} className="mb-8 space-y-2.5 rounded-xl border border-border bg-card p-4 shadow-sm">
        <input
          name="title"
          placeholder="Título (opcional; se genera del contenido)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
        />
        <textarea
          name="content"
          required
          rows={3}
          placeholder="Escribe tu nota…"
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            name="category"
            placeholder="Categoría (opcional)"
            className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <SubmitButton pendingText="Guardando…" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Guardar nota
          </SubmitButton>
        </div>
      </form>

      {/* Lista */}
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no tienes notas. Crea la primera arriba.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="group rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">{n.title}</h3>
                <form action={deleteNote.bind(null, n.id)}>
                  <ConfirmSubmit
                    message={`¿Eliminar la nota «${n.title}»?`}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title="Eliminar nota"
                  >
                    <Trash2 className="size-4" />
                  </ConfirmSubmit>
                </form>
              </div>
              {n.content !== n.title ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.content}</p> : null}
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>{formatShortDate(n.createdAt)}</span>
                {n.category ? <span className="rounded-full bg-muted px-2 py-0.5">{n.category}</span> : null}
                {n.project ? <span className="rounded-full bg-muted px-2 py-0.5">{n.project.emoji} {n.project.name}</span> : null}
                <span className="rounded-full border border-border px-2 py-0.5">{SOURCE_LABEL[n.source] ?? n.source}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
