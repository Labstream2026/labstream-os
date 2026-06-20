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

  const inputCls = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring";
  const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <form action={submit} className="mt-6 space-y-4">
      {/* Encabezado: avatar + identidad + foto (todo en una franja compacta) */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-5">
          <UserAvatar initials={(ini || name).slice(0, 2)} color={sel} url={avatarUrl} size="lg" className="size-20 text-2xl ring-4 ring-background" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold leading-tight">{name}</p>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
            {title ? <p className="mt-0.5 text-xs text-muted-foreground">{title}{age != null ? ` · ${age} años` : ""}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
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
                  className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive"
                >
                  Quitar
                </button>
              ) : null}
              {photoMsg ? <span className="text-xs text-muted-foreground">{photoMsg}</span> : null}
            </div>
          </div>
        </div>
      </div>

      {/* Identidad y datos, en una sola tarjeta con grilla de 2 columnas */}
      <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div>
          <p className="mb-3 text-sm font-semibold">Cómo te ve el equipo</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Nombre</span>
              <input name="name" defaultValue={name} placeholder="Tu nombre" className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Cargo</span>
              <input name="title" defaultValue={title ?? ""} placeholder="Ej. Editora, Productora…" className={inputCls} />
            </label>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Iniciales</span>
              <input name="initials" value={ini} onChange={(e) => setIni(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} placeholder="MR" className={`${inputCls} w-24 uppercase`} />
            </label>
            <div>
              <span className={labelCls}>Color de avatar</span>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSel(c)}
                    className={"rounded-full ring-offset-2 ring-offset-background transition " + (sel === c ? "ring-2 ring-ring" : "hover:scale-110")}
                    aria-label={c}
                  >
                    <UserAvatar initials="" color={c} size="md" className="size-7" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Datos del colaborador */}
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-sm font-semibold">Mis datos</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Cédula</span>
              <input name="cedula" defaultValue={cedula ?? ""} inputMode="numeric" placeholder="N.º de documento" className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Fecha de nacimiento{age != null ? ` · ${age} años` : ""}</span>
              <input name="birthDate" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>EPS</span>
              <input name="eps" defaultValue={eps ?? ""} placeholder="Tu EPS" className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>ARL</span>
              <input name="arl" defaultValue={arl ?? ""} placeholder="Tu ARL" className={inputCls} />
            </label>
          </div>
        </div>

        {/* Guardar */}
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <button
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar perfil"}
          </button>
          {msg ? <span className="text-sm text-muted-foreground">{msg}</span> : null}
        </div>
      </div>
    </form>
  );
}
