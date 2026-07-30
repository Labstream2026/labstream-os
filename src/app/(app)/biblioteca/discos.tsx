"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  Check,
  ChevronRight,
  Cloud,
  HardDrive,
  LayoutGrid,
  List,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { MenuBarra, MenuOpcion, MenuSeparador, MenuGrupo, usePreferenciaLocal } from "@/components/ui/barra-menu";
import { cn } from "@/lib/utils";
import { DISK_KINDS, DISK_KIND_LABEL, DISK_FULL_PCT } from "@/lib/material-health";
import { MOUNT_KEYS, MOUNT_LABEL, MOUNT_DESC } from "@/lib/disco-raiz";
import {
  addStorageDisk,
  deleteStorageDisk,
  markDiskChecked,
  registrarMontaje,
  toggleDiskStatus,
  updateStorageDisk,
} from "./disk-actions";

export type DiskRow = {
  id: string;
  name: string;
  kind: string;
  color: string | null;
  capacityGB: number | null;
  usedGB: number | null; // el del montaje ya llega calculado en vivo desde el servidor
  liveNas: boolean; // la ocupación vino del statfs (no editable a mano)
  mountKey: string | null; // qué montaje ES este disco (su raíz); null = disco de cajón
  location: string | null;
  offsite: boolean;
  status: string;
  notes: string | null;
  lastCheckDays: number | null; // días desde la última verificación; null = nunca
  needsCheck: boolean; // pide que alguien lo conecte (mismo criterio que los avisos)
  nProjects: number;
  nLocations: number;
};

const inputCls = "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function tbLabel(gb: number | null): string {
  if (gb == null) return "—";
  return `${(gb / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} TB`;
}

// Semáforo de verificación: verde < 3 meses, ámbar < 6, rojo después (o nunca).
// El texto y el color se sacan del MISMO número para que no se contradigan («hace 3 meses»
// en verde era la contradicción de antes, en el filo de los 90 días).
function checkTone(days: number | null): { cls: string; dot: string; label: string } {
  if (days == null) return { cls: "text-muted-foreground", dot: "bg-muted-foreground", label: "Nunca verificado" };
  const meses = Math.floor(days / 30);
  const label =
    days === 0 ? "Verificado hoy" : days === 1 ? "Ayer" : days < 60 ? `Hace ${days} días` : `Hace ${meses} meses`;
  if (days < 90) return { cls: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", label };
  if (days < 180) return { cls: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", label };
  return { cls: "text-red-500", dot: "bg-red-500", label };
}

function pctDe(d: DiskRow): number | null {
  if (!d.capacityGB || d.usedGB == null) return null;
  return Math.min(100, Math.round((d.usedGB / d.capacityGB) * 100));
}

// ── Formulario compartido de alta/edición ──────────────────────────────────────
// El campo «Usado» solo aparece cuando NO es un montaje: si el disco se lee en vivo, anotarlo
// a mano no sirve de nada. Y como el campo no viaja, la action ya no lo pisa con null (antes
// editar el nombre del NAS le borraba la ocupación anotada).
function DiskForm({ disk, onDone }: { disk?: DiskRow; onDone: () => void }) {
  const action = disk ? updateStorageDisk.bind(null, disk.id) : addStorageDisk;
  const [mount, setMount] = useState(disk?.mountKey ?? "");
  const live = Boolean(mount);
  return (
    <form action={action} onSubmit={onDone} className="flex flex-wrap items-center gap-2 p-3">
      <input name="name" required defaultValue={disk?.name ?? ""} placeholder="Nombre (ej. LAB-01 · LaCie 4 TB)" className={`min-w-48 flex-1 ${inputCls}`} />
      <select name="kind" defaultValue={disk?.kind ?? "HDD"} className={`w-32 ${inputCls}`} title="Tipo de soporte">
        {DISK_KINDS.map((k) => (
          <option key={k} value={k}>{DISK_KIND_LABEL[k]}</option>
        ))}
      </select>
      {/* La RAÍZ: qué montaje de la app es este disco. Vacío = disco de cajón. */}
      <select
        name="mountKey"
        value={mount}
        onChange={(e) => setMount(e.target.value)}
        className={`w-52 ${inputCls}`}
        title="Si este disco es una carpeta que la app tiene montada, se puede navegar por dentro y su ocupación se lee sola"
      >
        <option value="">Sin montar (disco de cajón)</option>
        {MOUNT_KEYS.map((k) => (
          <option key={k} value={k}>{MOUNT_LABEL[k]}</option>
        ))}
      </select>
      {live ? null : (
        <>
          <input name="capacityTB" defaultValue={disk?.capacityGB ? String(disk.capacityGB / 1000) : ""} placeholder="Capacidad TB" inputMode="decimal" className={`w-28 ${inputCls}`} title="Capacidad total en TB (ej. 4 o 3,5)" />
          <input name="usedTB" defaultValue={disk?.usedGB ? String(disk.usedGB / 1000) : ""} placeholder="Usado TB" inputMode="decimal" className={`w-24 ${inputCls}`} title="Espacio usado en TB (a mano; un disco montado se lee solo)" />
        </>
      )}
      <input name="location" defaultValue={disk?.location ?? ""} placeholder="Dónde está (ej. Estudio · cajón 2)" className={`min-w-44 flex-1 ${inputCls}`} />
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
        <input type="checkbox" name="offsite" defaultChecked={disk?.offsite ?? false} className="size-4 accent-primary" />
        Fuera del estudio
      </label>
      <input name="notes" defaultValue={disk?.notes ?? ""} placeholder="Notas" className={`min-w-40 flex-1 ${inputCls}`} />
      {live ? (
        <p className="w-full text-[11px] text-muted-foreground">
          {MOUNT_DESC[mount as "OPS" | "GALERIA"]} Su capacidad y ocupación se leen del disco: no hace falta anotarlas.
        </p>
      ) : null}
      <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        {disk ? "Guardar" : "Añadir disco"}
      </button>
      <button type="button" onClick={onDone} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" title="Cancelar">
        <X className="size-4" />
      </button>
    </form>
  );
}

// ── El menú ⋮ de cada disco ────────────────────────────────────────────────────
// Todo lo que antes eran cinco iconos sueltos por tarjeta. Se mantiene TODO: verificar,
// etiqueta QR, editar, retirar/reactivar y eliminar (esta última solo si no tiene material,
// igual que antes).
//
// Los formularios viven FUERA del <details> y se disparan por referencia. Parece un rodeo,
// pero es lo que hace segura la confirmación de borrado: el menú se cierra en cuanto se pulsa
// una opción, y un diálogo montado dentro se iría con él (además de quedar atrapado en el
// contexto de apilamiento del desplegable).
function MenuDisco({ d, onEdit }: { d: DiskRow; onEdit: () => void }) {
  const { confirm, dialog } = useConfirmDialog();
  const verificar = React.useRef<HTMLFormElement>(null);
  const alternar = React.useRef<HTMLFormElement>(null);
  const borrar = React.useRef<HTMLFormElement>(null);
  const retirado = d.status === "RETIRADO";

  return (
    <>
      <form ref={verificar} action={markDiskChecked.bind(null, d.id)} className="hidden" />
      <form ref={alternar} action={toggleDiskStatus.bind(null, d.id)} className="hidden" />
      <form ref={borrar} action={deleteStorageDisk.bind(null, d.id)} className="hidden" />

      <MenuBarra tono="icono" alineado="derecha" icono={<MoreVertical />} titulo={`Acciones de ${d.name}`}>
        <MenuOpcion
          marca={false}
          icono={<Check />}
          onClick={() => verificar.current?.requestSubmit()}
          pista={d.kind === "NUBE" ? undefined : "lo conecté y abre"}
        >
          Verificado hoy
        </MenuOpcion>
        <MenuOpcion marca={false} icono={<Pencil />} onClick={onEdit}>Editar</MenuOpcion>
        <MenuOpcion marca={false} icono={<QrCode />} href={`/biblioteca/discos/${d.id}/etiqueta`}>Etiqueta QR</MenuOpcion>
        <MenuSeparador />
        <MenuOpcion marca={false} icono={<RotateCcw />} onClick={() => alternar.current?.requestSubmit()}>
          {retirado ? "Reactivar" : "Retirar"}
        </MenuOpcion>
        {d.nLocations === 0 ? (
          <MenuOpcion
            marca={false}
            peligro
            icono={<Trash2 />}
            onClick={() => {
              void confirm({
                title: "Eliminar disco",
                message: `¿Eliminar el disco «${d.name}»? No tiene material registrado.`,
                confirmLabel: "Eliminar",
                danger: true,
              }).then((ok) => {
                if (ok) borrar.current?.requestSubmit();
              });
            }}
          >
            Eliminar
          </MenuOpcion>
        ) : (
          // Con material registrado NO se ofrece borrar: se retira. Decirlo evita que alguien
          // busque un botón que no está.
          <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
            Tiene material registrado: retíralo en vez de borrarlo.
          </p>
        )}
      </MenuBarra>
      {dialog}
    </>
  );
}

// Barra de ocupación compartida por la fila y la tarjeta.
function Ocupacion({ d, compacta = false }: { d: DiskRow; compacta?: boolean }) {
  const pct = pctDe(d);
  if (pct == null) {
    return (
      <p className="text-xs text-muted-foreground">
        {d.capacityGB ? `${tbLabel(d.capacityGB)} · sin uso anotado` : "sin medir"}
      </p>
    );
  }
  const lleno = pct >= DISK_FULL_PCT;
  return (
    <div>
      <div className={cn("mb-1 flex justify-between gap-2 text-xs", compacta && "text-[11px]")}>
        <span className="text-muted-foreground">
          <b className="font-semibold text-foreground">{tbLabel(d.usedGB)}</b> / {tbLabel(d.capacityGB)}
        </span>
        <span className={lleno ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
          {pct} %{lleno ? " · casi lleno" : ""}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-accent">
        <div className={cn("h-full rounded-full", pct >= 95 ? "bg-red-500" : lleno ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ChipVerificacion({ d }: { d: DiskRow }) {
  // La nube no se «conecta»: pedirle una verificación física no significa nada (y el barrido
  // de avisos nunca la notificaba, así que era una alerta imposible de apagar).
  if (d.kind === "NUBE") {
    return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Cloud className="size-3.5" /> Revisar acceso</span>;
  }
  const c = checkTone(d.lastCheckDays);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", c.cls)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", c.dot)} /> {c.label}
    </span>
  );
}

function Identidad({ d }: { d: DiskRow }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="h-7 w-2.5 shrink-0 rounded" style={{ background: d.color ?? "#94a3b8" }} />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{d.name}</span>
          <span className="shrink-0 rounded border border-border bg-background px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
            {DISK_KIND_LABEL[d.kind] ?? d.kind}
          </span>
          {d.mountKey ? (
            <span className="shrink-0 rounded bg-sky-100 px-1.5 py-px text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" title="La app tiene este disco montado: se puede navegar por dentro">
              montado
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {d.location ?? "sin ubicación anotada"}
          {d.offsite ? " · fuera del estudio" : ""}
          {d.status === "RETIRADO" ? " · retirado" : ""}
        </span>
      </span>
    </span>
  );
}

type Orden = "nombre" | "lleno" | "verificacion" | "capacidad";
const ORDEN_LABEL: Record<Orden, string> = {
  nombre: "Nombre",
  lleno: "Más lleno primero",
  verificacion: "Hace más que no se verifica",
  capacidad: "Capacidad",
};

export type MontajeLibre = { key: string; label: string; desc: string; totalGB: number; usedGB: number };

// Ofrecer lo que la app ya tiene montado y nadie ha registrado. Es la respuesta al arranque en
// frío: sin esto, la pestaña sale vacía aunque el NAS del estudio esté conectado y leyéndose.
function SugerenciaMontaje({ m }: { m: MontajeLibre }) {
  const libre = Math.max(0, m.totalGB - m.usedGB);
  return (
    <form action={registrarMontaje.bind(null, m.key)} className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3">
      <HardDrive className="size-5 shrink-0 text-primary" />
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium">
          La app tiene montado <b>{m.label}</b> y ningún disco lo reclama.
        </p>
        <p className="text-xs text-muted-foreground">
          {m.desc} {(m.totalGB / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} TB en total ·{" "}
          {(libre / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} TB libres, leídos del disco.
        </p>
      </div>
      <button className="shrink-0 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        Registrarlo
      </button>
    </form>
  );
}

export function Discos({
  disks,
  canManage,
  highlightId = null,
  montajesLibres = [],
}: {
  disks: DiskRow[];
  canManage: boolean;
  highlightId?: string | null;
  montajesLibres?: MontajeLibre[];
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [soloAtencion, setSoloAtencion] = useState(false);
  const [verRetirados, setVerRetirados] = useState(false);
  const [busca, setBusca] = useState("");
  const [orden, setOrden] = useState<Orden>("nombre");
  // La vista elegida se recuerda en este navegador: quien prefiere tarjetas no vuelve a
  // pedirlas cada vez que entra.
  const [vista, setVista] = usePreferenciaLocal<"lista" | "cuadricula">("discos-vista", "lista");

  const editing = disks.find((d) => d.id === editingId) ?? null;

  const nAtencion = disks.filter((d) => d.needsCheck).length;
  const nRetirados = disks.filter((d) => d.status === "RETIRADO").length;

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(busca.trim());

  const visibles = disks
    .filter((d) => (d.status === "RETIRADO" ? verRetirados : true))
    .filter((d) => (soloAtencion ? d.needsCheck : true))
    .filter((d) => !q || norm(`${d.name} ${d.location ?? ""} ${DISK_KIND_LABEL[d.kind] ?? d.kind}`).includes(q))
    .sort((a, b) => {
      // Los retirados siempre al final, sea cual sea el orden pedido.
      const retA = a.status === "RETIRADO" ? 1 : 0;
      const retB = b.status === "RETIRADO" ? 1 : 0;
      if (retA !== retB) return retA - retB;
      if (orden === "lleno") return (pctDe(b) ?? -1) - (pctDe(a) ?? -1);
      if (orden === "capacidad") return (b.capacityGB ?? -1) - (a.capacityGB ?? -1);
      if (orden === "verificacion") {
        // «Nunca» pesa más que cualquier número de días.
        const va = a.lastCheckDays ?? Number.MAX_SAFE_INTEGER;
        const vb = b.lastCheckDays ?? Number.MAX_SAFE_INTEGER;
        return vb - va;
      }
      // Por nombre, pero lo que pide atención primero: un disco que lleva un año sin conectarse
      // importa más que el orden alfabético.
      const atA = a.needsCheck ? 0 : 1;
      const atB = b.needsCheck ? 0 : 1;
      if (atA !== atB) return atA - atB;
      return a.name.localeCompare(b.name, "es");
    });

  const chipCls = (activo: boolean, tono: "warn" | "ink") =>
    cn(
      "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
      activo
        ? tono === "warn"
          ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="mt-5">
      {/* ── Barra: filtros puestos a la vista, lo demás recogido en menús ── */}
      <div className="flex flex-wrap items-center gap-2">
        {nAtencion > 0 ? (
          <button type="button" onClick={() => setSoloAtencion((v) => !v)} className={chipCls(soloAtencion, "warn")}>
            ⚠ Por verificar · {nAtencion}
          </button>
        ) : null}
        {nRetirados > 0 ? (
          <button type="button" onClick={() => setVerRetirados((v) => !v)} className={chipCls(verRetirados, "ink")}>
            Retirados · {nRetirados}
          </button>
        ) : null}

        <label className="relative ml-auto shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar disco…"
            className="w-44 rounded-md border border-border bg-card py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary"
          />
        </label>

        <MenuBarra etiqueta="Ordenar" icono={<ArrowUpDown />} alineado="derecha" titulo="Ordenar los discos">
          <MenuGrupo>Ordenar por</MenuGrupo>
          {(Object.keys(ORDEN_LABEL) as Orden[]).map((o) => (
            <MenuOpcion key={o} activa={orden === o} onClick={() => setOrden(o)}>{ORDEN_LABEL[o]}</MenuOpcion>
          ))}
        </MenuBarra>

        <MenuBarra etiqueta="Vista" icono={vista === "lista" ? <List /> : <LayoutGrid />} alineado="derecha" titulo="Cambiar la vista">
          <MenuOpcion activa={vista === "lista"} icono={<List />} onClick={() => setVista("lista")}>Lista</MenuOpcion>
          <MenuOpcion activa={vista === "cuadricula"} icono={<LayoutGrid />} onClick={() => setVista("cuadricula")}>Cuadrícula</MenuOpcion>
        </MenuBarra>

        {canManage ? (
          <button
            type="button"
            onClick={() => { setAdding((v) => !v); setEditingId(null); }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Añadir disco
          </button>
        ) : null}
      </div>

      {canManage && (adding || editing) ? (
        <div className="mt-3 rounded-xl border border-border bg-card">
          {editing ? <p className="border-b border-border px-3 pt-2.5 pb-2 text-sm font-medium">Editar «{editing.name}»</p> : null}
          <DiskForm key={editing?.id ?? "new"} disk={editing ?? undefined} onDone={() => { setAdding(false); setEditingId(null); }} />
        </div>
      ) : null}

      {canManage && montajesLibres.length > 0 ? (
        <div className="mt-3 space-y-2">
          {montajesLibres.map((m) => <SugerenciaMontaje key={m.key} m={m} />)}
        </div>
      ) : null}

      {disks.length === 0 ? (
        montajesLibres.length === 0 || !canManage ? (
          <div className="mt-8">
            <EmptyState
              icon={<HardDrive className="size-6" />}
              title="Sin discos registrados"
              description="Registra el NAS, los discos externos y la nube para armar el mapa del material."
            />
          </div>
        ) : null
      ) : visibles.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Ningún disco coincide con el filtro.
        </p>
      ) : vista === "lista" ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          {/* Cabecera de columnas: solo en pantallas anchas, donde la rejilla es de verdad. */}
          <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.7fr)_minmax(0,1.2fr)_84px_44px] gap-4 border-b border-border bg-muted/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
            <span>Disco</span>
            <span>Ocupación</span>
            <span>Verificación</span>
            <span className="text-right">Proyectos</span>
            <span />
          </div>
          <ul className="divide-y divide-border">
            {visibles.map((d) => (
              <li
                key={d.id}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-4 gap-y-2 px-4 py-2.5 transition-colors hover:bg-muted/50 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.7fr)_minmax(0,1.2fr)_84px_44px]",
                  d.status === "RETIRADO" && "opacity-60",
                  d.id === highlightId && "bg-primary/5 ring-2 ring-inset ring-primary/40",
                )}
              >
                {/* La fila entera abre la ficha del disco: ahí vive su contenido. */}
                <Link href={`/biblioteca/discos/${d.id}`} className="col-start-1 min-w-0">
                  <Identidad d={d} />
                </Link>
                <div className="col-start-1 lg:col-start-2"><Ocupacion d={d} /></div>
                <div className="col-start-1 lg:col-start-3"><ChipVerificacion d={d} /></div>
                <div className="col-start-1 text-xs text-muted-foreground lg:col-start-4 lg:text-right">
                  <b className="font-semibold text-foreground">{d.nProjects}</b>
                  <span className="lg:hidden"> {d.nProjects === 1 ? "proyecto" : "proyectos"}</span>
                </div>
                <div className="col-start-2 row-start-1 flex justify-end lg:col-start-5 lg:row-start-auto">
                  {canManage ? <MenuDisco d={d} onEdit={() => { setEditingId(d.id); setAdding(false); }} /> : (
                    <Link href={`/biblioteca/discos/${d.id}`} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" title="Ver el disco">
                      <ChevronRight className="size-4" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((d) => (
            <div
              key={d.id}
              className={cn(
                "flex flex-col gap-2.5 rounded-xl border bg-card p-4 shadow-sm",
                d.status === "RETIRADO" && "opacity-60",
                d.id === highlightId ? "border-primary ring-2 ring-primary/30" : "border-border",
              )}
            >
              <div className="flex items-start gap-2">
                <Link href={`/biblioteca/discos/${d.id}`} className="min-w-0 flex-1"><Identidad d={d} /></Link>
                {canManage ? <MenuDisco d={d} onEdit={() => { setEditingId(d.id); setAdding(false); }} /> : null}
              </div>
              <Ocupacion d={d} compacta />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-border pt-2 text-xs">
                <ChipVerificacion d={d} />
                {d.liveNas ? <span className="text-muted-foreground" title="Ocupación leída del disco en vivo">en vivo</span> : null}
                {d.location ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="size-3" /> {d.location}</span>
                ) : null}
                <span className="ml-auto text-muted-foreground">{d.nProjects} {d.nProjects === 1 ? "proyecto" : "proyectos"}</span>
              </div>
              {d.notes ? <p className="text-xs text-muted-foreground">{d.notes}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
