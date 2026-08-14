import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { parsePeriodo, type Periodo, type FilaBarra, type Jornada, type SerieBarras } from "@/lib/reportes/datos";
import { accesoRastreo, filtroSujetos } from "./acceso";

// ── Los DATOS del panel de rastreo ──────────────────────────────────────────
// Sale de una sola fuente: los bloques que sube el sensor de la app de escritorio. Aquí se
// arma TODO en el servidor (horas ya formateadas, jornadas en hora de Bogotá, series listas
// para pintar) y se filtra por lo que la sesión tiene derecho a ver — ver lib/rastreo/acceso.
//
// El día de trabajo lo agrupa POSTGRES, no JavaScript: el contenedor corre en UTC y una tarde
// de edición se partiría en dos al cruzar la medianoche del servidor. Con date_trunc sobre la
// hora local de Bogotá, un martes es un martes.

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type Visor = {
  id: string;
  nombre: string;
  ini: string | null;
  color: string | null;
  venceTxt: string | null; // «hasta el 30 sep» · null = sin vencimiento
  nota: string | null;
};

export type PersonaRastreo = {
  id: string;
  ini: string | null;
  nombre: string;
  color: string | null;
  horas: number; // efectivas, para ordenar y para las barras
  horasTxt: string; // «38,4 h»
  /** Del tiempo medido, cuánto tuvo entrada real de mouse/teclado. Distingue «app abierta»
   *  de «trabajando». null si no hay nada medido. */
  pctActivo: number | null;
  dias: number; // días con actividad en el periodo
  promedioTxt: string; // «6,4 h» por día trabajado
  serie: SerieBarras; // su curva en el periodo
  apps: FilaBarra[];
  cuentas: FilaBarra[];
  jornadas: Jornada[]; // las últimas 10, de la más reciente a la más vieja
  equipos: number; // equipos vinculados y vivos
  ultimoTxt: string | null; // «hace 3 min» · null si nunca reportó
  visores: Visor[]; // a quién más se le compartió (vacío si no gestionas)
};

export type RastreoDatos = {
  periodo: Periodo;
  /** Ve a todo el equipo y puede conceder/quitar acceso. */
  gestiona: boolean;
  /** Qué pintan las barras: «Por día», «Por semana», «Por mes». */
  contexto: string;
  totalTxt: string;
  personasConDatos: number;
  pctActivoEquipo: number | null;
  serieEquipo: SerieBarras;
  personas: PersonaRastreo[];
  /** A quién se le puede conceder acceso (solo si gestionas). */
  candidatos: { id: string; nombre: string; ini: string | null; color: string | null }[];
  /** Nadie ha vinculado equipo todavía: el panel explica qué falta en vez de mostrar ceros. */
  sinSensor: boolean;
};

type FilaDia = { userId: string; dia: Date; seg: number; act: number; ini: Date; fin: Date };

const horas1 = (seg: number) => `${(seg / 3600).toFixed(1).replace(".", ",")} h`;
const FMT_HORA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
const FMT_DIA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short" });

/** «hace 3 min» · «hace 2 h» · «hace 4 d». */
function hace(d: Date, ahoraMs: number): string {
  const min = Math.max(0, Math.round((ahoraMs - d.getTime()) / 60000));
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 36) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} d`;
}

/**
 * Agrupa los días en las barras que le sirven al periodo: un mes se ve por día, 90 días por
 * semana, y un año o «todo» por mes. Devuelve también el rótulo de qué se está viendo.
 */
export function agrupar(filas: { dia: Date; seg: number }[], periodo: Pick<Periodo, "key">): { serie: SerieBarras; contexto: string } {
  const modo = periodo.key === "mes" ? "dia" : periodo.key === "90" ? "semana" : "mes";
  const cubos = new Map<string, { orden: number; label: string; seg: number }>();

  for (const f of filas) {
    // `dia` viene de Postgres como fecha pura: sus componentes UTC SON el día de Bogotá.
    const d = f.dia;
    let clave: string, label: string, orden: number;
    if (modo === "dia") {
      clave = d.toISOString().slice(0, 10);
      label = String(d.getUTCDate());
      orden = d.getTime();
    } else if (modo === "semana") {
      // Lunes de esa semana.
      const lunes = new Date(d.getTime());
      const dow = (lunes.getUTCDay() + 6) % 7; // 0 = lunes
      lunes.setUTCDate(lunes.getUTCDate() - dow);
      clave = lunes.toISOString().slice(0, 10);
      label = `${lunes.getUTCDate()} ${MES_CORTO[lunes.getUTCMonth()]}`;
      orden = lunes.getTime();
    } else {
      clave = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      label = MES_CORTO[d.getUTCMonth()];
      orden = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    }
    const c = cubos.get(clave) ?? { orden, label, seg: 0 };
    c.seg += f.seg;
    cubos.set(clave, c);
  }

  const ordenados = [...cubos.values()].sort((a, b) => a.orden - b.orden);
  return {
    serie: {
      labels: ordenados.map((c) => c.label),
      valores: ordenados.map((c) => Math.round((c.seg / 3600) * 10) / 10),
    },
    contexto: modo === "dia" ? "Por día" : modo === "semana" ? "Por semana" : "Por mes",
  };
}

export async function construirRastreo(session: SessionUser | null, sp: { p?: string; m?: string }): Promise<RastreoDatos | null> {
  const acceso = await accesoRastreo(session);
  const filtro = filtroSujetos(acceso);
  if (!acceso.puede || !filtro) return null; // la página redirige: aquí no se decide la UI

  const ahora = new Date();
  const periodo = parsePeriodo(sp, ahora);
  const rango = { ...(periodo.desde ? { gte: periodo.desde } : {}), lt: periodo.hasta };

  // El WHERE del SQL crudo se arma con Prisma.sql (parametrizado, nunca interpolado a mano).
  const wUsuarios = acceso.sujetos === null ? Prisma.empty : Prisma.sql`AND "userId" IN (${Prisma.join(acceso.sujetos)})`;
  const wDesde = periodo.desde ? Prisma.sql`AND "startedAt" >= ${periodo.desde}` : Prisma.empty;

  const [porDia, apps, cuentas, usuarios, dispositivos, compartidos, clientesDb] = await Promise.all([
    // Un renglón por persona y día LOCAL: cuánto sumó, cuánto de eso fue activo, y a qué hora
    // abrió y cerró. De aquí salen la serie, los días trabajados y las jornadas.
    db.$queryRaw<FilaDia[]>`
      SELECT "userId",
             (("startedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'))::date AS dia,
             SUM("seconds")::int    AS seg,
             SUM("activeSecs")::int AS act,
             MIN("startedAt")       AS ini,
             MAX("startedAt" + make_interval(secs => "seconds")) AS fin
      FROM "WorkBlock"
      WHERE "startedAt" < ${periodo.hasta} ${wDesde} ${wUsuarios}
      GROUP BY 1, 2
      ORDER BY 2 ASC
    `,
    db.workBlock.groupBy({ by: ["userId", "app"], where: { startedAt: rango, ...filtro }, _sum: { seconds: true } }),
    db.workBlock.groupBy({ by: ["userId", "clientId"], where: { startedAt: rango, ...filtro }, _sum: { seconds: true } }),
    db.user.findMany({
      where: { active: true, isGuest: false, role: { key: { notIn: ["cliente", "demo"] } } },
      select: { id: true, name: true, initials: true, avatarColor: true },
      orderBy: { name: "asc" },
    }),
    db.trackerDevice.findMany({
      where: { revokedAt: null, ...(acceso.sujetos ? { userId: { in: acceso.sujetos } } : {}) },
      select: { userId: true, lastSeenAt: true },
    }),
    // Quién ve a quién (para la columna de «compartido con»). Solo tiene sentido si gestionas.
    acceso.gestiona
      ? db.trackerShare.findMany({
          where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: ahora } }] },
          select: {
            subjectId: true, expiresAt: true, nota: true,
            viewer: { select: { id: true, name: true, initials: true, avatarColor: true } },
          },
        })
      : Promise.resolve([]),
    db.client.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
  ]);

  const ahoraMs = ahora.getTime();
  const nombreCliente = new Map(clientesDb.map((c) => [c.id, c.name]));

  // ── Por persona ──
  const diasDe = new Map<string, FilaDia[]>();
  for (const f of porDia) {
    const arr = diasDe.get(f.userId) ?? [];
    arr.push(f);
    diasDe.set(f.userId, arr);
  }
  const appsDe = new Map<string, FilaBarra[]>();
  for (const r of apps) {
    const seg = r._sum.seconds ?? 0;
    const arr = appsDe.get(r.userId) ?? [];
    arr.push({ label: r.app, valor: seg, texto: horas1(seg) });
    appsDe.set(r.userId, arr);
  }
  const cuentasDe = new Map<string, FilaBarra[]>();
  for (const r of cuentas) {
    const seg = r._sum.seconds ?? 0;
    const arr = cuentasDe.get(r.userId) ?? [];
    arr.push({ label: r.clientId ? nombreCliente.get(r.clientId) ?? "Otra cuenta" : "Sin atribuir", valor: seg, texto: horas1(seg) });
    cuentasDe.set(r.userId, arr);
  }
  for (const arr of [...appsDe.values(), ...cuentasDe.values()]) arr.sort((a, b) => b.valor - a.valor).splice(6);

  const equiposDe = new Map<string, { n: number; ultimo: Date | null }>();
  for (const d of dispositivos) {
    const cur = equiposDe.get(d.userId) ?? { n: 0, ultimo: null };
    cur.n += 1;
    if (d.lastSeenAt && (!cur.ultimo || d.lastSeenAt > cur.ultimo)) cur.ultimo = d.lastSeenAt;
    equiposDe.set(d.userId, cur);
  }

  const visoresDe = new Map<string, Visor[]>();
  for (const s of compartidos) {
    const arr = visoresDe.get(s.subjectId) ?? [];
    arr.push({
      id: s.viewer.id,
      nombre: s.viewer.name,
      ini: s.viewer.initials,
      color: s.viewer.avatarColor,
      venceTxt: s.expiresAt ? `hasta el ${s.expiresAt.getUTCDate()} ${MES_CORTO[s.expiresAt.getUTCMonth()]}` : null,
      nota: s.nota,
    });
    visoresDe.set(s.subjectId, arr);
  }

  const visibles = acceso.sujetos === null ? usuarios : usuarios.filter((u) => acceso.sujetos!.includes(u.id));

  const personas: PersonaRastreo[] = visibles
    .map((u) => {
      const dias = diasDe.get(u.id) ?? [];
      const seg = dias.reduce((s, d) => s + d.seg, 0);
      const act = dias.reduce((s, d) => s + d.act, 0);
      const eq = equiposDe.get(u.id);
      return {
        id: u.id,
        ini: u.initials,
        nombre: u.name,
        color: u.avatarColor,
        horas: Math.round((seg / 3600) * 10) / 10,
        horasTxt: horas1(seg),
        pctActivo: seg > 0 ? Math.round((act / seg) * 100) : null,
        dias: dias.length,
        promedioTxt: dias.length ? horas1(seg / dias.length) : "—",
        serie: agrupar(dias, periodo).serie,
        apps: appsDe.get(u.id) ?? [],
        cuentas: cuentasDe.get(u.id) ?? [],
        jornadas: [...dias]
          .sort((a, b) => b.dia.getTime() - a.dia.getTime())
          .slice(0, 10)
          .map((d) => ({
            dia: FMT_DIA.format(d.dia).replace(".", ""),
            inicio: FMT_HORA.format(d.ini),
            fin: FMT_HORA.format(d.fin),
            efectivasTxt: horas1(d.seg),
            horas: d.seg / 3600,
          })),
        equipos: eq?.n ?? 0,
        ultimoTxt: eq?.ultimo ? hace(eq.ultimo, ahoraMs) : null,
        visores: visoresDe.get(u.id) ?? [],
      };
    })
    // Quien no tiene equipo vinculado NI datos no aporta nada: fuera de la lista.
    .filter((p) => p.horas > 0 || p.equipos > 0)
    .sort((a, b) => b.horas - a.horas);

  const totalSeg = porDia.reduce((s, d) => s + d.seg, 0);
  const totalAct = porDia.reduce((s, d) => s + d.act, 0);
  const { serie: serieEquipo, contexto } = agrupar(porDia, periodo);

  return {
    periodo,
    gestiona: acceso.gestiona,
    contexto,
    totalTxt: horas1(totalSeg),
    personasConDatos: personas.filter((p) => p.horas > 0).length,
    pctActivoEquipo: totalSeg > 0 ? Math.round((totalAct / totalSeg) * 100) : null,
    serieEquipo,
    personas,
    candidatos: acceso.gestiona ? usuarios.map((u) => ({ id: u.id, nombre: u.name, ini: u.initials, color: u.avatarColor })) : [],
    sinSensor: personas.every((p) => p.equipos === 0) && totalSeg === 0,
  };
}
