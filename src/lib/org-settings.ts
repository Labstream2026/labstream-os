import { cache } from "react";
import { db } from "@/lib/db";

// Marca/branding de la organización (fila única "default"). El color de marca re-tiñe la app.
export type OrgBrand = { primaryColor: string | null };

export const getOrgSettings = cache(async (): Promise<OrgBrand> => {
  const row = await db.orgSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  return { primaryColor: row?.primaryColor ?? null };
});

// Convierte "#rrggbb" al triplete HSL "H S% L%" que usa globals.css (hsl(var(--primary))).
// Devuelve null si el hex no es válido (así la acción puede rechazarlo y el layout ignorarlo).
export function hexToHslTriplet(hex: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// CSS que sobrescribe --primary y --ring (aro de foco) con el color de marca, en claro y oscuro.
// "" si no hay color válido (la app usa su azul por defecto). Va inline en el layout raíz.
export function brandCss(primaryColor: string | null): string {
  if (!primaryColor) return "";
  const triplet = hexToHslTriplet(primaryColor);
  if (!triplet) return "";
  return `:root,.dark{--primary:${triplet};--ring:${triplet};}`;
}
