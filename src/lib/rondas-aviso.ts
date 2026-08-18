import { db } from "@/lib/db";
import { notifyAndEmail } from "@/lib/notify";
import { acabaDeExcederse, estadoRonda } from "@/lib/rondas";

// ── Aviso de «esta pieza se pasó de las rondas pactadas» ────────────────────
// Se llama DESPUÉS de guardar una decisión del cliente que pidió cambios, desde las dos
// puertas por las que puede entrar: la sala pública del cliente y el panel interno.
//
// Avisa UNA sola vez, en la ronda que cruza el tope, no en cada ronda posterior — para eso
// está `acabaDeExcederse`. Que el aviso se repita en la 6, la 7 y la 8 sería la forma más
// rápida de que el equipo aprenda a ignorarlo.
//
// Va al PRODUCTOR (lead del proyecto) y a COMERCIAL, porque son dos decisiones distintas:
// el productor tiene que parar la mano, y comercial tiene que decidir si se cobra.

const ROLES_COMERCIALES = ["ventas", "gerente"];

export async function avisarRondaExcedida(deliverableId: string): Promise<void> {
  const pieza = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: {
      id: true,
      name: true,
      number: true,
      project: { select: { id: true, name: true, leadId: true, roundsIncluded: true, client: { select: { name: true } } } },
    },
  });
  // Sin tope pactado no hay nada que exceder: se cuentan las rondas igual, pero nadie prometió
  // un techo y avisar sería inventarse un incumplimiento.
  if (!pieza?.project?.roundsIncluded) return;

  const rondas = await db.deliverableDecision.count({
    where: { deliverableId, stage: "CLIENTE", result: "CAMBIOS" },
  });
  if (!acabaDeExcederse(rondas, pieza.project.roundsIncluded)) return;

  const e = estadoRonda(rondas, pieza.project.roundsIncluded);
  const nombrePieza = pieza.number ? `#${pieza.number} ${pieza.name}` : pieza.name;
  const cliente = pieza.project.client?.name ?? "el cliente";

  const comerciales = await db.user.findMany({
    where: { active: true, isGuest: false, role: { key: { in: ROLES_COMERCIALES } } },
    select: { id: true },
  });
  const destinos = new Set<string>([...(pieza.project.leadId ? [pieza.project.leadId] : []), ...comerciales.map((u) => u.id)]);

  await Promise.all(
    [...destinos].map((userId) =>
      notifyAndEmail(userId, {
        type: "rondas.excedidas",
        event: "rondas.excedidas",
        title: `«${nombrePieza}» se pasó de las rondas pactadas`,
        body: `${cliente} pidió cambios ${e.ronda} veces y se pactaron ${e.tope}. Hay ${e.extra} ronda${e.extra > 1 ? "s" : ""} por cobrar en ${pieza.project.name}.`,
        link: `/revisiones/${pieza.id}`,
        projectId: pieza.project.id,
        // Mismo agrupador por pieza: si alguna vez se disparan dos a la vez, se colapsan.
        groupKey: `rondas:${pieza.id}`,
      }),
    ),
  );
}
