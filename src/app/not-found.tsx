import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Panel } from "@/components/ui/surface";
import { LumenWordmark } from "@/components/ui/lumen-mark";
import { LumenCore } from "@/components/brand/lumen-core";

export default function NotFound() {
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
            Page not found
          </h1>
          <p className="mt-2 text-[length:var(--text-body)] text-[var(--color-ink-muted)]">
            This learning path doesn&apos;t exist or may have been moved.
          </p>
          <div className="mt-8 flex justify-center">
            <LinkButton href="/" variant="primary">
              Return home
            </LinkButton>
          </div>
        </Panel>
      </main>
    </div>
  );
}
