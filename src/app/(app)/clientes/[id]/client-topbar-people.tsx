"use client";

import { createPortal } from "react-dom";
import { UserAvatar } from "@/components/user-avatar";
import { useTopbarSlot } from "@/components/layout/topbar-slot";
import { ClientMembers, type ClientMemberItem } from "./client-members";

// Miembros del cliente EN LA BARRA superior: la ficha teletransporta este grupo de avatares al
// hueco `#topbar-people-slot` (el default —el equipo global— se oculta solo vía CSS). Clic en
// los avatares → panel con la MISMA gestión de «Acceso al cliente» (ver info, cambiar rol,
// quitar, dar acceso buscando por nombre — reusa ClientMembers y sus acciones). Clic fuera o
// Escape → se recoge (data-autoclose, como los chats).
export function ClientTopbarPeople({
  clientId,
  members,
  addable,
  canManage,
}: {
  clientId: string;
  members: ClientMemberItem[];
  addable: ClientMemberItem[];
  canManage: boolean;
}) {
  const target = useTopbarSlot("topbar-people-slot");
  if (!target) return null;

  return createPortal(
    <details data-autoclose className="relative">
      <summary
        className="flex cursor-pointer list-none items-center rounded-lg p-1 hover:bg-muted [&::-webkit-details-marker]:hidden"
        aria-label="Miembros de este cliente"
        title="Miembros de este cliente"
      >
        {members.length === 0 ? (
          <span className="rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">Sin miembros</span>
        ) : (
          <span className="flex -space-x-2">
            {members.slice(0, 4).map((m) => (
              <UserAvatar key={m.id} initials={m.initials} color={m.color} size="sm" ring />
            ))}
            {members.length > 4 ? (
              <span className="grid size-7 place-items-center rounded-full border-2 border-background bg-muted text-[10px] font-bold text-muted-foreground">+{members.length - 4}</span>
            ) : null}
          </span>
        )}
      </summary>
      {/* El panel reusa ClientMembers tal cual (lista + rol + quitar + dar acceso). */}
      <div className="absolute right-0 z-40 mt-2 w-[21rem] max-w-[calc(100vw-2rem)] [&>div]:shadow-xl">
        <ClientMembers clientId={clientId} members={members} addable={addable} canManage={canManage} />
      </div>
    </details>,
    target,
  );
}
