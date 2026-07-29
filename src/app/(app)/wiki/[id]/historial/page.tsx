import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { UserAvatar } from "@/components/user-avatar";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { restoreWikiRevision } from "../../actions";
import { diffLineas, diffCompacto } from "@/lib/text-diff";
import { formatBogota } from "@/lib/bogota-time";
import { ChevronRight, RotateCcw, History } from "lucide-react";

export const dynamic = "force-dynamic";

// Historial de una página: qué cambió en cada guardado y vuelta atrás. El estado actual
// cuenta como la versión de arriba, así que siempre se compara «esto» con «lo anterior».
export default async function WikiHistorialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;
  const session = await getSession();

  const page = await db.wikiPage.findUnique({
    where: { id },
    select: { id: true, title: true, icon: true, content: true, updatedAt: true },
  });
  if (!page) notFound();

  const lista = await db.wikiRevision.findMany({
    where: { pageId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { author: { select: { name: true, initials: true, avatarColor: true } } },
  });

  const puedeRestaurar = hasPermission(session, "editar_wiki");

  // Qué versión se está mirando. Por defecto, la más reciente archivada (o sea: el último
  // cambio). Se compara SIEMPRE contra lo que vino DESPUÉS, que es lo que responde a
  // «¿qué se le hizo a la página en este guardado?».
  const elegida = lista.find((r) => r.id === v) ?? lista[0] ?? null;
  const posterior = elegida
    ? (lista[lista.findIndex((r) => r.id === elegida.id) - 1] ?? { content: page.content, title: page.title, createdAt: page.updatedAt })
    : null;

  const d = elegida && posterior ? diffLineas(elegida.content, posterior.content) : null;
  const bloques = d ? diffCompacto(d, 2) : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <nav aria-label="Ruta" className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/wiki" className="hover:text-foreground">Wiki</Link>
        <ChevronRight className="size-3" />
        <Link href={`/wiki/${id}`} className="truncate hover:text-foreground">{page.title}</Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground">Historial</span>
      </nav>

      <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <History className="size-6 text-muted-foreground" /> Historial de la página
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cada guardado deja atrás la versión anterior. Se conservan las 50 últimas.
      </p>

      {lista.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Esta página aún no tiene versiones anteriores: se guardan a partir de la próxima edición.
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
          {/* Lista de versiones */}
          <div className="space-y-1">
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Versiones</p>
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
              <p className="font-semibold text-foreground">Versión actual</p>
              <p className="text-muted-foreground">{formatBogota(page.updatedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            {lista.map((r) => {
              const activa = elegida?.id === r.id;
              return (
                <Link
                  key={r.id}
                  href={`/wiki/${id}/historial?v=${r.id}`}
                  className={`block rounded-lg border px-3 py-2 text-xs transition-colors ${
                    activa ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {r.author ? <UserAvatar initials={r.author.initials} name={r.author.name} color={r.author.avatarColor} size="sm" /> : null}
                    <span className="min-w-0 flex-1 truncate font-medium">{r.author?.name ?? "Alguien"}</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    {formatBogota(r.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {r.title !== page.title ? <p className="mt-0.5 truncate italic text-muted-foreground">«{r.title}»</p> : null}
                </Link>
              );
            })}
          </div>

          {/* Comparación */}
          <div className="min-w-0">
            {elegida && d ? (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-semibold">Qué cambió en este guardado</p>
                    <p className="text-xs text-muted-foreground">
                      {d.truncado ? (
                        "La página es demasiado larga para comparar línea a línea."
                      ) : (
                        <>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">+{d.anadidas}</span>{" "}
                          <span className="font-medium text-rose-600 dark:text-rose-400">−{d.quitadas}</span> líneas
                        </>
                      )}
                    </p>
                  </div>
                  {puedeRestaurar ? (
                    <form action={restoreWikiRevision.bind(null, elegida.id)}>
                      <ConfirmSubmit
                        message="¿Volver a esta versión? La versión actual se guardará en el historial, así que también podrás deshacerlo."
                        confirmLabel="Restaurar"
                        danger={false}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                      >
                        <RotateCcw className="size-3.5" /> Restaurar esta versión
                      </ConfirmSubmit>
                    </form>
                  ) : null}
                </div>

                {d.anadidas + d.quitadas === 0 && !d.truncado ? (
                  <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                    El texto no cambió en este guardado (pudo cambiar el título, la sección o las etiquetas).
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                    {bloques.map((bloque, bi) => (
                      <div key={bi} className={bi > 0 ? "border-t border-border" : ""}>
                        {bi > 0 ? (
                          <p className="bg-muted/50 px-3 py-1 text-center text-[10px] text-muted-foreground">⋯ texto sin cambios ⋯</p>
                        ) : null}
                        {bloque.map((l, li) => (
                          <div
                            key={li}
                            className={`flex gap-2 px-3 py-0.5 font-mono text-xs ${
                              l.tipo === "mas"
                                ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                                : l.tipo === "menos"
                                  ? "bg-rose-500/10 text-rose-800 dark:text-rose-300"
                                  : "text-muted-foreground"
                            }`}
                          >
                            <span className="w-3 shrink-0 select-none opacity-60">
                              {l.tipo === "mas" ? "+" : l.tipo === "menos" ? "−" : " "}
                            </span>
                            <span className="whitespace-pre-wrap break-words">{l.texto || " "}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
