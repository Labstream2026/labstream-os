"use client";

import * as React from "react";
import { Check, Copy, Mail, MessageCircle, ArrowLeft, Loader2 } from "lucide-react";
import { textoWhatsapp, textoCorreo, type PiezaCompartida } from "@/lib/review-share";
import { copiarAlPortapapeles } from "@/lib/copiar";
import { contactoSugerido, enviarEnlaceRevision } from "./enviar-actions";

// ── «Gracias por revisar. Ahora que le llegue al cliente» ──────────────────────
// Sale justo después de pre-aprobar. Hasta ahora, pre-aprobar no se notaba: el enlace del
// cliente vivía dentro del menú ⋯ de la bandeja y había que ir a buscarlo, así que la pieza se
// quedaba días «pre-aprobada» sin que el cliente supiera que le tocaba.
//
// Se apoya en el modal de cierre que ya ve el CLIENTE en su sala (review/[token]): mismo tono,
// mismas fases (elegir → escribir → enviando → hecho) y misma capa z-[90], que es la que queda
// por encima del modo inmersivo del reproductor (un overlay opaco a z-[60]).

type Fase =
  | { p: "inicio" }
  | { p: "redactar"; canal: "whatsapp" | "email" }
  | { p: "enviando"; canal: "whatsapp" | "email" }
  | { p: "hecho"; canal: "whatsapp" | "email" }
  | { p: "error"; canal: "whatsapp" | "email"; mensaje: string };

export function EnviarAlCliente({
  deliverableId,
  titulo,
  proyecto,
  cliente,
  url,
  venceLabel,
  puedeEnviar,
  correoActivo,
  deQuien,
  onCerrar,
}: {
  deliverableId: string;
  titulo: string;
  proyecto: string;
  cliente: string | null;
  url: string;
  // Ya formateada en el servidor: la fecha se pinta en hora de Bogotá, no en la del navegador.
  venceLabel: string | null;
  // Puede DECIDIR sobre la pieza (misma puerta que la pre-aprobación) → puede mandarla.
  puedeEnviar: boolean;
  correoActivo: boolean;
  deQuien: string;
  onCerrar: () => void;
}) {
  const [fase, setFase] = React.useState<Fase>({ p: "inicio" });
  const [copiado, setCopiado] = React.useState<"si" | "no" | null>(null);
  const [para, setPara] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [contacto, setContacto] = React.useState<{ email: string | null; phone: string | null } | null>(null);
  const [pendiente, empezar] = React.useTransition();

  // El contacto del cliente se pide UNA vez al abrir, no al elegir canal: así el botón ya sale
  // con el número o el correo debajo y se ve a quién va antes de pulsar nada.
  React.useEffect(() => {
    if (!puedeEnviar) return;
    let vivo = true;
    void contactoSugerido(deliverableId).then((c) => { if (vivo) setContacto(c); });
    return () => { vivo = false; };
  }, [deliverableId, puedeEnviar]);

  const piezas: PiezaCompartida[] = React.useMemo(
    () => [{ titulo, proyecto, url }],
    [titulo, proyecto, url],
  );

  async function copiar() {
    const ok = await copiarAlPortapapeles(url);
    // Si el navegador no deja, se dice: el campo de arriba sigue siendo seleccionable a mano,
    // pero callarlo dejaba al usuario pulsando un botón que no hacía nada visible.
    setCopiado(ok ? "si" : "no");
    setTimeout(() => setCopiado(null), ok ? 1600 : 3500);
  }

  function abrirRedaccion(canal: "whatsapp" | "email") {
    setPara((canal === "whatsapp" ? contacto?.phone : contacto?.email) ?? "");
    setFase({ p: "redactar", canal });
  }

  function enviar(canal: "whatsapp" | "email") {
    setFase({ p: "enviando", canal });
    empezar(async () => {
      const r = await enviarEnlaceRevision(deliverableId, { channel: canal, to: para, note: nota });
      if (r.ok) setFase({ p: "hecho", canal });
      else setFase({ p: "error", canal, mensaje: r.error ?? "No se pudo enviar." });
    });
  }

  // Lo que le va a llegar al cliente, palabra por palabra: lo arma el MISMO módulo que lo manda
  // (lib/review-share), así que la previa no puede quedarse desfasada del envío real.
  const previa =
    fase.p === "redactar" || fase.p === "enviando"
      ? fase.canal === "whatsapp"
        ? textoWhatsapp(piezas, nota)
        : textoCorreo(piezas, deQuien, nota)
      : "";

  const canalNombre = (c: "whatsapp" | "email") => (c === "whatsapp" ? "WhatsApp" : "correo");

  return (
    // z-[90]: por ENCIMA del modo inmersivo del reproductor (overlay opaco a z-[60]). Es la
    // misma capa que usa el modal del cliente, por el mismo motivo.
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Mandar la pieza al cliente">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative">

          {fase.p === "inicio" ? (
            <>
              <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400">
                <Check className="size-6" />
              </div>
              <h2 className="mt-4 text-center text-xl font-bold tracking-tight">¡Gracias por revisar!</h2>
              <p className="mx-auto mt-2 max-w-[32ch] text-center text-sm text-muted-foreground">
                Ya avisamos {cliente ? `a ${cliente}` : "al cliente"} en su portal. Pero lo que de verdad lo mueve es
                que le llegue el enlace.
              </p>

              <div className="mt-4 rounded-lg border border-border bg-background px-3 py-2">
                <p className="truncate text-sm font-medium">{titulo}</p>
                <p className="truncate text-xs text-muted-foreground">{proyecto}{cliente ? ` · ${cliente}` : ""}</p>
              </div>

              <div className="mt-3 flex items-stretch gap-2">
                <input
                  readOnly
                  value={url}
                  aria-label="Enlace de revisión del cliente"
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 py-2 font-mono text-xs text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={copiar}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${copiado === "si" ? "bg-emerald-600 text-white" : copiado === "no" ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                >
                  {copiado === "si" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copiado === "si" ? "¡Copiado!" : copiado === "no" ? "Selecciónalo" : "Copiar"}
                </button>
              </div>

              {puedeEnviar ? (
                <>
                  <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => abrirRedaccion("whatsapp")}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1da851] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#178c44]"
                    >
                      <MessageCircle className="size-4" /> Por WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirRedaccion("email")}
                      disabled={!correoActivo}
                      title={correoActivo ? undefined : "El correo no está configurado (SMTP)"}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Mail className="size-4" /> Por correo
                    </button>
                  </div>
                  {contacto && (contacto.phone || contacto.email) ? (
                    <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                      A {[contacto.phone, contacto.email].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </>
              ) : null}

              <button
                type="button"
                onClick={onCerrar}
                className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Ahora no, sigo aquí
              </button>

              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                {venceLabel ? `El enlace vence el ${venceLabel}. ` : ""}
                También puedes copiarlo luego desde la bandeja.
              </p>
            </>
          ) : null}

          {fase.p === "redactar" || fase.p === "enviando" ? (
            <>
              <button
                type="button"
                onClick={() => setFase({ p: "inicio" })}
                disabled={fase.p === "enviando"}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <ArrowLeft className="size-3.5" /> Volver
              </button>
              <h2 className="mt-3 text-lg font-bold tracking-tight">Mandar por {canalNombre(fase.canal)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Esto es lo que le va a llegar. Puedes añadirle una línea tuya.</p>

              <label className="mt-4 block text-xs font-medium text-muted-foreground">
                {fase.canal === "whatsapp" ? "Número del cliente (con indicativo)" : "Correo del cliente"}
                <input
                  value={para}
                  onChange={(e) => setPara(e.target.value)}
                  disabled={fase.p === "enviando"}
                  inputMode={fase.canal === "whatsapp" ? "tel" : "email"}
                  placeholder={fase.canal === "whatsapp" ? "573001234567" : "cliente@empresa.com"}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                />
              </label>

              <label className="mt-3 block text-xs font-medium text-muted-foreground">
                Tu nota (opcional)
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value.slice(0, 500))}
                  disabled={fase.p === "enviando"}
                  rows={2}
                  placeholder="Ej.: Quedamos pendientes de tu visto bueno antes del viernes."
                  className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                />
              </label>

              <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vista previa</p>
                <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground/90">{previa}</pre>
              </div>

              <button
                type="button"
                onClick={() => enviar(fase.canal)}
                disabled={fase.p === "enviando" || pendiente || !para.trim()}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {fase.p === "enviando" ? <><Loader2 className="size-4 animate-spin" /> Enviando…</> : `Enviar por ${canalNombre(fase.canal)}`}
              </button>
            </>
          ) : null}

          {fase.p === "hecho" ? (
            <>
              <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400">
                <Check className="size-6" />
              </div>
              <h2 className="mt-4 text-center text-xl font-bold tracking-tight">Enviado</h2>
              <p className="mx-auto mt-2 max-w-[32ch] text-center text-sm text-muted-foreground">
                {cliente ?? "El cliente"} ya tiene el enlace por {canalNombre(fase.canal)}. Cuando lo abra, lo verás en
                la bandeja como «Con el cliente».
              </p>
              <button
                type="button"
                onClick={onCerrar}
                className="mt-5 w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Listo
              </button>
            </>
          ) : null}

          {fase.p === "error" ? (
            <>
              <h2 className="text-lg font-bold tracking-tight">No se pudo enviar</h2>
              <p className="mt-2 text-sm text-muted-foreground">{fase.mensaje}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                El enlace sigue bien: puedes copiarlo y mandarlo tú.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setFase({ p: "redactar", canal: fase.canal })}
                  className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Volver a intentar
                </button>
                <button
                  type="button"
                  onClick={() => setFase({ p: "inicio" })}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
                >
                  Copiar el enlace en su lugar
                </button>
              </div>
            </>
          ) : null}

        </div>
      </div>
    </div>
  );
}
