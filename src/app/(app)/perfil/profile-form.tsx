"use client";

import * as React from "react";
import { UserAvatar } from "@/components/user-avatar";
import { updateMyProfile, updateMyAvatar, removeMyAvatar } from "./actions";

const COLORS = ["indigo", "emerald", "violet", "cyan", "amber", "rose", "orange", "slate"];

export function ProfileForm({
  name,
  email,
  title,
  initials,
  color,
  avatarUrl,
  cedula,
  eps,
  arl,
  birthDate,
}: {
  name: string;
  email: string;
  title: string | null;
  initials: string | null;
  color: string | null;
  avatarUrl?: string | null;
  cedula?: string | null;
  eps?: string | null;
  arl?: string | null;
  birthDate?: string | null; // ISO o ""
}) {
  // Fecha de nacimiento en formato YYYY-MM-DD para el input + edad calculada.
  const birthInput = birthDate ? birthDate.slice(0, 10) : "";
  const [birth, setBirth] = React.useState(birthInput);
  const age = React.useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
    const [y, m, d] = birth.split("-").map(Number);
    const now = new Date();
    let a = now.getUTCFullYear() - y;
    if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) a--;
    return a >= 0 && a < 120 ? a : null;
  }, [birth]);
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState(color ?? "slate");
  const [ini, setIni] = React.useState(initials ?? "");
  const [photoMsg, setPhotoMsg] = React.useState<string | null>(null);
  const [photoPending, startPhoto] = React.useTransition();

  function submit(formData: FormData) {
    formData.set("color", sel);
    setMsg(null);
    start(async () => {
      const r = await updateMyProfile(formData);
      setMsg(r.ok ? "✓ Perfil actualizado" : `⚠️ ${r.error ?? "No se pudo guardar"}`);
    });
  }

  return (
    <>
      {/* Foto de perfil */}
      <div className="mt-6 max-w-md rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-4">
          <UserAvatar initials={(ini || name).slice(0, 2)} color={sel} url={avatarUrl} size="lg" className="size-16" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Foto de perfil</p>
            <p className="text-xs text-muted-foreground">JPG, PNG o WebP · máx 5MB</p>
            <div className="mt-2 flex items-center gap-2">
              <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                {photoPending ? "Subiendo…" : "Cambiar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={photoPending}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const fd = new FormData();
                    fd.set("avatar", f);
                    setPhotoMsg(null);
                    startPhoto(async () => {
                      const r = await updateMyAvatar(fd);
                      setPhotoMsg(r.ok ? "✓ Foto actualizada" : `⚠️ ${r.error ?? "Error"}`);
                    });
                  }}
                />
              </label>
              {avatarUrl ? (
                <button
                  type="button"
                  onClick={() => startPhoto(async () => { await removeMyAvatar(); setPhotoMsg("✓ Foto eliminada"); })}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Quitar
                </button>
              ) : null}
              {photoMsg ? <span className="text-xs text-muted-foreground">{photoMsg}</span> : null}
            </div>
          </div>
        </div>
      </div>

    <form action={submit} className="mt-4 max-w-md space-y-4">
      <div className="flex items-center gap-3">
        <UserAvatar initials={(ini || name).slice(0, 2)} color={sel} url={avatarUrl} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Nombre</span>
        <input
          name="name"
          defaultValue={name}
          placeholder="Tu nombre como lo verá el equipo"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="mt-1 block text-[11px] text-muted-foreground">Puedes acortarlo o ajustarlo (al entrar se toma de Authentik, pero aquí mandas tú).</span>
      </label>

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

      {/* Datos del colaborador */}
      <div className="border-t border-border pt-4">
        <p className="mb-2 text-sm font-semibold">Mis datos</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Cédula</span>
            <input name="cedula" defaultValue={cedula ?? ""} inputMode="numeric" placeholder="N.º de documento" className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Fecha de nacimiento{age != null ? ` · ${age} años` : ""}</span>
            <input name="birthDate" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">EPS</span>
            <input name="eps" defaultValue={eps ?? ""} placeholder="Tu EPS" className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">ARL</span>
            <input name="arl" defaultValue={arl ?? ""} placeholder="Tu ARL" className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
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
    </>
  );
}
