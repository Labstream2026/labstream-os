"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function createClient(formData: FormData) {
  const session = await getSession();
  if (!hasPermission(session, "crear_proyectos")) {
    throw new Error("No autorizado");
  }
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const client = await db.client.create({
    data: {
      name,
      company: String(formData.get("company") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      emoji: String(formData.get("emoji") ?? "").trim() || "🏢",
    },
  });
  await logActivity({ action: "client.create", summary: `creó el cliente «${name}»`, clientId: client.id, entityType: "client", entityId: client.id });
  revalidatePath("/");
  revalidatePath("/proyectos");
  redirect(`/clientes/${client.id}`);
}
