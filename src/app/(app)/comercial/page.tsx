import Link from "next/link";
import { redirect } from "next/navigation";
import { IconComercial } from "@/components/icons";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { formatMoney } from "@/lib/ui";
import { daysSince } from "@/lib/billing";
import { quoteDraftFromBlocks } from "@/lib/proposals/quote-draft";
import { effectiveStatus, type ProposalStatus } from "@/lib/proposals/types";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { LeadsBand } from "./leads-band";

export const dynamic = "force-dynamic";

// ── El embudo CON PLATA ───────────────────────────────────────────────────────
// Un embudo que solo cuenta tarjetas no dice nada: lo que importa es cuánta plata hay en
// juego, cuánta se ganó, cuánta se perdió y qué tan bien cerramos. El valor de cada
// propuesta sale de sus bloques de dinero (quoteDraftFromBlocks, el mismo traductor probado
// que arma la cotización), y el estado se deriva con effectiveStatus para que una ENVIADA
// con la validez vencida no se disfrace de viva.

// Columnas en el orden en que avanza una propuesta. RECHAZADA por fin tiene columna: perder
// con motivo es información comercial, esconderla era perder dos veces.
const COLUMNS: { status: ProposalStatus; label: string; tone: string }[] = [
  { status: "BORRADOR", label: "Borrador", tone: "text-muted-foreground" },
  { status: "ENVIADA", label: "Enviada", tone: "text-sky-600 dark:text-sky-400" },
  { status: "ACEPTADA", label: "Aceptada", tone: "text-emerald-600 dark:text-emerald-400" },
  { status: "RECHAZADA", label: "No aprobada", tone: "text-rose-600 dark:text-rose-400" },
  { status: "VENCIDA", label: "Vencida", tone: "text-amber-600 dark:text-amber-400" },
];

// Suma compacta para cabeceras de columna: $12,4 M se lee de un vistazo; el valor exacto
// vive en las tarjetas y en las cifras de arriba.
function plata(n: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export default async function ComercialPage() {
  const session = await getSession();
  if (!session || !hasPermission(session, "ver_cotizaciones")) redirect("/");
  // El dinero del embudo es información financiera: sin ver_finanzas se ve el tablero
  // (etapas y tarjetas) pero sin valores ni cifras de cierre.
  const verPlata = hasPermission(session, "ver_finanzas");

  // Propuestas acotadas por acceso: las de clientes que el usuario puede ver
  // más las que él mismo creó (borradores sin cliente incluidos).
  const proposals = await db.proposal.findMany({
    where: {
      OR: [
        { client: accessibleClientWhere(session) },
        { createdById: session.id },
      ],
    },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      expiresAt: true,
      sentAt: true,
      views: true,
      acceptedAt: true,
      rejectedAt: true,
      rejectReason: true,
      blocks: true,
      createdAt: true,
      client: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  type Card = {
    id: string;
    code: string;
    title: string;
    clientName: string | null;
    valor: number;
    // Sub-línea contextual según la etapa (enviada hace N, sin abrir, motivo del rechazo…).
    detalle: string | null;
    alerta: boolean;
  };

  const byStatus = new Map<ProposalStatus, Card[]>(COLUMNS.map((c) => [c.status, []]));
  const valor = new Map<ProposalStatus, number>(COLUMNS.map((c) => [c.status, 0]));

  for (const p of proposals) {
    const st = effectiveStatus({ status: p.status as ProposalStatus, expiresAt: p.expiresAt });
    const v = quoteDraftFromBlocks(p.blocks)?.subtotal ?? 0;

    let detalle: string | null = null;
    let alerta = false;
    if (st === "ENVIADA" && p.sentAt) {
      const d = daysSince(p.sentAt);
      if (p.views === 0) {
        // Enviada y sin una sola apertura: o no llegó, o no interesó — hay que reactivar.
        detalle = `enviada hace ${d} d · el cliente no la ha abierto`;
        alerta = d != null && d >= 3;
      } else {
        detalle = `enviada hace ${d} d · vista ${p.views} ${p.views === 1 ? "vez" : "veces"}`;
      }
    } else if (st === "ACEPTADA" && p.acceptedAt) {
      detalle = `aceptada hace ${daysSince(p.acceptedAt)} d`;
    } else if (st === "RECHAZADA") {
      // El motivo es lo valioso del rechazo; sin motivo, al menos el cuándo.
      detalle = p.rejectReason?.trim() ? `«${p.rejectReason.trim()}»` : p.rejectedAt ? `hace ${daysSince(p.rejectedAt)} d · sin motivo registrado` : null;
    } else if (st === "VENCIDA") {
      detalle = "venció sin decisión — ¿se renueva o se archiva?";
    }

    byStatus.get(st)?.push({ id: p.id, code: p.code, title: p.title, clientName: p.client?.name ?? null, valor: v, detalle, alerta });
    valor.set(st, (valor.get(st) ?? 0) + v);
  }

  // Cifras de cabecera: lo vivo, lo ganado, lo perdido y la tasa de cierre real.
  const enJuego = valor.get("ENVIADA") ?? 0;
  const ganado = valor.get("ACEPTADA") ?? 0;
  const perdido = (valor.get("RECHAZADA") ?? 0) + (valor.get("VENCIDA") ?? 0);
  const nAceptadas = byStatus.get("ACEPTADA")?.length ?? 0;
  const nDecididas = nAceptadas + (byStatus.get("RECHAZADA")?.length ?? 0) + (byStatus.get("VENCIDA")?.length ?? 0);
  const tasaCierre = nDecididas > 0 ? Math.round((nAceptadas / nDecididas) * 100) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        icon={<IconComercial />}
        title="Embudo comercial"
        description="Tus propuestas por etapa — y cuánta plata hay en cada una."
      />

      {/* Antes del embudo: quien todavía no tiene propuesta. Se pinta sola o no se pinta. */}
      <LeadsBand />

      {proposals.length === 0 ? (
        <EmptyState
          icon={<IconComercial />}
          title="Aún no hay propuestas"
          description="Crea la primera desde Cotizaciones → Propuestas."
        />
      ) : (
        <>
          {verPlata ? (
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Cifra label="En juego" value={formatMoney(enJuego)} hint="enviadas, esperando respuesta" tone="text-sky-600 dark:text-sky-400" />
              <Cifra
                label="Tasa de cierre"
                value={tasaCierre != null ? `${tasaCierre}%` : "—"}
                hint={tasaCierre != null ? `${nAceptadas} de ${nDecididas} decididas` : "aún sin decisiones"}
                tone={tasaCierre != null && tasaCierre >= 50 ? "text-emerald-600 dark:text-emerald-400" : undefined}
              />
              <Cifra label="Ganado" value={formatMoney(ganado)} hint="propuestas aceptadas" tone="text-emerald-600 dark:text-emerald-400" />
              <Cifra label="Perdido" value={formatMoney(perdido)} hint="no aprobadas + vencidas" tone={perdido > 0 ? "text-rose-600 dark:text-rose-400" : undefined} />
            </div>
          ) : null}

          <div className="overflow-x-auto pb-2">
            <div className="flex gap-4">
              {COLUMNS.map((col) => {
                const items = byStatus.get(col.status) ?? [];
                const suma = valor.get(col.status) ?? 0;
                return (
                  <div key={col.status} className="flex min-w-[240px] flex-1 flex-col">
                    <div className="mb-3 flex items-baseline justify-between gap-2 px-1">
                      <span className={`text-sm font-semibold ${col.tone}`}>{col.label}</span>
                      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                        {verPlata && suma > 0 ? (
                          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{plata(suma)}</span>
                        ) : null}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {items.length}
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {items.length === 0 ? (
                        <p className="px-1 text-sm text-muted-foreground">—</p>
                      ) : (
                        items.map((p) => (
                          <Link
                            key={p.id}
                            href={`/cotizaciones/propuestas/${p.id}`}
                            className="block rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:bg-accent/50"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
                              {verPlata && p.valor > 0 ? (
                                <p className="text-xs font-semibold tabular-nums">{formatMoney(p.valor)}</p>
                              ) : null}
                            </div>
                            <p className="mt-0.5 truncate font-medium">{p.title}</p>
                            {p.clientName ? (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.clientName}</p>
                            ) : null}
                            {p.detalle ? (
                              <p className={`mt-1 line-clamp-2 text-xs ${p.alerta ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                                {p.detalle}
                              </p>
                            ) : null}
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Cifra({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone ?? ""}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
