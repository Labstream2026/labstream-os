import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sectionMeta } from "@/lib/chat-section";
import { sessionHasSectionAccess } from "@/lib/chat-section-access";

// Tarjeta que muestra el GRUPO de chat asignado a una sección (Wiki, Biblioteca, Reportes,
// Cotizaciones, Calendario) y enlaza a su conversación. Solo se muestra si hay un grupo asignado a
// esa sección y la persona tiene acceso a ella (permiso de ver la sección). Un grupo se asigna
// desde los ajustes del propio grupo en el chat. Server component.
export async function SectionChatCard({ section }: { section: string }) {
  const meta = sectionMeta(section);
  if (!meta) return null;
  const session = await getSession();
  if (!sessionHasSectionAccess(section, session)) return null;
  const channel = await db.chatChannel.findFirst({
    where: { section, type: "GENERAL" },
    select: { id: true, name: true, _count: { select: { members: true } } },
  });
  if (!channel) return null;
  return (
    <Link
      href={`/chat/${channel.id}`}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30"
      title={`Abrir el chat de ${meta.label}`}
    >
      <MessagesSquare className="size-4 text-primary" />
      <span className="font-medium">{channel.name}</span>
      <span className="text-xs text-muted-foreground">· chat de {meta.label} · {channel._count.members} miembro{channel._count.members === 1 ? "" : "s"}</span>
    </Link>
  );
}
