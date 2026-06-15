import { redirect } from "next/navigation";
import { getSession, hasPermission } from "@/lib/auth";
import { ProposalWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function NuevaPropuestaPage() {
  const session = await getSession();
  if (!hasPermission(session, "crear_cotizaciones")) redirect("/cotizaciones");
  return <ProposalWizard />;
}
