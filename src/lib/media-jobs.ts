import { db } from "@/lib/db";
import { mcpPollVideo } from "@/lib/higgsfield-mcp";
import { ensureMarcebot, postBotFileMessage, postBotTextMessage } from "@/lib/marcebot/bot";
import { notify } from "@/lib/notify";

// Entrega de medios ASÍNCRONOS (video) generados por Higgsfield. Dos vías que comparten lógica:
//  - pollAndDeliverJob(id): sondeo ACTIVO tras crear el job (entrega oportuna en minutos).
//  - runPendingMediaJobs(): un pase del cron (red de seguridad ante reinicios del contenedor).
// Un "claim" atómico (updateMany por status) garantiza que solo UNA vía entregue cada job.

const MAX_AGE_MS = 30 * 60_000; // a los 30 min sin completar → fallido
const POLL_EVERY_MS = 15_000;
const ACTIVE_DEADLINE_MS = 12 * 60_000;

type Job = { id: string; channelId: string; userId: string; prompt: string; providerJobId: string | null; createdAt: Date };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function deliver(job: Job, url: string): Promise<void> {
  // Claim atómico: si otro proceso ya lo pasó a "completed", abortamos (no duplicar).
  const claimed = await db.mediaJob.updateMany({ where: { id: job.id, status: "in_progress" }, data: { status: "completed", resultUrl: url } });
  if (claimed.count !== 1) return;
  const bot = await ensureMarcebot();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`descarga ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await postBotFileMessage(bot.id, job.channelId, "🎬 Aquí tienes el video que generaste.", [{ name: `video-${Date.now()}.mp4`, mime: "video/mp4", buf }]);
  } catch {
    // No se pudo adjuntar → al menos entregar el enlace.
    await postBotTextMessage(bot.id, job.channelId, `🎬 Tu video está listo: ${url}`);
  }
  await notify(job.userId, { type: "marcebot", title: "Marcebot", body: "Tu video ya está listo 🎬", link: `/chat/${job.channelId}` }).catch(() => {});
}

async function fail(job: Job, reason: string): Promise<void> {
  const claimed = await db.mediaJob.updateMany({ where: { id: job.id, status: "in_progress" }, data: { status: "failed", error: reason } });
  if (claimed.count !== 1) return;
  const bot = await ensureMarcebot();
  const txt =
    reason === "nsfw" ? "⚠️ No pude generar el video: el contenido fue rechazado por el filtro. Prueba con otra descripción."
    : reason === "timeout" ? "⚠️ El video tardó demasiado y se canceló. Inténtalo de nuevo."
    : "⚠️ No pude generar el video. Inténtalo de nuevo.";
  await postBotTextMessage(bot.id, job.channelId, txt);
  await notify(job.userId, { type: "marcebot", title: "Marcebot", body: txt.replace(/^⚠️\s*/, ""), link: `/chat/${job.channelId}` }).catch(() => {});
}

// Procesa UN sondeo de un job; devuelve true si quedó resuelto (entregado/fallido).
async function step(job: Job): Promise<boolean> {
  if (!job.providerJobId) {
    if (Date.now() - new Date(job.createdAt).getTime() > MAX_AGE_MS) { await fail(job, "timeout"); return true; }
    return false;
  }
  try {
    const poll = await mcpPollVideo(job.providerJobId);
    if (poll.status === "completed" && poll.url) { await deliver(job, poll.url); return true; }
    if (poll.status === "failed") { await fail(job, "failed"); return true; }
    if (poll.status === "nsfw") { await fail(job, "nsfw"); return true; }
  } catch {
    /* error transitorio: reintentar en el siguiente pase */
  }
  if (Date.now() - new Date(job.createdAt).getTime() > MAX_AGE_MS) { await fail(job, "timeout"); return true; }
  return false;
}

// Sondeo ACTIVO de un job recién creado (delivery oportuna). Best-effort: floating promise.
export async function pollAndDeliverJob(jobId: string): Promise<void> {
  const deadline = Date.now() + ACTIVE_DEADLINE_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_EVERY_MS);
    const job = await db.mediaJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "in_progress") return; // ya resuelto (quizá por el cron)
    if (await step(job)) return;
  }
}

// Un pase del cron: sondea todos los jobs en curso una vez (red de seguridad).
export async function runPendingMediaJobs(): Promise<{ checked: number }> {
  const jobs = await db.mediaJob.findMany({ where: { status: "in_progress" }, orderBy: { createdAt: "asc" }, take: 25 });
  for (const job of jobs) await step(job).catch(() => {});
  return { checked: jobs.length };
}
