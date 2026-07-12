"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Hash, Lock, Globe, Users, X, ArrowLeft, UserPlus, Building2, ListChecks, CircleCheck } from "lucide-react";
import { completeMyTask } from "@/app/(app)/mis-tareas/actions";
import { type CalItem } from "@/app/(app)/calendario/my-calendar";
import { CalendarDetailCard, CAL_DETAIL_EVENT } from "@/app/(app)/calendario/calendar-detail";
import { cn } from "@/lib/utils";
import { formatBogotaDate } from "@/lib/bogota-time";
import { EntityEmoji } from "@/components/icons/marks";
import { UserAvatar } from "@/components/user-avatar";
import { ChannelChat, type ChatMe, type ChatMsg, type Member } from "@/components/chat/channel-chat";
import { ChannelSettings } from "@/components/chat/channel-settings";

export type DockTeamMember = { id: string; name: string; initials: string | null; color: string | null };
type DockChannel = {
  id: string;
  name: string;
  type: string;
  isPublic: boolean;
  canManage: boolean;
  members: { id: string; name: string; initials: string | null; color: string | null; role?: string }[];
};
type DockPayload = { channel: DockChannel | null; canAccess: boolean; messages: ChatMsg[] };
type DockTask = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: string;
  projectId: string | null;
  projectName: string | null;
  projectEmoji: string | null;
};

function dueLabel(iso: string | null): string | null {
  if (!iso) return null;
  return formatBogotaDate(iso, { day: "numeric", month: "short" });
}

const MIN_W = 300;
const MAX_W = 640;
const DEFAULT_W = 340;

export function ChatDock({
  me,
  isAdmin = false,
  team,
  generalChannel,
  variant = "desktop",
  open = true,
  onClose,
}: {
  me: ChatMe;
  isAdmin?: boolean;
  team: DockTeamMember[];
  generalChannel: { id: string; name: string; messages: ChatMsg[] } | null;
  variant?: "desktop" | "mobile";
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const projectId = pathname.startsWith("/proyectos/") ? pathname.split("/")[2] : null;
  const onRealProject = !!projectId && projectId !== "nuevo";
  const clientId = pathname.startsWith("/clientes/") ? pathname.split("/")[2] : null;
  const onRealClient = !!clientId && clientId !== "nuevo";
  // En "Chat del día" el chat ya es el contenido principal → a la derecha mostramos
  // las tareas pendientes en vez de repetir el chat.
  const onEstados = pathname === "/estados";
  const onCalendar = pathname === "/calendario";
  const contextKey = `${projectId ?? ""}|${clientId ?? ""}`;

  const [dmUserId, setDmUserId] = React.useState<string | null>(null);
  const [dock, setDock] = React.useState<DockPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [showMembers, setShowMembers] = React.useState(false);
  const [tasks, setTasks] = React.useState<DockTask[] | null>(null);

  // Tareas pendientes para el panel de "Chat del día".
  React.useEffect(() => {
    if (!onEstados) return;
    let cancelled = false;
    fetch("/api/my-tasks", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((d) => { if (!cancelled) setTasks(d.tasks ?? []); })
      .catch(() => { if (!cancelled) setTasks([]); });
    return () => { cancelled = true; };
  }, [onEstados, pathname]);

  // Al cambiar de proyecto/cliente, se sale del DM y se vuelve al chat del contexto.
  React.useEffect(() => { setDmUserId(null); setShowMembers(false); }, [contextKey]);

  // Resolver el canal a mostrar: DM > proyecto > cliente > general.
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!dmUserId && !onRealProject && !onRealClient) { setDock(null); return; } // usa el general (prop)
      setLoading(true);
      const q = dmUserId ? `dm=${dmUserId}` : onRealProject ? `project=${projectId}` : `client=${clientId}`;
      try {
        // Reintento corto: en dev la ruta puede compilarse en frío en la 1.ª petición.
        let r = await fetch(`/api/chat/dock?${q}`, { credentials: "include" });
        if (!r.ok) {
          await new Promise((res) => setTimeout(res, 600));
          if (cancelled) return;
          r = await fetch(`/api/chat/dock?${q}`, { credentials: "include" });
        }
        const data: DockPayload = await r.json();
        if (!cancelled) setDock(data);
      } catch {
        if (!cancelled) setDock({ channel: null, canAccess: false, messages: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dmUserId, projectId, clientId, onRealProject, onRealClient]);

  // Ancho redimensionable (escritorio).
  const [width, setWidth] = React.useState(DEFAULT_W);
  React.useEffect(() => {
    const w = Number(window.localStorage.getItem("ui:chatWidth"));
    if (w >= MIN_W && w <= MAX_W) setWidth(w);
  }, []);
  const dragging = React.useRef(false);
  React.useEffect(() => {
    function move(e: MouseEvent) {
      if (!dragging.current) return;
      const w = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - e.clientX));
      setWidth(w);
    }
    function up() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = "";
      window.localStorage.setItem("ui:chatWidth", String(width));
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [width]);

  // ── Calendario: panel partido (detalle arriba / chat abajo) ──
  // La vista del calendario emite la cita/tarea seleccionada por un evento de ventana.
  const [calItem, setCalItem] = React.useState<CalItem | null>(null);
  React.useEffect(() => {
    if (!onCalendar) { setCalItem(null); return; }
    const onDetail = (e: Event) => setCalItem((e as CustomEvent).detail as CalItem | null);
    window.addEventListener(CAL_DETAIL_EVENT, onDetail);
    return () => window.removeEventListener(CAL_DETAIL_EVENT, onDetail);
  }, [onCalendar]);
  // ── Estado a renderizar ──
  const isDM = !!dmUserId;
  const usingGeneral = !isDM && !onRealProject && !onRealClient;
  const effectiveChannel = usingGeneral
    ? generalChannel
      ? { id: generalChannel.id, name: generalChannel.name, type: "GENERAL", isPublic: true, canManage: false, members: [] as DockChannel["members"] }
      : null
    : dock?.channel ?? null;
  const messages = usingGeneral ? generalChannel?.messages ?? [] : dock?.messages ?? [];
  const canAccess = usingGeneral ? !!generalChannel : dock?.canAccess ?? false;
  const dmName = isDM ? team.find((t) => t.id === dmUserId)?.name ?? "Mensaje directo" : null;

  const mentionMembers: Member[] = team.map((t) => ({ id: t.id, name: t.name }));

  const body = (
    <div className="flex h-full w-full flex-col">
      {/* Franja de miembros del equipo (para chatear en privado) */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Equipo</span>
        <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
          {team.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setDmUserId((cur) => (cur === u.id ? null : u.id))}
              title={`Mensaje directo con ${u.name}`}
              className={cn(
                "shrink-0 rounded-full ring-2 transition-all",
                dmUserId === u.id ? "ring-primary" : "ring-transparent hover:ring-border",
              )}
            >
              <UserAvatar initials={u.initials} color={u.color} size="sm" />
            </button>
          ))}
          {team.length === 0 ? <span className="text-xs text-muted-foreground">Sin compañeros activos</span> : null}
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Cerrar chat" className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      {/* Cabecera de la conversación */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        {isDM ? (
          <>
            <button type="button" onClick={() => setDmUserId(null)} title="Volver al chat del proyecto" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
              <ArrowLeft className="size-4" />
            </button>
            <UserAvatar initials={team.find((t) => t.id === dmUserId)?.initials ?? null} color={team.find((t) => t.id === dmUserId)?.color ?? null} size="sm" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{dmName}</p>
            <span className="shrink-0 text-[11px] text-muted-foreground">Privado</span>
          </>
        ) : (
          <>
            {usingGeneral ? <Hash className="size-4 text-muted-foreground" /> : effectiveChannel?.type === "CLIENT" ? <Building2 className="size-4 text-indigo-600" /> : effectiveChannel?.isPublic ? <Globe className="size-4 text-emerald-600" /> : <Lock className="size-4 text-amber-600" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{usingGeneral ? `Equipo · ${effectiveChannel?.name ?? "general"}` : effectiveChannel?.name ?? "Chat"}</p>
              <p className="truncate text-[11px] text-muted-foreground">{usingGeneral ? "Canal del equipo" : effectiveChannel?.type === "CLIENT" ? "Todos los que trabajan con el cliente" : effectiveChannel?.isPublic ? "Público para el equipo" : "Privado · por invitación"}</p>
            </div>
            {!usingGeneral && effectiveChannel ? (
              <button type="button" onClick={() => setShowMembers((v) => !v)} title="Miembros del chat" className={cn("flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs", showMembers ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted")}>
                {effectiveChannel.canManage ? <UserPlus className="size-3.5" /> : <Users className="size-3.5" />}
                {effectiveChannel.members.length}
              </button>
            ) : null}
          </>
        )}
      </div>

      {/* Gestión de miembros del proyecto (invitar/quitar) */}
      {showMembers && effectiveChannel && !isDM && !usingGeneral ? (
        <div className="border-b border-border p-3">
          {effectiveChannel.canManage ? (
            <ChannelSettings
              channelId={effectiveChannel.id}
              isPublic={effectiveChannel.isPublic}
              canManage
              members={effectiveChannel.members.map((m) => ({ id: m.id, name: m.name, initials: m.initials, color: m.color, role: m.role }))}
              team={team.map((t) => ({ id: t.id, name: t.name, initials: t.initials, color: t.color }))}
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {effectiveChannel.members.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                  <UserAvatar initials={m.initials} color={m.color} size="sm" /> {m.name}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Conversación */}
      <div className="min-h-0 flex-1">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : !effectiveChannel ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
            {onRealProject ? "Este proyecto aún no tiene chat." : onRealClient ? "Este cliente aún no tiene chat." : "Entra a un proyecto o cliente para ver su chat, o elige a un compañero arriba para un mensaje directo."}
          </div>
        ) : !canAccess ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Lock className="size-7 text-muted-foreground" />
            <p className="text-sm font-medium">{effectiveChannel?.type === "CLIENT" ? "Chat del cliente" : "Chat privado del proyecto"}</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {effectiveChannel?.type === "CLIENT"
                ? "No trabajas en ningún proyecto de este cliente todavía."
                : "No estás en esta conversación. Pídele al responsable o a un administrador del chat que te invite."}
            </p>
          </div>
        ) : (
          <ChannelChat key={effectiveChannel.id} channelId={effectiveChannel.id} me={me} isAdmin={isAdmin} members={mentionMembers} initialMessages={messages} projectId={effectiveChannel.type === "PROJECT" && onRealProject ? projectId : null} />
        )}
      </div>
    </div>
  );

  // Panel de tareas pendientes (solo en "Chat del día").
  const tasksBody = (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <ListChecks className="size-4 text-muted-foreground" />
        <p className="flex-1 text-sm font-semibold">Mis tareas pendientes</p>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tasks === null ? (
          <p className="p-2 text-sm text-muted-foreground">Cargando…</p>
        ) : tasks.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No tienes tareas pendientes 🎉</p>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2 hover:bg-accent">
                <button
                  type="button"
                  title="Marcar como hecha"
                  onClick={() => {
                    setTasks((prev) => (prev ?? []).filter((x) => x.id !== t.id));
                    void completeMyTask(t.id);
                  }}
                  className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-emerald-600"
                >
                  <CircleCheck className="size-4" />
                </button>
                <a href={t.projectId ? `/proyectos/${t.projectId}?tab=tareas` : "/mis-tareas"} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {t.projectName ? <><EntityEmoji value={t.projectEmoji} fallback="📁" />{" "}{t.projectName}</> : "Personal"}
                    {dueLabel(t.dueDate) ? ` · 📅 ${dueLabel(t.dueDate)}` : ""}
                  </p>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-border p-2">
        <a href="/mis-tareas" className="block rounded-md px-2 py-1.5 text-center text-xs font-medium text-primary hover:bg-muted">Ver todas mis tareas →</a>
      </div>
    </div>
  );

  // Calendario: el panel derecho es SOLO el detalle de la cita/tarea (sin chat). Se abre con
  // doble clic / doble toque sobre una cita; con un solo clic solo se selecciona.
  const calendarBody = (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        {calItem ? (
          <CalendarDetailCard item={calItem} onClose={() => setCalItem(null)} />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
            Doble clic (o doble toque) en una cita o tarea para ver su detalle aquí.
          </div>
        )}
      </div>
    </div>
  );

  const panel = onCalendar ? calendarBody : onEstados ? tasksBody : body;

  if (variant === "mobile") {
    return <div className="h-full w-full bg-background">{panel}</div>;
  }

  // Escritorio: aside redimensionable, plegable a 0.
  return (
    <aside
      className={cn("relative hidden h-full shrink-0 border-l border-border bg-background md:block", !open && "w-0 overflow-hidden border-l-0")}
      style={{ width: open ? width : 0 }}
    >
      {/* Asa para redimensionar */}
      {open ? (
        <div
          onMouseDown={() => { dragging.current = true; document.body.style.userSelect = "none"; }}
          className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-primary/30"
          title="Arrastra para redimensionar"
        />
      ) : null}
      <div className="h-full" style={{ width: open ? width : 0 }}>{panel}</div>
    </aside>
  );
}
