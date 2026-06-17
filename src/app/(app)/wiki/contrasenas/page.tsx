import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { WikiTabs } from "../wiki-tabs";
import { CredentialsClient, type Cred } from "./credentials-client";

export const dynamic = "force-dynamic";

export default async function ContrasenasPage() {
  const session = (await getSession())!; // el layout ya bloquea a invitados
  const isAdmin = session.role === "admin";

  const [creds, team] = await Promise.all([
    db.credential.findMany({
      // Admin ve todas; el resto solo las que creó o le compartieron.
      where: isAdmin ? {} : { OR: [{ createdById: session.id }, { viewers: { some: { userId: session.id } } }] },
      orderBy: [{ category: "asc" }, { title: "asc" }],
      include: {
        ownerUser: { select: { name: true } },
        createdBy: { select: { name: true } },
        viewers: { include: { user: { select: { id: true, name: true, initials: true, avatarColor: true } } } },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } }),
  ]);

  const shaped: Cred[] = creds.map((c) => ({
    id: c.id,
    title: c.title,
    category: c.category,
    username: c.username,
    url: c.url,
    notes: c.notes,
    ownerName: c.ownerUser?.name ?? null,
    createdByName: c.createdBy?.name ?? null,
    viewers: c.viewers.map((v) => ({ id: v.user.id, name: v.user.name, initials: v.user.initials, color: v.user.avatarColor })),
    canManage: isAdmin || c.createdById === session.id,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Wiki del equipo</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Bóveda de usuarios y contraseñas del equipo.</p>
      <WikiTabs />

      <div className="mb-4">
        <h2 className="text-lg font-semibold">Usuarios y contraseñas</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Cada contraseña está cifrada. Solo la ven los administradores, quien la creó y las personas a las que
          le des acceso. {isAdmin ? "Como administrador ves todas." : "Ves las que creaste o te compartieron."}
        </p>
      </div>

      <CredentialsClient creds={shaped} team={team.map((t) => ({ id: t.id, name: t.name, initials: t.initials, color: t.avatarColor }))} />
    </div>
  );
}
