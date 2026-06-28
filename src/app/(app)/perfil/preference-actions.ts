"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { START_PAGE_SET } from "@/lib/user-preference";

// Guarda (parcialmente) las preferencias del usuario actual. Best-effort: no lanza al cliente para
// no romper la UI por un fallo al persistir una preferencia (la UI ya cambió de forma optimista).
export async function saveUserPreference(patch: {
  sidebarCollapsed?: boolean;
  chatPanelOpen?: boolean;
  reduceMotion?: boolean;
  startPage?: string;
}): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const data: { sidebarCollapsed?: boolean; chatPanelOpen?: boolean; reduceMotion?: boolean; startPage?: string } = {};
  if (typeof patch.sidebarCollapsed === "boolean") data.sidebarCollapsed = patch.sidebarCollapsed;
  if (typeof patch.chatPanelOpen === "boolean") data.chatPanelOpen = patch.chatPanelOpen;
  if (typeof patch.reduceMotion === "boolean") data.reduceMotion = patch.reduceMotion;
  if (typeof patch.startPage === "string" && START_PAGE_SET.has(patch.startPage)) data.startPage = patch.startPage;
  if (Object.keys(data).length === 0) return;
  await db.userPreference.upsert({
    where: { userId: session.id },
    create: { userId: session.id, ...data },
    update: data,
  });
  // reduceMotion/startPage afectan el render del servidor (shell / Inicio): revalida el layout.
  if ("reduceMotion" in data || "startPage" in data) revalidatePath("/", "layout");
}
