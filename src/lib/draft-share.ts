import { signDraftToken } from "@/lib/review-token";
import { formatBogotaDate } from "@/lib/bogota-time";

// Estado del enlace de BORRADOR de un entregable, listo para pintar. Lo arma el servidor —incluida
// la fecha, en hora de Bogotá y no en la del navegador de quien mira— y lo consumen tanto el panel
// del proyecto como la sala de /revisiones, que comparten la misma barra de enlace.
export type DraftShareInfo = {
  url: string;
  active: boolean;
  visits: number;
  expiresLabel: string | null;
  expired: boolean;
};

export type DraftShareFields = {
  id: string;
  draftShareAt: Date | null;
  draftShareVisits: number;
  draftShareExpiresAt: Date | null;
};

export function draftShareInfo(d: DraftShareFields, baseUrl: string): DraftShareInfo {
  const base = (baseUrl || "").replace(/\/$/, "");
  return {
    // El token es determinista (mismo entregable = mismo enlace): encender y apagar es un
    // interruptor, no una fábrica de enlaces. Igual que el enlace oficial al revocar/reactivar.
    url: `${base}/review/${signDraftToken(d.id)}`,
    active: !!d.draftShareAt,
    visits: d.draftShareVisits,
    expiresLabel: d.draftShareExpiresAt ? formatBogotaDate(d.draftShareExpiresAt, { day: "numeric", month: "long" }) : null,
    expired: !!d.draftShareExpiresAt && d.draftShareExpiresAt.getTime() < Date.now(),
  };
}
