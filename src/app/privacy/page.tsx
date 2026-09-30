import type { Metadata } from "next";
import Link from "next/link";
import { LumenWordmark } from "@/components/ui/lumen-mark";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--color-surface)]">
      <header className="flex h-16 items-center border-b border-[var(--color-border)] px-6">
        <Link
          href="/"
          className="text-[var(--color-ink)] transition-colors hover:text-[var(--color-learning)]"
        >
          <LumenWordmark />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-16 md:py-24">
        <article className="prose prose-sm sm:prose-base dark:prose-invert prose-headings:font-semibold prose-a:text-[var(--color-learning)]">
          <h1 className="mb-8 text-3xl font-semibold text-[var(--color-ink)]">
            Privacy Policy
          </h1>

          <p className="mb-8 text-[var(--color-ink-muted)]">
            Last updated: [INSERT DATE]
          </p>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              Information We Collect
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              [INSERT VERIFIED DATA COLLECTION POLICY]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              How Information Is Used
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              [INSERT VERIFIED DATA USAGE POLICY]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              Authentication
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              We use Supabase for authentication. When you sign up, we collect
              your email address strictly to provide access to your account.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              Educational & Learning Data
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              As an adaptive AI teacher, Lumen processes your interactions,
              answers, and voice inputs to model your knowledge state and
              provide personalized instruction.
            </p>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              [INSERT SPECIFIC LLM/AI DATA SHARING POLICY]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              Third-Party Services
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              [INSERT VERIFIED THIRD-PARTY PROCESSORS]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              Data Retention & Security
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              [INSERT VERIFIED DATA RETENTION POLICY]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              User Rights
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              [INSERT USER RIGHTS POLICY (e.g., Data deletion, export)]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              Contact
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              If you have any questions about this Privacy Policy, please
              contact us at [INSERT CONTACT EMAIL].
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
