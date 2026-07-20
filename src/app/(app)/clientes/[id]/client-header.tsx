import Link from "next/link";
import { ChevronLeft, Camera, Pencil } from "lucide-react";
import { tone } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { EntityEmoji } from "@/components/icons/marks";

// Cabecera MÍNIMA del detalle de cliente (mismo lenguaje que el detalle de proyecto):
// una sola línea con volver + foto + nombre + empresa/descripción + stats compactas + logo.
// Es SOLO lectura: toda la edición (color, foto, logo, portada, textos) vive en Ajustes →
// Apariencia / Información; el lápiz salta directo allí (#ajustes vía hash del menú lateral).
export function ClientHeader({
  name,
  company,
  description,
  emoji,
  photoUrl,
  logoUrl,
  color,
  isActive,
  stats,
  canEdit,
}: {
  name: string;
  company: string | null;
  description: string | null;
  emoji: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
  color: string | null;
  isActive: boolean;
  stats: { proyectos: number; activos: number; cotizaciones: number };
  canEdit: boolean;
}) {
  const t = color ? tone(color) : null;
  const subtitle = [company, description].filter((s) => s && s.trim()).join(" · ");

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Link
        href="/clientes"
        aria-label="Volver a clientes"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft className="size-5" />
      </Link>

      {/* Foto (o emoji) con anillo del color del cliente */}
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border",
          t ? t.chip : "border-border bg-muted",
        )}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={name} className="size-full object-cover" />
        ) : emoji ? (
          <span className="text-lg leading-none"><EntityEmoji value={emoji} /></span>
        ) : (
          <Camera className="size-4 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-bold tracking-tight">{name}</h1>
          {t ? <span className={cn("size-2.5 shrink-0 rounded-full", t.dot)} title="Color del cliente" /> : null}
          {!isActive ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Inactivo</span>
          ) : null}
          {canEdit ? (
            <a
              href="#acceso"
              title="Editar cliente (Ajustes)"
              aria-label="Editar cliente"
              className="shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </a>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {subtitle ? <>{subtitle} · </> : null}
          <span className="tabular-nums">{stats.proyectos}</span> proyecto{stats.proyectos === 1 ? "" : "s"} ·{" "}
          <span className="tabular-nums">{stats.activos}</span> activo{stats.activos === 1 ? "" : "s"} ·{" "}
          <span className="tabular-nums">{stats.cotizaciones}</span> cotizacion{stats.cotizaciones === 1 ? "" : "es"}
        </p>
      </div>

      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`Logo ${name}`} className="hidden max-h-10 max-w-[6rem] shrink-0 object-contain sm:block" />
      ) : null}
    </div>
  );
}
