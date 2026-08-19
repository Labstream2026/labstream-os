import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { despacharCorreo } from "./enviar";
import { marcarEnServidor } from "./imap";

// ── La cola de salida: quién despacha y cuándo ──────────────────────────────
// Dos relojes miran la misma cola: un timer EN PROCESO (puntual — la ventana de deshacer son
// segundos y el cron corre cada 5 minutos) y el barrido del cron (terco — si el proceso se
// reinició con envíos en espera, nada se queda dentro). Los dos llegan al MISMO reclamo
// atómico pendiente→enviando, igual que el botón «Deshacer»: gana uno solo y los demás ven
// count=0 y se retiran. Por eso un timer duplicado (HMR, reinicio) es inofensivo.

const REINTENTOS_MAX = 3;
/** Más allá de esto no se arma timer: el barrido del cron (cada 5 min) llega a tiempo. */
const HORIZONTE_TIMER_MS = 45 * 60_000;
/** Una fila en «enviando» más vieja que esto quedó colgada de un reinicio a mitad de envío. */
const ENVIANDO_COLGADO_MS = 10 * 60_000;

/** Despacha UNA fila de la cola (si sigue pendiente). El reclamo decide las carreras. */
export async function despacharOutbox(id: string): Promise<{ ok: boolean; error?: string }> {
  const reclamo = await db.mailOutbox.updateMany({ where: { id, estado: "pendiente" }, data: { estado: "enviando" } });
  if (reclamo.count !== 1) return { ok: false, error: "ya no estaba pendiente" };
  const fila = await db.mailOutbox.findUnique({ where: { id } });
  if (!fila) return { ok: false, error: "la fila desapareció" };

  const adjuntosMeta = (fila.adjuntosMeta as { nombre: string; mime: string; bytes: number }[] | null) ?? undefined;
  const r = await despacharCorreo(
    fila.accountId,
    { crudo: Buffer.from(fila.crudo), messageId: fila.messageId },
    {
      nombreRemitente: fila.nombreRemitente,
      para: fila.para,
      cc: fila.cc || null,
      asunto: fila.asunto,
      texto: fila.textoLocal,
      htmlLocal: fila.htmlUsuario + fila.colaLocal || null,
      enRespuestaA: fila.enRespuestaA,
      referencias: fila.referencias,
      projectId: fila.projectId,
      adjuntosMeta,
    },
  );

  if (!r.ok) {
    // Falla LIMPIA del SMTP: no salió nada, se puede reintentar. Al agotar, a «error» — la
    // fila queda visible en «Programados» con su causa, y se avisa. Nunca en silencio.
    const intentos = fila.intentos + 1;
    const agotado = intentos >= REINTENTOS_MAX;
    await db.mailOutbox
      .update({ where: { id }, data: { estado: agotado ? "error" : "pendiente", intentos, ultimoError: r.error } })
      .catch(() => {});
    if (!agotado) programarDespacho(id, new Date(Date.now() + 60_000)); // reintento corto
    else await avisarFallo(fila.accountId, fila.asunto, fila.para, r.error);
    return { ok: false, error: r.error };
  }

  // Salió. Si era una respuesta, AHORA el original queda respondido (no al hacer clic: un
  // envío deshecho no debe dejar el hilo marcado como contestado).
  if (fila.respondeAId) {
    const orig = await db.mailMessage
      .findUnique({ where: { id: fila.respondeAId }, select: { id: true, uid: true, folder: true, accountId: true } })
      .catch(() => null);
    if (orig && orig.accountId === fila.accountId && orig.folder !== "ENVIADOS") {
      await db.mailMessage.update({ where: { id: orig.id }, data: { answered: true } }).catch(() => {});
      void marcarEnServidor(fila.accountId, orig.uid, "\\Answered", { folder: orig.folder }).catch(() => {});
    }
  }
  await db.mailOutbox.delete({ where: { id } }).catch(() => {});
  return { ok: true };
}

/** El barrido del cron: despacha lo vencido y da por perdidos los envíos colgados. */
export async function barrerOutbox(): Promise<number> {
  const vencidos = await db.mailOutbox.findMany({
    where: { estado: "pendiente", sendAt: { lte: new Date() } },
    orderBy: { sendAt: "asc" },
    take: 30,
    select: { id: true },
  });
  let n = 0;
  for (const v of vencidos) {
    const r = await despacharOutbox(v.id);
    if (r.ok) n += 1;
  }

  // Colgados en «enviando»: el proceso murió A MITAD del envío y no sabemos si el SMTP lo
  // alcanzó a tomar. Reintentar solo sería arriesgarse a mandarlo DOS veces — se marca en
  // error y la persona verifica en Enviados (o el webmail) antes de reintentar a mano.
  const dudosos = await db.mailOutbox.findMany({
    where: { estado: "enviando", updatedAt: { lt: new Date(Date.now() - ENVIANDO_COLGADO_MS) } },
    select: { id: true, accountId: true, asunto: true, para: true },
  });
  for (const d of dudosos) {
    await db.mailOutbox
      .update({
        where: { id: d.id },
        data: { estado: "error", ultimoError: "El envío se interrumpió a mitad de camino. Verifica en Enviados (o en el webmail) si alcanzó a salir ANTES de reintentar — reintentar a ciegas puede duplicarlo." },
      })
      .catch(() => {});
    await avisarFallo(d.accountId, d.asunto, d.para, "el envío se interrumpió a mitad de camino");
  }
  return n;
}

async function avisarFallo(accountId: string, asunto: string, para: string, error: string) {
  const cuenta = await db.mailAccount.findUnique({ where: { id: accountId }, select: { userId: true } }).catch(() => null);
  if (!cuenta) return;
  await notify(cuenta.userId, {
    type: "correo",
    event: "correo.no-salio",
    title: `⚠️ No salió: «${asunto || "(sin asunto)"}»`,
    body: `Para ${para}. ${error}. Está en la carpeta Programados para reintentarlo o pasarlo a borradores.`,
    link: "/correo?c=programados",
    groupKey: "correo:no-salio",
  }).catch(() => {});
}

// ── El timer en proceso ──
// Vive en globalThis: en desarrollo el HMR recarga el módulo y sin esto cada recarga
// armaría relojes duplicados (el reclamo los vuelve inofensivos, pero con uno basta).
const g = globalThis as unknown as { __lsRelojesOutbox?: Map<string, ReturnType<typeof setTimeout>> };
const relojes = (g.__lsRelojesOutbox ??= new Map());

export function programarDespacho(id: string, sendAt: Date): void {
  const espera = sendAt.getTime() - Date.now();
  if (espera > HORIZONTE_TIMER_MS) return; // lejano: el barrido del cron llega a su hora
  const previo = relojes.get(id);
  if (previo) clearTimeout(previo);
  const t = setTimeout(() => {
    relojes.delete(id);
    void despacharOutbox(id).catch(() => {});
  }, Math.max(espera, 0) + 500); // medio segundo de gracia: el «Deshacer» del último instante gana más carreras
  t.unref?.();
  relojes.set(id, t);
}

export function cancelarDespacho(id: string): void {
  const t = relojes.get(id);
  if (t) {
    clearTimeout(t);
    relojes.delete(id);
  }
}
