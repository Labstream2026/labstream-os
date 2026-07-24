import crypto from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { opsSession } from "@/lib/ops-access";
import { normalizeOpsRel, statOps } from "@/lib/nas-ops";
import { getOnlyOfficeConfig, isEditableOffice, buildConfig, signConfig } from "@/lib/onlyoffice";
import { signScopedToken } from "@/lib/signed-token";
import { OnlyOfficeEditor } from "../[id]/editor";

export const dynamic = "force-dynamic";

// Editor OnlyOffice para un documento VIVO de Operaciones_LAB. El documento se descarga y se
// guarda de vuelta EN LA MISMA ruta de la share; la clave del editor lleva el mtime, así que si
// el archivo cambia por fuera (Finder/SMB) la próxima apertura ve la versión nueva.
export default async function OpsDocPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { path: rawPath } = await searchParams;
  const session = await opsSession();
  if (!session) redirect("/login");

  let rel: string;
  try {
    rel = normalizeOpsRel(rawPath || "");
  } catch {
    rel = "";
  }
  const backHref = rel.includes("/") ? `/operaciones?path=${encodeURIComponent(rel.slice(0, rel.lastIndexOf("/")))}` : "/operaciones";
  if (!rel) return <Notice title="Ruta inválida" msg="No se indicó qué documento abrir." backHref="/operaciones" />;

  const st = await statOps(rel);
  if (!st || st.dir) {
    return <Notice title="No encontrado" msg="El archivo ya no está ahí (¿movido o renombrado desde el NAS?)." backHref={backHref} />;
  }
  const cfg = await getOnlyOfficeConfig();
  if (!cfg.enabled) {
    return <Notice title="Edición no disponible" msg="OnlyOffice no está conectado todavía. Configúralo en Configuración → Integraciones." backHref={backHref} />;
  }
  if (!isEditableOffice(st.name)) {
    return <Notice title="No editable" msg="Este tipo de archivo no se edita en OnlyOffice." backHref={backHref} />;
  }

  // demo mira, el equipo edita.
  const canEdit = session.role !== "demo";
  const t = signScopedToken("opsdoc", rel, 1); // 1 día: cubre la sesión de edición
  const fileUrl = `${cfg.callbackBase}/api/ops/file?path=${encodeURIComponent(rel)}&t=${encodeURIComponent(t)}`;
  const callbackUrl = `${cfg.callbackBase}/api/docs/ops/callback?path=${encodeURIComponent(rel)}&t=${encodeURIComponent(t)}`;
  const config = await signConfig(
    buildConfig({
      attachmentId: `ops_${crypto.createHash("sha1").update(rel).digest("hex").slice(0, 16)}`,
      name: st.name,
      version: Math.round(st.mtimeMs), // la clave cambia cuando el archivo cambia por fuera
      fileUrl,
      callbackUrl,
      canEdit,
      user: { id: session.id, name: session.name },
    }),
  );

  return <OnlyOfficeEditor docsUrl={cfg.docsUrl} config={config} title={st.name} backHref={backHref} />;
}

function Notice({ title, msg, backHref }: { title: string; msg: string; backHref: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{msg}</p>
      <Link href={backHref} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Volver
      </Link>
    </div>
  );
}
