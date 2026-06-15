"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Boxes, HardDrive, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/wiki", label: "General", icon: BookOpen, exact: true },
  { href: "/wiki/inventario", label: "Inventario", icon: Boxes },
  { href: "/wiki/ubicacion", label: "Ubicación del material", icon: HardDrive },
  { href: "/wiki/contrasenas", label: "Usuarios y contraseñas", icon: KeyRound, adminOnly: false },
];

export function WikiTabs({ canSeePasswords = true }: { canSeePasswords?: boolean }) {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => {
        if (t.href === "/wiki/contrasenas" && !canSeePasswords) return null;
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}
