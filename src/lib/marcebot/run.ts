import { db } from "@/lib/db";
import { ensureMarcebot, sendBotDM, type BotUser } from "./bot";
import { getUserPendientes, getTeamSummary, openStatusKeys, type TeamSummary } from "./data";
import { getUserChases, getTeamEscalation, chaseCount, type TeamEscalation } from "./chase";
import {
  composePersonal,
  composeTeam,
  personalSignature,
  teamSignature,
  type Gender,
} from "./compose";
import { bogotaHour, bogotaDateKey } from "./time";

// Orquestador horario de Marcebot. Lo invoca /api/cron/marcebot cada hora.
// Reglas:
//   • Solo escribe en horario laboral de Colombia (7:00–20:00).
//   • Saludo matutino una vez al día (primera corrida 7–10 h).
//   • Fuera de la mañana, solo avisa si algo cambió (tarea/cita nueva o atrasada) o
//     hay una cita inminente — nunca repite el mismo resumen.
//   • Roles administrativos reciben, además, un DM aparte con el resumen del equipo.

const WORK_START = 7;
const WORK_END = 20; // exclusivo
const MORNING_END = 10; // ventana del saludo matutino: [7, 10)
const ADMIN_ROLES = ["admin", "gerente", "productor"];

export type MarcebotRunSummary = {
  ok: true;
  skipped?: "fuera-de-horario";
  hour: number;
  recipients: number;
  personalSent: number;
  teamSent: number;
};

export async function runMarcebot(now: Date = new Date()): Promise<MarcebotRunSummary> {
  const hour = bogotaHour(now);
  const dk = bogotaDateKey(now);
  const inWorkHours = hour >= WORK_START && hour < WORK_END;
  const morningWindow = hour >= WORK_START && hour < MORNING_END;

  const bot = await ensureMarcebot();
  const recipients = await db.user.findMany({
    where: { active: true, isGuest: false, isSystemBot: false, role: { key: { notIn: ["cliente"] } } },
    select: {
      id: true,
      name: true,
      gender: true,
      role: { select: { key: true } },
      marcebotState: true,
    },
  });

  if (!inWorkHours) {
    return { ok: true, skipped: "fuera-de-horario", hour, recipients: recipients.length, personalSent: 0, teamSent: 0 };
  }

  const openKeys = await openStatusKeys();

  // El resumen de equipo se calcula una sola vez (si hay algún destinatario admin).
  const anyAdmin = recipients.some((u) => ADMIN_ROLES.includes(u.role.key));
  let team: TeamSummary | null = null;
  let esc: TeamEscalation | null = null;
  let teamSig = "";
  if (anyAdmin) {
    [team, esc] = await Promise.all([getTeamSummary(openKeys, now), getTeamEscalation(openKeys, now)]);
    teamSig = teamSignature(team);
  }

  let personalSent = 0;
  let teamSent = 0;

  await Promise.allSettled(
    recipients.map(async (u) => {
      const state = u.marcebotState;
      const update: {
        lastDigest?: string;
        lastSentAt?: Date;
        lastMorningOn?: string;
        lastTeamDigest?: string;
        lastTeamOn?: string;
      } = {};

      // ── DM personal ──
      const [p, chases] = await Promise.all([getUserPendientes(u.id, openKeys, now), getUserChases(u.id, now)]);
      const sig = personalSignature(p, chases);
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
      } else if ((p.overdue.length || p.today.length || chaseCount(chases) > 0) && changed) {
        sendPersonal = true;
      }

      if (sendPersonal) {
        const body = composePersonal({ name: u.name, gender: u.gender as Gender, p, chases, morning, welcome, now });
        await sendBotDM(bot, u.id, u.name, body);
        personalSent += 1;
        update.lastDigest = sig;
        update.lastSentAt = now;
        if (morning) update.lastMorningOn = dk;
      }

      // ── DM de equipo (roles administrativos) ──
      if (team && ADMIN_ROLES.includes(u.role.key)) {
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

      if (Object.keys(update).length > 0) {
        await db.marcebotState.upsert({
          where: { userId: u.id },
          create: { userId: u.id, ...update },
          update,
        });
      }
    }),
  );

  return { ok: true, hour, recipients: recipients.length, personalSent, teamSent };
}
