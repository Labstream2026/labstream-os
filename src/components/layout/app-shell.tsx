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
import { ChatLiveProvider, useChatLive } from "@/components/layout/chat-live";
import { IconChat } from "@/components/icons";

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
  remindersToday = 0,
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
  remindersToday?: number;
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

  // Páginas que aprovechan todo el ancho: en ellas el panel de chat NO roba espacio del
  // layout — pero ya no desaparece: se abre como OVERLAY flotante por encima (botón del
  // topbar), así el chat funciona en TODA la app (antes en estas 9 rutas no había ninguna
  // superficie de chat: ni leer ni escribir).
  const FULL_WIDTH_ROUTES = ["/", "/estados", "/chat", "/plantillas", "/wiki", "/asistente", "/reportes", "/revisiones", "/calendario"];
  const fullWidth = FULL_WIDTH_ROUTES.some((r) =>
    r === "/" ? pathname === "/" : pathname === r || pathname.startsWith(`${r}/`),
  );
  const isChatPage = pathname === "/chat" || pathname.startsWith("/chat/");
  // El cliente (portal del cliente) nunca ve el panel de chat del equipo (es interno).
  const dockMode: "none" | "aside" | "overlay" = isCliente ? "none" : fullWidth ? "overlay" : "aside";
  // El overlay y la hoja móvil son efímeros (no se persisten): nunca sorprenden abiertos.
  const [overlayOpen, setOverlayOpen] = React.useState(false);
  const [mobileChatOpen, setMobileChatOpen] = React.useState(false);

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

  // Cerrar cajones móviles y paneles flotantes al navegar entre páginas.
  React.useEffect(() => {
    setMobileMenuOpen(false);
    setOverlayOpen(false);
    setMobileChatOpen(false);
  }, [pathname]);

  return (
    <ChatLiveProvider>
    <div className={`flex h-[100dvh] w-full overflow-hidden bg-background${reduceMotion ? " reduce-motion" : ""}`}>
      {/* Barra lateral de escritorio */}
      <div className="hidden md:flex">
        <Sidebar user={user} clients={clients} canAdmin={canAdmin} canQuotes={canQuotes} canComercial={canComercial} canAsistente={canAsistente} canWiki={canWiki} canBiblioteca={canBiblioteca} canCalendar={canCalendar} canTimeline={canTimeline} canReports={canReports} canClients={canClients} canPapelera={canPapelera} isCliente={isCliente} collapsed={sidebarCollapsed} chatUnread={chatUnread} reviewPending={reviewPending} remindersToday={remindersToday} onSearch={() => setSearchOpen(true)} />
      </div>

      {/* Cajón de menú (móvil) */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] animate-in slide-in-from-left duration-200">
            <Sidebar
              drawer
              user={user}
              clients={clients}
              canAdmin={canAdmin}
              canQuotes={canQuotes}
              canComercial={canComercial}
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
              remindersToday={remindersToday}
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
          onTogglePanel={dockMode === "overlay" ? () => setOverlayOpen((v) => !v) : toggleChat}
          onToggleSidebar={toggleSidebar}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          showChatToggle={dockMode !== "none"}
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

      {/* Panel de chat de escritorio (redimensionable; muestra el chat del contexto). */}
      {dockMode === "aside" ? (
        <ChatDock variant="desktop" open={chatOpen} me={me} isAdmin={isAdmin} team={dockTeam} generalChannel={generalChannel} />
      ) : null}

      {/* Rutas de ancho completo: el chat se abre como overlay flotante (botón del topbar),
          sin robar ancho al contenido. */}
      {dockMode === "overlay" && overlayOpen ? (
        <div className="fixed bottom-0 right-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-40 hidden w-[380px] max-w-[92vw] border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-200 md:block">
          <ChatDock variant="mobile" me={me} isAdmin={isAdmin} team={dockTeam} generalChannel={generalChannel} onClose={() => setOverlayOpen(false)} />
        </div>
      ) : null}

      {/* Móvil: burbuja flotante + hoja deslizante con el chat del contexto — responder sin
          abandonar la página (antes el único camino era bottom-nav → /chat → buscar canal). */}
      {dockMode !== "none" && !isChatPage && !mobileChatOpen ? (
        <MobileChatBubble onOpen={() => setMobileChatOpen(true)} fallbackUnread={chatUnread} />
      ) : null}
      {dockMode !== "none" && mobileChatOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileChatOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 h-[82dvh] overflow-hidden rounded-t-2xl border-t border-border bg-background animate-in slide-in-from-bottom duration-200">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
            <div className="h-[calc(100%-0.75rem)]">
              <ChatDock variant="mobile" me={me} isAdmin={isAdmin} team={dockTeam} generalChannel={generalChannel} onClose={() => setMobileChatOpen(false)} />
            </div>
          </div>
        </div>
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
    </ChatLiveProvider>
  );
}

// Burbuja flotante de chat (solo móvil): abre la hoja deslizante con el chat del contexto.
// Vive como componente propio para poder consumir el contexto vivo (badge de no-leídos).
function MobileChatBubble({ onOpen, fallbackUnread = 0 }: { onOpen: () => void; fallbackUnread?: number }) {
  const live = useChatLive();
  const unread = live.total ?? fallbackUnread;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Abrir chat"
      className="fixed right-4 z-40 flex size-12 items-center justify-center rounded-full border border-border bg-background text-primary shadow-lg active:scale-95 md:hidden print:hidden"
      style={{ bottom: "calc(8.5rem + env(safe-area-inset-bottom))" }}
    >
      <IconChat className="size-6" />
      {unread > 0 ? (
        <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-5 text-primary-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}
