import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { ensureServiceCatalog, getCatalogForWizard, getQuoteSettings } from "@/lib/services-catalog";
import { loadInventory } from "@/lib/equipos";
import { ProposalWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function NuevaPropuestaPage() {
  const session = await getSession();
  if (!hasPermission(session, "crear_cotizaciones")) redirect("/cotizaciones");
  // Catálogo interno estandarizado + ajustes (% transporte/imprevistos e IVA) para el armador.
  await ensureServiceCatalog();
  const [catalogByType, settings, clients, inv] = await Promise.all([
    getCatalogForWizard(),
    getQuoteSettings(),
    db.client.findMany({ where: accessibleClientWhere(session), orderBy: { name: "asc" }, select: { name: true } }),
    loadInventory(),
  ]);
  return (
    <ProposalWizard
      catalogByType={catalogByType}
      defaults={{ iva: settings.iva, contingencyPct: settings.contingencyPct }}
      clientNames={clients.map((c) => c.name)}
      inventory={inv.items.map((i) => ({ name: i.name, category: i.category, tags: i.tags, quantity: i.quantity }))}
    />
  );
}
