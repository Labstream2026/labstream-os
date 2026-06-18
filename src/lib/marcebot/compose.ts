import crypto from "node:crypto";
import type { UserPendientes, TeamSummary, TaskLite, EventLite } from "./data";
import type { UserChases, TeamEscalation, LeadEscalation } from "./chase";
import type { UserWeek, TeamWeek } from "./weekly";
import { chaseCount, chaseIds, leadEscalationKeys } from "./chase";
import { bogotaLongDate, bogotaTime, bogotaShortDate, duePhrase } from "./time";

function hoursText(minutes: number): string {
  if (minutes <= 0) return "";
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} h`;
}

// Redacción de los mensajes de Marcebot. Tono cercano y motivador; trato por género
// ("muchacho" / "muchacha", o "equipo" si no está definido).

export type Gender = "M" | "F" | null | undefined;

// "muchacho" / "muchacha" / "equipo".
export function vocativo(gender: Gender): string {
  if (gender === "M") return "muchacho";
  if (gender === "F") return "muchacha";
  return "equipo";
}

function saludoHora(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("es-CO", { hour: "numeric", hour12: false, timeZone: "America/Bogota" }).format(now));
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function bullet(t: TaskLite, opts?: { showDue?: boolean; overdue?: boolean; now?: Date }): string {
  const proj = t.project ? ` · ${t.project}` : "";
  let due = "";
  if (t.due) {
    if (opts?.overdue && opts.now) due = ` — ${duePhrase(t.due, opts.now)}`;
    else if (opts?.showDue) due = ` (vence ${bogotaShortDate(t.due)})`;
  }
  return `   • ${t.title}${proj}${due}`;
}

function eventLine(e: EventLite): string {
  return `   • ${bogotaTime(e.start)} — ${e.title}`;
}

function clip<T>(arr: T[], n: number): { shown: T[]; rest: number } {
  return { shown: arr.slice(0, n), rest: Math.max(0, arr.length - n) };
}

// Firma estable del contenido accionable: si cambia, hay algo nuevo que avisar.
// Incluye las citas inminentes y lo que hay por perseguir para disparar avisos nuevos.
export function personalSignature(p: UserPendientes, chases?: UserChases, leadEsc?: LeadEscalation[]): string {
  const payload = JSON.stringify({
    o: p.overdue.map((t) => t.id).sort(),
    t: p.today.map((t) => t.id).sort(),
    s: p.shootsToday.map((t) => t.id).sort(),
    e: p.eventsToday.map((e) => e.id).sort(),
    im: p.imminent.map((e) => e.id).sort(),
    c: chases ? chaseIds(chases) : [],
    le: leadEsc ? leadEscalationKeys(leadEsc) : [],
  });
  return crypto.createHash("sha1").update(payload).digest("hex");
}

export function teamSignature(s: TeamSummary): string {
  const payload = JSON.stringify({
    o: s.overdueTotal,
    u: s.unassigned.map((t) => t.id).sort(),
    d: s.deliveries.map((t) => t.id).sort(),
    sh: s.shoots.map((t) => t.id).sort(),
  });
  return crypto.createHash("sha1").update(payload).digest("hex");
}

export function hasActionable(p: UserPendientes): boolean {
  return p.overdue.length > 0 || p.today.length > 0 || p.eventsToday.length > 0 || p.shootsToday.length > 0;
}

// Líneas de la sección "🎯 Para perseguir" (lo que un productor empuja). Hasta 3 por grupo.
function chaseLines(c: UserChases): string[] {
  if (chaseCount(c) === 0) return [];
  const out: string[] = ["🎯 Para perseguir:"];
  const group = (emoji: string, label: string, items: { title: string; detail: string }[]) => {
    if (!items.length) return;
    out.push(`${emoji} ${label}:`);
    items.slice(0, 3).forEach((it) => out.push(`   • ${it.title} — ${it.detail}`));
    if (items.length > 3) out.push(`   … y ${items.length - 3} más`);
  };
  group("✅", "Por pre-aprobar", c.reviewsPending);
  group("📨", "Seguimiento al cliente", c.clientWaiting);
  group("📦", "Sin material y por vencer", c.noMaterial);
  group("💼", "Comercial por cerrar", c.proposals);
  group("🧾", "Por cobrar", c.invoices);
  out.push("");
  return out;
}

// Mensaje personal. `morning` = saludo del día (incluye el plan completo aunque esté
// al día). `welcome` = primera vez que Marcebot le escribe a esta persona.
export function composePersonal(opts: {
  name: string;
  gender: Gender;
  p: UserPendientes;
  chases: UserChases;
  leadEsc?: LeadEscalation[];
  morning: boolean;
  welcome: boolean;
  now: Date;
}): string {
  const { name, gender, p, chases, leadEsc = [], morning, welcome, now } = opts;
  const voc = vocativo(gender);
  const firstName = name.split(" ")[0];
  const actionable = hasActionable(p) || chaseCount(chases) > 0 || leadEsc.length > 0;
  const lines: string[] = [];

  if (welcome) {
    lines.push(`¡Hola, ${voc}! 🤖 Soy Marcebot, tu copiloto en Labstream.`);
    lines.push(`Cada día te paso un resumen de lo que tienes pendiente para que nada se te escape. 🙌`);
    lines.push("");
  } else if (morning) {
    lines.push(`${saludoHora(now)}, ${voc} ☀️ Aquí va tu plan de hoy, ${firstName}.`);
    lines.push("");
  }

  // Avisos inminentes primero (citas que arrancan en breve).
  for (const e of p.imminent.slice(0, 2)) {
    lines.push(`⏰ ¡Ojo, ${voc}! "${e.title}" arranca a las ${bogotaTime(e.start)}.`);
  }
  if (p.imminent.length) lines.push("");

  if (p.overdue.length) {
    lines.push(`🔴 ${p.overdue.length} ${p.overdue.length === 1 ? "tarea atrasada" : "tareas atrasadas"} — ¡a ponerse al día, ${voc}! 👊`);
    const { shown, rest } = clip(p.overdue, 4);
    shown.forEach((t) => lines.push(bullet(t, { overdue: true, now })));
    if (rest) lines.push(`   … y ${rest} más`);
    lines.push("");
  }

  if (p.today.length) {
    lines.push(`🟡 ${p.today.length} para hoy:`);
    const { shown, rest } = clip(p.today, 4);
    shown.forEach((t) => lines.push(bullet(t)));
    if (rest) lines.push(`   … y ${rest} más`);
    lines.push("");
  }

  if (p.shootsToday.length) {
    lines.push(`🎬 ${p.shootsToday.length === 1 ? "Rodaje hoy" : `${p.shootsToday.length} rodajes hoy`}:`);
    p.shootsToday.slice(0, 3).forEach((t) => lines.push(bullet(t)));
    lines.push("");
  }

  if (p.eventsToday.length) {
    lines.push(`📅 ${p.eventsToday.length === 1 ? "Tienes 1 cita" : `Tienes ${p.eventsToday.length} citas`}:`);
    p.eventsToday.slice(0, 4).forEach((e) => lines.push(eventLine(e)));
    lines.push("");
  }

  if (morning && p.soon.length) {
    lines.push(`🔵 Y ${p.soon.length} ${p.soon.length === 1 ? "tarea más" : "tareas más"} esta semana.`);
    lines.push("");
  }

  // Lo que hay que perseguir (revisiones, comercial, cobros…).
  lines.push(...chaseLines(chases));

  // Atrasos del equipo en TUS proyectos (eres el líder) → a empujar.
  if (leadEsc.length) {
    lines.push(`🚨 Atrasos en ${leadEsc.length === 1 ? "tu proyecto" : "tus proyectos"} — empújalos, ${voc}:`);
    leadEsc.slice(0, 4).forEach((e) => {
      const who = e.byPerson.slice(0, 4).map((p2) => `${p2.name} (${p2.count})`).join(" · ");
      lines.push(`   • ${e.project}: ${who}`);
    });
    lines.push("");
  }

  // Cierre con empuje de productor.
  if (!actionable) {
    lines.push(`✅ ¡Vas al día, ${voc}! No tienes pendientes urgentes. A disfrutarlo. 🎉`);
  } else if (p.overdue.length || chases.invoices.length || chases.clientWaiting.length || leadEsc.length) {
    lines.push(`No aflojes, ${voc} 🔥 Saca esto adelante y me cuentas. Aquí estaré pendiente.`);
  } else {
    lines.push(`¡A darle, ${voc}! Cuando cierres algo, lo voy viendo. 💪`);
  }

  return lines.join("\n").trim();
}

// Resumen de equipo (admin / gerente / productor).
export function composeTeam(opts: { s: TeamSummary; esc?: TeamEscalation; morning: boolean; now: Date }): string {
  const { s, esc, morning, now } = opts;
  const lines: string[] = [];
  lines.push(`👔 Resumen del equipo · ${bogotaLongDate(now)}`);
  lines.push("");

  if (s.overdueTotal) {
    lines.push(`🔴 ${s.overdueTotal} ${s.overdueTotal === 1 ? "tarea atrasada" : "tareas atrasadas"} en total:`);
    s.byPerson.slice(0, 6).forEach((b) => lines.push(`   • ${b.name} — ${b.count}`));
    lines.push("");
  } else {
    lines.push("🟢 Sin tareas atrasadas en el equipo. ¡Bien ahí!");
    lines.push("");
  }

  if (s.unassigned.length) {
    lines.push(`🆕 ${s.unassigned.length} sin responsable (próximas 2 semanas):`);
    s.unassigned.slice(0, 4).forEach((t) => lines.push(bullet(t, { showDue: true })));
    lines.push("");
  }

  if (s.deliveries.length) {
    lines.push(`📦 ${s.deliveries.length} ${s.deliveries.length === 1 ? "entrega" : "entregas"} esta semana:`);
    s.deliveries.slice(0, 5).forEach((t) => lines.push(bullet(t, { showDue: true })));
    lines.push("");
  }

  if (s.shoots.length) {
    lines.push(`🎬 ${s.shoots.length} ${s.shoots.length === 1 ? "rodaje" : "rodajes"} esta semana:`);
    s.shoots.slice(0, 5).forEach((t) => lines.push(bullet(t, { showDue: true })));
    lines.push("");
  }

  // Focos de atención que un productor vigila (revisiones estancadas, comercial, cobros).
  if (esc) {
    const flags: string[] = [];
    if (esc.awaitingInternal) flags.push(`✅ ${esc.awaitingInternal} por pre-aprobar`);
    if (esc.awaitingClient) flags.push(`📨 ${esc.awaitingClient} sin respuesta del cliente`);
    if (esc.staleTasks) flags.push(`🐢 ${esc.staleTasks} tareas estancadas (+7 días)`);
    if (esc.proposalsOpen) flags.push(`💼 ${esc.proposalsOpen} propuestas sin cerrar`);
    if (esc.invoicesOverdue) flags.push(`🧾 ${esc.invoicesOverdue} facturas por cobrar`);
    if (flags.length) {
      lines.push("⚠️ Focos de atención:");
      flags.forEach((f) => lines.push(`   • ${f}`));
      lines.push("");
    }
  }

  lines.push(morning ? "Que tengan un gran día. El equipo te necesita al frente. 🙌" : "Échale un ojo cuando puedas. 🙌");
  return lines.join("\n").trim();
}

// Cierre del DÍA (~4 p. m., días laborales que no son el último de la semana): qué cerró
// hoy la persona y qué le queda pendiente, para que termine el día al tanto.
export function composeDailyClose(opts: {
  name: string;
  gender: Gender;
  done: TaskLite[];
  p: UserPendientes;
  now: Date;
}): string {
  const { name, gender, done, p, now } = opts;
  const voc = vocativo(gender);
  const firstName = name.split(" ")[0];
  const lines: string[] = [`🌇 Cierre del día, ${firstName}.`, ""];

  if (done.length) {
    lines.push(`✅ Hoy cerraste ${done.length} ${done.length === 1 ? "tarea" : "tareas"}. ¡Bien ahí, ${voc}! 🙌`);
    const { shown, rest } = clip(done, 5);
    shown.forEach((t) => lines.push(bullet(t)));
    if (rest) lines.push(`   … y ${rest} más`);
    lines.push("");
  } else {
    lines.push(`Hoy no marcaste tareas como cerradas. Mañana las sacamos, ${voc} 💪`);
    lines.push("");
  }

  const pending = [...p.overdue, ...p.today];
  if (pending.length) {
    const od = p.overdue.length ? ` (${p.overdue.length} atrasada${p.overdue.length === 1 ? "" : "s"})` : "";
    lines.push(`📌 Te ${pending.length === 1 ? "queda" : "quedan"} ${pending.length} ${pending.length === 1 ? "pendiente" : "pendientes"}${od}:`);
    const { shown, rest } = clip(pending, 5);
    shown.forEach((t, i) => lines.push(bullet(t, i < p.overdue.length ? { overdue: true, now } : undefined)));
    if (rest) lines.push(`   … y ${rest} más`);
    lines.push("");
    lines.push(`Déjalas listas o pásalas para mañana. Nos vemos temprano, ${voc} 🌙`);
  } else {
    lines.push(`🎉 ¡Quedaste al día, ${voc}! Sin pendientes. Desconéctate tranquilo. 🌙`);
  }

  return lines.join("\n").trim();
}

// Cierre de semana (viernes ~4 p. m.): recap personal de lo cerrado y lo que queda.
export function composeWeeklyPersonal(opts: {
  name: string;
  gender: Gender;
  week: UserWeek;
  p: UserPendientes;
  now: Date;
}): string {
  const { name, gender, week, p, now } = opts;
  const voc = vocativo(gender);
  const firstName = name.split(" ")[0];
  const hrs = hoursText(week.minutes);
  const lines: string[] = [`🎉 ¡Cierre de semana, ${firstName}!`, ""];

  if (week.completed > 0) {
    lines.push(`✅ Cerraste ${week.completed} ${week.completed === 1 ? "tarea" : "tareas"} esta semana${hrs ? ` y registraste ${hrs}` : ""}. ¡Crack! 🙌`);
  } else {
    lines.push(`Esta semana no marcaste tareas cerradas${hrs ? ` (registraste ${hrs})` : ""}. La próxima la sacamos, ${voc} 💪`);
  }

  const remaining = p.overdue.length + p.today.length + p.soon.length;
  if (remaining > 0) {
    const od = p.overdue.length ? ` (${p.overdue.length} atrasada${p.overdue.length === 1 ? "" : "s"})` : "";
    lines.push(`📌 Para el lunes te quedan ${remaining} pendiente${remaining === 1 ? "" : "s"}${od}.`);
  }
  lines.push("");
  lines.push(`¡Buen trabajo, ${voc}! Desconéctate el finde, que el lunes seguimos con todo. 🚀`);
  return lines.join("\n").trim();
}

// Cierre de semana del equipo (para roles administrativos).
export function composeWeeklyTeam(opts: { week: TeamWeek; s: TeamSummary; esc?: TeamEscalation; now: Date }): string {
  const { week, s, esc, now } = opts;
  const lines: string[] = [`👔 Cierre de semana del equipo · ${bogotaLongDate(now)}`, ""];
  lines.push(`✅ ${week.completedTotal} ${week.completedTotal === 1 ? "tarea cerrada" : "tareas cerradas"} esta semana.`);
  if (week.topClosers.length) {
    lines.push(`🏆 ${week.topClosers.slice(0, 3).map((c) => `${c.name} (${c.count})`).join(" · ")}`);
  }
  if (s.overdueTotal) {
    lines.push(`🔴 ${s.overdueTotal} ${s.overdueTotal === 1 ? "tarea atrasada arrastra" : "tareas atrasadas arrastran"} al lunes.`);
  }
  if (esc) {
    const flags: string[] = [];
    if (esc.awaitingInternal) flags.push(`✅ ${esc.awaitingInternal} por pre-aprobar`);
    if (esc.awaitingClient) flags.push(`📨 ${esc.awaitingClient} sin respuesta del cliente`);
    if (esc.proposalsOpen) flags.push(`💼 ${esc.proposalsOpen} propuestas sin cerrar`);
    if (esc.invoicesOverdue) flags.push(`🧾 ${esc.invoicesOverdue} facturas por cobrar`);
    if (flags.length) {
      lines.push("");
      lines.push("Para no dejar cabos sueltos:");
      flags.forEach((f) => lines.push(`   • ${f}`));
    }
  }
  lines.push("");
  lines.push("Gran semana, equipo. A descansar y recargar. 🙌");
  return lines.join("\n").trim();
}
