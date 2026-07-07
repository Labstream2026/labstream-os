"use client";

import { useState, useTransition } from "react";
import { Trash2, MessageCircle, Check } from "lucide-react";
import { setUserRole, setUserActive, setUserGuest, setUserGender, setUserWhatsapp, setUserColor, deleteUser } from "./actions";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { AVATAR_COLORS } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function UserControls({
  userId,
  userName,
  roleKey,
  active,
  isGuest,
  gender,
  color,
  whatsappPhone,
  whatsappCommand,
  roles,
  isSelf,
}: {
  userId: string;
  userName: string;
  roleKey: string;
  active: boolean;
  isGuest: boolean;
  gender: string | null;
  color: string | null;
  whatsappPhone: string | null;
  whatsappCommand: boolean;
  roles: { key: string; name: string }[];
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [col, setCol] = useState(color ?? "slate");
  const { confirm, dialog } = useConfirmDialog();

  // Estado local de los campos de WhatsApp (número + permiso de comandar).
  const [phone, setPhone] = useState(whatsappPhone ?? "");
  const [command, setCommand] = useState(whatsappCommand);
  const savePhone = () => {
    const v = phone.trim();
    if (v === (whatsappPhone ?? "")) return; // sin cambios
    run(() => setUserWhatsapp(userId, v || null, command));
  };
  const toggleCommand = () => {
    const next = !command;
    setCommand(next);
    run(() => setUserWhatsapp(userId, phone.trim() || null, next));
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) setError(res.error ?? "No se pudo aplicar el cambio.");
      } catch {
        // Si la acción del servidor lanza (p. ej. tras un despliegue, el id de la
        // Server Action de esta pestaña ya no existe → UnrecognizedActionError, o un
        // 503 transitorio), lo mostramos inline en vez de dejar que tumbe toda la página.
        setError("No se pudo aplicar el cambio. Recarga la página e inténtalo de nuevo.");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      {dialog}
      <div className="flex items-center gap-2">
        <select
          value={roleKey}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value;
            run(() => setUserRole(userId, v));
          }}
          className="cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>

        <select
          value={gender ?? ""}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value;
            run(() => setUserGender(userId, v || null));
          }}
          title="Cómo te saluda Marcebot (muchacho / muchacha)"
          className="cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          <option value="">🤖 Neutro</option>
          <option value="M">👦 Muchacho</option>
          <option value="F">👧 Muchacha</option>
        </select>

        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setUserGuest(userId, !isGuest))}
          title={isGuest ? "Invitado: sin acceso a la Wiki. Clic para dar acceso." : "Con acceso a la Wiki. Clic para marcar como invitado (sin Wiki)."}
          className={
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 " +
            (isGuest
              ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
              : "border-border bg-card text-muted-foreground hover:bg-accent")
          }
        >
          {isGuest ? "Invitado" : "Equipo"}
        </button>

        <button
          type="button"
          disabled={pending || (isSelf && active)}
          onClick={() => run(() => setUserActive(userId, !active))}
          title={isSelf && active ? "No puedes desactivar tu propia cuenta" : undefined}
          className={
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 " +
            (active
              ? "border-border bg-card text-muted-foreground hover:bg-accent"
              : "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20")
          }
        >
          {active ? "Activo" : "Inactivo"}
        </button>

        {!isSelf ? (
          <button
            type="button"
            disabled={pending}
            onClick={async () => { if (await confirm({ title: "Eliminar usuario", message: `¿Eliminar a ${userName}? Se borra su cuenta y sus pertenencias; el contenido en propiedad queda sin autor. No se puede deshacer.`, confirmLabel: "Eliminar", danger: true })) run(() => deleteUser(userId)); }}
            title="Eliminar usuario"
            className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>

      {/* WhatsApp: número vinculado + permiso de comandar al agente desde WhatsApp. */}
      <div className="flex items-center gap-2">
        <MessageCircle className="size-3.5 text-muted-foreground" />
        <input
          value={phone}
          disabled={pending}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={savePhone}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          inputMode="tel"
          placeholder="WhatsApp 57300…"
          title="Número de WhatsApp de la persona (con indicativo). Vacío = sin vincular."
          className="w-36 rounded-md border border-border bg-card px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <button
          type="button"
          disabled={pending || !phone.trim()}
          onClick={toggleCommand}
          title={
            !phone.trim()
              ? "Vincula primero un número para poder comandar"
              : command
                ? "Puede dar instrucciones al agente por WhatsApp (crear notas, tareas, citas). Clic para quitar."
                : "Solo está vinculado. Clic para permitir comandar por WhatsApp."
          }
          className={
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 " +
            (command
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-border bg-card text-muted-foreground hover:bg-accent")
          }
        >
          {command ? (
            <span className="inline-flex items-center gap-1">
              Comanda <Check className="size-3.5" />
            </span>
          ) : (
            "No comanda"
          )}
        </button>
      </div>

      {/* Color de identificación: tiñe el avatar y las notificaciones de la persona. */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Color:</span>
        <div className="flex items-center gap-1">
          {Object.keys(AVATAR_COLORS).map((k) => (
            <button
              key={k}
              type="button"
              disabled={pending}
              onClick={() => { setCol(k); run(() => setUserColor(userId, k)); }}
              aria-label={`Color ${k}`}
              title={k}
              className={cn(
                "size-4 rounded-full transition-transform hover:scale-110 disabled:opacity-50",
                AVATAR_COLORS[k].split(" ")[0],
                col === k ? "ring-2 ring-offset-1 ring-offset-card ring-foreground/60" : "",
              )}
            />
          ))}
        </div>
      </div>

      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
