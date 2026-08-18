import { readdirSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Download, Monitor, RefreshCw, Stethoscope } from "lucide-react";
import { getSession } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { leerManifiestoPlugin, pesoLegible } from "@/lib/plugin-manifest";
import { formatBogota } from "@/lib/bogota-time";

// ── INSTALAR EL PANEL DE CORRECCIONES EN DAVINCI RESOLVE ──
// A esta página apunta el `installer` del manifiesto y el aviso de «hay versión nueva» del
// panel, así que tiene que existir de verdad y decir la versión REAL que está publicada.
//
// Para qué hace falta si el puente ya se actualiza solo: la autoactualización solo sabe
// reemplazar JS dentro de la carpeta del usuario. La PRIMERA instalación tiene que copiar la
// carpeta del plugin a ProgramData (Windows) o /Library (Mac) y poner ahí el
// WorkflowIntegration.node de Blackmagic — y las dos cosas piden administrador. Eso no lo puede
// hacer una página web: lo hace el instalador del kit, una sola vez por equipo.
//
// Vive FUERA del grupo (app) para que se pueda abrir desde la ventana del plugin sin arrastrar
// la barra lateral, pero NO es pública: el proxy la deja detrás de la sesión del equipo.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Instalar el panel de Resolve" };

function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
        {n}
      </span>
      <span className="text-sm leading-relaxed">{children}</span>
    </li>
  );
}

function Ruta({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] break-all">{children}</code>;
}

export default async function InstalarPluginPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/plugin/instalar");
  // El panel es una herramienta del EQUIPO de edición; los invitados de cliente no lo instalan.
  if (session.role === "cliente") redirect("/");

  const m = await leerManifiestoPlugin();
  // El .dmg lo construye GitHub Actions DESPUÉS del empaquetado local (necesita un runner de
  // macOS) y llega al NAS en el deploy SIGUIENTE, así que en cada release hay una ventana en la
  // que el dmg vigente en disco es el de la versión anterior. Se ofrece el MÁS RECIENTE que
  // exista en vez de exigir el nombre exacto: un pkg viejo instala igual de bien, porque el
  // puente se autoactualiza al abrir el panel. Si se exigiera el exacto, el botón de Mac se
  // esfumaría de producción con cada versión nueva hasta el próximo deploy casual.
  let dmg: { url: string; version: string } | null = null;
  if (m) {
    try {
      const candidatos = readdirSync(path.join(process.cwd(), "public", "plugin"))
        .map((f) => f.match(/^LabstreamCorrecciones-(\d+\.\d+(?:\.\d+)?)\.dmg$/))
        .filter((x): x is RegExpMatchArray => x !== null)
        .sort((a, b) => b[1].localeCompare(a[1], undefined, { numeric: true }));
      if (candidatos.length > 0) dmg = { url: `/plugin/${candidatos[0][0]}`, version: candidatos[0][1] };
    } catch {
      /* sin carpeta aún: sin botón de Mac */
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/resolve" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Volver al panel
      </Link>

      <header className="mt-4 border-b border-border pb-6">
        <Logo className="h-7" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Instalar el panel de correcciones en DaVinci Resolve</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Abre las correcciones del video <em>dentro</em> de Resolve: saltar al timecode de cada nota, marcarlas hechas y pintar
          los marcadores en el timeline. Se instala una sola vez por equipo.
        </p>
      </header>

      {/* Descarga */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        {m?.kit ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Versión {m.version}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Publicada el {formatBogota(m.builtAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {m.exe ? (
                  <a
                    href={m.exe}
                    download
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Download className="size-4" /> Windows (.exe)
                  </a>
                ) : null}
                {dmg ? (
                  <a
                    href={dmg.url}
                    download
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Download className="size-4" /> Mac (.dmg{dmg.version !== m.version ? ` · v${dmg.version}` : ""})
                  </a>
                ) : null}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Van sin firma digital, así que la primera vez el sistema desconfía: en Windows, SmartScreen pide «Más información →
              Ejecutar de todas formas»; en Mac, clic derecho sobre el .pkg → Abrir. Si tu Windows tiene el «Control de
              aplicaciones inteligente» activado bloqueará cualquier .exe sin firma — usa el zip de abajo, que hace exactamente lo
              mismo.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Alternativa universal:{" "}
              <a href={m.kit} download className="text-primary hover:underline">
                kit en zip ({m.kitSize ? pesoLegible(m.kitSize) : "zip"})
              </a>{" "}
              con <Ruta>INSTALAR-Windows.bat</Ruta> / <Ruta>instalar-panel-mac.command</Ruta> dentro.
            </p>
            {m.notes ? <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">{m.notes}</p> : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Todavía no hay ninguna versión publicada. Se genera con <Ruta>node scripts/empaquetar-plugin.mjs</Ruta> antes de
            desplegar.
          </p>
        )}
      </section>

      {/* Requisitos: lo que hace fallar la instalación */}
      <section className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="size-4 shrink-0 text-amber-500" /> Antes de empezar
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex gap-2">
            <span className="text-amber-500">·</span>
            <span>
              Hace falta <strong>DaVinci Resolve Studio</strong> (el de pago). Los Workflow Integrations no existen en la versión
              gratuita: en un Resolve gratis el instalador avisa y se detiene.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-amber-500">·</span>
            <span>
              Va a <strong>pedir permisos de administrador</strong>. No es opcional: el plugin se copia a una carpeta del sistema,
              que es donde Resolve los busca.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-amber-500">·</span>
            <span>
              <strong>Cierra Resolve</strong> antes de instalar. Si está abierto no ve el panel nuevo hasta que lo reinicies.
            </span>
          </li>
        </ul>
      </section>

      {/* Pasos por sistema */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Monitor className="size-4 shrink-0 text-muted-foreground" /> Windows
          </h2>
          <ol className="mt-3 space-y-2.5">
            <Paso n={1}>
              Descomprime el zip en una carpeta cualquiera. <strong>No lo ejecutes desde dentro del zip</strong>: Windows lo abre
              en una carpeta temporal y el instalador no encuentra sus archivos.
            </Paso>
            <Paso n={2}>
              Doble clic en <Ruta>INSTALAR-Windows.bat</Ruta> y acepta el aviso de administrador.
            </Paso>
            <Paso n={3}>Abre Resolve y ve a menú Workspace → Workflow Integrations → Labstream Correcciones.</Paso>
          </ol>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Monitor className="size-4 shrink-0 text-muted-foreground" /> macOS
          </h2>
          <ol className="mt-3 space-y-2.5">
            <Paso n={1}>Descomprime el zip (doble clic).</Paso>
            <Paso n={2}>
              Doble clic en <Ruta>instalar-panel-mac.command</Ruta> y escribe tu contraseña cuando la pida. Si macOS lo bloquea
              por ser de un desarrollador sin identificar: clic derecho → Abrir.
            </Paso>
            <Paso n={3}>Abre Resolve y ve a menú Workspace → Workflow Integrations → Labstream Correcciones.</Paso>
          </ol>
        </section>
      </div>

      {/* La parte que evita repetir todo esto */}
      <section className="mt-4 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <RefreshCw className="size-4 shrink-0 text-muted-foreground" /> Esta es la última vez que lo instalas a mano
        </h2>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            <span>
              <strong className="text-foreground">La interfaz del panel</strong> es esta misma web: cada mejora que despleguemos
              te llega al abrirlo, sin tocar nada.
            </span>
          </p>
          <p className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            <span>
              <strong className="text-foreground">El puente con Resolve</strong> se actualiza solo desde la versión {m?.version ?? "2.1"}:
              cuando haya una nueva, el panel te ofrece un botón, la descarga a tu carpeta de usuario (ahí no hace falta
              administrador) y la estrena al reiniciar Resolve. Si una versión descargada fallara al abrir, vuelve sola a la
              anterior.
            </span>
          </p>
        </div>
      </section>

      {/* Cuando no funciona */}
      <section className="mt-4 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Stethoscope className="size-4 shrink-0 text-muted-foreground" /> Si algo no cuadra
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          El mismo zip trae un diagnóstico que dice qué falta y dónde está mirando: <Ruta>DIAGNOSTICO-Windows.bat</Ruta> o{" "}
          <Ruta>diagnostico-mac.command</Ruta>. Pásame lo que imprima y sabré exactamente qué pasó.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          El panel aparece pero sin correcciones → revisa que hayas iniciado sesión dentro de la ventana del plugin. El panel no
          salta al timecode → casi siempre es Resolve gratuito, o que el plugin quedó instalado sin el archivo de Blackmagic.
        </p>
      </section>
    </div>
  );
}
