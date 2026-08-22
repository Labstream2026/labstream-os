import { db } from "@/lib/db";
import { accessibleProjectWhere } from "@/lib/project-access";
import { signReviewToken } from "@/lib/review-token";
import { formatBogota } from "@/lib/bogota-time";
import { photoThumbSrc } from "@/lib/deliverable-photo";
import { deliverableOrientation } from "@/lib/ui";
import { CLIENT_DELIVERABLE_STATES, clientPhases, clientPhasePill, type ClientPhase } from "@/lib/client-portal";
import type { SessionUser } from "@/lib/session";

// ── Datos del INICIO del cliente ──
// Arma todo lo que pinta el tablero «¿Cómo va mi proceso?»: acciones pendientes («Te toca a ti»,
// como carrusel con el fotograma real de cada pieza), el estado de UN proyecto de un vistazo
// (cuenta atrás + viaje por fases + estado pieza por pieza), próximas fechas y novedades. Se usa
// en /inicio (el propio cliente) y en la VISTA PREVIA del portal (/clientes/[id]/portal).

export type TeTocaItem = {
  kind: "review" | "survey";
  title: string; // la pieza a revisar, o el título de la encuesta
  project: string; // proyecto al que pertenece (subtítulo del carrusel)
  cover: string | null; // fotograma del video (portada del entregable), null en encuestas
  vertical: boolean; // orientación de la pieza → aspecto de la tarjeta (9/16 vs 16/9)
  href: string;
  cta: string;
  due: string | null; // «Antes del 5 sep», o null
};

// Estado de una pieza en la voz del cliente (para el vistazo del proyecto).
export type HomePieceStatus = "revision" | "cambios" | "listo" | "produccion";
export type HomePiece = { name: string; status: HomePieceStatus };

// Cuenta atrás hacia la próxima fecha clave del proyecto.
export type HomeCountdown = { text: string; tone: "urgente" | "pronto" | "tranqui" };

export type HomeProject = {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  clientName: string | null;
  pill: { label: string; className: string };
  phases: ClientPhase[];
  pct: number | null; // % de piezas aprobadas (null si aún no hay piezas de cara al cliente)
  nextLine: string | null; // «Siguiente: …» (fecha clave más próxima)
  countdown: HomeCountdown | null; // «Faltan 3 días» hacia esa misma fecha
  pieces: HomePiece[]; // estado pieza por pieza (lo que el equipo ya entregó / está preparando)
  finished: boolean;
};

export type Novedad = {
  id: string;
  title: string;
  when: string;
  link: string | null;
  actor: { name: string; initials: string | null; color: string | null } | null;
};

export type FechaItem = { when: string; label: string };

export type ClientHomeData = {
  teToca: TeTocaItem[];
  projects: HomeProject[];
  fechas: FechaItem[];
  novedades: Novedad[];
};

const APPROVED = new Set(["APROBADO", "ENTREGADO"]);

function shortDate(d: Date): string {
  return formatBogota(d, { day: "numeric", month: "short" });
}

// Días de calendario hasta una fecha (redondeo por día en UTC: para una etiqueta amable —«hoy»,
// «faltan 3 días»— no importan las horas ni el huso al minuto; las fechas clave se fijan por día).
function diasHasta(target: Date, now: Date): number {
  const soloDia = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  return Math.round((soloDia(target) - soloDia(now)) / 86_400_000);
}

// La cuenta atrás amable + su tono (urgente ≤ hoy, pronto ≤ 3 días, tranqui más allá).
function countdownDe(target: Date, now: Date): HomeCountdown {
  const d = diasHasta(target, now);
  if (d < 0) return { text: "Entrega vencida", tone: "urgente" };
  if (d === 0) return { text: "Es hoy", tone: "urgente" };
  if (d === 1) return { text: "Falta 1 día", tone: "pronto" };
  if (d <= 3) return { text: `Faltan ${d} días`, tone: "pronto" };
  return { text: `Faltan ${d} días`, tone: "tranqui" };
}

// Estado de una pieza de cara al cliente, en su voz.
function pieceStatus(status: string): HomePieceStatus {
  if (status === "ENVIADO_CLIENTE") return "revision";
  if (status === "CORRECCIONES") return "cambios";
  if (APPROVED.has(status)) return "listo";
  return "produccion";
}

export async function getClientHomeData(user: { id: string; name: string }): Promise<ClientHomeData> {
  // Pseudo-sesión de rol cliente SOLO para las cláusulas de acceso (accessibleProjectWhere usa
  // id/role/perms): así la vista previa del equipo consulta EXACTAMENTE lo que ve esa persona.
  const pseudo = { id: user.id, name: user.name, role: "cliente", perms: [] as string[] } as unknown as SessionUser;
  const where = accessibleProjectWhere(pseudo);

  // Piezas del cliente: SOLO donde está tagueado como revisor (mismo criterio que Mis entregas).
  const mine = { OR: [{ reviewers: { some: { userId: user.id } } }, { reviewerId: user.id }] };

  const now = new Date();
  const in14d = new Date(now.getTime() + 14 * 24 * 3600 * 1000);

  const projects = await db.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 12,
    select: {
      id: true,
      name: true,
      emoji: true,
      color: true,
      status: true,
      dueDate: true,
      finishedAt: true,
      client: { select: { name: true } },
      deliverables: {
        where: { status: { in: [...CLIENT_DELIVERABLE_STATES] }, ...mine },
        select: { id: true, name: true, status: true, type: true, dueDate: true, updatedAt: true, coverFileAssetId: true },
      },
    },
  });
  const projectIds = projects.map((p) => p.id);

  // «Te toca a ti»: piezas esperando SU revisión (carrusel con fotograma) + encuestas sin responder.
  const teToca: TeTocaItem[] = [];
  for (const p of projects) {
    for (const d of p.deliverables.filter((d) => d.status === "ENVIADO_CLIENTE")) {
      teToca.push({
        kind: "review",
        title: d.name,
        project: p.name,
        cover: d.coverFileAssetId ? photoThumbSrc({ fileAssetId: d.coverFileAssetId, url: null }) : null,
        vertical: deliverableOrientation(d.type) === "vertical",
        href: `/review/${signReviewToken(d.id)}`,
        cta: "Revisar",
        due: d.dueDate ? `Antes del ${shortDate(d.dueDate)}` : null,
      });
    }
  }
  const finishedIds = projects.filter((p) => p.finishedAt).map((p) => p.id);
  if (finishedIds.length) {
    const answered = new Set(
      (
        await db.projectSurvey.findMany({
          where: { userId: user.id, projectId: { in: finishedIds } },
          select: { projectId: true },
        })
      ).map((s) => s.projectId),
    );
    for (const p of projects.filter((p) => p.finishedAt && !answered.has(p.id))) {
      teToca.push({
        kind: "survey",
        title: "Cuéntanos cómo estuvo el proceso",
        project: `${p.name} · terminado`,
        cover: null,
        vertical: false,
        href: `/mis-entregas/${p.id}#encuesta`,
        cta: "Calificar",
        due: null,
      });
    }
  }

  // Tarjetas de proyecto con su viaje por fases, cuenta atrás y estado pieza por pieza.
  const homeProjects: HomeProject[] = projects.map((p) => {
    const total = p.deliverables.length;
    const ok = p.deliverables.filter((d) => APPROVED.has(d.status)).length;
    // Fecha clave más próxima: una pieza por revisar antes, si no la entrega del proyecto.
    const pendingDue = p.deliverables
      .filter((d) => d.status === "ENVIADO_CLIENTE" && d.dueDate && d.dueDate >= now)
      .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())[0];
    const target = p.finishedAt
      ? null
      : pendingDue?.dueDate ?? (p.dueDate && p.dueDate >= now ? p.dueDate : null);
    const nextLine = p.finishedAt
      ? null
      : pendingDue
        ? `Revisar «${pendingDue.name}» · ${shortDate(pendingDue.dueDate!)}`
        : p.dueDate && p.dueDate >= now
          ? `Entrega final · ${shortDate(p.dueDate)}`
          : null;
    // Piezas ordenadas por urgencia (lo que espera al cliente, primero) para el vistazo.
    const orden: Record<HomePieceStatus, number> = { revision: 0, cambios: 1, produccion: 2, listo: 3 };
    const pieces: HomePiece[] = p.deliverables
      .map((d) => ({ name: d.name, status: pieceStatus(d.status) }))
      .sort((a, b) => orden[a.status] - orden[b.status]);
    return {
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      color: p.color,
      clientName: p.client?.name ?? null,
      pill: clientPhasePill(p),
      phases: clientPhases(p),
      pct: total ? Math.round((ok / total) * 100) : null,
      nextLine,
      countdown: target ? countdownDe(target, now) : null,
      pieces,
      finished: !!p.finishedAt,
    };
  });

  // Próximas fechas: citas de sus proyectos (14 días) + entregas de proyecto + plazos de revisión.
  const fechas: { at: Date; label: string }[] = [];
  if (projectIds.length) {
    const events = await db.calendarEvent.findMany({
      where: { projectId: { in: projectIds }, start: { gte: now, lte: in14d } },
      orderBy: { start: "asc" },
      take: 6,
      select: { title: true, start: true, project: { select: { name: true } } },
    });
    for (const e of events) fechas.push({ at: e.start, label: `${e.title}${e.project ? ` — ${e.project.name}` : ""}` });
  }
  for (const p of projects) {
    if (!p.finishedAt && p.dueDate && p.dueDate >= now && p.dueDate <= in14d) {
      fechas.push({ at: p.dueDate, label: `Entrega final · ${p.name}` });
    }
    for (const d of p.deliverables) {
      if (d.status === "ENVIADO_CLIENTE" && d.dueDate && d.dueDate >= now && d.dueDate <= in14d) {
        fechas.push({ at: d.dueDate, label: `Revisar «${d.name}»` });
      }
    }
  }
  fechas.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Novedades: sus últimas notificaciones (ya vienen personalizadas y filtradas por acceso).
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      title: true,
      link: true,
      createdAt: true,
      actor: { select: { name: true, initials: true, avatarColor: true } },
      subject: { select: { name: true, initials: true, avatarColor: true } },
    },
  });
  const novedades: Novedad[] = notifications.map((n) => {
    const a = n.actor ?? n.subject;
    return {
      id: n.id,
      title: n.title,
      when: formatBogota(n.createdAt, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
      link: n.link,
      actor: a ? { name: a.name, initials: a.initials, color: a.avatarColor } : null,
    };
  });

  return {
    teToca: teToca.slice(0, 8),
    projects: homeProjects,
    fechas: fechas.slice(0, 6).map((f) => ({ when: shortDate(f.at), label: f.label })),
    novedades,
  };
}
