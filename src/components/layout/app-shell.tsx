"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar, type SidebarUser, type SidebarClient } from "@/components/layout/sidebar";
import { Topbar, type TopbarAvatar } from "@/components/layout/topbar";
import { TabsBar } from "@/components/layout/tabs-bar";
import { Lightbox } from "@/components/lightbox";
import { ChatDock, type DockTeamMember } from "@/components/layout/chat-dock";
import { CommandPalette, type WikiSearchItem } from "@/components/layout/command-palette";
import { DetailsAutoClose } from "@/components/details-auto-close";
import { BottomNav } from "@/components/layout/bottom-nav";
import { QuickCreateFab } from "@/components/quick-create/quick-create-fab";
import type { ChatMe, ChatMsg } from "@/components/chat/channel-chat";
import type { NotificationItem } from "@/components/layout/notifications-bell";

export type GeneralChannel = { id: string; name: string; messages: ChatMsg[] } | null;

export function AppShell({
  user,
  clients,
  wikiPages = [],
  team,
  canAdmin,
  canQuotes,
  canAsistente = true,
  canWiki = true,
  canBiblioteca = true,
  canCalendar = true,
  canTimeline = true,
  canReports = true,
  canClients = true,
  canCreateTasks = false,
  canCreateProjects = false,
  fabPriorities = [],
  me,
  isAdmin = false,
  generalChannel,
  dockTeam = [],
  chatUnread = 0,
  reviewPending = 0,
  notifications,
  children,
}: {
  user: SidebarUser;
  clients: SidebarClient[];
  wikiPages?: WikiSearchItem[];
  team: TopbarAvatar[];
  canAdmin: boolean;
  canQuotes?: boolean;
  canAsistente?: boolean;
  canWiki?: boolean;
  canBiblioteca?: boolean;
  canCalendar?: boolean;
  canTimeline?: boolean;
  canReports?: boolean;
  canClients?: boolean;
  canCreateTasks?: boolean;
  canCreateProjects?: boolean;
  fabPriorities?: { value: string; label: string }[];
  me: ChatMe;
  isAdmin?: boolean;
  generalChannel: GeneralChannel;
  dockTeam?: DockTeamMember[];
  chatUnread?: number;
  reviewPending?: number;
  notifications: NotificationItem[];
  children: React.ReactNode;
}) {
  // Escritorio (preferencias recordadas).
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(true);
  // Móvil (cajones, no se recuerdan).
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const pathname = usePathname();

  // Páginas que aprovechan todo el ancho: ocultamos el panel de chat de la derecha
  // (escritorio) para darles más espacio. Algunas ya tienen su propio chat (Chat del
  // día, Chats) y otras son de lectura/trabajo amplio (Wiki, Asistente IA, Reportes,
  // Inicio, Plantillas).
  const FULL_WIDTH_ROUTES = ["/", "/estados", "/chat", "/plantillas", "/wiki", "/asistente", "/reportes", "/revisiones"];
  const hideChatDock = FULL_WIDTH_ROUTES.some((r) =>
    r === "/" ? pathname === "/" : pathname === r || pathname.startsWith(`${r}/`),
  );

  // Atajo ⌘K / Ctrl+K para abrir el buscador.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cargar preferencias de escritorio tras montar (evita mismatch de hidratación).
  React.useEffect(() => {
    const c = window.localStorage.getItem("ui:sidebarCollapsed");
    const ch = window.localStorage.getItem("ui:chatOpen");
    if (c != null) setSidebarCollapsed(c === "1");
    if (ch != null) setChatOpen(ch === "1");
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((v) => {
      window.localStorage.setItem("ui:sidebarCollapsed", v ? "0" : "1");
      return !v;
    });
  };
  const toggleChat = () => {
    setChatOpen((v) => {
      window.localStorage.setItem("ui:chatOpen", v ? "0" : "1");
      return !v;
    });
  };

  // Cerrar cajones móviles al navegar entre páginas.
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      {/* Barra lateral de escritorio */}
      <div className="hidden md:flex">
        <Sidebar user={user} clients={clients} canAdmin={canAdmin} canQuotes={canQuotes} canAsistente={canAsistente} canWiki={canWiki} canBiblioteca={canBiblioteca} canCalendar={canCalendar} canTimeline={canTimeline} canReports={canReports} canClients={canClients} collapsed={sidebarCollapsed} chatUnread={chatUnread} reviewPending={reviewPending} onSearch={() => setSearchOpen(true)} />
      </div>

      {/* Cajón de menú (móvil) */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] animate-in slide-in-from-left duration-200">
            <Sidebar
              user={user}
              clients={clients}
              canAdmin={canAdmin}
              canQuotes={canQuotes}
              canAsistente={canAsistente}
              canWiki={canWiki}
              canBiblioteca={canBiblioteca}
              canCalendar={canCalendar}
              canTimeline={canTimeline}
              canReports={canReports}
              canClients={canClients}
              chatUnread={chatUnread}
              reviewPending={reviewPending}
              onSearch={() => { setSearchOpen(true); setMobileMenuOpen(false); }}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="relative flex min-w-0 flex-1 flex-col">
        <Topbar
          team={team}
          notifications={notifications}
          onTogglePanel={toggleChat}
          onToggleSidebar={toggleSidebar}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          showChatToggle={!hideChatDock}
        />
        {/* Barra de pestañas estilo Notion (solo escritorio). */}
        <TabsBar />
        {/* Padding inferior en móvil para no tapar contenido con la barra inferior
            (incluye el área segura de la barra de inicio en iPhone). */}
        <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>

        {/* Botón flotante de creación rápida (contextual por sección). Anclado al bloque
            CENTRAL (no a la ventana), así no se monta sobre el panel de chat de la derecha. */}
        <QuickCreateFab
          me={{ id: me.id, name: me.name }}
          team={dockTeam.map((u) => ({ id: u.id, name: u.name }))}
          priorities={fabPriorities}
          canCalendar={canCalendar}
          canCreateTasks={canCreateTasks}
          canCreateProjects={canCreateProjects}
        />
      </div>

      {/* Panel de chat de escritorio (redimensionable; muestra el chat del proyecto).
          Se oculta en páginas de ancho completo para darles todo el espacio. */}
      {!hideChatDock ? (
        <ChatDock variant="desktop" open={chatOpen} me={me} isAdmin={isAdmin} team={dockTeam} generalChannel={generalChannel} />
      ) : null}

      {/* Cierra los menús <details> al hacer clic fuera o con Escape */}
      <DetailsAutoClose />

      {/* Buscador global (⌘K) */}
      <CommandPalette clients={clients} wikiPages={wikiPages} open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Visor de imágenes (abre en la misma página, cierra con Escape/×) */}
      <Lightbox />

      {/* Barra de navegación inferior (móvil) */}
      <BottomNav
        onMenu={() => setMobileMenuOpen(true)}
        chatUnread={chatUnread}
      />
    </div>
  );
}
