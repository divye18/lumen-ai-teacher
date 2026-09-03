import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { publicConfig } from "@/config/public";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";

export default async function LearnLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!publicConfig.supabase.url || !publicConfig.supabase.anonKey) {
    redirect("/");
  }
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) redirect("/login");

  return <div className="min-h-svh bg-[var(--color-canvas)]">{children}</div>;
}
