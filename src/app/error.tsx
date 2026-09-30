"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { Panel } from "@/components/ui/surface";
import { LumenWordmark } from "@/components/ui/lumen-mark";
import { LumenCore } from "@/components/brand/lumen-core";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--color-surface)]">
      <header className="flex h-16 items-center justify-between border-b border-[var(--color-border)] px-6">
        <Link
          href="/"
          className="text-[var(--color-ink)] transition-colors hover:text-[var(--color-learning)]"
        >
          <LumenWordmark />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <Panel className="w-full max-w-md p-8 text-center" inset>
          <div className="mb-6 flex justify-center">
            <LumenCore size="small" intensity="subtle" interactive={false} />
          </div>
          <h1 className="text-xl font-semibold text-[var(--color-ink)]">
            Something went wrong
          </h1>
          <p className="mt-2 text-[length:var(--text-body)] text-[var(--color-ink-muted)]">
            An unexpected error interrupted your session.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button onClick={() => reset()} variant="primary">
              Try again
            </Button>
            <LinkButton href="/" variant="secondary">
              Return home
            </LinkButton>
          </div>
        </Panel>
      </main>
    </div>
  );
}
