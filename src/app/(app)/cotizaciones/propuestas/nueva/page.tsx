import { redirect } from "next/navigation";
import { getSession, hasPermission } from "@/lib/auth";
import { ensureServiceCatalog, getCatalogForWizard, getQuoteSettings } from "@/lib/services-catalog";
import { ProposalWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function NuevaPropuestaPage() {
  const session = await getSession();
  if (!hasPermission(session, "crear_cotizaciones")) redirect("/cotizaciones");
  // Catálogo interno estandarizado + ajustes (% transporte/imprevistos e IVA) para el armador.
  await ensureServiceCatalog();
  const [catalogByType, settings] = await Promise.all([getCatalogForWizard(), getQuoteSettings()]);
  return <ProposalWizard catalogByType={catalogByType} defaults={{ iva: settings.iva, contingencyPct: settings.contingencyPct }} />;
}
