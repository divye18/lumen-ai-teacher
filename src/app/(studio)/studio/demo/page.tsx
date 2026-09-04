import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { ensureDemoSession } from "@/lib/demo";

export const metadata: Metadata = { title: "Demo" };
export const dynamic = "force-dynamic";

/**
 * Demo Mode entry point. Provisions the curated demo lesson + session (real
 * persistence, real teaching engine, deterministic content) and drops the
 * viewer straight into the Teaching Room. Safe to hit repeatedly.
 */
export default async function DemoPage() {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) redirect("/login?next=/studio/demo");

  const demo = await ensureDemoSession(supabase, user.value.id);
  if (!demo.ok) {
    redirect("/studio?demo=error");
  }

  redirect(`/learn/${demo.value.sessionId}?demo=1`);
}
