import Link from "next/link";
import { Home, Inbox, FolderCheck, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";

// Sub-navegación del PORTAL del cliente: pestañas propias entre sus 4 superficies.
// Vive dentro de las páginas (no en la barra lateral) para que el portal se sienta
// un espacio propio y coherente, en móvil y escritorio.
const TABS = [
  { key: "inicio", label: "Inicio", href: "/inicio", icon: Home },
  { key: "entregas", label: "Mis entregas", href: "/mis-entregas", icon: Inbox },
  { key: "finales", label: "Entregas finales", href: "/entregas-finales", icon: FolderCheck },
  { key: "solicitudes", label: "Solicitudes", href: "/solicitudes", icon: MessageSquarePlus },
] as const;

export type ClientPortalTab = (typeof TABS)[number]["key"];

export function ClientPortalNav({ active }: { active: ClientPortalTab }) {
  return (
    <nav aria-label="Portal del cliente" className="-mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
      {TABS.map((t) => {
        const Icon = t.icon;
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
