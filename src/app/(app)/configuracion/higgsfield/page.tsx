import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getHiggsfieldAuth, disconnectHiggsfield } from "@/lib/higgsfield-oauth";
import { listTools } from "@/lib/higgsfield-mcp";

export const dynamic = "force-dynamic";

async function disconnect() {
  "use server";
  const s = await getSession();
  if (!s || s.role !== "admin") throw new Error("No autorizado");
  await disconnectHiggsfield();
  redirect("/configuracion/higgsfield?estado=desconectado");
}

export default async function HiggsfieldPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/configuracion");
  const sp = await searchParams;
  const estado = typeof sp?.estado === "string" ? sp.estado : null;

  const auth = await getHiggsfieldAuth();
  const connected = !!(auth?.refreshTokenEnc && auth.clientId);

  // Si está conectado, verificar el token listando las herramientas del MCP.
  let tools: { name: string; description?: string }[] = [];
  let toolsError: string | null = null;
  if (connected) {
    try {
      tools = await listTools();
    } catch (e) {
      toolsError = e instanceof Error ? e.message : "error";
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/configuracion" className="text-sm text-muted-foreground hover:underline">← Configuración</Link>
      <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold tracking-tight">🎨 Higgsfield (imágenes y video por IA)</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Conecta tu cuenta de Higgsfield para que Marcebot genere <b>imágenes y videos</b> en el chat, usando los créditos de tu <b>plan</b>.
        Se conecta una vez (OAuth) y la app renueva el acceso sola.
      </p>

      {estado === "ok" ? <p className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">✅ Higgsfield conectado.</p> : null}
      {estado === "error" ? <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">❌ No se pudo conectar. Inténtalo de nuevo.</p> : null}
      {estado === "desconectado" ? <p className="mt-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">Higgsfield desconectado.</p> : null}

      <div className="mt-6 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-block size-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
            <span className="font-medium">{connected ? "Conectado" : "No conectado"}</span>
            {connected && auth?.connectedByName ? <span className="text-muted-foreground">· por {auth.connectedByName}</span> : null}
          </div>
          {connected ? (
            <div className="flex items-center gap-2">
              <Link href="/api/higgsfield/connect" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">Reconectar</Link>
              <form action={disconnect}>
                <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10">Desconectar</button>
              </form>
            </div>
          ) : (
            <Link href="/api/higgsfield/connect" className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">Conectar Higgsfield</Link>
          )}
        </div>

        {connected ? (
          <div className="mt-4 border-t border-border pt-3 text-sm">
            {toolsError ? (
              <p className="text-red-600 dark:text-red-400">⚠️ Conectado pero no pude leer las herramientas: {toolsError}. Prueba “Reconectar”.</p>
            ) : (
              <>
                <p className="text-muted-foreground">Herramientas detectadas en el MCP ({tools.length}):</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {tools.map((t) => (
                    <li key={t.name} className="rounded-full bg-muted px-2 py-0.5 text-xs" title={t.description ?? ""}>{t.name}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        En el chat: pídele a Marcebot <i>“genérame una imagen de…”</i> o <i>“hazme un video de…”</i>. El video tarda unos minutos y se entrega aquí mismo al terminar.
      </p>
    </div>
  );
}
