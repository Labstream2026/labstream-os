import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { getSession, hasPermission } from "@/lib/auth";
import { getChatListData } from "./list-data";
import { ChatList } from "./chat-list";

export const dynamic = "force-dynamic";

// Índice de /chat. En escritorio el rail vive en el layout, así que aquí solo se muestra
// un estado vacío («selecciona una conversación»). En móvil (sin rail) se muestra la
// lista completa de chats.
export default async function ChatIndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getChatListData(session);

  return (
    <>
      {/* Móvil: lista de chats a pantalla completa */}
      <div className="h-full md:hidden">
        <ChatList data={data} canCreate={hasPermission(session, "crear_canales")} />
      </div>
      {/* Escritorio: panel vacío (el rail está en el layout) */}
      <div className="hidden h-full flex-col items-center justify-center gap-2 px-6 text-center md:flex">
        <MessagesSquare className="size-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">Selecciona una conversación</p>
        <p className="text-sm text-muted-foreground">Elige un chat del navegador de la izquierda para abrirlo aquí.</p>
      </div>
    </>
  );
}
