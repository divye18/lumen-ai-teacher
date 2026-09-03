import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SessionCompleteView } from "@/components/session/session-complete-view";
import { requireUser } from "@/lib/auth/current-user";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getSessionReport } from "@/lib/studio/session-report";

export const metadata: Metadata = { title: "Session summary" };
export const dynamic = "force-dynamic";

export default async function SessionCompletePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  if (!user.ok) {
    redirect(`/login?next=/studio/session/${sessionId}/complete`);
  }

  const report = await getSessionReport(supabase, user.value.id, sessionId);
  if (!report.ok) notFound();

  return <SessionCompleteView report={report.value} />;
}
