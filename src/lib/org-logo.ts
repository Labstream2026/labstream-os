import path from "node:path";
import fs from "node:fs/promises";
import { STORAGE_DIR } from "@/lib/storage";

// Logo de la organización, SIN columna en BD (evita migración): el subido vive en el
// almacenamiento en un nombre fijo por variante; si no hay subido, se sirve el logo de
// fábrica de public/brand/. Un endpoint (/api/brand-logo/<variante>) resuelve cuál dar.
//
// OJO con la nomenclatura (igual que el componente Logo): "light" = logo para FONDO CLARO
// (tinta oscura) → de fábrica es logo-dark.png; "dark" = logo para FONDO OSCURO (tinta
// blanca) → de fábrica es logo.png.
export type LogoVariant = "light" | "dark";

const customPath = (v: LogoVariant) => path.join(STORAGE_DIR, "brand", `org-logo-${v}.png`);
const bundledPath = (v: LogoVariant) => path.join(process.cwd(), "public", "brand", v === "light" ? "logo-dark.png" : "logo.png");

export function orgLogoRel(v: LogoVariant): string {
  return `brand/org-logo-${v}.png`;
}

// Buffer del logo a servir (custom si existe; si no, el de fábrica) + mtime para el ETag.
export async function readOrgLogo(v: LogoVariant): Promise<{ buf: Buffer; mtimeMs: number; custom: boolean } | null> {
  for (const [p, custom] of [
    [customPath(v), true],
    [bundledPath(v), false],
  ] as const) {
    try {
      const [buf, st] = await Promise.all([fs.readFile(p), fs.stat(p)]);
      return { buf, mtimeMs: st.mtimeMs, custom };
    } catch {
      // sigue al siguiente candidato
    }
  }
  return null;
}

// ¿Hay logo SUBIDO (no el de fábrica) para cada variante? Para reflejarlo en el panel.
export async function customLogoState(): Promise<{ light: boolean; dark: boolean }> {
  const has = async (v: LogoVariant) => {
    try {
      await fs.access(customPath(v));
      return true;
    } catch {
      return false;
    }
  };
  return { light: await has("light"), dark: await has("dark") };
}
