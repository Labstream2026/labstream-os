"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Hash, Lock, Globe, Users, X, ArrowLeft, UserPlus, Building2, ListChecks, CircleCheck, ChevronDown } from "lucide-react";
import { completeMyTask } from "@/app/(app)/mis-tareas/actions";
import { cn } from "@/lib/utils";
import { formatBogotaDate } from "@/lib/bogota-time";
import { EntityEmoji } from "@/components/icons/marks";
import { UserAvatar } from "@/components/user-avatar";
import { ChannelChat, type ChatMe, type ChatMsg, type Member } from "@/components/chat/channel-chat";
import { ChannelSettings } from "@/components/chat/channel-settings";
import { useChatLive } from "@/components/layout/chat-live";

export type DockTeamMember = { id: string; name: string; initials: string | null; color: string | null };
type DockChannel = {
  id: string;
  name: string;
  type: string;
  isPublic: boolean;
  canManage: boolean;
  members: { id: string; name: string; initials: string | null; color: string | null; role?: string }[];
  projectId?: string | null;
};
type DockPayload = {
  channel: DockChannel | null;
  canAccess: boolean;
  messages: ChatMsg[];
  // Extras que igualan el dock a /chat/[id] (los calcula /api/chat/dock).
  initialLastReadAt?: string | null;
  mentionExtras?: { name: string; hint: string }[];
  canArchive?: boolean;
};
// Fila del selector de conversación (lista compacta de /api/chat/dock?list=1).
type ConvoRow = { id: string; name: string; kind: string; unread: number; muted: boolean; context: string | null };
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
  // Los canales de cliente-empresa se eliminaron: el único contexto que manda es el PROYECTO.
  // En "Chat del día" el chat ya es el contenido principal → a la derecha mostramos
  // las tareas pendientes en vez de repetir el chat.
  const onEstados = pathname === "/estados";
  const contextKey = projectId ?? "";

  const [dmUserId, setDmUserId] = React.useState<string | null>(null);
  // Conversación elegida a mano en el selector (manda sobre el canal del contexto).
  const [manualId, setManualId] = React.useState<string | null>(null);
  const [dock, setDock] = React.useState<DockPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [showMembers, setShowMembers] = React.useState(false);
  const [tasks, setTasks] = React.useState<DockTask[] | null>(null);
  // Selector de conversación: lista perezosa (se pide al abrirlo) + badges vivos.
  const [convos, setConvos] = React.useState<ConvoRow[] | null>(null);
  const live = useChatLive();

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

  // Al cambiar de proyecto, se sale del DM/manual y se vuelve al chat del contexto.
  React.useEffect(() => { setDmUserId(null); setManualId(null); setShowMembers(false); }, [contextKey]);

  // La burbuja RECUERDA la última conversación elegida a mano (canal o DM): al abrir el panel
  // de nuevo reabre donde estabas. Solo al montar, y solo si el contexto del proyecto no manda.
  const restoredRef = React.useRef(false);
  React.useEffect(() => {
    if (restoredRef.current || onRealProject) return;
    restoredRef.current = true;
    try {
      const raw = window.localStorage.getItem("ui:chatLast");
      if (!raw) return;
      const saved = JSON.parse(raw) as { kind?: string; id?: string };
      if (saved.kind === "dm" && saved.id) setDmUserId(saved.id);
      else if (saved.kind === "channel" && saved.id) setManualId(saved.id);
    } catch { /* ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    try {
      if (manualId) window.localStorage.setItem("ui:chatLast", JSON.stringify({ kind: "channel", id: manualId }));
      else if (dmUserId) window.localStorage.setItem("ui:chatLast", JSON.stringify({ kind: "dm", id: dmUserId }));
    } catch { /* ignora */ }
  }, [manualId, dmUserId]);
  // Si lo recordado ya no existe o perdiste el acceso, vuelve al general y olvídalo.
  React.useEffect(() => {
    if (loading || !dock || dock.canAccess) return;
    if (manualId) {
      setManualId(null);
      try { window.localStorage.removeItem("ui:chatLast"); } catch { /* ignora */ }
    }
  }, [dock, loading, manualId]);

  // Resolver el canal a mostrar: manual (selector) > DM > proyecto > cliente > general.
  // El general también se pide por ?channel= para traer los extras (línea de no-leídos,
  // @canal/@Rol, Guardar en Archivos); mientras llega, se pinta con el prop server-render.
  const generalId = generalChannel?.id ?? null;
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      const q = manualId
        ? `channel=${manualId}`
        : dmUserId
          ? `dm=${dmUserId}`
          : onRealProject
            ? `project=${projectId}`
            : generalId
              ? `channel=${generalId}`
              : null;
      if (!q) { setDock(null); return; }
      setDock(null); // el destino cambió: no pintar el canal anterior mientras llega el nuevo
      setLoading(true);
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
  }, [manualId, dmUserId, projectId, onRealProject, generalId]);

  // Lista del selector (perezosa): se pide al abrir el desplegable la primera vez.
  const loadConvos = React.useCallback(() => {
    if (convos !== null) return;
    fetch("/api/chat/dock?list=1", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => setConvos(d.rows ?? []))
      .catch(() => setConvos([]));
  }, [convos]);

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

  // ── Estado a renderizar ──
  const isManual = !!manualId;
  const isDM = !isManual && !!dmUserId;
  // Sin manual/DM/contexto, el destino es el general: el prop server-render pinta al instante
  // y el fetch por ?channel= lo releva con los extras (línea de no-leídos, @canal/@Rol…).
  const generalFallback = !isManual && !isDM && !onRealProject;
  const effectiveChannel =
    dock?.channel ??
    (generalFallback && generalChannel
      ? { id: generalChannel.id, name: generalChannel.name, type: "GENERAL", isPublic: true, canManage: false, members: [] as DockChannel["members"] }
      : null);
  const messages = dock?.messages ?? (generalFallback ? generalChannel?.messages ?? [] : []);
  const canAccess = dock ? dock.canAccess : generalFallback ? !!generalChannel : false;
  const usingGeneral = !!effectiveChannel && effectiveChannel.id === generalId;
  const dmName = isDM ? team.find((t) => t.id === dmUserId)?.name ?? "Mensaje directo" : null;

  // Menciones acotadas al CANAL cuando el servidor las trae (antes: todo el equipo, incluso
  // en canales privados); el equipo completo queda de respaldo (general/DM/primer pintado).
  const mentionMembers: Member[] = dock?.channel?.members?.length
    ? dock.channel.members.map((m) => ({ id: m.id, name: m.name }))
    : team.map((t) => ({ id: t.id, name: t.name }));
  // Total de no-leídos vivo (badge del selector de conversación).
  const liveTotal = live.total ?? 0;

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
            {usingGeneral ? <Hash className="size-4 shrink-0 text-muted-foreground" /> : effectiveChannel?.type === "CLIENT" ? <Building2 className="size-4 shrink-0 text-indigo-600" /> : effectiveChannel?.isPublic ? <Globe className="size-4 shrink-0 text-emerald-600" /> : <Lock className="size-4 shrink-0 text-amber-600" />}
            {/* Selector de conversación: el dock ya no está atado al canal del contexto —
                desde cualquier página se puede abrir CUALQUIER chat, con no-leídos vivos. */}
            <details data-autoclose className="relative min-w-0 flex-1">
              <summary
                onClick={loadConvos}
                className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-muted [&::-webkit-details-marker]:hidden"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{usingGeneral ? `Equipo · ${effectiveChannel?.name ?? "general"}` : effectiveChannel?.name ?? "Elegir chat"}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{usingGeneral ? "Canal del equipo" : effectiveChannel?.type === "CLIENT" ? "Todos los que trabajan con el cliente" : effectiveChannel?.type === "DIRECT" ? "Mensaje directo · privado" : effectiveChannel ? (effectiveChannel.isPublic ? "Público para el equipo" : "Privado · por invitación") : "Abre una conversación"}</p>
                </div>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                {liveTotal > 0 ? (
                  <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">{liveTotal > 99 ? "99+" : liveTotal}</span>
                ) : null}
              </summary>
              <div className="absolute left-0 top-full z-30 mt-1 max-h-80 w-[17rem] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                {convos === null ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">Cargando conversaciones…</p>
                ) : convos.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">Sin conversaciones.</p>
                ) : (
                  convos.map((c) => {
                    const n = live.unreadOf(c.id) ?? c.unread;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={(e) => {
                          setManualId(c.id);
                          setDmUserId(null);
                          e.currentTarget.closest("details")?.removeAttribute("open");
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
                          effectiveChannel?.id === c.id && "bg-accent",
                        )}
                      >
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate">{c.name}</span>
                          {c.context ? <span className="block truncate text-[10px] text-muted-foreground">{c.context}</span> : null}
                        </span>
                        {n > 0 ? (
                          <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", c.muted ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")}>{n}</span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </details>
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
            {onRealProject ? "Este proyecto aún no tiene chat." : "Elige una conversación en el selector de arriba, o a un compañero para un mensaje directo."}
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
          <ChannelChat
            // El general se pinta primero con el prop server-render y se releva con el fetch
            // (extras incluidos): el sufijo remonta UNA vez para aplicar la ventana completa.
            key={`${effectiveChannel.id}:${dock ? "full" : "boot"}`}
            channelId={effectiveChannel.id}
            me={me}
            isAdmin={isAdmin}
            members={mentionMembers}
            initialMessages={messages}
            initialLastReadAt={dock?.initialLastReadAt ?? null}
            mentionExtras={dock?.mentionExtras ?? []}
            canArchive={dock?.canArchive ?? false}
            projectId={effectiveChannel.type === "PROJECT" ? dock?.channel?.projectId ?? (onRealProject ? projectId : null) : null}
          />
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

  // En el calendario el dock NO se monta (app-shell lo oculta): el detalle de la cita/tarea sale
  // como modal centrado sobre el propio calendario, no en un panel lateral.
  const panel = onEstados ? tasksBody : body;

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
