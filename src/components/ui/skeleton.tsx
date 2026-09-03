import type { HTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-subtle)]",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-[lumen-shimmer_1.6s_infinite]",
        "after:bg-gradient-to-r after:from-transparent after:via-[color-mix(in_oklab,var(--color-ink)_6%,transparent)] after:to-transparent",
        className,
      )}
      aria-hidden
      {...props}
    />
  );
}
