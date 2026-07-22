import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageClient } from "@/lib/client-access";
import { getClientHomeData } from "@/lib/client-home-data";
import { ClientHomeView } from "@/components/client-home-view";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// ── «Ver como cliente» ──
// Vista PREVIA del portal: el equipo ve EXACTAMENTE el Inicio que ve una persona del cliente
// (mismos datos, mismas consultas de acceso), en solo lectura y sin pedirle pantallazos.
// No es impersonación: la sesión sigue siendo la del equipo; solo se consulta con el id del
// usuario del portal para pintar su tablero.
export default async function ClientPortalPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ usuario?: string }>;
}) {
  const { id } = await params;
  const { usuario } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "cliente") redirect("/inicio");

  const client = await db.client.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      members: {
        select: {
          userId: true,
          role: true,
          user: {
            select: { id: true, name: true, active: true, initials: true, avatarColor: true, role: { select: { key: true } } },
          },
        },
      },
      projects: { select: { leadId: true, members: { select: { userId: true } } } },
    },
  });
  if (!client) notFound();
  if (
    !canManageClient(
      { members: client.members.map((m) => ({ userId: m.userId, role: m.role })), projects: client.projects },
      session,
    )
  ) {
    redirect(`/clientes/${id}`);
  }

  const portalUsers = client.members.filter((m) => m.user.role.key === "cliente" && m.user.active).map((m) => m.user);
  const selected = portalUsers.find((u) => u.id === usuario) ?? portalUsers[0] ?? null;
  const data = selected ? await getClientHomeData({ id: selected.id, name: selected.name }) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Link href={`/clientes/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {client.name}
      </Link>

      <div className="mt-3 mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-300/60 bg-indigo-500/[0.07] px-4 py-3 dark:border-indigo-500/30">
        <Eye className="size-5 shrink-0 text-indigo-500" />
        <div className="min-w-52 flex-1">
          <p className="text-sm font-semibold">
            Vista previa del portal {selected ? <>— así lo ve <span className="text-indigo-600 dark:text-indigo-400">{selected.name}</span></> : null}
          </p>
          <p className="text-xs text-muted-foreground">Solo lectura: los enlaces están desactivados. Los datos son los reales de esa persona.</p>
        </div>
        {portalUsers.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {portalUsers.map((u) => (
              <Link
                key={u.id}
                href={`/clientes/${id}/portal?usuario=${u.id}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  selected?.id === u.id
                    ? "border-transparent bg-indigo-500 text-white"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <UserAvatar initials={u.initials} color={u.avatarColor} size="sm" /> {u.name.split(" ")[0]}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {!selected || !data ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Este cliente aún no tiene personas con acceso al portal. Invítalas desde la ficha del cliente (Ajustes → Personas del portal).
        </div>
      ) : (
        <ClientHomeView data={data} readOnly />
      )}
    </div>
  );
}
