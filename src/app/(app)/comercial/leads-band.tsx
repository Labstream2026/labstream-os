import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { UserAvatar } from "@/components/user-avatar";
import { cambiarEstadoLead, tomarLead, convertirLeadEnCliente } from "./leads-actions";

// Los prospectos que deja el asistente de WhatsApp cuando le escribe alguien de fuera. Van
// ARRIBA del embudo de propuestas porque eso son: la etapa anterior a que exista una propuesta.
// Quien no tenga `gestionar_leads` no ve nada — la banda entera desaparece.

const PILL: Record<string, string> = {
  NUEVO: "bg-primary/10 text-primary",
  CONTACTADO: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  COTIZANDO: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

const SIGUIENTE: Record<string, { estado: string; label: string }> = {
  NUEVO: { estado: "CONTACTADO", label: "Contactado" },
  CONTACTADO: { estado: "COTIZANDO", label: "Cotizando" },
  COTIZANDO: { estado: "GANADO", label: "Ganado" },
};

function fecha(d: Date): string {
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export async function LeadsBand() {
  const session = await getSession();
  if (!hasPermission(session, "gestionar_leads")) return null;

  const leads = await db.lead.findMany({
    where: { estado: { notIn: ["GANADO", "PERDIDO"] } },
    orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
    take: 40,
    select: {
      id: true, nombre: true, empresa: true, interes: true, mensaje: true, presupuesto: true,
      telefono: true, email: true, canal: true, estado: true, createdAt: true,
      atendidoPor: { select: { name: true, initials: true, avatarColor: true } },
    },
  });

  const puedeCrearClientes = hasPermission(session, "crear_clientes");

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">Prospectos</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{leads.length}</span>
        <span className="text-xs text-muted-foreground">Gente de fuera que escribió al asistente y aún no es cliente.</span>
      </div>

      {leads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nadie nuevo ha escrito todavía. Cuando alguien de fuera le escriba al asistente por WhatsApp, sus datos aparecen aquí.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {leads.map((l) => {
            const paso = SIGUIENTE[l.estado];
            return (
              <div key={l.id} className="flex flex-col rounded-xl border border-border bg-card p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.nombre}</p>
                    {l.empresa ? <p className="truncate text-xs text-muted-foreground">{l.empresa}</p> : null}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL[l.estado] ?? "bg-muted text-muted-foreground"}`}>
                    {l.estado.toLowerCase()}
                  </span>
                </div>

                {l.interes ? <p className="mt-2 line-clamp-2 text-sm">{l.interes}</p> : null}
                {l.mensaje ? <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{l.mensaje}</p> : null}

                <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {l.telefono ? <div className="truncate">📱 {l.telefono}</div> : null}
                  {l.email ? <div className="truncate">✉️ {l.email}</div> : null}
                  {l.presupuesto ? <div className="truncate">💬 dijo: {l.presupuesto}</div> : null}
                </dl>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    {l.atendidoPor ? (
                      <>
                        <UserAvatar initials={l.atendidoPor.initials} color={l.atendidoPor.avatarColor} size="sm" />
                        <span className="truncate">{l.atendidoPor.name}</span>
                      </>
                    ) : (
                      <form action={tomarLead}>
                        <input type="hidden" name="id" value={l.id} />
                        <button type="submit" className="rounded-md px-1.5 py-1 font-medium text-primary transition-colors hover:bg-accent">
                          Lo tomo yo
                        </button>
                      </form>
                    )}
                    <span className="shrink-0">· {fecha(l.createdAt)}</span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {paso && !(paso.estado === "GANADO" && puedeCrearClientes) ? (
                      <form action={cambiarEstadoLead}>
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="estado" value={paso.estado} />
                        <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-accent">
                          {paso.label}
                        </button>
                      </form>
                    ) : null}
                    {l.estado === "COTIZANDO" && puedeCrearClientes ? (
                      <form action={convertirLeadEnCliente}>
                        <input type="hidden" name="id" value={l.id} />
                        <button type="submit" className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90">
                          Es cliente
                        </button>
                      </form>
                    ) : null}
                    <form action={cambiarEstadoLead}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="estado" value="PERDIDO" />
                      <button type="submit" className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent" title="Descartar este prospecto">
                        Descartar
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
