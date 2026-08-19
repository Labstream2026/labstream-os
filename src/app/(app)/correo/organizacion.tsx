"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BellOff, Building2, Download, Loader2, X } from "lucide-react";
import { agruparDominioCliente, quitarDominioCliente, silenciarRemitente, sincronizarHistorico } from "./acciones";

// ── Organización del correo: dominios por empresa, silencios e historial ────

/** Banner en el hilo: «¿todo lo de @pepsico.com es Pepsico?» — un clic y queda agrupado
 *  (con backfill de lo ya sincronizado, en todas las bandejas del equipo). */
export function AgruparDominio({ dominio, clientes }: { dominio: string; clientes: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [clienteId, setClienteId] = React.useState(clientes[0]?.id ?? "");
  const [estado, setEstado] = React.useState<"quieto" | "guardando" | string>("quieto");
  const [listo, setListo] = React.useState<number | null>(null);

  if (!clientes.length) return null;
  if (listo !== null) {
    return (
      <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
        Listo: todo lo de <b>@{dominio}</b> quedó agrupado ({listo} correo{listo === 1 ? "" : "s"} etiquetados de una vez).
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[12px]">
      <Building2 className="size-3.5 text-muted-foreground" />
      <span>¿Agrupar <b>todo</b> lo que llegue de <b>@{dominio}</b> bajo</span>
      <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}
        className="rounded-md border border-input bg-background px-2 py-1 text-[12px] outline-none focus:ring-2 focus:ring-ring">
        {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <button
        type="button"
        disabled={estado === "guardando"}
        onClick={() => {
          setEstado("guardando");
          void agruparDominioCliente(clienteId, dominio).then((r) => {
            if (!r.ok) { setEstado(r.error ?? "No se pudo."); return; }
            setListo(r.etiquetados ?? 0);
            router.refresh();
          });
        }}
        className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {estado === "guardando" ? "Agrupando…" : "Agrupar"}
      </button>
      <span className="text-muted-foreground">— cualquiera de esa empresa, no solo este remitente</span>
      {estado !== "quieto" && estado !== "guardando" ? <span className="w-full font-medium text-destructive">{estado}</span> : null}
    </div>
  );
}

/** Botón de la barra del hilo: silenciar al remitente (su correo entra directo al Archivo
 *  de la app — para notificaciones automáticas y robots). */
export function BotonSilenciar({ remitente, volverHref }: { remitente: string; volverHref: string }) {
  const router = useRouter();
  const [pendiente, arranca] = React.useTransition();
  return (
    <button
      type="button"
      title={`Silenciar a ${remitente}: lo suyo entra directo al Archivo de la app (el webmail no cambia)`}
      onClick={() =>
        arranca(async () => {
          const r = await silenciarRemitente(remitente, true);
          if (r.ok) router.push(volverHref, { scroll: false });
        })
      }
      className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {pendiente ? <Loader2 className="size-4 animate-spin" /> : <BellOff className="size-4" />}
    </button>
  );
}

/** La tarjeta «Organización» de ajustes: dominios agrupados, remitentes silenciados y el
 *  botón de traer historial viejo. */
export function PanelOrganizacion({ dominios, silencios }: {
  dominios: { domain: string; cliente: string }[];
  silencios: string[];
}) {
  const router = useRouter();
  const [pendiente, arranca] = React.useTransition();
  const [historial, setHistorial] = React.useState<"quieto" | "trayendo" | string>("quieto");

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Organización</h3>

      <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Empresas agrupadas por dominio</p>
      {dominios.length ? (
        <ul className="mt-1.5 space-y-1">
          {dominios.map((d) => (
            <li key={d.domain} className="group flex items-center gap-2 text-[12.5px]">
              <Building2 className="size-3.5 text-muted-foreground" />
              <span className="font-mono">@{d.domain}</span>
              <span className="text-muted-foreground">→ {d.cliente}</span>
              <button type="button" title="Quitar (frena lo futuro; lo ya etiquetado se queda)"
                onClick={() => arranca(async () => { await quitarDominioCliente(d.domain); router.refresh(); })}
                className="invisible rounded p-1 text-muted-foreground hover:text-destructive group-hover:visible">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12px] text-muted-foreground">
          Ninguna aún. Abre un hilo de un remitente corporativo sin cliente y aparecerá «¿Agrupar todo @dominio…?».
        </p>
      )}

      <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Remitentes silenciados</p>
      {silencios.length ? (
        <ul className="mt-1.5 space-y-1">
          {silencios.map((s) => (
            <li key={s} className="group flex items-center gap-2 text-[12.5px]">
              <BellOff className="size-3.5 text-muted-foreground" />
              <span className="font-mono">{s}</span>
              <span className="text-muted-foreground">→ directo al Archivo</span>
              <button type="button" title="Quitar el silencio"
                onClick={() => arranca(async () => { await silenciarRemitente(s, false); router.refresh(); })}
                className="invisible rounded p-1 text-muted-foreground hover:text-destructive group-hover:visible">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12px] text-muted-foreground">Ninguno. En un hilo, el botón 🔕 silencia a ese remitente (notificaciones, robots…).</p>
      )}
      {pendiente ? <Loader2 className="mt-2 size-3.5 animate-spin text-muted-foreground" /> : null}

      <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Historial</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={historial === "trayendo"}
          onClick={() => {
            setHistorial("trayendo");
            void sincronizarHistorico().then((r) => {
              setHistorial(r.ok ? `Se trajeron ${r.traidos ?? 0} correos viejos. Púlsalo otra vez para seguir bajando.` : (r.error ?? "No se pudo."));
              router.refresh();
            });
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[12.5px] font-medium hover:bg-accent disabled:opacity-50"
        >
          {historial === "trayendo" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          Traer correo viejo (hasta 1 año, en tandas de ~300)
        </button>
        {historial !== "quieto" && historial !== "trayendo" ? <span className="text-[12px] text-muted-foreground">{historial}</span> : null}
      </div>
    </div>
  );
}
