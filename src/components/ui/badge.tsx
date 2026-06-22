import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Badge con variantes semánticas. La variante "default" NO aplica color (respeta el
// className que se pase) → 100% compatible con los usos actuales que pintan con clases.
const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "",
      neutral: "bg-muted text-muted-foreground",
      success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
      warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
      danger: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
      info: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
      outline: "border border-border text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
