"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { decisionSetInterno } from "@/app/(app)/proyectos/[id]/fotos/[setId]/set-actions";
import { EnviarAlCliente } from "./enviar-al-cliente";

// ── Decisión interna sobre un SET DE FOTOS ──
// El equivalente del panel de pre-aprobación de los videos, sin versiones: se revisa la galería
// tal como la verá el cliente y se decide. Al pre-aprobar sale la MISMA ventana de envío de las
// piezas de video (correo/WhatsApp con sello) — la lección de esa ventana: envuelve la decisión,
// no la reemplaza; «Pedir cambios» sigue su camino aparte.

type Envio = {
  titulo: string;
  proyecto: string;
  cliente: string | null;
  url: string;
  venceLabel: string | null;
  puedeEnviar: boolean;
  correoActivo: boolean;
};

export function DecisionSetFotos({
  setId,
  canDecide,
  yaAbierto,
  envio,
  deQuien,
}: {
  setId: string;
  canDecide: boolean;
  // true = el set ya está de cara al cliente (pre-aprobado o enviado directo).
  yaAbierto: boolean;
  envio: Envio;
  deQuien: string;
}) {
  const router = useRouter();
  const [pendiente, start] = React.useTransition();
  const [pidiendo, setPidiendo] = React.useState(false);
  const [nota, setNota] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [ventana, setVentana] = React.useState(false);

  function decidir(result: "APROBADO" | "CAMBIOS") {
    setError(null);
    start(async () => {
      const r = await decisionSetInterno(setId, result, result === "CAMBIOS" ? nota : undefined);
      if (!r.ok) {
        setError(r.message ?? "No se pudo registrar la decisión.");
        return;
      }
      setPidiendo(false);
      setNota("");
      if (result === "APROBADO") setVentana(true);
      else router.refresh();
    });
  }

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Pre-aprobación del set</h2>
        <p className="text-xs text-muted-foreground">
          {yaAbierto
            ? "La galería ya está de cara al cliente."
            : "Lo de arriba es exactamente lo que verá el cliente. Si está listo, pre-apruébalo y mándaselo."}
        </p>
      </div>
      <div className="space-y-3 p-4">
        {!canDecide ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Puedes mirar la galería, pero la pre-aprobación la decide un revisor asignado o el responsable del proyecto.
          </p>
        ) : pidiendo ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              placeholder="¿Qué hay que ajustar en el set? (se vuelve tarea para el responsable)"
              className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => decidir("CAMBIOS")}
                disabled={pendiente}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {pendiente ? <Loader2 className="size-4 animate-spin" /> : null} Enviar cambios
              </button>
              <button
                type="button"
                onClick={() => setPidiendo(false)}
                disabled={pendiente}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {!yaAbierto ? (
              <button
                type="button"
                onClick={() => decidir("APROBADO")}
                disabled={pendiente}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {pendiente ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Pre-aprobar el set
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setVentana(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Send className="size-4" /> Mandarle el enlace al cliente
              </button>
            )}
            {!yaAbierto ? (
              <button
                type="button"
                onClick={() => setPidiendo(true)}
                disabled={pendiente}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
              >
                Pedir cambios
              </button>
            ) : null}
          </div>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      {ventana ? (
        <EnviarAlCliente
          deliverableId={setId}
          titulo={envio.titulo}
          proyecto={envio.proyecto}
          cliente={envio.cliente}
          url={envio.url}
          venceLabel={envio.venceLabel}
          puedeEnviar={envio.puedeEnviar}
          correoActivo={envio.correoActivo}
          deQuien={deQuien}
          onCerrar={() => {
            setVentana(false);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}
