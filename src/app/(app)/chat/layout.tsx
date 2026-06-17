import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getChatListData } from "./list-data";
import { ChatList } from "./chat-list";

export const dynamic = "force-dynamic";

// Layout maestro-detalle del chat: el rail/navegador de conversaciones queda fijo a la
// izquierda (escritorio) y el chat seleccionado (/chat/[id]) se abre en el panel de la
// derecha. El rail persiste entre navegaciones (no se recarga al cambiar de chat).
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getChatListData(session);

  return (
    <div className="flex h-full">
      {/* Rail navegador (solo escritorio; en móvil la lista vive en la página índice) */}
      <aside className="hidden w-80 shrink-0 border-r border-border bg-card md:block">
        <ChatList data={data} />
      </aside>
      {/* Panel derecho: conversación seleccionada, o vacío / lista en móvil */}
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
