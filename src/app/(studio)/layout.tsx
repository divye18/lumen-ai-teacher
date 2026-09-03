import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { StudioNav } from "@/components/app-shell/studio-nav";
import { LumenWordmark } from "@/components/ui/lumen-mark";
import { requireUser } from "@/lib/auth/current-user";
import { publicConfig } from "@/config/public";
import { getSupabaseServerClient } from "@/lib/db/server";

export default async function StudioLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!publicConfig.supabase.url || !publicConfig.supabase.anonKey) {
    return <SetupNotice />;
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) redirect("/login?next=/studio");

  return (
    <div className="flex min-h-svh flex-col">
      <StudioNav email={user.value.email} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <LumenWordmark size="lg" />
      <h1 className="mt-8 text-lg font-semibold tracking-tight">
        Connect Lumen to Supabase
      </h1>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
        Set{" "}
        <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
        and{" "}
        <code className="font-mono text-[12px]">
          NEXT_PUBLIC_SUPABASE_ANON_KEY
        </code>{" "}
        in <code className="font-mono text-[12px]">.env.local</code>, then
        restart the dev server.
      </p>
      <Link
        href="/"
        className="mt-6 text-[13px] font-medium text-[var(--color-accent)] hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}
