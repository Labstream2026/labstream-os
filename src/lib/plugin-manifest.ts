import { readFile } from "node:fs/promises";
import path from "node:path";

// El manifiesto del plugin de Resolve, leído del disco (lo escribe scripts/empaquetar-plugin.mjs
// junto con los archivos, así que versión, hashes y kit salen SIEMPRE de la misma corrida).
//
// Vive aquí y no en la ruta de API porque lo leen DOS sitios —/api/resolve-plugin/version (lo
// consulta el puente para autoactualizarse) y la página /plugin/instalar (la mira una persona)—
// y si cada uno lo interpretara a su manera acabarían anunciando versiones distintas.

export type PluginManifest = {
  version: string;
  notes?: string | null;
  files: { name: string; sha256: string; size: number }[];
  builtAt: string;
  installer?: string;
  kit?: string;
  kitSize?: number;
  kitSha256?: string;
  // Instalador de un clic para Windows (null si se empaquetó fuera de Windows, sin csc).
  exe?: string | null;
};

export async function leerManifiestoPlugin(): Promise<PluginManifest | null> {
  try {
    const p = path.join(process.cwd(), "public", "plugin", "manifest.json");
    const m = JSON.parse(await readFile(p, "utf8")) as PluginManifest;
    // Sin versión el manifiesto no sirve para nada: se trata como si no existiera.
    return m && typeof m.version === "string" ? m : null;
  } catch {
    // No haberlo empaquetado aún NO es un error: es «no hay nada que ofrecer todavía».
    return null;
  }
}

// Bytes → "56,5 kB" para enseñárselo a una persona antes de que descargue.
export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("es-CO", { maximumFractionDigits: 1 })} kB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
}
