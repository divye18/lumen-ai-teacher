import { cn } from "@/lib/ui/cn";

/** The Lumen mark: a light aperture. Simple, recognisable, scalable. */
export function LumenMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-5", className)}
      aria-hidden
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.35"
      />
      <path
        d="M12 3a9 9 0 0 1 0 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

export function LumenWordmark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const text = {
    sm: "text-[13px]",
    md: "text-[15px]",
    lg: "text-lg",
  }[size];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight text-[var(--color-ink)]",
        className,
      )}
    >
      <LumenMark className="text-[var(--color-accent)]" />
      <span className={text}>Lumen</span>
    </span>
  );
}
