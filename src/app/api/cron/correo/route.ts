import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { sincronizarCuenta } from "@/lib/correo/imap";
import { barrerOutbox } from "@/lib/correo/outbox";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sincroniza los buzones conectados aunque nadie tenga la pestaña abierta. Programar en el
// NAS cada 5 min (mismo patrón que el resto de crons; el secreto es OBLIGATORIO):
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3200/api/cron/correo
// En serie a propósito: son buzones del MISMO MailPlus y bombardearlo en paralelo desde su
// propio NAS no le hace bien a nadie.
async function run(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  // PRIMERO lo que sale: si el proceso se reinició con envíos en cola (deshacer vencido o
  // programados), este barrido es su red de seguridad — correo saliente espera menos que
  // la sincronización de entrada.
  const despachados = await barrerOutbox();
  const cuentas = await db.mailAccount.findMany({ select: { id: true, email: true } });
  const detalle: Record<string, string> = {};
  let nuevos = 0;
  for (const c of cuentas) {
    const r = await sincronizarCuenta(c.id, { max: 250 });
    nuevos += r.nuevos;
    if (r.error) detalle[c.email] = r.error;
  }
  const empujados = await empujarSinResponder();
  return NextResponse.json({ ok: true, cuentas: cuentas.length, nuevos, despachados, empujados, errores: detalle });
}

// ── «Por responder»: el empujón de los correos de CLIENTES sin respuesta ──
// Un correo de un cliente que lleva >24 h en Recibidos sin respuesta ni archivo es una
// promesa incumplida en silencio. Se avisa UNA vez por mensaje (answerNudgedAt) al dueño
// del buzón — campana/push según su preferencia — y la carpeta «Por responder» los junta.
const HORAS_SIN_RESPONDER = 24;

async function empujarSinResponder(): Promise<number> {
  const tope = new Date(Date.now() - HORAS_SIN_RESPONDER * 3_600_000);
  const pendientes = await db.mailMessage.findMany({
    where: {
      folder: "INBOX",
      clientId: { not: null }, // el foco son los CLIENTES; lo demás no genera deuda
      answered: false,
      answerNudgedAt: null,
      date: { lt: tope },
      snoozedUntil: null, // pospuesto = decisión tomada; su regreso ya avisa solo
    },
    orderBy: { date: "asc" },
    take: 50, // por tanda: el cron corre cada 5 min, alcanza de sobra
    select: {
      id: true, subject: true, fromName: true, fromEmail: true,
      account: { select: { userId: true, user: { select: { name: true } } } },
      client: { select: { name: true } },
      project: { select: { id: true, name: true, leadId: true } },
    },
  });
  let n = 0;
  for (const m of pendientes) {
    const enviado = await notify(m.account.userId, {
      type: "correo",
      event: "correo.por-responder",
      title: `✉️ Sin responder: ${m.fromName || m.fromEmail || "un cliente"}`,
      body: `«${m.subject}»${m.client ? ` · ${m.client.name}` : ""} lleva más de ${HORAS_SIN_RESPONDER} h sin respuesta.`,
      link: "/correo?c=responder",
      groupKey: "correo:por-responder",
    });
    // Si el hilo está colgado de un PROYECTO con líder, la deuda también es suya: se le
    // avisa (una vez, con el mismo candado) hacia la pestaña Correo del proyecto — el buzón
    // es ajeno y ahí no puede entrar, pero el hilo del proyecto sí lo ve.
    if (m.project?.leadId && m.project.leadId !== m.account.userId) {
      await notify(m.project.leadId, {
        type: "correo",
        event: "correo.por-responder",
        title: `✉️ Sin responder en ${m.project.name}: ${m.fromName || m.fromEmail || "un cliente"}`,
        body: `«${m.subject}» lleva más de ${HORAS_SIN_RESPONDER} h sin respuesta en el buzón de ${m.account.user.name}.`,
        link: `/proyectos/${m.project.id}?tab=correo`,
        groupKey: "correo:por-responder",
      }).catch(() => {});
    }
    // Empujado una sola vez, se haya entregado o esté el tipo apagado: no se insiste.
    await db.mailMessage.update({ where: { id: m.id }, data: { answerNudgedAt: new Date() } });
    if (enviado) n += 1;
  }
  return n;
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
