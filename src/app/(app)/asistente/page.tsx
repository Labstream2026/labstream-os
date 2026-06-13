import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/ai";
import { AssistantChat } from "./assistant-chat";

export const dynamic = "force-dynamic";

export default async function AsistentePage() {
  const projects = await db.project.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, name: true },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Asistente IA</h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        Tu copiloto para correos, resúmenes, ideas y planificación.
      </p>
      <AssistantChat
        enabled={aiEnabled}
        projects={projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
      />
    </div>
  );
}
