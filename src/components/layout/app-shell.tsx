"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar, type SidebarUser, type SidebarClient } from "@/components/layout/sidebar";
import { Topbar, type TopbarAvatar } from "@/components/layout/topbar";
import { ScrollMain } from "@/components/layout/scroll-main";
import { Lightbox } from "@/components/lightbox";
import { ChatDock, type DockTeamMember } from "@/components/layout/chat-dock";
import { CommandPalette, type WikiSearchItem } from "@/components/layout/command-palette";
import { DetailsAutoClose } from "@/components/details-auto-close";
import { BottomNav } from "@/components/layout/bottom-nav";
import { QuickCreateFab } from "@/components/quick-create/quick-create-fab";
import type { ChatMe, ChatMsg } from "@/components/chat/channel-chat";
import type { NotificationItem } from "@/components/layout/notifications-bell";
import { saveUserPreference } from "@/app/(app)/perfil/preference-actions";

export type GeneralChannel = { id: string; name: string; messages: ChatMsg[] } | null;

export function AppShell({
  user,
  clients,
  wikiPages = [],
  team,
  canAdmin,
  canQuotes,
  canComercial = false,
  canAsistente = true,
  canWiki = true,
  canBiblioteca = true,
  canCalendar = true,
  canTimeline = true,
  canReports = true,
  canClients = true,
  canPapelera = false,
  canCreateTasks = false,
  canCreateProjects = false,
  fabPriorities = [],
  me,
  isAdmin = false,
  isCliente = false,
  generalChannel,
  dockTeam = [],
  chatUnread = 0,
  reviewPending = 0,
  notifications,
  initialSidebarCollapsed = false,
  initialChatPanelOpen = true,
  reduceMotion = false,
  children,
}: {
  user: SidebarUser;
  clients: SidebarClient[];
  wikiPages?: WikiSearchItem[];
  team: TopbarAvatar[];
  canAdmin: boolean;
  canQuotes?: boolean;
  canComercial?: boolean;
  canAsistente?: boolean;
  canWiki?: boolean;
  canBiblioteca?: boolean;
  canCalendar?: boolean;
  canTimeline?: boolean;
  canReports?: boolean;
  canClients?: boolean;
  canPapelera?: boolean;
  canCreateTasks?: boolean;
  canCreateProjects?: boolean;
  fabPriorities?: { value: string; label: string }[];
  me: ChatMe;
  isAdmin?: boolean;
  isCliente?: boolean;
  generalChannel: GeneralChannel;
  dockTeam?: DockTeamMember[];
  chatUnread?: number;
  reviewPending?: number;
  notifications: NotificationItem[];
  initialSidebarCollapsed?: boolean;
  initialChatPanelOpen?: boolean;
  reduceMotion?: boolean;
  children: React.ReactNode;
}) {
  // Escritorio (preferencias recordadas EN BD → sincronizan entre dispositivos; el valor
  // inicial llega del servidor, así que no hay parpadeo al cargar).
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(initialSidebarCollapsed);
  const [chatOpen, setChatOpen] = React.useState(initialChatPanelOpen);
  // Móvil (cajones, no se recuerdan).
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const pathname = usePathname();

  // Páginas que aprovechan todo el ancho: ocultamos el panel de chat de la derecha
  // (escritorio) para darles más espacio. Algunas ya tienen su propio chat (Chat del
  // día, Chats) y otras son de lectura/trabajo amplio (Wiki, Asistente IA, Reportes,
  // Inicio, Plantillas).
  const FULL_WIDTH_ROUTES = ["/", "/estados", "/chat", "/plantillas", "/wiki", "/asistente", "/reportes", "/revisiones"];
  // El cliente (portal del cliente) nunca ve el panel de chat del equipo (es interno).
  const hideChatDock = isCliente || FULL_WIDTH_ROUTES.some((r) =>
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

  // Al alternar, persiste en BD (best-effort) para que el estado siga al usuario entre el
  // móvil y el escritorio. Antes solo se guardaba en localStorage de ese navegador.
  const toggleSidebar = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      void saveUserPreference({ sidebarCollapsed: next });
      return next;
    });
  };
  const toggleChat = () => {
    setChatOpen((v) => {
      const next = !v;
      void saveUserPreference({ chatPanelOpen: next });
      return next;
    });
  };

  // Cerrar cajones móviles al navegar entre páginas.
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className={`flex h-[100dvh] w-full overflow-hidden bg-background${reduceMotion ? " reduce-motion" : ""}`}>
      {/* Barra lateral de escritorio */}
      <div className="hidden md:flex">
        <Sidebar user={user} clients={clients} canAdmin={canAdmin} canQuotes={canQuotes} canComercial={canComercial} canAsistente={canAsistente} canWiki={canWiki} canBiblioteca={canBiblioteca} canCalendar={canCalendar} canTimeline={canTimeline} canReports={canReports} canClients={canClients} canPapelera={canPapelera} isCliente={isCliente} collapsed={sidebarCollapsed} chatUnread={chatUnread} reviewPending={reviewPending} onSearch={() => setSearchOpen(true)} />
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
              canPapelera={canPapelera}
              isCliente={isCliente}
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
        {/* Las pestañas (escritorio) ahora viven dentro de la barra superior (Topbar). */}
        {/* Padding inferior en móvil para no tapar contenido con la barra inferior
            (incluye el área segura de la barra de inicio en iPhone). */}
        <ScrollMain className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">{children}</ScrollMain>

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
        canClients={canClients}
        isCliente={isCliente}
      />
    </div>
  );
}
