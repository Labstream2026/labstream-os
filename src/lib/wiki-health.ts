import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { WIKI_REVIEW_STALE_DAYS } from "@/lib/wiki-templates";

// Salud del conocimiento: qué se está quedando viejo y a quién le toca.
// Hasta ahora la Wiki avisaba de forma pasiva (un chip «para revisar» que solo veía quien
// entraba). Aquí se calcula el panorama y, sobre todo, se AVISA al dueño.

const staleMs = WIKI_REVIEW_STALE_DAYS * 86400000;

// Cuánto se espera antes de volver a avisar del mismo descuido (un aviso diario sería ruido
// y acabaría silenciado).
const REAVISO_DIAS = 30;

export type SaludWiki = {
  total: number;
  alDia: number;
  paraRevisar: number;
  sinDuenno: number;
  nuncaLeidas: number;
  porDuenno: { id: string | null; name: string; initials: string | null; color: string | null; vencidas: number; avisadoAt: Date | null }[];
  huerfanas: { id: string; title: string; icon: string | null; updatedAt: Date }[];
  olvidadas: { id: string; title: string; icon: string | null; updatedAt: Date }[];
};

export async function getSaludWiki(): Promise<SaludWiki> {
  const ahora = Date.now();
  const paginas = await db.wikiPage.findMany({
    select: {
      id: true, title: true, icon: true, updatedAt: true, lastReviewedAt: true, staleNotifiedAt: true,
      owner: { select: { id: true, name: true, initials: true, avatarColor: true } },
    },
    orderBy: { updatedAt: "asc" },
  });

  const vencida = (p: (typeof paginas)[number]) => !!p.owner && ahora - (p.lastReviewedAt?.getTime() ?? 0) > staleMs;
  const paraRevisar = paginas.filter(vencida);
  const sinDuenno = paginas.filter((p) => !p.owner);

  // Agrupa las vencidas por dueño: es la lista de «a quién le toca».
  const porDuennoMap = new Map<string, SaludWiki["porDuenno"][number]>();
  for (const p of paraRevisar) {
    const o = p.owner!;
    const prev = porDuennoMap.get(o.id);
    porDuennoMap.set(o.id, {
      id: o.id,
      name: o.name,
      initials: o.initials,
      color: o.avatarColor,
      vencidas: (prev?.vencidas ?? 0) + 1,
      // Se muestra el aviso MÁS RECIENTE de sus páginas vencidas.
      avisadoAt: [prev?.avisadoAt, p.staleNotifiedAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null,
    });
  }

  return {
    total: paginas.length,
    alDia: paginas.length - paraRevisar.length - sinDuenno.length,
    paraRevisar: paraRevisar.length,
    sinDuenno: sinDuenno.length,
    nuncaLeidas: paginas.filter((p) => !p.lastReviewedAt).length,
    porDuenno: [...porDuennoMap.values()].sort((a, b) => b.vencidas - a.vencidas),
    huerfanas: sinDuenno.slice(0, 10).map((p) => ({ id: p.id, title: p.title, icon: p.icon, updatedAt: p.updatedAt })),
    // Las que llevan más tiempo sin tocarse: candidatas a archivar o a estar mintiendo.
    olvidadas: paginas.slice(0, 5).map((p) => ({ id: p.id, title: p.title, icon: p.icon, updatedAt: p.updatedAt })),
  };
}

/**
 * Avisa a cada dueño de sus páginas vencidas. Idempotente: una página avisada no vuelve a
 * avisar hasta pasados REAVISO_DIAS, y editarla limpia la marca (ver `guardarConHistorial`).
 * Un solo aviso por persona, no uno por página: cinco campanazos seguidos se silencian.
 */
export async function avisarPaginasVencidas(): Promise<{ avisados: number; paginas: number }> {
  const ahora = Date.now();
  const limiteReaviso = new Date(ahora - REAVISO_DIAS * 86400000);

  const vencidas = await db.wikiPage.findMany({
    where: {
      ownerId: { not: null },
      OR: [{ lastReviewedAt: null }, { lastReviewedAt: { lt: new Date(ahora - staleMs) } }],
      AND: [{ OR: [{ staleNotifiedAt: null }, { staleNotifiedAt: { lt: limiteReaviso } }] }],
    },
    select: { id: true, title: true, ownerId: true },
  });
  if (!vencidas.length) return { avisados: 0, paginas: 0 };

  const porDuenno = new Map<string, { id: string; title: string }[]>();
  for (const p of vencidas) {
    const k = p.ownerId!;
    (porDuenno.get(k) ?? porDuenno.set(k, []).get(k)!).push({ id: p.id, title: p.title });
  }

  let avisados = 0;
  for (const [ownerId, suyas] of porDuenno) {
    const n = suyas.length;
    const ok = await notify(ownerId, {
      type: "wiki",
      event: "wiki_stale",
      title: n === 1 ? `Toca revisar «${suyas[0].title}»` : `Tienes ${n} páginas de la wiki por revisar`,
      body:
        n === 1
          ? "Lleva más de seis meses sin revisarse. Si sigue vigente, márcala como revisada."
          : `${suyas.slice(0, 3).map((s) => s.title).join(", ")}${n > 3 ? " y otras" : ""}. Si siguen vigentes, márcalas como revisadas.`,
      link: n === 1 ? `/wiki/${suyas[0].id}` : "/wiki/salud",
      subjectId: ownerId,
      groupKey: "wiki:stale",
    }).catch(() => false);
    if (ok) avisados++;
  }

  // Se sella SIEMPRE que se intentó: si el usuario tiene el aviso apagado, no se le insiste
  // cada día con una notificación que él mismo silenció.
  await db.wikiPage.updateMany({ where: { id: { in: vencidas.map((p) => p.id) } }, data: { staleNotifiedAt: new Date() } });

  return { avisados, paginas: vencidas.length };
}
