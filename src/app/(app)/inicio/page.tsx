import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { formatBogota } from "@/lib/bogota-time";
import { getClientHomeData } from "@/lib/client-home-data";
import { ClientHomeView } from "@/components/client-home-view";
import { ClientPortalNav } from "@/components/client-portal-nav";
import { ClientHero } from "@/components/client-hero";

export const dynamic = "force-dynamic";

// ── INICIO del cliente ──
// El aterrizaje del portal responde en 5 segundos «¿cómo va mi proceso?»: qué le toca hacer,
// en qué fase va cada proyecto y qué pasó últimamente. Solo para el rol cliente (el equipo
// tiene su propio Inicio en "/").
export default async function InicioClientePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "cliente") redirect("/");

  const [data, membership, me] = await Promise.all([
    getClientHomeData({ id: session.id, name: session.name }),
    db.clientMember.findFirst({
      where: { userId: session.id },
      // La portada del portal es la MISMA de la ficha (una sola fuente): el cliente la ve,
      // no la edita — su marca se siente cuidada sin trabajo doble del equipo.
      select: {
        client: {
          select: {
            name: true, company: true, emoji: true, accentColor: true,
            bannerUrl: true, bannerPosY: true, photoUrl: true, logoUrl: true, logoBg: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    // Género para el saludo (reutiliza el campo que ya usa Marcebot). null = saludo neutro,
    // nunca uno que arriesgue equivocarse.
    db.user.findUnique({ where: { id: session.id }, select: { gender: true } }),
  ]);

  const firstName = session.name.split(" ")[0] || session.name;
  const today = formatBogota(new Date(), { weekday: "long", day: "numeric", month: "long" });
  // Fecha en mayúscula inicial (formatBogota la entrega en minúscula: "viernes, 22 de agosto").
  const todayCap = today.charAt(0).toUpperCase() + today.slice(1);
  const c = membership?.client ?? null;
  const saludo = me?.gender === "F" ? `Bienvenida, ${firstName}` : me?.gender === "M" ? `Bienvenido, ${firstName}` : `Hola, ${firstName}`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {c ? (
        <div className="mb-4">
          <ClientHero
            name={c.name}
            emoji={c.emoji}
            photoUrl={c.photoUrl}
            logoUrl={c.logoUrl}
            logoBg={c.logoBg}
            color={c.accentColor}
            bannerUrl={c.bannerUrl}
            bannerPosY={c.bannerPosY}
            variant="portal"
          />
        </div>
      ) : null}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{todayCap}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">{saludo} 👋</h1>
          {/* La bienvenida cálida: qué es este espacio y qué va a encontrar. El cliente entra
              pocas veces — que cada vez se sienta parte de algo y sepa dónde está todo. */}
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Este es tu espacio en Labstream: aquí ves cómo avanza tu proyecto, revisas lo que
            preparamos para ti y hablas con el equipo cuando lo necesites.
          </p>
        </div>
        {hasPermission(session, "crear_proyectos") ? (
          <Link
            href="/proyectos/nuevo"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Plus className="size-4" /> Nuevo proyecto
          </Link>
        ) : null}
      </header>

      {/* Sub-nav SOLO en móvil (md:hidden): en escritorio manda el rail de la izquierda. */}
      <ClientPortalNav active="inicio" />
      <ClientHomeView data={data} />
    </div>
  );
}
