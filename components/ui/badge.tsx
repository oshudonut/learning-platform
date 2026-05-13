import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary ring-primary/20",
        secondary: "bg-secondary/50 text-secondary-foreground ring-secondary/30",
        accent: "bg-accent/10 text-accent ring-accent/20",
        success: "bg-success/10 text-success ring-success/20",
        warning: "bg-warning/10 text-warning ring-warning/20",
        destructive: "bg-destructive/10 text-destructive ring-destructive/20",
        outline: "bg-transparent text-muted-foreground ring-border",
        easy: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
        medium: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
        hard: "bg-rose-500/10 text-rose-400 ring-rose-500/20",
        high: "bg-violet-500/10 text-violet-400 ring-violet-500/20",
        low: "bg-slate-500/10 text-slate-400 ring-slate-500/20",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
