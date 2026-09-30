import type { Metadata } from "next";
import Link from "next/link";
import { LumenWordmark } from "@/components/ui/lumen-mark";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
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
            Terms of Service
          </h1>

          <p className="mb-8 text-[var(--color-ink-muted)]">
            Last updated: [INSERT DATE]
          </p>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              1. Acceptance of Terms
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              [INSERT VERIFIED ACCEPTANCE POLICY]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              2. Eligibility
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              [INSERT ELIGIBILITY REQUIREMENTS (e.g., Age restrictions)]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              3. Account Responsibilities
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              You are responsible for maintaining the confidentiality of your
              account credentials and for all activities that occur under your
              account.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              4. Use of Lumen & Educational Content
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              Lumen is an educational tool. [INSERT VERIFIED CONTENT USAGE
              POLICY]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              5. Intellectual Property
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              [INSERT INTELLECTUAL PROPERTY POLICY]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              6. Prohibited Use
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              [INSERT PROHIBITED ACTIONS POLICY]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              7. Third-Party Services
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              [INSERT THIRD-PARTY INTEGRATION TERMS]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              8. Disclaimer & Limitation of Liability
            </h2>
            <p className="mb-4 text-sm leading-relaxed text-[var(--color-ink)] uppercase">
              [INSERT VERIFIED LEGAL DISCLAIMERS AND LIMITATION OF LIABILITY IN
              ALL CAPS IF REQUIRED]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              9. Changes to Terms
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              [INSERT TERMS MODIFICATION POLICY]
            </p>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-ink)]">
              10. Contact
            </h2>
            <p className="mb-4 leading-relaxed text-[var(--color-ink)]">
              If you have any questions about these Terms, please contact us at
              [INSERT CONTACT EMAIL].
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
