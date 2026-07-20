"use client";

import * as React from "react";
import { IconCalendario, IconConfiguracion } from "@/components/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, MoreHorizontal, Share2, Check, Menu, User, LogOut, ChevronLeft, ChevronDown, Link2, UserPlus, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationsBell, type NotificationItem } from "@/components/layout/notifications-bell";
import { logout } from "@/lib/auth-actions";
import { routeMeta } from "@/lib/nav-meta";
import { LABSTREAM_ICONS } from "@/components/icons";
import { inviteClientUser } from "@/app/(app)/clientes/actions";

// La barra ahora también muestra nombre + título de la persona (panel de miembros).
export type TopbarAvatar = { initials: string | null; color: string | null; name?: string; title?: string | null };

// ── Menú «Compartir»: copiar enlace · invitar a un cliente (contextual) · invitar al equipo ──
// El contexto de cliente sale de la URL (/clientes/[id]) o del atributo data-client-id que el
// detalle de proyecto inyecta en su título de la barra. Cierra al hacer clic fuera (data-autoclose).
function ShareMenu({ canAdmin }: { canAdmin: boolean }) {
  const pathname = usePathname();
  const [copied, setCopied] = React.useState(false);
  const [clientCtx, setClientCtx] = React.useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);

  // Detecta el cliente en contexto al ABRIR el menú (URL de ficha o data-client-id del proyecto).
  const detectClient = () => {
    const seg = pathname.split("/").filter(Boolean);
    if (seg[0] === "clientes" && seg[1] && seg[1] !== "nuevo") return seg[1];
    const holder = document.querySelector<HTMLElement>("#topbar-page-slot [data-client-id]");
    return holder?.dataset.clientId ?? null;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignora */ }
  };

  const invite = () => {
    const name = nameRef.current?.value ?? "";
    const email = emailRef.current?.value ?? "";
    setMsg(null);
    start(async () => {
      const r = await inviteClientUser(clientCtx!, name, email);
      if (r.ok) {
        setMsg({ ok: true, text: r.emailSent ? "Invitación enviada por correo." : "Acceso creado (correo no configurado)." });
        if (nameRef.current) nameRef.current.value = "";
        if (emailRef.current) emailRef.current.value = "";
      } else {
        setMsg({ ok: false, text: r.error ?? "No se pudo invitar." });
      }
    });
  };

  return (
    <details
      data-autoclose
      className="relative hidden sm:block"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) {
          setClientCtx(detectClient());
          setInviteOpen(false);
          setMsg(null);
        }
      }}
    >
      <summary className="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden">
        <span className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
          {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
          {copied ? "¡Enlace copiado!" : "Compartir"}
          <ChevronDown className="size-3.5 opacity-80" />
        </span>
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-border bg-popover p-1.5 text-sm shadow-xl">
        <button type="button" onClick={copy} className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-muted">
          <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>Copiar enlace<span className="block text-xs text-muted-foreground">de esta página, para el equipo</span></span>
        </button>
        {canAdmin ? (
          <>
            <div className="mx-2 my-1 h-px bg-border" />
            {clientCtx ? (
              <div>
                <button type="button" onClick={() => setInviteOpen((v) => !v)} className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-muted">
                  <UserPlus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>Invitar a un cliente<span className="block text-xs text-muted-foreground">al portal de esta cuenta (correo + acceso)</span></span>
                </button>
                {inviteOpen ? (
                  <div className="space-y-2 px-3 pb-2 pt-1">
                    <input ref={nameRef} placeholder="Nombre (p. ej. Luis Felipe)" className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                    <div className="flex items-center gap-2">
                      <input ref={emailRef} type="email" placeholder="correo@empresa.com" className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                      <button type="button" onClick={invite} disabled={pending} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} Invitar
                      </button>
                    </div>
                    {msg ? <p className={cn("text-xs", msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{msg.text}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <Link href="/clientes" className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-muted">
                <UserPlus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>Invitar a un cliente<span className="block text-xs text-muted-foreground">abre Clientes y entra a la cuenta a invitar</span></span>
              </Link>
            )}
            <Link href="/configuracion" className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-muted">
              <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>Invitar a alguien del equipo<span className="block text-xs text-muted-foreground">crear usuario interno (Configuración)</span></span>
            </Link>
          </>
        ) : null}
      </div>
    </details>
  );
}

// ── Panel de miembros por defecto (el EQUIPO, solo lectura) ──
// Clic en los avatares → lista con nombre y cargo; clic fuera → se recoge (data-autoclose).
// En la ficha de cliente, la página inyecta su propio panel (editable) en #topbar-people-slot
// y este default se oculta solo (regla CSS en globals).
function TeamPeople({ team }: { team: TopbarAvatar[] }) {
  return (
    <details data-autoclose className="relative hidden lg:block">
      <summary className="flex cursor-pointer list-none items-center rounded-lg p-1 hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label="Ver el equipo" title="El equipo">
        <span className="flex -space-x-2">
          {team.slice(0, 4).map((m, i) => (
            <UserAvatar key={i} initials={m.initials} color={m.color} size="sm" ring />
          ))}
          {team.length > 4 ? (
            <span className="grid size-7 place-items-center rounded-full border-2 border-background bg-muted text-[10px] font-bold text-muted-foreground">+{team.length - 4}</span>
          ) : null}
        </span>
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-popover text-sm shadow-xl">
        <p className="px-3.5 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">El equipo · {team.length}</p>
        <div className="max-h-80 overflow-y-auto pb-1.5">
          {team.map((m, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-muted">
              <UserAvatar initials={m.initials} color={m.color} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium leading-tight">{m.name ?? "—"}</span>
                {m.title ? <span className="block truncate text-[11px] text-muted-foreground">{m.title}</span> : null}
              </span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

export function Topbar({
  team,
  notifications,
  canAdmin = false,
  onToggleSidebar,
  onOpenMobileMenu,
}: {
  team: TopbarAvatar[];
  notifications: NotificationItem[];
  canAdmin?: boolean;
  onToggleSidebar: () => void;
  onOpenMobileMenu: () => void;
}) {
  const pathname = usePathname();
  const { icon, label, desc } = routeMeta(pathname);
  const RouteIcon = icon ? LABSTREAM_ICONS[icon] : null;
  // "Volver" en móvil: en una página de detalle (p. ej. /proyectos/[id]) la barra superior no
  // ofrecía cómo regresar a la lista. Si la ruta tiene un segmento anidado, mostramos una flecha
  // que lleva a la sección padre. El chat trae su propio botón de volver, así que se excluye.
  const segments = pathname.split("/").filter(Boolean);
  const showBack = segments.length >= 2 && segments[0] !== "chat";
  const backHref = `/${segments[0]}`;
  // En el DETALLE de proyecto el título lo inyecta la página (#topbar-page-slot) y el equipo
  // se gestiona en su fila «en el equipo» — el grupo de avatares global no se pinta.
  const isProjectDetail = segments[0] === "proyectos" && segments.length >= 2 && segments[1] !== "nuevo";

  return (
    <header className="flex h-[calc(3.75rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border bg-background px-3 pt-[env(safe-area-inset-top)] sm:px-4">
      {/* Abrir cajón de menú (solo móvil) */}
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground md:hidden"
        aria-label="Abrir menú"
        onClick={onOpenMobileMenu}
      >
        <Menu />
      </Button>

      {/* Plegar barra lateral (solo escritorio) */}
      <Button
        variant="ghost"
        size="icon"
        className="hidden text-muted-foreground md:inline-flex"
        aria-label="Plegar barra lateral"
        onClick={onToggleSidebar}
      >
        <PanelLeft />
      </Button>

      {/* Hueco de identidad de página: TODAS las secciones muestran aquí su nombre + descripción
          (default desde nav-meta, en móvil y escritorio). Las páginas con datos vivos (proyecto,
          PageHeader con conteos) inyectan el suyo vía portal y el default se oculta solo (CSS :has). */}
      <div id="topbar-page-slot" className="flex min-w-0 flex-1 items-center">
        <div data-slot-default className="flex min-w-0 items-center gap-2.5">
          {showBack ? (
            <Link
              href={backHref}
              aria-label="Volver"
              className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted active:scale-95 md:hidden"
            >
              <ChevronLeft className="size-5" />
            </Link>
          ) : null}
          {RouteIcon ? (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&>svg]:size-5">
              <RouteIcon />
            </span>
          ) : null}
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-semibold leading-tight">{label}</span>
            {desc ? <span className="hidden truncate text-[11.5px] leading-tight text-muted-foreground sm:block">{desc}</span> : null}
          </span>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
        {/* Personas: avatares → panel (default: el equipo, solo lectura). La ficha de cliente
            inyecta aquí su panel editable. En el detalle de proyecto no se pinta el default. */}
        <div id="topbar-people-slot" className="flex items-center">
          {!isProjectDetail ? (
            <div data-slot-default>
              <TeamPeople team={team} />
            </div>
          ) : null}
        </div>
        <ShareMenu canAdmin={canAdmin} />
        <NotificationsBell items={notifications} />
        <ThemeToggle />
        {/* El botón del panel de chat murió: el chat vive en la burbuja flotante y en /chat. */}
        <details data-autoclose className="relative hidden md:block">
          <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Más opciones">
            <MoreHorizontal className="size-5" />
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-border bg-popover p-1 text-sm shadow-lg">
            <Link href="/ajustes?s=perfil" className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted">
              <User className="size-4" /> Mi perfil
            </Link>
            <Link href="/calendario" className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted">
              <IconCalendario className="size-4" /> Mi calendario
            </Link>
            <Link href="/ajustes" className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted">
              <IconConfiguracion className="size-4" /> Ajustes
            </Link>
            <form action={logout} className="border-t border-border">
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-destructive hover:bg-muted">
                <LogOut className="size-4" /> Cerrar sesión
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
