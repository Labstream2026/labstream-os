import { leerManifiestoPlugin } from "@/lib/plugin-manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── ¿Hay versión nueva del puente nativo? ─────────────────────────────────────
// La INTERFAZ del panel no necesita esto: es una página web, así que cada despliegue llega a
// todos los editores al instante. Lo que sí vive en disco de cada equipo es el puente nativo
// (main.js/bridge.js), y ese es el que se anuncia aquí.
//
// El manifiesto lo genera `scripts/empaquetar-plugin.mjs` junto con los archivos, así que la
// versión, el hash y el archivo SIEMPRE salen de la misma corrida: no puede quedar un manifiesto
// prometiendo una versión que los archivos no tienen.
//
// Sin sesión a propósito: es metadatos públicos (una versión y un hash), lo mismo que anuncia
// cualquier repositorio de descargas, y así el puente puede consultarlo antes de que el editor
// inicie sesión en el panel.

export async function GET() {
  const m = await leerManifiestoPlugin();
  // Sin manifiesto (aún no se ha empaquetado ninguna versión) no es un error: es «no hay
  // actualización que ofrecer». El panel simplemente no enseña el aviso.
  if (!m) return Response.json({ ok: true, version: null });
  return Response.json({
    ok: true,
    version: m.version,
    notes: m.notes ?? null,
    files: m.files,
    builtAt: m.builtAt,
    url: m.installer ?? null,
    // El kit completo (zip con la carpeta del plugin + los instaladores). El puente NO lo usa
    // —él solo reemplaza JS—; es para la página de instalación y para equipos nuevos.
    kit: m.kit ?? null,
    kitSize: m.kitSize ?? null,
    kitSha256: m.kitSha256 ?? null,
  });
}
