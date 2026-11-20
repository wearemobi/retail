import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
        accent:
          "border-transparent bg-accent-brand-soft text-accent-brand font-semibold",
        amber:
          "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold",
        emerald:
          "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-semibold",
        destructive:
          "border-transparent bg-destructive/15 text-destructive font-semibold",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
