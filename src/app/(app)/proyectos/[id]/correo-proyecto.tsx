import Link from "next/link";
import { Mail } from "lucide-react";
import { db } from "@/lib/db";
import { formatBogota } from "@/lib/bogota-time";
import { asuntoLimpio } from "@/lib/correo/hilos";
import { EmptyState } from "@/components/ui/empty-state";

// ── La pestaña Correo del proyecto ──────────────────────────────────────────
// Los hilos que alguien del equipo ASIGNÓ a este proyecto desde su bandeja (o que cayeron
// solos por una regla). Es la memoria de lo que el cliente pidió por correo, visible para
// todo el que ve el proyecto — asignar ES la decisión de compartirlo. Solo se muestran las
// cabeceras (quién, asunto, fragmento): el cuerpo completo vive en la bandeja de su dueño,
// y si el hilo es TUYO, el enlace te lleva directo a él.

export async function CorreoProyecto({ projectId, sessionUserId }: { projectId: string; sessionUserId: string | null }) {
  const mensajes = await db.mailMessage.findMany({
    where: { projectId, folder: { not: "PAPELERA" } },
    orderBy: { date: "desc" },
    take: 200,
    select: {
      id: true, threadKey: true, folder: true, fromName: true, fromEmail: true, toList: true,
      subject: true, snippet: true, date: true,
      account: { select: { userId: true, user: { select: { name: true } } } },
    },
  });

  if (mensajes.length === 0) {
    return (
      <EmptyState
        icon={<Mail className="size-4" />}
        title="Sin correos asignados"
        description="Desde tu bandeja de Correo, abre un hilo del cliente y usa «Asignar a proyecto»: quedará aquí, a la vista del equipo, y lo que llegue después al hilo cae solo."
      />
    );
  }

  // Agrupar por hilo: la fila muestra el mensaje MÁS RECIENTE y cuántos lleva.
  const hilos = new Map<string, { ultimo: (typeof mensajes)[number]; n: number; ids: string[] }>();
  for (const m of mensajes) {
    const clave = m.threadKey ?? m.id;
    const h = hilos.get(clave);
    if (h) {
      h.n += 1;
      h.ids.push(m.id);
    } else {
      hilos.set(clave, { ultimo: m, n: 1, ids: [m.id] });
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <p className="border-b border-border bg-muted/30 px-4 py-2 text-[11.5px] text-muted-foreground">
        Hilos de correo que el equipo colgó de este proyecto — lo que el cliente pidió, por escrito y con fecha.
      </p>
      <ul className="divide-y divide-border">
        {[...hilos.values()].map(({ ultimo: m, n, ids }) => {
          const esMio = sessionUserId != null && m.account.userId === sessionUserId;
          const quien = m.folder === "ENVIADOS" ? `${m.account.user?.name ?? "—"} → ${m.toList || "cliente"}` : `${m.fromName || m.fromEmail || "—"}`;
          const fila = (
            <>
              <span className="w-44 shrink-0 truncate text-[13px] font-medium">{quien}{n > 1 ? <span className="font-normal text-muted-foreground"> ({n})</span> : null}</span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {asuntoLimpio(m.subject)} <span className="text-muted-foreground">— {m.snippet}</span>
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatBogota(m.date, { day: "numeric", month: "short" }).replace(".", "")}</span>
              <span className="shrink-0 text-[10.5px] text-muted-foreground">buzón de {m.account.user?.name ?? "—"}</span>
            </>
          );
          return (
            <li key={m.id}>
              {esMio ? (
                <Link href={`/correo?c=recibidos&h=${ids.reverse().join(".")}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                  {fila}
                </Link>
              ) : (
                <span className="flex items-center gap-3 px-4 py-2.5">{fila}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
