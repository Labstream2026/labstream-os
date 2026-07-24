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
  opsEnabled = false,
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
  opsEnabled?: boolean;
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
  // Ya no se usa (la barra derecha fija murió: el chat vive en burbujas). Se conserva en la
  // firma para que el layout del servidor no tenga que cambiar a la vez.
  initialChatPanelOpen?: boolean;
  reduceMotion?: boolean;
  children: React.ReactNode;
}) {
  // Escritorio (preferencias recordadas EN BD → sincronizan entre dispositivos; el valor
  // inicial llega del servidor, así que no hay parpadeo al cargar).
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(initialSidebarCollapsed);
  // Móvil (cajones, no se recuerdan).
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const pathname = usePathname();

  const isChatPage = pathname === "/chat" || pathname.startsWith("/chat/");
  // El chat vive en BURBUJAS (+ la pestaña /chat): la barra derecha fija y el botón del
  // topbar murieron. El cliente (portal) no tiene chat.
  const hasChat = !isCliente;
  // En el DETALLE de proyecto manda la burbuja del PROYECTO (escritorio): la global no se pinta.
  const projSeg = pathname.startsWith("/proyectos/") ? pathname.split("/")[2] : null;
  const isProjectDetail = !!projSeg && projSeg !== "nuevo";
  // El panel de la burbuja y la hoja móvil son efímeros (no se persisten): nunca sorprenden abiertos.
  const [chatPanelOpen, setChatPanelOpen] = React.useState(false);
  const [mobileChatOpen, setMobileChatOpen] = React.useState(false);
  // MODO ENFOQUE (/chat): el panel de «Producción/Clientes» se retira por defecto para que la
  // conversación ocupe todo el ancho. El botón de colapsar de la barra lo trae de vuelta durante la
  // sesión; al recargar vuelve a enfocarse. Fuera de /chat manda la preferencia normal (persistida).
  const [chatFocus, setChatFocus] = React.useState(true);

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
    // En /chat el botón de colapsar controla el MODO ENFOQUE (mostrar/ocultar el panel de clientes);
    // no se persiste (cada entrada a /chat arranca enfocada). Fuera de /chat, la preferencia normal.
    if (isChatPage) {
      setChatFocus((v) => !v);
      return;
    }
    setSidebarCollapsed((v) => {
      const next = !v;
      void saveUserPreference({ sidebarCollapsed: next });
      return next;
    });
  };
  // Cerrar cajones móviles y paneles flotantes al navegar entre páginas.
  React.useEffect(() => {
    setMobileMenuOpen(false);
    setChatPanelOpen(false);
    setMobileChatOpen(false);
  }, [pathname]);

  // Esc cierra el panel de la burbuja (y la hoja móvil).
  React.useEffect(() => {
    if (!chatPanelOpen && !mobileChatOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setChatPanelOpen(false); setMobileChatOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatPanelOpen, mobileChatOpen]);

  return (
    <ChatLiveProvider>
    <div className={`flex h-[100dvh] w-full overflow-hidden bg-background${reduceMotion ? " reduce-motion" : ""}`}>
      {/* Barra lateral de escritorio */}
      <div className="hidden md:flex">
        <Sidebar user={user} clients={clients} canAdmin={canAdmin} canQuotes={canQuotes} canComercial={canComercial} canAsistente={canAsistente} canWiki={canWiki} canBiblioteca={canBiblioteca} opsEnabled={opsEnabled} canCalendar={canCalendar} canTimeline={canTimeline} canReports={canReports} canClients={canClients} canPapelera={canPapelera} isCliente={isCliente} collapsed={isChatPage ? chatFocus : sidebarCollapsed} chatUnread={chatUnread} reviewPending={reviewPending} remindersToday={remindersToday} onSearch={() => setSearchOpen(true)} />
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
              opsEnabled={opsEnabled}
              canCalendar={canCalendar}
              canTimeline={canTimeline}
              canReports={canReports}
              canClients={canClients}
              canPapelera={canPapelera}
              canCreateTasks={canCreateTasks}
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
          canAdmin={canAdmin}
          onToggleSidebar={toggleSidebar}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
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

      {/* ESCRITORIO: el chat vive en una BURBUJA flotante (misma posición que la burbuja del
          proyecto, apilada sobre el FAB de crear). Abre un panel deslizante con el chat completo.
          En el detalle de proyecto no se pinta: ahí manda la burbuja del proyecto. */}
      {hasChat && !isChatPage && !isProjectDetail && !chatPanelOpen ? (
        <DesktopChatBubble onOpen={() => setChatPanelOpen(true)} fallbackUnread={chatUnread} />
      ) : null}
      {hasChat && chatPanelOpen ? (
        <div className="fixed bottom-0 right-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-40 hidden w-[380px] max-w-[92vw] border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-200 md:block">
          <ChatDock variant="mobile" me={me} isAdmin={isAdmin} team={dockTeam} generalChannel={generalChannel} onClose={() => setChatPanelOpen(false)} />
        </div>
      ) : null}

      {/* Móvil: burbuja flotante + hoja deslizante con el chat del contexto — responder sin
          abandonar la página (antes el único camino era bottom-nav → /chat → buscar canal). */}
      {hasChat && !isChatPage && !mobileChatOpen ? (
        <MobileChatBubble onOpen={() => setMobileChatOpen(true)} fallbackUnread={chatUnread} />
      ) : null}
      {hasChat && mobileChatOpen ? (
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

      {/* Barra de navegación inferior (móvil): Inicio · Tareas · Clientes · Calendario · Más.
          El chat se abre desde su burbuja (badge incluido) y crear vive en el cajón de «Más». */}
      <BottomNav
        onMenu={() => setMobileMenuOpen(true)}
        canClients={canClients}
        canCalendar={canCalendar}
        isCliente={isCliente}
      />
    </div>
    </ChatLiveProvider>
  );
}

// Burbuja flotante de chat (solo móvil): abre la hoja deslizante con el chat del contexto.
// Vive como componente propio para poder consumir el contexto vivo (badge de no-leídos).
// Burbuja de ESCRITORIO (md+): misma posición y estilo que la burbuja del proyecto
// (bottom-[5.75rem] right-6, apilada ENCIMA del FAB de crear que vive en bottom-6 right-6).
function DesktopChatBubble({ onOpen, fallbackUnread = 0 }: { onOpen: () => void; fallbackUnread?: number }) {
  const live = useChatLive();
  const unread = live.total ?? fallbackUnread;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Abrir chat"
      title="Chat (Esc cierra)"
      // Mientras el speed-dial del FAB está abierto (.qc-dial-open), se desvanece: sus acciones
      // suben exactamente a este hueco (mismo arreglo que la burbuja del proyecto en ea32e27).
      className="group fixed bottom-[5.75rem] right-6 z-50 hidden size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-[transform,opacity] hover:scale-105 active:scale-95 md:grid print:hidden [body:has(.qc-dial-open)_&]:pointer-events-none [body:has(.qc-dial-open)_&]:opacity-0"
    >
      <IconChat className="size-6" />
      {unread > 0 ? (
        <span className="absolute -right-1 -top-1 grid min-w-[22px] place-items-center rounded-full border-2 border-background bg-red-500 px-1 text-[11px] font-extrabold leading-[18px] text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}

function MobileChatBubble({ onOpen, fallbackUnread = 0 }: { onOpen: () => void; fallbackUnread?: number }) {
  const live = useChatLive();
  const unread = live.total ?? fallbackUnread;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Abrir chat"
      // Se desvanece mientras el speed-dial del FAB está abierto (marcador .qc-dial-open):
      // sus acciones suben justo a este hueco y la burbuja las tapaba (mismo bug que en escritorio).
      className="fixed right-4 z-40 flex size-12 items-center justify-center rounded-full border border-border bg-background text-primary shadow-lg transition-opacity active:scale-95 md:hidden print:hidden [body:has(.qc-dial-open)_&]:pointer-events-none [body:has(.qc-dial-open)_&]:opacity-0"
      // Justo encima de la barra inferior (64px + aire): el FAB «+» ya no flota en móvil
      // (crear vive en el cajón de «Más»), así que la burbuja baja a su hueco natural.
      style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
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
