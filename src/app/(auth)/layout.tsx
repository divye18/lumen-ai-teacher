import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { ThemeToggle } from "@/components/ui/theme";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <Link
          href="/"
          className="text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          ← Back
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <Suspense>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}
