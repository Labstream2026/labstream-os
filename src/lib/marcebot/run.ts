import { db } from "@/lib/db";
import { ensureMarcebot, sendBotDM, sendBotEmail, type BotUser } from "./bot";
import { getUserPendientes, getUserDoneToday, getTeamSummary, openStatusKeys, type TeamSummary } from "./data";
import { getUserChases, getTeamEscalation, getLeadEscalations, chaseCount, type TeamEscalation } from "./chase";
import { getUserWeekStats, getTeamWeekStats, type TeamWeek } from "./weekly";
import { getMarcebotConfig } from "./config";
import {
  composePersonal,
  composeTeam,
  composeDailyClose,
  composeWeeklyPersonal,
  composeWeeklyTeam,
  personalSignature,
  teamSignature,
  type Gender,
} from "./compose";
import { bogotaHour, bogotaDateKey, bogotaWeekday } from "./time";

// Orquestador horario de Marcebot. Lo invoca /api/cron/marcebot cada hora.
// Reglas (todas configurables desde Configuración → Marcebot):
//   • Solo escribe los días laborales y dentro de la franja horaria (por defecto
//     lun–vie, 7:00 a 16:00; la última a las 4 p. m., porque el equipo cierra a las 5).
//   • Saludo matutino una vez al día (primeras 3 horas de la franja).
//   • Fuera de la mañana, solo avisa si algo cambió (tarea/cita nueva o atrasada) o
//     hay una cita inminente — nunca repite el mismo resumen.
//   • Roles administrativos reciben, además, un DM aparte con el resumen del equipo.
//   • El ÚLTIMO día laboral, a la última hora, manda el "cierre de semana" (recap
//     personal + del equipo) como última notificación de la semana.

const MORNING_HOURS = 3; // ventana del saludo matutino: [startHour, startHour + 3)
const ADMIN_ROLES = ["admin", "gerente", "productor"];

export type MarcebotRunSummary = {
  ok: true;
  skipped?: "desactivado" | "dia-no-laboral" | "fuera-de-horario";
  hour: number;
  recipients: number;
  personalSent: number;
  teamSent: number;
  weeklySent: number;
  closeSent: number;
};

export async function runMarcebot(now: Date = new Date()): Promise<MarcebotRunSummary> {
  const cfg = await getMarcebotConfig();
  const hour = bogotaHour(now);
  const dk = bogotaDateKey(now);
  const wd = bogotaWeekday(now);
  const isWorkday = cfg.workDays.includes(wd);
  const inHours = hour >= cfg.startHour && hour <= cfg.lastHour;
  const morningWindow = isWorkday && hour >= cfg.startHour && hour < cfg.startHour + MORNING_HOURS;
  // El cierre de semana cae el último día laboral configurado (por defecto viernes).
  // Usamos una VENTANA (>= lastHour-1) en vez de la hora exacta: el cron corre cada 2 h y
  // sus ticks pueden no caer justo en `lastHour`, así que con `=== lastHour` el cierre no
  // se enviaría nunca si la cadencia está desfasada. El dedup por `lastWeeklyOn` (más abajo)
  // garantiza que solo se mande una vez ese día.
  const lastWorkday = cfg.workDays.length ? Math.max(...cfg.workDays) : 5;
  const isFinalWorkday = wd === lastWorkday;
  // Ventana de cierre del día: la última hora de la franja (p. ej. 16:00). El cierre del
  // día se manda todos los días laborales; el último día laboral lo sustituye el cierre
  // de semana (más completo).
  const inCloseWindow = hour >= cfg.lastHour - 1;
  const isFridayClose = isFinalWorkday && inCloseWindow;

  const bot = await ensureMarcebot();
  const recipients = await db.user.findMany({
    where: { active: true, isGuest: false, isSystemBot: false, role: { key: { notIn: ["cliente"] } } },
    select: {
      id: true,
      name: true,
      email: true,
      gender: true,
      role: { select: { key: true } },
      marcebotState: true,
    },
  });

  if (!cfg.enabled) {
    return { ok: true, skipped: "desactivado", hour, recipients: recipients.length, personalSent: 0, teamSent: 0, weeklySent: 0, closeSent: 0 };
  }
  if (!isWorkday || !inHours) {
    return { ok: true, skipped: isWorkday ? "fuera-de-horario" : "dia-no-laboral", hour, recipients: recipients.length, personalSent: 0, teamSent: 0, weeklySent: 0, closeSent: 0 };
  }

  const openKeys = await openStatusKeys();

  // El resumen de equipo se calcula una sola vez (si hay algún destinatario admin).
  const anyAdmin = recipients.some((u) => ADMIN_ROLES.includes(u.role.key));
  let team: TeamSummary | null = null;
  let esc: TeamEscalation | null = null;
  let teamWeek: TeamWeek | null = null;
  let teamSig = "";
  if (anyAdmin) {
    [team, esc] = await Promise.all([getTeamSummary(openKeys, now), getTeamEscalation(openKeys, now)]);
    teamSig = teamSignature(team);
    if (isFridayClose) teamWeek = await getTeamWeekStats(now);
  }

  let personalSent = 0;
  let teamSent = 0;
  let weeklySent = 0;
  let closeSent = 0;

  await Promise.allSettled(
    recipients.map(async (u) => {
      const state = u.marcebotState;
      const update: {
        lastDigest?: string;
        lastSentAt?: Date;
        lastMorningOn?: string;
        lastTeamDigest?: string;
        lastTeamOn?: string;
        lastWeeklyOn?: string;
      } = {};

      const isAdmin = ADMIN_ROLES.includes(u.role.key);
      const [p, chases, leadEsc] = await Promise.all([
        getUserPendientes(u.id, openKeys, now),
        getUserChases(u.id, now),
        getLeadEscalations(u.id, openKeys, now),
      ]);
      const sig = personalSignature(p, chases, leadEsc);
      const doWeekly = isFridayClose && state?.lastWeeklyOn !== dk;
      // Cierre del DÍA (días laborales que no son el último). Reutiliza `lastWeeklyOn`
      // como marcador genérico de "último cierre enviado" (su valor es la fecha del día),
      // así no hace falta una columna nueva: el último día laboral lo cubre el cierre de
      // semana y los demás días el cierre diario; ambos dedupean por la fecha de hoy.
      const doDailyClose = inCloseWindow && !isFinalWorkday && state?.lastWeeklyOn !== dk;

      if (doWeekly) {
        // ── Cierre de semana (último día laboral, ~4 p. m.) — DM + correo ──
        const week = await getUserWeekStats(u.id, now);
        const wkBody = composeWeeklyPersonal({ name: u.name, gender: u.gender as Gender, week, p, now });
        await sendBotDM(bot, u.id, u.name, wkBody);
        await sendBotEmail(u.email, "🎉 Cierre de semana — Labstream OS", wkBody);
        weeklySent += 1;
        update.lastWeeklyOn = dk;
        update.lastSentAt = now;
        update.lastDigest = sig; // mantiene coherente el anti-spam
        if (isAdmin && team && teamWeek) {
          await sendBotDM(bot, u.id, u.name, composeWeeklyTeam({ week: teamWeek, s: team, esc: esc ?? undefined, now }));
          weeklySent += 1;
          update.lastTeamDigest = teamSig;
          update.lastTeamOn = dk;
        }
      } else if (doDailyClose) {
        // ── Cierre del día (~4 p. m.) — DM + correo: qué cerró hoy y qué le queda ──
        const done = await getUserDoneToday(u.id, now);
        const body = composeDailyClose({ name: u.name, gender: u.gender as Gender, done, p, now });
        await sendBotDM(bot, u.id, u.name, body);
        await sendBotEmail(u.email, "🌇 Cierre del día — Labstream OS", body);
        closeSent += 1;
        update.lastWeeklyOn = dk; // marca "cierre enviado hoy"
        update.lastSentAt = now;
        update.lastDigest = sig;
      } else {
        // ── DM personal ──
        const welcome = !state;
        const morningDue = morningWindow && state?.lastMorningOn !== dk;
        const changed = sig !== state?.lastDigest;
        let sendPersonal = false;
        let morning = false;
        if (welcome) {
          sendPersonal = true;
          morning = true;
        } else if (morningDue) {
          sendPersonal = true;
          morning = true;
        } else if (p.imminent.length && changed) {
          sendPersonal = true;
        } else if ((p.overdue.length || p.today.length || chaseCount(chases) > 0 || leadEsc.length > 0) && changed) {
          sendPersonal = true;
        }

        if (sendPersonal) {
          const body = composePersonal({ name: u.name, gender: u.gender as Gender, p, chases, leadEsc, morning, welcome, now });
          await sendBotDM(bot, u.id, u.name, body);
          // El plan de la mañana (y la bienvenida) van también por correo; los avisos
          // sueltos del resto del día se quedan solo en el DM para no saturar la bandeja.
          if (morning) await sendBotEmail(u.email, "☀️ Tu plan de hoy — Labstream OS", body);
          personalSent += 1;
          update.lastDigest = sig;
          update.lastSentAt = now;
          if (morning) update.lastMorningOn = dk;
        }

        // ── DM de equipo (roles administrativos) ──
        if (team && isAdmin) {
          const morningTeam = morningWindow && state?.lastTeamOn !== dk;
          let sendTeam = false;
          let tMorning = false;
          if (!state || morningTeam) {
            sendTeam = true;
            tMorning = true;
          } else if (teamSig !== state.lastTeamDigest && (team.overdueTotal > 0 || team.unassigned.length > 0)) {
            sendTeam = true;
          }
          if (sendTeam) {
            const body = composeTeam({ s: team, esc: esc ?? undefined, morning: tMorning, now });
            await sendBotDM(bot, u.id, u.name, body);
            teamSent += 1;
            update.lastTeamDigest = teamSig;
            if (tMorning) update.lastTeamOn = dk;
          }
        }
      }

      if (Object.keys(update).length > 0) {
        await db.marcebotState.upsert({
          where: { userId: u.id },
          create: { userId: u.id, ...update },
          update,
        });
      }
    }),
  );

  return { ok: true, hour, recipients: recipients.length, personalSent, teamSent, weeklySent, closeSent };
}
