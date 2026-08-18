import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── ¿Qué entregable estoy editando? ───────────────────────────────────────────
// El panel de Resolve le pregunta al puente cómo se llama el timeline abierto y manda ese
// nombre aquí; devolvemos el entregable que le corresponde para abrir DIRECTO en sus
// correcciones. Antes el editor tenía que elegir cliente → proyecto → video a mano, tres
// toques, teniendo ESE video delante.
//
// Autorización: la sesión del equipo, igual que el panel (no el token de revisión). El
// alcance de proyectos es el MISMO de la app, así que nadie ve por aquí un proyecto que no
// vería en la web.
//
// El emparejamiento es deliberadamente CONSERVADOR: ante la duda, no adivina. Un falso
// positivo —abrir el video equivocado— es peor que no detectar nada, porque el editor
// marcaría correcciones de otra pieza sin darse cuenta.

// Normaliza para comparar: minúsculas, sin acentos, sin extensión, y los separadores
// habituales de los nombres de timeline (_ - . espacios) colapsados a un espacio.
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // quita los acentos ya separados por NFD
    .replace(/\.(mov|mp4|mxf|prproj|drp)$/i, "")
    .replace(/[_.\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Puntaje de parecido entre el nombre del timeline y el de un entregable.
// 100 = idéntico · 80 = uno contiene al otro entero · 0 = no se parecen.
// El "contiene" pide al menos 6 caracteres para no casar por un "v2" suelto.
function puntaje(timeline: string, candidato: string): number {
  if (!timeline || !candidato) return 0;
  if (timeline === candidato) return 100;
  if (candidato.length >= 6 && timeline.includes(candidato)) return 80;
  if (timeline.length >= 6 && candidato.includes(timeline)) return 80;
  // Palabras en común (>=4 letras): mide solape real, no coincidencias de "de", "el"…
  const a = new Set(timeline.split(" ").filter((w) => w.length >= 4));
  const b = new Set(candidato.split(" ").filter((w) => w.length >= 4));
  if (a.size === 0 || b.size === 0) return 0;
  let comunes = 0;
  for (const w of a) if (b.has(w)) comunes++;
  const cobertura = comunes / Math.min(a.size, b.size);
  return cobertura >= 0.6 ? Math.round(50 + cobertura * 25) : 0;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ ok: false, error: "Sin sesión." }, { status: 401 });
  if (session.role === "cliente") return Response.json({ ok: false, error: "No disponible." }, { status: 403 });

  const timelineRaw = (new URL(req.url).searchParams.get("timeline") || "").slice(0, 200);
  const timeline = normalizar(timelineRaw);
  if (!timeline) return Response.json({ ok: true, match: null, reason: "sin-timeline" });

  if (!rateLimit(`plugin-match:${session.id}`, 60, 60_000)) {
    return Response.json({ ok: false, error: "Demasiadas peticiones." }, { status: 429 });
  }

  // Candidatos: entregables vivos de proyectos accesibles. Se acota a los 400 más recientes
  // —el emparejamiento es en memoria y no tiene sentido pasear el archivo entero del estudio.
  const candidatos = await db.deliverable.findMany({
    where: { archivedAt: null, project: accessibleProjectWhere(session) },
    orderBy: { updatedAt: "desc" },
    take: 400,
    select: {
      id: true,
      name: true,
      number: true,
      updatedAt: true,
      project: { select: { name: true } },
    },
  });

  const puntuados = candidatos
    .map((d) => ({ d, score: puntaje(timeline, normalizar(d.name)) }))
    .filter((x) => x.score > 0)
    // A igual parecido gana el más reciente (ya vienen ordenados por updatedAt).
    .sort((a, b) => b.score - a.score);

  if (puntuados.length === 0) return Response.json({ ok: true, match: null, reason: "sin-coincidencia" });

  // AMBIGÜEDAD: si el segundo empata con el primero, no se elige. Pasa de verdad — «Reel 01»
  // en dos proyectos distintos — y abrir el equivocado haría marcar correcciones ajenas.
  const mejor = puntuados[0];
  const segundo = puntuados[1];
  if (segundo && segundo.score === mejor.score) {
    return Response.json({ ok: true, match: null, reason: "ambiguo", candidatos: puntuados.length });
  }

  return Response.json({
    ok: true,
    match: {
      deliverableId: mejor.d.id,
      name: mejor.d.name,
      number: mejor.d.number,
      projectName: mejor.d.project.name,
      score: mejor.score,
    },
  });
}
