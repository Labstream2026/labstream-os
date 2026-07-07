import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { statusMeta, formatShortDate } from "@/lib/ui";
import { tone } from "@/lib/colors";
import { cn } from "@/lib/utils";

export type ProjectCardData = {
  id: string;
  name: string;
  emoji: string | null;
  status: string;
  progress: number;
  dueDate: Date | string | null;
  lead: { initials: string | null; color: string | null } | null;
};

export function ProjectCard({ project, tintColor }: { project: ProjectCardData; tintColor?: string | null }) {
  const status = statusMeta(project.status);
  const due = formatShortDate(project.dueDate);
  // Tinte por color del cliente (suave, vía hex+alpha): no altera el color del texto.
  const t = tintColor ? tone(tintColor) : null;

  return (
    <Link
      href={`/proyectos/${project.id}`}
      style={t ? { backgroundColor: `${t.hex}1f`, borderColor: `${t.hex}40` } : undefined}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border p-4 shadow-sm transition-all hover:shadow-md active:scale-[0.99] motion-reduce:active:scale-100",
        t ? "hover:border-primary/40" : "border-border bg-card hover:border-border/80",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-lg">
          {project.emoji ?? "🎬"}
        </span>
        <Badge className={cn(status.className)}>
          <span className="mr-1 inline-block size-1.5 rounded-full bg-current align-middle" />
          {status.label}
        </Badge>
      </div>

      <div>
        <h3 className="font-semibold leading-snug group-hover:text-primary">{project.name}</h3>
        {due ? <p className="mt-0.5 text-xs text-muted-foreground">vence {due}</p> : null}
      </div>

      <div className="mt-auto flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }}
          />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{project.progress}%</span>
        {project.lead ? (
          <UserAvatar initials={project.lead.initials} color={project.lead.color} size="sm" />
        ) : null}
      </div>
    </Link>
  );
}
