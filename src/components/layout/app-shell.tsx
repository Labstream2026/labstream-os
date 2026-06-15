"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar, type SidebarUser, type SidebarClient } from "@/components/layout/sidebar";
import { Topbar, type TopbarAvatar } from "@/components/layout/topbar";
import { ChatDock, type DockTeamMember } from "@/components/layout/chat-dock";
import { CommandPalette } from "@/components/layout/command-palette";
import { DetailsAutoClose } from "@/components/details-auto-close";
import { BottomNav } from "@/components/layout/bottom-nav";
import type { ChatMe, ChatMsg } from "@/components/chat/channel-chat";
import type { NotificationItem } from "@/components/layout/notifications-bell";

export type GeneralChannel = { id: string; name: string; messages: ChatMsg[] } | null;

export function AppShell({
  user,
  clients,
  team,
  canAdmin,
  canQuotes,
  canWiki = true,
  me,
  generalChannel,
  dockTeam = [],
  chatUnread = 0,
  notifications,
  children,
}: {
  user: SidebarUser;
  clients: SidebarClient[];
  team: TopbarAvatar[];
  canAdmin: boolean;
  canQuotes?: boolean;
  canWiki?: boolean;
  me: ChatMe;
  generalChannel: GeneralChannel;
  dockTeam?: DockTeamMember[];
  chatUnread?: number;
  notifications: NotificationItem[];
  children: React.ReactNode;
}) {
  // Escritorio (preferencias recordadas).
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(true);
  // Móvil (cajones, no se recuerdan).
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [mobileChatOpen, setMobileChatOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const pathname = usePathname();

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
    setMobileChatOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      {/* Barra lateral de escritorio */}
      <div className="hidden md:flex">
        <Sidebar user={user} clients={clients} canAdmin={canAdmin} canQuotes={canQuotes} canWiki={canWiki} collapsed={sidebarCollapsed} chatUnread={chatUnread} onSearch={() => setSearchOpen(true)} />
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
              canWiki={canWiki}
              chatUnread={chatUnread}
              onSearch={() => { setSearchOpen(true); setMobileMenuOpen(false); }}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          team={team}
          notifications={notifications}
          onTogglePanel={toggleChat}
          onToggleSidebar={toggleSidebar}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />
        {/* Padding inferior en móvil para no tapar contenido con la barra inferior */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>
      </div>

      {/* Panel de chat de escritorio (redimensionable; muestra el chat del proyecto) */}
      <ChatDock variant="desktop" open={chatOpen} me={me} team={dockTeam} generalChannel={generalChannel} />

      {/* Hoja de chat a pantalla completa (móvil) */}
      {mobileChatOpen ? (
        <div className="fixed inset-0 z-50 bg-background md:hidden">
          <ChatDock variant="mobile" me={me} team={dockTeam} generalChannel={generalChannel} onClose={() => setMobileChatOpen(false)} />
        </div>
      ) : null}

      {/* Cierra los menús <details> al hacer clic fuera o con Escape */}
      <DetailsAutoClose />

      {/* Buscador global (⌘K) */}
      <CommandPalette clients={clients} open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Barra de navegación inferior (móvil) */}
      <BottomNav
        onChat={() => setMobileChatOpen((v) => !v)}
        onMenu={() => setMobileMenuOpen(true)}
        chatActive={mobileChatOpen}
      />
    </div>
  );
}
