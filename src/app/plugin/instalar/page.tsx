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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Versión {m.version}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Publicada el {formatBogota(m.builtAt)} · {m.kitSize ? pesoLegible(m.kitSize) : "zip"}
                </p>
              </div>
              <a
                href={m.kit}
                download
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <Download className="size-4" /> Descargar el instalador
              </a>
            </div>
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
