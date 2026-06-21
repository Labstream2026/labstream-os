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

export function UserAvatar({
  initials,
  name,
  color,
  url,
  size = "md",
  className,
  ring,
}: {
  initials?: string | null;
  name?: string | null;
  color?: string | null;
  url?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  ring?: boolean;
}) {
  const label = (initials && initials.trim()) || (name ? initialsFromName(name) : "?");
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={label.slice(0, 2)}
        className={cn(
          "inline-block shrink-0 rounded-full object-cover",
          SIZES[size],
          ring && "ring-2 ring-background",
          className,
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        avatarColor(color),
        SIZES[size],
        ring && "ring-2 ring-background",
        className,
      )}
    >
      {label.slice(0, 2)}
    </span>
  );
}
