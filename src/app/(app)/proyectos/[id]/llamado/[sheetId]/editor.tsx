"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Plus, Send, Trash2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { guardarLlamado, enviarLlamado, confirmarLlamado } from "../actions";

// ── El editor de la hoja de llamado ─────────────────────────────────────────
// Un solo formulario y un solo «Guardar»: campos de la hoja + la lista de personas + el
// cronograma (estos dos viajan como JSON y el servidor reconcilia). «Enviar al equipo»
// notifica a cada citado con cuenta; el botón de copiar arma el mensaje de WhatsApp.

export type PersonaVM = {
  id: string | null;
  userId: string | null;
  nombre: string; // el del equipo viene resuelto; el externo se escribe
  rol: string;
  telefono: string;
  citacion: string;
  confirmado: boolean;
};

export type BloqueVM = { hora: string; actividad: string; notas: string };

export function LlamadoEditor({ sheetId, gestiona, soyCitadoSinConfirmar, inicial, equipoDisponible, textoWhatsapp, estado, avisadosTxt }: {
  sheetId: string;
  gestiona: boolean;
  /** El usuario de la sesión está citado y aún no confirma: se le muestra el botón grande. */
  soyCitadoSinConfirmar: boolean;
  inicial: {
    titulo: string;
    citacionGeneral: string;
    locacion: string;
    direccion: string;
    indicaciones: string;
    clienteEnSet: string;
    notas: string;
    personas: PersonaVM[];
    bloques: BloqueVM[];
  };
  /** Miembros del equipo que aún no están citados (para añadirlos). */
  equipoDisponible: { id: string; nombre: string; rol: string | null }[];
  textoWhatsapp: string;
  estado: string;
  avisadosTxt: string | null;
}) {
  const router = useRouter();
  const [personas, setPersonas] = React.useState<PersonaVM[]>(inicial.personas);
  const [bloques, setBloques] = React.useState<BloqueVM[]>(inicial.bloques.length ? inicial.bloques : [{ hora: "", actividad: "", notas: "" }]);
  const [error, setError] = React.useState<string | null>(null);
  const [guardado, setGuardado] = React.useState(false);
  const [pendiente, arranca] = React.useTransition();
  const [enviando, arrancaEnvio] = React.useTransition();
  const [copiado, setCopiado] = React.useState(false);
  const [confirmado, setConfirmado] = React.useState(false);

  const cls = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";
  const clsMini = "rounded-md border border-input bg-background px-2 py-1 text-[12.5px] outline-none focus:ring-2 focus:ring-ring";

  const guardar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("personas", JSON.stringify(personas));
    fd.set("bloques", JSON.stringify(bloques));
    setError(null);
    setGuardado(false);
    arranca(async () => {
      const r = await guardarLlamado(sheetId, fd);
      if (!r.ok) { setError(r.error ?? "No se pudo guardar."); return; }
      setGuardado(true);
      router.refresh();
    });
  };

  const enviar = () =>
    arrancaEnvio(async () => {
      const r = await enviarLlamado(sheetId);
      if (!r.ok) { setError(r.error ?? "No se pudo enviar."); return; }
      router.refresh();
    });

  const copiar = async () => {
    await navigator.clipboard.writeText(textoWhatsapp);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  // El botón del citado: confirmar la propia asistencia (visible aunque no gestione).
  const botonConfirmar = soyCitadoSinConfirmar && !confirmado ? (
    <button
      type="button"
      onClick={() => { setConfirmado(true); void confirmarLlamado(sheetId).then(() => router.refresh()); }}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
    >
      <Check className="size-4" /> Confirmo mi asistencia
    </button>
  ) : soyCitadoSinConfirmar && confirmado ? (
    <p className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Asistencia confirmada ✓</p>
  ) : null;

  if (!gestiona) return <div className="space-y-3">{botonConfirmar}</div>;

  return (
    <form onSubmit={guardar} className="space-y-4">
      {botonConfirmar}

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Título del rodaje</span>
          <input name="titulo" defaultValue={inicial.titulo} placeholder="p. ej. Rodaje reels — locación norte" className={cls} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Citación general</span>
          <input name="citacionGeneral" type="time" defaultValue={inicial.citacionGeneral} className={`${cls} tabular-nums`} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Locación</span>
          <input name="locacion" defaultValue={inicial.locacion} placeholder="Estudio norte / Finca El Roble…" className={cls} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Dirección</span>
          <input name="direccion" defaultValue={inicial.direccion} placeholder="Cra 00 # 00-00, ciudad" className={cls} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Cómo llegar / parqueadero <span className="font-normal text-muted-foreground">(opcional)</span></span>
          <textarea name="indicaciones" rows={2} defaultValue={inicial.indicaciones} className={cls} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Cliente en set <span className="font-normal text-muted-foreground">(nombre y teléfono)</span></span>
          <input name="clienteEnSet" defaultValue={inicial.clienteEnSet} placeholder="María F. — 300 000 0000" className={cls} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Notas <span className="font-normal text-muted-foreground">(dress code, alimentación, seguridad…)</span></span>
          <textarea name="notas" rows={2} defaultValue={inicial.notas} className={cls} />
        </label>
      </div>

      {/* Personas citadas */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Equipo citado <span className="font-normal text-muted-foreground">— la citación vacía usa la general</span></p>
        <div className="space-y-2">
          {personas.map((p, i) => (
            <div key={p.id ?? `n${i}`} className="flex flex-wrap items-center gap-2">
              {p.userId ? (
                <span className="min-w-32 flex-1 truncate text-[13px] font-medium">{p.nombre}{p.confirmado ? <span className="ml-1.5 text-emerald-600 dark:text-emerald-400" title="confirmó">✓</span> : null}</span>
              ) : (
                <input value={p.nombre} onChange={(e) => setPersonas((xs) => xs.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                  placeholder="Nombre (externo)" className={cn(clsMini, "min-w-32 flex-1")} />
              )}
              <input value={p.rol} onChange={(e) => setPersonas((xs) => xs.map((x, j) => (j === i ? { ...x, rol: e.target.value } : x)))}
                placeholder="Rol" className={cn(clsMini, "w-32")} />
              <input value={p.citacion} onChange={(e) => setPersonas((xs) => xs.map((x, j) => (j === i ? { ...x, citacion: e.target.value } : x)))}
                type="time" className={cn(clsMini, "w-24 tabular-nums")} title="Citación propia (vacía = la general)" />
              <input value={p.telefono} onChange={(e) => setPersonas((xs) => xs.map((x, j) => (j === i ? { ...x, telefono: e.target.value } : x)))}
                placeholder="Teléfono" className={cn(clsMini, "w-32 tabular-nums")} />
              <button type="button" aria-label="Quitar" onClick={() => setPersonas((xs) => xs.filter((_, j) => j !== i))}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {equipoDisponible.filter((u) => !personas.some((p) => p.userId === u.id)).map((u) => (
            <button key={u.id} type="button"
              onClick={() => setPersonas((xs) => [...xs, { id: null, userId: u.id, nombre: u.nombre, rol: u.rol ?? "", telefono: "", citacion: "", confirmado: false }])}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground">
              <Plus className="size-3" /> {u.nombre}
            </button>
          ))}
          <button type="button"
            onClick={() => setPersonas((xs) => [...xs, { id: null, userId: null, nombre: "", rol: "", telefono: "", citacion: "", confirmado: false }])}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <UserPlus className="size-3" /> Externo / freelancer
          </button>
        </div>
      </div>

      {/* Cronograma */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-2 text-sm font-semibold">Cronograma del día</p>
        <div className="space-y-2">
          {bloques.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input value={b.hora} onChange={(e) => setBloques((xs) => xs.map((x, j) => (j === i ? { ...x, hora: e.target.value } : x)))}
                type="time" className={cn(clsMini, "w-24 tabular-nums")} />
              <input value={b.actividad} onChange={(e) => setBloques((xs) => xs.map((x, j) => (j === i ? { ...x, actividad: e.target.value } : x)))}
                placeholder="Actividad (montaje, escena 1, almuerzo…)" className={cn(clsMini, "min-w-40 flex-1")} />
              <input value={b.notas} onChange={(e) => setBloques((xs) => xs.map((x, j) => (j === i ? { ...x, notas: e.target.value } : x)))}
                placeholder="Notas" className={cn(clsMini, "w-44")} />
              <button type="button" aria-label="Quitar" onClick={() => setBloques((xs) => xs.filter((_, j) => j !== i))}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setBloques((xs) => [...xs, { hora: "", actividad: "", notas: "" }])}
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
          <Plus className="size-3" /> Bloque
        </button>
      </div>

      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pendiente}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar
        </button>
        <button type="button" onClick={enviar} disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          title="Aviso en la app (y correo/push según la preferencia de cada quien) a todos los citados con cuenta">
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {estado === "ENVIADA" ? "Reenviar aviso" : "Enviar al equipo"}
        </button>
        <button type="button" onClick={copiar}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          title="Copia la hoja en formato mensaje, lista para pegarla en el grupo de WhatsApp">
          <Copy className="size-4" /> {copiado ? "Copiado ✓" : "Copiar para WhatsApp"}
        </button>
        {guardado ? <span className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">Guardado ✓</span> : null}
        {avisadosTxt ? <span className="ml-auto text-[11.5px] text-muted-foreground">{avisadosTxt}</span> : null}
      </div>
    </form>
  );
}
