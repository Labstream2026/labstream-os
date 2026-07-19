import { cn } from "@/lib/utils";
import { avatarColor } from "@/lib/ui";

const SIZES: Record<string, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

// Abreviatura a partir del nombre cuando el usuario no fijó sus iniciales: quita el sufijo de
// cargo (" - Rol") y toma la inicial del nombre + la del apellido (p. ej. "Alejandra Hereira" → "AH").
function initialsFromName(name: string): string {
  const words = name.split(/\s+[-–—]\s+/)[0].trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// Punto de estado por tamaño del avatar.
const DOT_SIZES: Record<string, string> = { sm: "size-2", md: "size-2.5", lg: "size-3" };

export function UserAvatar({
  initials,
  name,
  color,
  url,
  size = "md",
  className,
  ring,
  presence,
  dnd,
}: {
  initials?: string | null;
  name?: string | null;
  color?: string | null;
  url?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  ring?: boolean;
  // Estado de disponibilidad (punto en la esquina): "activo" (verde) · "ocupado" (ámbar) · "ausente"
  // (gris). `dnd` (No molestar vigente) prioriza y lo pinta rojo. Sin ninguno, el avatar es idéntico.
  presence?: string | null;
  dnd?: boolean;
}) {
  const label = (initials && initials.trim()) || (name ? initialsFromName(name) : "?");
  const withDot = !!presence || !!dnd;
  // Sin estado, el className se aplica al avatar (comportamiento anterior); con estado, al envoltorio.
  const avatarClass = withDot ? undefined : className;
  const avatar = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={label.slice(0, 2)}
      className={cn("inline-block shrink-0 rounded-full object-cover", SIZES[size], ring && "ring-2 ring-background", avatarClass)}
    />
  ) : (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none", avatarColor(color), SIZES[size], ring && "ring-2 ring-background", avatarClass)}
    >
      {label.slice(0, 2)}
    </span>
  );
  if (!withDot) return avatar;
  const dotColor = dnd ? "bg-rose-500" : presence === "ocupado" ? "bg-amber-500" : presence === "ausente" ? "bg-slate-400" : "bg-emerald-500";
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {avatar}
      <span className={cn("absolute bottom-0 right-0 rounded-full ring-2 ring-background", dotColor, DOT_SIZES[size])} aria-hidden />
    </span>
  );
}
