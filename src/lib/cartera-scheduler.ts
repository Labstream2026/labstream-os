import { db } from "@/lib/db";
import { notifyMany } from "@/lib/notify";
import { siigoEnabled, datosSiigo } from "@/lib/siigo";
import { getLiveAuthState } from "@/lib/permissions";
import { formatMoney } from "@/lib/ui";

// ── Aviso diario de cartera (centro Finanzas) ─────────────────────────────────
// Una vez al día, en la mañana de Bogotá, mira la cartera de Siigo y avisa a quienes ven
// finanzas: qué facturas VENCEN en los próximos 7 días y cuáles ACABAN de vencer. Mismo
// modelo en-proceso que el sondeo de calendarios (instrumentation.ts lo enciende): la app
// es la fuente, sin depender del Programador de tareas del NAS.
//
// Anti-duplicado: antes de notificar se RECLAMA el día en OrgSettings.carteraAvisadaEl con
// un updateMany condicional — dos ticks (o un reinicio a media mañana) no pueden avisar dos
// veces el mismo día.

const TICK_MS = 15 * 60_000; // cada 15 min se evalúa si ya toca (barato: 1 consulta)
const HORA_AVISO = 7; // 7 a. m. de Bogotá en adelante

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function horaBogota(): number {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "2-digit", hour12: false }).format(new Date()));
  return Number.isFinite(h) ? h % 24 : 0;
}

function ayerDe(hoyISO: string): string {
  return new Date(Date.parse(`${hoyISO}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

// Quiénes reciben el aviso: usuarios activos internos con `ver_finanzas` efectivo (el
// mismo resolutor vivo de la sesión, usuario por usuario — el equipo es chico y esto corre
// una vez al día).
async function destinatariosFinanzas(): Promise<string[]> {
  const usuarios = await db.user.findMany({ where: { active: true }, select: { id: true } });
  const con: string[] = [];
  for (const u of usuarios) {
    try {
      const estado = await getLiveAuthState(u.id);
      if (!estado || !estado.active) continue;
      if (estado.roleKey === "cliente" || estado.roleKey === "demo") continue;
      if (estado.roleKey === "admin" || estado.perms.includes("ver_finanzas")) con.push(u.id);
    } catch {
      /* un usuario ilegible no tumba el aviso de los demás */
    }
  }
  return con;
}

async function avisarCartera(): Promise<void> {
  if (!siigoEnabled()) return;
  const hoy = hoyBogota();
  if (horaBogota() < HORA_AVISO) return;

  // Reclama el día ANTES de leer Siigo o notificar: si otro tick lo tomó, aquí se acaba.
  const reclamo = await db.orgSettings.updateMany({
    where: { id: "default", NOT: { carteraAvisadaEl: hoy } },
    data: { carteraAvisadaEl: hoy },
  });
  if (reclamo.count === 0) {
    // O ya se avisó hoy, o la fila default no existe aún: se crea y se reclama en el acto.
    const fila = await db.orgSettings.findUnique({ where: { id: "default" }, select: { carteraAvisadaEl: true } });
    if (fila) return;
    await db.orgSettings.create({ data: { id: "default", carteraAvisadaEl: hoy } }).catch(() => null);
  }

  const r = await datosSiigo();
  if (!r.ok) return; // sin datos no se inventa nada; mañana se reintenta
  const { facturas } = r.datos;
  const ayer = ayerDe(hoy);

  const porVencer = facturas.filter((f) => f.saldo > 0 && f.vence !== null && f.vence >= hoy && f.vence <= new Date(Date.parse(`${hoy}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10));
  // «Acaban de vencer»: vencieron AYER. Con el reclamo diario, cada factura se anuncia como
  // vencida exactamente una vez (el día siguiente a su plazo).
  const recienVencidas = facturas.filter((f) => f.saldo > 0 && f.vence === ayer);
  if (porVencer.length === 0 && recienVencidas.length === 0) return;

  const destinatarios = await destinatariosFinanzas();
  if (destinatarios.length === 0) return;

  const partes: string[] = [];
  if (recienVencidas.length > 0) {
    const suma = recienVencidas.reduce((n, f) => n + f.saldo, 0);
    partes.push(`${recienVencidas.length} factura${recienVencidas.length === 1 ? " venció" : "s vencieron"} ayer (${formatMoney(suma, "COP")}): ${recienVencidas.slice(0, 3).map((f) => f.cliente).join(", ")}${recienVencidas.length > 3 ? "…" : ""}`);
  }
  if (porVencer.length > 0) {
    const suma = porVencer.reduce((n, f) => n + f.saldo, 0);
    partes.push(`${porVencer.length} vence${porVencer.length === 1 ? "" : "n"} en los próximos 7 días (${formatMoney(suma, "COP")})`);
  }

  await notifyMany(destinatarios, {
    type: "cartera",
    event: "cartera_cobro",
    title: recienVencidas.length > 0 ? "💵 Cartera: hay facturas vencidas nuevas" : "💵 Cartera: facturas por vencer esta semana",
    body: partes.join(" · "),
    link: "/facturacion?t=facturas",
  }).catch(() => null);
}

// Arranca el planificador una sola vez por proceso (guard en globalThis, sobrevive al HMR).
export function startCarteraScheduler(): void {
  const g = globalThis as unknown as { __labstreamCarteraSched?: NodeJS.Timeout };
  if (g.__labstreamCarteraSched) return;
  setTimeout(() => void avisarCartera().catch(() => null), 90_000); // primer intento a los 90 s
  g.__labstreamCarteraSched = setInterval(() => void avisarCartera().catch(() => null), TICK_MS);
}
