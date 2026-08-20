import Link from "next/link";
import { PenLine, X } from "lucide-react";
import { IconCorreo } from "@/components/icons";
import { db } from "@/lib/db";
import { formatBogota } from "@/lib/bogota-time";
import { asuntoLimpio } from "@/lib/correo/hilos";
import { EmptyState } from "@/components/ui/empty-state";
import { agregarContactoProyecto, quitarContactoProyecto } from "./contactos-actions";

// ── La pestaña Correo del proyecto ──────────────────────────────────────────
// Arriba, los CONTACTOS del proyecto (los correos del cliente para ESTE trabajo) y el botón
// «Escribir al cliente»: abre el compositor del buzón PROPIO ya dirigido a ellos, y el
// enviado queda colgado del proyecto. Abajo, los hilos que el equipo asignó aquí (o que
// cayeron solos por regla/herencia) — la memoria de lo que el cliente pidió por correo.
// Solo cabeceras: el cuerpo completo vive en la bandeja de su dueño; si el hilo es TUYO,
// el enlace te lleva directo a él.

export async function CorreoProyecto({ projectId, sessionUserId, gestiona = false }: { projectId: string; sessionUserId: string | null; gestiona?: boolean }) {
  const contactos = await db.projectContact.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: { email: true, nombre: true },
  });
  const paraEscribir = contactos.map((c) => c.email).join(", ");
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

  // ── Los contactos del proyecto + «Escribir al cliente» ──
  const bloqueContactos = (
    <div className="mb-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px] font-semibold">Contactos del proyecto</p>
        {contactos.map((c) => (
          <span key={c.email} className="group inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11.5px]">
            {c.nombre ? <b>{c.nombre}</b> : null} <span className="text-muted-foreground">{c.email}</span>
            {gestiona ? (
              <form action={quitarContactoProyecto.bind(null, projectId, c.email)} className="hidden group-hover:block">
                <button type="submit" title="Quitar contacto" className="rounded p-0.5 text-muted-foreground hover:text-destructive"><X className="size-3" /></button>
              </form>
            ) : null}
          </span>
        ))}
        {contactos.length === 0 ? <span className="text-[11.5px] text-muted-foreground">agrega los correos del cliente para este proyecto</span> : null}
        {contactos.length && sessionUserId ? (
          <Link
            href={`/correo?para=${encodeURIComponent(paraEscribir)}&proy=${projectId}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90"
            title="Abre TU correo con el mensaje ya dirigido a los contactos; el enviado queda colgado de este proyecto"
          >
            <PenLine className="size-3.5" /> Escribir al cliente
          </Link>
        ) : null}
      </div>
      {gestiona ? (
        <form action={agregarContactoProyecto.bind(null, projectId)} className="mt-2 flex flex-wrap items-center gap-1.5">
          <input name="nombre" placeholder="Nombre (opcional)" maxLength={120}
            className="rounded-md border border-input bg-background px-2 py-1 text-[12px] outline-none focus:ring-2 focus:ring-ring" />
          <input name="email" type="email" required placeholder="correo@cliente.com"
            className="min-w-48 rounded-md border border-input bg-background px-2 py-1 text-[12px] outline-none focus:ring-2 focus:ring-ring" />
          <button className="rounded-md border border-border px-2.5 py-1 text-[12px] font-medium hover:bg-accent">Agregar</button>
        </form>
      ) : null}
    </div>
  );

  if (mensajes.length === 0) {
    return (
      <div>
        {bloqueContactos}
        <EmptyState
          icon={<IconCorreo className="size-4" />}
          title="Sin correos asignados"
          description="Desde tu bandeja de Correo, abre un hilo del cliente y usa «Asignar a proyecto»: quedará aquí, a la vista del equipo, y lo que llegue después al hilo cae solo."
        />
      </div>
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
    <div>
      {bloqueContactos}
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
    </div>
  );
}
