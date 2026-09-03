"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { LumenWordmark } from "@/components/ui/lumen-mark";
import { ThemeToggle } from "@/components/ui/theme";
import { getSupabaseBrowserClient } from "@/lib/db/client";
import { cn } from "@/lib/ui/cn";

const NAV = [
  { href: "/studio", label: "Studio", match: (p: string) => p === "/studio" },
  {
    href: "/studio/knowledge",
    label: "Knowledge",
    match: (p: string) => p.startsWith("/studio/knowledge"),
  },
  {
    href: "/studio/plan",
    label: "Lessons",
    match: (p: string) =>
      p.startsWith("/studio/plan") || p.startsWith("/studio/learn"),
  },
] as const;

export function StudioNav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await getSupabaseBrowserClient().auth.signOut();
    } catch {
      /* still navigate away */
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-canvas)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4 sm:px-6">
        <Link href="/studio" className="mr-3 shrink-0">
          <LumenWordmark />
        </Link>

        <nav className="flex items-center gap-0.5" aria-label="Primary">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-[var(--color-subtle)] text-[var(--color-ink)]"
                    : "text-[var(--color-ink-muted)] hover:bg-[var(--color-subtle)] hover:text-[var(--color-ink)]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <div className="group relative">
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full border border-[var(--color-border-strong)] text-[11px] font-semibold text-[var(--color-ink-muted)]"
              aria-label="Account"
            >
              {(email ?? "?").slice(0, 1).toUpperCase()}
            </button>
            <div className="invisible absolute top-full right-0 z-40 mt-1.5 w-56 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 opacity-0 shadow-[var(--shadow-md)] transition-[opacity,visibility] group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              {email ? (
                <p className="truncate px-2.5 py-1.5 text-[12px] text-[var(--color-ink-faint)]">
                  {email}
                </p>
              ) : null}
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="w-full rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] text-[var(--color-ink-muted)] hover:bg-[var(--color-subtle)] hover:text-[var(--color-ink)] disabled:opacity-50"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
