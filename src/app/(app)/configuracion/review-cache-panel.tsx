"use client";

import * as React from "react";
import { HardDrive, Loader2, Check, AlertTriangle } from "lucide-react";
import { leerEspacioRevision, vaciarCacheRevision, type EspacioResult } from "./review-cache-actions";

// Panel de Ajustes → Mantenimiento: cuánto ocupa en el NAS la copia local de los videos de
// revisión de Drive y cuánto disco queda libre. Existe porque esa copia es lo que hace que el
// segundo y la captura funcionen al instante — pero también es lo que puede llenar el disco, y
// hasta ahora había que entrar al NAS por consola para saberlo.

function gb(bytes: number): string {
  if (bytes <= 0) return "0 KB"; // sin esto, una caché vacía se anunciaba como «1 KB»
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ReviewCachePanel() {
  const [datos, setDatos] = React.useState<EspacioResult | null>(null);
  const [busy, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [confirmar, setConfirmar] = React.useState(false);

  const cargar = React.useCallback(() => {
    void leerEspacioRevision().then(setDatos).catch(() => setDatos(null));
  }, []);
  React.useEffect(cargar, [cargar]);

  if (datos && !datos.permitido) return null;

  const usoPct = datos?.permitido ? Math.min(100, Math.round((datos.bytes / datos.tope) * 100)) : 0;
  // Aviso cuando el disco del NAS baja del 10 %: ahí peligra todo, no solo la revisión.
  const discoJusto = datos?.permitido && datos.libre != null && datos.total != null && datos.libre / datos.total < 0.1;

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <HardDrive className="size-4 text-primary" /> Copia local de los videos de revisión
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Cuando se revisa un video que vive en Google Drive, el NAS guarda una copia para servirlo
        al instante y poder guardar el segundo y la captura del fotograma. Es contenido{" "}
        <strong>desechable</strong>: el original sigue en Drive y la copia se vuelve a traer sola.
      </p>

      {!datos ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Midiendo…
        </p>
      ) : datos.permitido ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-[11px] text-muted-foreground">Ocupa ahora</dt>
              <dd className="text-sm font-semibold tabular-nums">{gb(datos.bytes)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Videos copiados</dt>
              <dd className="text-sm font-semibold tabular-nums">{datos.copias}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Tope antes de reciclar</dt>
              <dd className="text-sm font-semibold tabular-nums">{gb(datos.tope)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Libre en el NAS</dt>
              <dd className={`text-sm font-semibold tabular-nums ${discoJusto ? "text-destructive" : ""}`}>
                {datos.libre != null ? gb(datos.libre) : "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(1, usoPct)}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {usoPct}% del tope. Al llegar al tope se borran solas las copias menos usadas, y las de
            los entregables aprobados hace más de una semana se retiran cada noche. Un video de más
            de {gb(datos.topeArchivo)} —o que se comiera más de la mitad de lo que queda libre— no se
            copia: se sirve en directo desde Drive.
          </p>
          {discoJusto ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] font-medium text-destructive">
              <AlertTriangle className="mt-px size-3.5 shrink-0" /> Queda menos del 10% libre en el
              disco del NAS. Vacía esta copia y revisa qué más está ocupando espacio.
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!confirmar ? (
              <button
                type="button"
                onClick={() => setConfirmar(true)}
                disabled={busy || datos.copias === 0}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                Vaciar la copia local
              </button>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">
                  Se liberan {gb(datos.bytes)}. La próxima revisión volverá a traerse de Drive (tarda un poco esa vez).
                </span>
                <button
                  type="button"
                  onClick={() =>
                    start(async () => {
                      const r = await vaciarCacheRevision();
                      setMsg(r.ok ? { ok: true, text: `Listo: ${r.borradas} videos, ${gb(r.liberados ?? 0)} liberados.` } : { ok: false, text: r.error ?? "Error." });
                      setConfirmar(false);
                      cargar();
                    })
                  }
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null} Sí, vaciar
                </button>
                <button type="button" onClick={() => setConfirmar(false)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                  Cancelar
                </button>
              </>
            )}
          </div>

          {msg ? (
            <p className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
              {msg.ok ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />} {msg.text}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
