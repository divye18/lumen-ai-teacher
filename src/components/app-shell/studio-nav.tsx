"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { LumenWordmark } from "@/components/ui/lumen-mark";
import { ThemeToggle } from "@/components/ui/theme";
import { getSupabaseBrowserClient } from "@/lib/db/client";
import { cn } from "@/lib/ui/cn";

const NAV = [
  { href: "/studio", label: "Studio", match: (p: string) => p === "/studio" },
  {
    href: "/learn/c",
    label: "Curriculum",
    match: (p: string) => p.startsWith("/learn/c"),
  },
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
  const reduce = useReducedMotion();

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
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-canvas)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/studio" className="mr-4 shrink-0">
          <LumenWordmark />
        </Link>

        <nav
          className="lumen-scroll relative flex h-full min-w-0 flex-1 items-center gap-2 overflow-x-auto"
          aria-label="Primary"
        >
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full shrink-0 items-center px-1 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                  active
                    ? "text-[var(--color-ink)]"
                    : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
                )}
              >
                {item.label}
                {active ? (
                  <motion.span
                    layoutId={reduce ? undefined : "studio-nav-active"}
                    className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-[var(--color-accent)]"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <div className="group relative">
            <button
              type="button"
              className="grid size-8 place-items-center border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[11px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-subtle)]"
              aria-label="Account"
            >
              {(email ?? "?").slice(0, 1).toUpperCase()}
            </button>
            <div className="invisible absolute top-full right-0 z-40 mt-1.5 w-56 border border-[var(--color-border)] bg-[var(--color-surface)] p-1 opacity-0 shadow-none transition-[opacity,visibility] group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              {email ? (
                <p className="truncate px-2.5 py-1.5 text-[12px] text-[var(--color-ink-faint)]">
                  {email}
                </p>
              ) : null}
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="w-full px-2.5 py-1.5 text-left text-[13px] text-[var(--color-ink-muted)] hover:bg-[var(--color-subtle)] hover:text-[var(--color-ink)] disabled:opacity-50"
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
