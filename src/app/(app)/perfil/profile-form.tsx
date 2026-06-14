"use client";

import * as React from "react";
import { UserAvatar } from "@/components/user-avatar";
import { updateMyProfile } from "./actions";

const COLORS = ["indigo", "emerald", "violet", "cyan", "amber", "rose", "orange", "slate"];

export function ProfileForm({
  name,
  email,
  title,
  initials,
  color,
}: {
  name: string;
  email: string;
  title: string | null;
  initials: string | null;
  color: string | null;
}) {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState(color ?? "slate");
  const [ini, setIni] = React.useState(initials ?? "");

  function submit(formData: FormData) {
    formData.set("color", sel);
    setMsg(null);
    start(async () => {
      const r = await updateMyProfile(formData);
      setMsg(r.ok ? "✓ Perfil actualizado" : `⚠️ ${r.error ?? "No se pudo guardar"}`);
    });
  }

  return (
    <form action={submit} className="mt-6 max-w-md space-y-4">
      <div className="flex items-center gap-3">
        <UserAvatar initials={(ini || name).slice(0, 2)} color={sel} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Cargo</span>
        <input
          name="title"
          defaultValue={title ?? ""}
          placeholder="Ej. Editora, Productora, Director…"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Iniciales</span>
        <input
          name="initials"
          value={ini}
          onChange={(e) => setIni(e.target.value.toUpperCase().slice(0, 2))}
          maxLength={2}
          placeholder="MR"
          className="w-24 rounded-lg border border-input bg-background px-3 py-2 uppercase outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <div className="text-sm">
        <span className="mb-1.5 block font-medium">Color de avatar</span>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setSel(c)}
              className={
                "size-8 rounded-full ring-offset-2 ring-offset-background transition " +
                (sel === c ? "ring-2 ring-ring" : "")
              }
              aria-label={c}
            >
              <UserAvatar initials="" color={c} size="md" className="size-8" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar perfil"}
        </button>
        {msg ? <span className="text-sm text-muted-foreground">{msg}</span> : null}
      </div>
    </form>
  );
}
