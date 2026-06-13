import { cn } from "@/lib/utils";
import { avatarColor } from "@/lib/ui";

const SIZES: Record<string, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

export function UserAvatar({
  initials,
  color,
  size = "md",
  className,
  ring,
}: {
  initials?: string | null;
  color?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  ring?: boolean;
}) {
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
      {(initials ?? "?").slice(0, 2)}
    </span>
  );
}
